export type RGB = [number, number, number]

export const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const rgbToHex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

/** Naive device RGB → CMYK (0–100). Good starting point; brand colours should be entered from the guideline. */
export function rgbToCmyk([r, g, b]: RGB): [number, number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255
  const k = 1 - Math.max(R, G, B)
  if (k >= 0.9999) return [0, 0, 0, 100]
  const c = (1 - R - k) / (1 - k), m = (1 - G - k) / (1 - k), y = (1 - B - k) / (1 - k)
  return [c, m, y, k].map((v) => Math.round(v * 100)) as [number, number, number, number]
}
export function cmykToRgb([c, m, y, k]: [number, number, number, number]): RGB {
  return [255 * (1 - c / 100) * (1 - k / 100), 255 * (1 - m / 100) * (1 - k / 100), 255 * (1 - y / 100) * (1 - k / 100)]
}

export function luminance([r, g, b]: RGB) {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
export function contrast(a: RGB, b: RGB) {
  const la = luminance(a), lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
export function saturation([r, g, b]: RGB) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  return mx === 0 ? 0 : (mx - mn) / mx
}

/** Average colour and variance along the outer edge of a canvas. */
export function edgeStats(canvas: HTMLCanvasElement) {
  const s = 64
  const c = document.createElement('canvas')
  c.width = s; c.height = s
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(canvas, 0, 0, s, s)
  const d = ctx.getImageData(0, 0, s, s).data
  const px: RGB[] = []
  for (let i = 0; i < s; i++) {
    for (const [x, y] of [[i, 0], [i, s - 1], [0, i], [s - 1, i]]) {
      const o = (y * s + x) * 4
      if (d[o + 3] > 10) px.push([d[o], d[o + 1], d[o + 2]])
    }
  }
  if (!px.length) return { color: [255, 255, 255] as RGB, variance: 0 }
  const avg = [0, 1, 2].map((k) => px.reduce((a, p) => a + p[k], 0) / px.length) as RGB
  const variance = px.reduce((a, p) => a + (p[0] - avg[0]) ** 2 + (p[1] - avg[1]) ** 2 + (p[2] - avg[2]) ** 2, 0) / px.length
  return { color: avg, variance: Math.sqrt(variance) }
}

/** k-means palette extraction on a downsampled image. Returns colours sorted by share. */
export function extractPalette(source: CanvasImageSource, k = 6): { color: RGB; share: number }[] {
  const s = 96
  const c = document.createElement('canvas')
  c.width = s; c.height = s
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, s, s)
  const d = ctx.getImageData(0, 0, s, s).data
  const pts: RGB[] = []
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) pts.push([d[i], d[i + 1], d[i + 2]])
  if (!pts.length) return []
  // k-means++ style init: pick spread-out seeds
  const centers: RGB[] = [pts[Math.floor(pts.length / 2)]]
  while (centers.length < k) {
    let best = pts[0], bestD = -1
    for (let i = 0; i < pts.length; i += 7) {
      const p = pts[i]
      const dmin = Math.min(...centers.map((cc) => (p[0] - cc[0]) ** 2 + (p[1] - cc[1]) ** 2 + (p[2] - cc[2]) ** 2))
      if (dmin > bestD) { bestD = dmin; best = p }
    }
    centers.push(best)
  }
  const assign = new Array(pts.length).fill(0)
  for (let iter = 0; iter < 10; iter++) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      let bi = 0, bd = Infinity
      for (let j = 0; j < centers.length; j++) {
        const cc = centers[j]
        const dd = (p[0] - cc[0]) ** 2 + (p[1] - cc[1]) ** 2 + (p[2] - cc[2]) ** 2
        if (dd < bd) { bd = dd; bi = j }
      }
      assign[i] = bi
    }
    for (let j = 0; j < centers.length; j++) {
      let r = 0, g = 0, b = 0, n = 0
      for (let i = 0; i < pts.length; i++) if (assign[i] === j) { r += pts[i][0]; g += pts[i][1]; b += pts[i][2]; n++ }
      if (n) centers[j] = [r / n, g / n, b / n]
    }
  }
  const counts = centers.map((_, j) => assign.filter((a) => a === j).length)
  const out = centers.map((color, j) => ({ color: color.map(Math.round) as RGB, share: counts[j] / pts.length }))
    .filter((x) => x.share > 0.01)
    .sort((a, b) => b.share - a.share)
  // merge near-duplicates
  const merged: typeof out = []
  for (const o of out) {
    const dup = merged.find((m) => Math.hypot(m.color[0] - o.color[0], m.color[1] - o.color[1], m.color[2] - o.color[2]) < 28)
    if (dup) dup.share += o.share
    else merged.push({ ...o })
  }
  return merged
}
