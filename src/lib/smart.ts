import type { Analysis } from '../../shared/analysis'

export interface Box { x0: number; y0: number; x1: number; y1: number } // fractions 0..1

export interface Mask { w: number; h: number; data: Uint8Array }

/** Foreground mask: pixels that differ from the edge/background colour or sit on strong edges (text, shapes). */
export function foregroundMask(src: HTMLCanvasElement, long = 220): Mask {
  const s = long / Math.max(src.width, src.height)
  const w = Math.max(8, Math.round(src.width * s)), h = Math.max(8, Math.round(src.height * s))
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data
  // background reference from the border ring
  let r = 0, g = 0, b = 0, n = 0
  const ring: number[] = []
  for (let x = 0; x < w; x++) ring.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) ring.push(y * w, y * w + w - 1)
  for (const i of ring) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; n++ }
  r /= n; g /= n; b /= n
  let v = 0
  for (const i of ring) v += (d[i * 4] - r) ** 2 + (d[i * 4 + 1] - g) ** 2 + (d[i * 4 + 2] - b) ** 2
  const std = Math.sqrt(v / n)
  const T = Math.max(38, std * 2.2)
  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
  const out = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    const dist = Math.sqrt((d[i * 4] - r) ** 2 + (d[i * 4 + 1] - g) ** 2 + (d[i * 4 + 2] - b) ** 2)
    const grad = Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + w] - lum[i - w])
    if (dist > T || grad > Math.max(60, std * 1.5)) out[i] = 1
  }
  return { w, h, data: out }
}

/** Bounding box of the foreground, ignoring isolated noise. Returns fractions of the image. */
export function contentBox(m: Mask): Box {
  const rows = new Uint32Array(m.h), cols = new Uint32Array(m.w)
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.data[y * m.w + x]) { rows[y]++; cols[x]++ }
  const minRow = Math.max(2, m.w * 0.01), minCol = Math.max(2, m.h * 0.01)
  let y0 = 0, y1 = m.h - 1, x0 = 0, x1 = m.w - 1
  while (y0 < y1 && rows[y0] < minRow) y0++
  while (y1 > y0 && rows[y1] < minRow) y1--
  while (x0 < x1 && cols[x0] < minCol) x0++
  while (x1 > x0 && cols[x1] < minCol) x1--
  if (y1 - y0 < 3 || x1 - x0 < 3) return { x0: 0, y0: 0, x1: 1, y1: 1 }
  const pad = 0.015
  return {
    x0: Math.max(0, x0 / m.w - pad), y0: Math.max(0, y0 / m.h - pad),
    x1: Math.min(1, (x1 + 1) / m.w + pad), y1: Math.min(1, (y1 + 1) / m.h + pad),
  }
}

/** Tighten a rough (AI) box to the foreground pixels inside it, so cut-outs and crops are precise. */
export function refineBox(b: Box, m: Mask): Box {
  const grow = 0.03
  const X0 = Math.max(0, Math.floor((b.x0 - grow) * m.w)), X1 = Math.min(m.w, Math.ceil((b.x1 + grow) * m.w))
  const Y0 = Math.max(0, Math.floor((b.y0 - grow) * m.h)), Y1 = Math.min(m.h, Math.ceil((b.y1 + grow) * m.h))
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) if (m.data[y * m.w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  if (x1 < 0) return b
  const pad = 0.012
  const r = { x0: x0 / m.w - pad, y0: y0 / m.h - pad, x1: (x1 + 1) / m.w + pad, y1: (y1 + 1) / m.h + pad }
  // never shrink below half of what the model saw, never grow beyond the search window
  if ((r.x1 - r.x0) < (b.x1 - b.x0) * 0.5 || (r.y1 - r.y0) < (b.y1 - b.y0) * 0.5) return b
  return { x0: Math.max(0, r.x0), y0: Math.max(0, r.y0), x1: Math.min(1, r.x1), y1: Math.min(1, r.y1) }
}

export const union = (bs: Box[]): Box | null => bs.length
  ? { x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) }
  : null

/** Claude's analysis, normalised to fractions and snapped to the pixels. */
export interface AiResult {
  analysis: Analysis
  elements: { label: string; kind: string; importance: string; box: Box }[]
  keep: Box
}

export function normaliseAnalysis(a: Analysis, imgW: number, imgH: number, mask: Mask): AiResult {
  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  const elements = a.elements.map((e) => {
    const raw = { x0: clamp(Math.min(e.box.x0, e.box.x1) / imgW), y0: clamp(Math.min(e.box.y0, e.box.y1) / imgH), x1: clamp(Math.max(e.box.x0, e.box.x1) / imgW), y1: clamp(Math.max(e.box.y0, e.box.y1) / imgH) }
    return { label: e.label, kind: e.kind, importance: e.importance, box: e.kind === 'subject' ? raw : refineBox(raw, mask) }
  })
  const keep = union(elements.filter((e) => e.importance !== 'optional').map((e) => e.box)) ?? { x0: 0, y0: 0, x1: 1, y1: 1 }
  // Rectangular cut-outs only work when the pieces don't overlap in the original — otherwise
  // a slice of one element shows up inside another. Fall back to smart crop in that case.
  const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0)
  const overlap = (p: Box, q: Box) => area({ x0: Math.max(p.x0, q.x0), y0: Math.max(p.y0, q.y0), x1: Math.min(p.x1, q.x1), y1: Math.min(p.y1, q.y1) })
  const formats = a.formats.map((f) => {
    if (f.strategy !== 'recompose') return f
    const placed = f.placements.map((p) => elements[p.element]).filter(Boolean)
    const clash = placed.some((e, i) => placed.slice(i + 1).some((o) => overlap(e.box, o.box) > 0.04 * Math.min(area(e.box), area(o.box))))
    if (!clash && placed.length) return f
    return { ...f, strategy: 'crop' as const, placements: [], reasoning: `${f.reasoning} (Rearranging skipped: these elements overlap in the original, so they can’t be cut apart cleanly — using smart crop.)` }
  })
  return { analysis: { ...a, formats }, elements, keep }
}
