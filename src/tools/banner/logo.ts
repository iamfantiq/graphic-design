import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import { loadSource, normalizeSvg, svgSize } from '../../lib/files'
import { rgbToHex } from '../../lib/color'

export interface TracedPath { d: string; color: string }

export interface Logo {
  name: string
  kind: 'traced' | 'vector'
  /** transparent raster preview of the original */
  preview: HTMLCanvasElement
  /** width / height of the trimmed artwork */
  aspect: number
  // traced raster
  traced?: { paths: TracedPath[]; w: number; h: number; colors: { color: string; weight: number }[] }
  // vector source (PDF / AI / SVG converted to PDF): embed page 1, trimmed to artwork bounds
  pdfBytes?: Uint8Array
  /** artwork bounds as fractions of the page (top-left origin) */
  bounds?: { x0: number; y0: number; x1: number; y1: number }
}

export interface TraceOptions {
  colors: number
  detail: 'balanced' | 'high'
  smooth: number // 0..1
  removeBg: 'none' | 'edges' | 'all'
  tolerance: number // 0..120
  despeckle: number // min path size in px
}

export const DEFAULT_TRACE: TraceOptions = { colors: 4, detail: 'balanced', smooth: 0.5, removeBg: 'edges', tolerance: 40, despeckle: 12 }

/** Find the bounding box of visible pixels. */
export function alphaBounds(c: HTMLCanvasElement, threshold = 8) {
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height)
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x; if (x > x1) x1 = x
        if (y < y0) y0 = y; if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: width, y1: height }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 }
}

function crop(c: HTMLCanvasElement, b: { x0: number; y0: number; x1: number; y1: number }) {
  const o = document.createElement('canvas')
  o.width = b.x1 - b.x0; o.height = b.y1 - b.y0
  o.getContext('2d')!.drawImage(c, b.x0, b.y0, o.width, o.height, 0, 0, o.width, o.height)
  return o
}

/** Remove a flat background colour: either everywhere, or only the region connected to the image edges. */
function removeBackground(c: HTMLCanvasElement, mode: TraceOptions['removeBg'], tolerance: number) {
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const d = img.data, w = c.width, h = c.height
  // already transparent? keep as-is
  const corners = [0, w - 1, (h - 1) * w, h * w - 1]
  if (corners.some((i) => d[i * 4 + 3] < 200)) return c
  if (mode === 'none') return c
  const ref = [0, 1, 2].map((k) => corners.reduce((a, i) => a + d[i * 4 + k], 0) / 4)
  const tol2 = tolerance * tolerance
  const near = (i: number) => {
    const o = i * 4
    return (d[o] - ref[0]) ** 2 + (d[o + 1] - ref[1]) ** 2 + (d[o + 2] - ref[2]) ** 2 <= tol2
  }
  if (mode === 'all') {
    for (let i = 0; i < w * h; i++) if (near(i)) d[i * 4 + 3] = 0
  } else {
    const seen = new Uint8Array(w * h)
    const stack: number[] = []
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x)
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
    while (stack.length) {
      const i = stack.pop()!
      if (seen[i]) continue
      seen[i] = 1
      if (!near(i)) continue
      d[i * 4 + 3] = 0
      const x = i % w, y = (i / w) | 0
      if (x > 0) stack.push(i - 1)
      if (x < w - 1) stack.push(i + 1)
      if (y > 0) stack.push(i - w)
      if (y < h - 1) stack.push(i + w)
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

function runTrace(imgd: ImageData, options: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./trace.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e) => { w.terminate(); e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.svg) }
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message)) }
    w.postMessage({ imgd, options })
  })
}

