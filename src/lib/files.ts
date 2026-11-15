import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type SourceKind = 'raster' | 'svg' | 'pdf'

export interface LoadedSource {
  name: string
  kind: SourceKind
  /** high-resolution raster rendering of the artwork */
  canvas: HTMLCanvasElement
  /** original bytes for vector formats */
  bytes?: Uint8Array
  svgText?: string
  pageCount?: number
  page?: number
}

export function detectKind(file: File): SourceKind | null {
  const n = file.name.toLowerCase()
  if (file.type === 'image/svg+xml' || n.endsWith('.svg')) return 'svg'
  // Illustrator .ai files saved with "Create PDF Compatible File" (the default) are valid PDFs.
  if (n.endsWith('.eps')) return null
  if (file.type === 'application/pdf' || n.endsWith('.pdf') || n.endsWith('.ai') || file.type === 'application/postscript') return 'pdf'
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp)$/.test(n)) return 'raster'
  return null
}

export const ACCEPT_DESIGN = '.png,.jpg,.jpeg,.webp,.avif,.gif,.svg,.pdf,.ai,image/*,application/pdf'

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

export async function loadImageEl(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  await img.decode()
  return img
}

export async function renderPdfPage(bytes: Uint8Array, pageNumber: number, longSide: number, transparent = false) {
  const task = pdfjs.getDocument({ data: bytes.slice() })
  const doc = await task.promise
  const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages))
  const vp1 = page.getViewport({ scale: 1 })
  const scale = longSide / Math.max(vp1.width, vp1.height)
  const vp = page.getViewport({ scale })
  const canvas = makeCanvas(vp.width, vp.height)
  await page.render({
    canvas,
    viewport: vp,
    background: transparent ? 'rgba(0,0,0,0)' : 'rgb(255,255,255)',
  }).promise
  const out = { canvas, pageCount: doc.numPages, widthPt: vp1.width, heightPt: vp1.height }
  await task.destroy()
  return out
}

/** Parse an SVG string's intrinsic size (from width/height or viewBox). */
export function svgSize(svgText: string): { w: number; h: number } {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const el = doc.documentElement
  const vb = el.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  const num = (v: string | null) => (v && !v.endsWith('%') ? parseFloat(v) : NaN)
  let w = num(el.getAttribute('width'))
  let h = num(el.getAttribute('height'))
  if (vb && vb.length === 4) {
    if (!Number.isFinite(w) && !Number.isFinite(h)) { w = vb[2]; h = vb[3] }
    else if (!Number.isFinite(w)) w = (h * vb[2]) / vb[3]
    else if (!Number.isFinite(h)) h = (w * vb[3]) / vb[2]
  }
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) { w = 1000; h = 1000 }
  return { w, h }
}

/** Ensure an SVG has explicit width/height so browsers rasterise it at a known size. */
export function normalizeSvg(svgText: string, w: number, h: number) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const el = doc.documentElement
  if (!el.getAttribute('viewBox')) el.setAttribute('viewBox', `0 0 ${w} ${h}`)
  el.setAttribute('width', String(w))
  el.setAttribute('height', String(h))
  if (!el.getAttribute('xmlns')) el.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return new XMLSerializer().serializeToString(el)
}

export async function rasterizeSvg(svgText: string, longSide: number) {
  const { w, h } = svgSize(svgText)
  const s = longSide / Math.max(w, h)
  const tw = Math.round(w * s), th = Math.round(h * s)
  const blob = new Blob([normalizeSvg(svgText, tw, th)], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImageEl(url)
    const c = makeCanvas(tw, th)
    c.getContext('2d')!.drawImage(img, 0, 0, tw, th)
    return c
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function loadSource(file: File, opts: { longSide?: number; page?: number; transparent?: boolean } = {}): Promise<LoadedSource> {
  const longSide = opts.longSide ?? 3000
  const kind = detectKind(file)
  if (!kind) throw new Error(`Unsupported file type: ${file.name}`)
  if (kind === 'pdf') {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const page = opts.page ?? 1
    try {
      const r = await renderPdfPage(bytes, page, longSide, opts.transparent)
      return { name: file.name, kind, canvas: r.canvas, bytes, pageCount: r.pageCount, page }
    } catch (e) {
      if (file.name.toLowerCase().endsWith('.ai'))
        throw new Error('This .ai file has no PDF data. In Illustrator, use File → Save As → enable "Create PDF Compatible File", or export as PDF/SVG.')
      throw e
    }
  }
  if (kind === 'svg') {
    const svgText = await file.text()
    const canvas = await rasterizeSvg(svgText, longSide)
    return { name: file.name, kind, canvas, svgText }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImageEl(url)
    const c = makeCanvas(img.naturalWidth, img.naturalHeight)
    c.getContext('2d')!.drawImage(img, 0, 0)
    return { name: file.name, kind, canvas: c }
  } finally {
    URL.revokeObjectURL(url)
  }
}