export async function traceRaster(file: File, opt: TraceOptions): Promise<Logo> {
  const src = await loadSource(file)
  const long = opt.detail === 'high' ? 2200 : 1300
  // Upscale small logos before tracing: curves come out smoother.
  const s = long / Math.max(src.canvas.width, src.canvas.height)
  const work = document.createElement('canvas')
  work.width = Math.round(src.canvas.width * s); work.height = Math.round(src.canvas.height * s)
  const wctx = work.getContext('2d', { willReadFrequently: true })!
  wctx.imageSmoothingQuality = 'high'
  wctx.drawImage(src.canvas, 0, 0, work.width, work.height)
  removeBackground(work, opt.removeBg, opt.tolerance)
  const trimmed = crop(work, alphaBounds(work, 100))
  const pad = 4
  const padded = document.createElement('canvas')
  padded.width = trimmed.width + pad * 2; padded.height = trimmed.height + pad * 2
  const pctx = padded.getContext('2d', { willReadFrequently: true })!
  pctx.drawImage(trimmed, pad, pad)
  // Hard alpha edge: avoids semi-transparent halo colours in the palette.
  const imgd = pctx.getImageData(0, 0, padded.width, padded.height)
  let hasAlpha = false
  for (let i = 3; i < imgd.data.length; i += 4) {
    if (imgd.data[i] < 128) { imgd.data[i] = 0; imgd.data[i - 1] = imgd.data[i - 2] = imgd.data[i - 3] = 0; hasAlpha = true }
    else imgd.data[i] = 255
  }
  const t = 1.5 - opt.smooth * 1.4 // line / curve error tolerance
  const svg = await runTrace(imgd, {
    numberofcolors: opt.colors + (hasAlpha ? 1 : 0),
    colorsampling: 2, colorquantcycles: 4, mincolorratio: 0,
    ltres: t, qtres: t, pathomit: opt.despeckle, rightangleenhance: true,
    blurradius: 0, strokewidth: 0, linefilter: opt.smooth > 0.6, roundcoords: 2, viewbox: true,
  })
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const paths: TracedPath[] = []
  const weight = new Map<string, number>()
  doc.querySelectorAll('path').forEach((p) => {
    const op = parseFloat(p.getAttribute('opacity') ?? '1')
    const fill = p.getAttribute('fill') ?? ''
    const d = p.getAttribute('d') ?? ''
    const m = fill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (!m || op < 0.5 || !d) return
    const color = rgbToHex([+m[1], +m[2], +m[3]])
    paths.push({ d, color })
    weight.set(color, (weight.get(color) ?? 0) + d.length)
  })
  const colors = [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([color, w]) => ({ color, weight: w }))
  return {
    name: file.name, kind: 'traced', preview: padded,
    aspect: padded.width / padded.height,
    traced: { paths, w: padded.width, h: padded.height, colors },
  }
}

async function svgToPdfBytes(svgText: string) {
  const { w, h } = svgSize(svgText)
  const doc = new jsPDF({ unit: 'pt', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true })
  const holder = document.createElement('div')
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden'
  holder.innerHTML = normalizeSvg(svgText, w, h)
  document.body.appendChild(holder)
  try {
    await svg2pdf(holder.querySelector('svg')!, doc, { x: 0, y: 0, width: w, height: h })
  } finally { holder.remove() }
  return new Uint8Array(doc.output('arraybuffer'))
}

export async function loadVectorLogo(file: File): Promise<Logo> {
  const src = await loadSource(file, { longSide: 2000, transparent: true })
  let pdfBytes: Uint8Array
  if (src.kind === 'svg') pdfBytes = await svgToPdfBytes(src.svgText!)
  else pdfBytes = src.bytes!
  const c = src.canvas
  const b = alphaBounds(c)
  const preview = crop(c, b)
  return {
    name: file.name, kind: 'vector', preview, aspect: preview.width / preview.height, pdfBytes,
    bounds: { x0: b.x0 / c.width, y0: b.y0 / c.height, x1: b.x1 / c.width, y1: b.y1 / c.height },
  }
}

export const isVectorFile = (f: File) => /\.(svg|pdf|ai)$/i.test(f.name) || f.type === 'image/svg+xml' || f.type === 'application/pdf'
