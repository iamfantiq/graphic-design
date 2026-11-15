import * as pdfjs from 'pdfjs-dist'
import { PDFDocument, PDFDict, PDFName, PDFRawStream, PDFArray, decodePDFRawStream } from 'pdf-lib'
import { detectKind, loadImageEl } from '../../lib/files'

export type Level = 'pass' | 'warn' | 'fail' | 'info'
export interface Finding { level: Level; title: string; detail: string }
export interface Marker { kind: 'image' | 'text' | 'line'; level: Level; x: number; y: number; w: number; h: number; label: string } // fractions of page
export interface Product { id: string; label: string; good: number; min: number; bleed: number; safe: number }

export const PRODUCTS: Product[] = [
  { id: 'flyer', label: 'Flyer / poster up to A2 (viewed up close)', good: 300, min: 200, bleed: 3, safe: 5 },
  { id: 'poster', label: 'Large poster A1–A0 (1–2 m away)', good: 200, min: 120, bleed: 3, safe: 10 },
  { id: 'rollup', label: 'Roll-up / X-banner', good: 150, min: 100, bleed: 5, safe: 30 },
  { id: 'banner', label: 'Vinyl banner / mesh (2 m+ away)', good: 100, min: 60, bleed: 20, safe: 50 },
  { id: 'billboard', label: 'Billboard (10 m+ away)', good: 40, min: 20, bleed: 30, safe: 100 },
]

export interface Report {
  name: string
  kind: 'raster' | 'pdf'
  preview: HTMLCanvasElement
  pages: number
  docMm: { w: number; h: number }
  findings: Finding[]
  markers: Marker[]
  /** trim / bleed boxes as page fractions for overlay */
  trim?: { x0: number; y0: number; x1: number; y1: number }
  safe?: { x0: number; y0: number; x1: number; y1: number }
}

const mm = (pt: number) => (pt * 25.4) / 72
const fmt = (n: number) => (Math.round(n * 10) / 10).toString()
type M = [number, number, number, number, number, number]
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
const apply = (m: M, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

function dpiFinding(dpi: number, p: Product, what: string): Finding {
  if (dpi >= p.good) return { level: 'pass', title: `${what}: ${Math.round(dpi)} dpi`, detail: `Meets the ${p.good} dpi target for this product.` }
  if (dpi >= p.min) return { level: 'warn', title: `${what}: ${Math.round(dpi)} dpi`, detail: `Acceptable, below the ideal ${p.good} dpi. Fine from normal viewing distance; soft up close.` }
  return { level: 'fail', title: `${what}: ${Math.round(dpi)} dpi`, detail: `Under the ${p.min} dpi minimum — it will look pixelated. Use a larger source or a vector original.` }
}

export async function checkFile(file: File, product: Product, target: { w: number; h: number } | null): Promise<Report> {
  const kind = detectKind(file)
  if (kind === 'raster') return checkRaster(file, product, target)
  if (kind === 'pdf') return checkPdf(file, product, target)
  throw new Error('Print check supports PDF, AI (PDF-compatible) and raster images. Export SVG to PDF first.')
}

async function checkRaster(file: File, p: Product, target: { w: number; h: number } | null): Promise<Report> {
  const url = URL.createObjectURL(file)
  const img = await loadImageEl(url).finally(() => URL.revokeObjectURL(url))
  const W = img.naturalWidth, H = img.naturalHeight
  const s = Math.min(1, 1400 / Math.max(W, H))
  const preview = document.createElement('canvas')
  preview.width = Math.round(W * s); preview.height = Math.round(H * s)
  preview.getContext('2d')!.drawImage(img, 0, 0, preview.width, preview.height)
  const findings: Finding[] = []
  const t = target ?? { w: (W / 300) * 25.4, h: (H / 300) * 25.4 }
  if (!target) findings.push({ level: 'info', title: 'No print size given', detail: `At 300 dpi this image prints at ${fmt(t.w)} × ${fmt(t.h)} mm. Set the final size to check resolution.` })
  const dpi = Math.min(W / (t.w / 25.4), H / (t.h / 25.4))
  findings.push(dpiFinding(dpi, p, 'Resolution at print size'))
  const ar = Math.abs(Math.log((W / H) / (t.w / t.h)))
  if (target && ar > 0.01) findings.push({ level: 'warn', title: 'Proportions differ from the print size', detail: `Image is ${fmt(W / H)}:1, print is ${fmt(t.w / t.h)}:1 — the printer will crop or add borders. Use the Social Resizer’s approach or adjust the artboard.` })
  const needW = Math.ceil(((t.w + 2 * p.bleed) / 25.4) * p.good), needH = Math.ceil(((t.h + 2 * p.bleed) / 25.4) * p.good)
  findings.push({ level: 'info', title: 'Bleed cannot be verified in a flat image', detail: `Ideal file for ${fmt(t.w)} × ${fmt(t.h)} mm with ${p.bleed} mm bleed: ${needW} × ${needH} px. Raster files usually arrive RGB — printers convert to CMYK, so check saturated brand colours on a proof.` })
  if (/\.jpe?g$/i.test(file.name)) findings.push({ level: 'info', title: 'JPEG compression', detail: 'Fine for photos. For type and logos, a PDF with vector content prints sharper at any size.' })
  return { name: file.name, kind: 'raster', preview, pages: 1, docMm: { w: (W / 300) * 25.4, h: (H / 300) * 25.4 }, findings, markers: [] }
}

function box(page: ReturnType<PDFDocument['getPage']>, name: 'TrimBox' | 'BleedBox') {
  return page.node.get(PDFName.of(name)) ? (name === 'TrimBox' ? page.getTrimBox() : page.getBleedBox()) : null
}

async function checkPdf(file: File, p: Product, target: { w: number; h: number } | null): Promise<Report> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const findings: Finding[] = []
  const markers: Marker[] = []

  // --- structure (pdf-lib) ---
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const page = doc.getPage(0)
  const media = page.getMediaBox()
  const crop = page.getCropBox()
  const trimBox = box(page, 'TrimBox')
  const bleedBox = box(page, 'BleedBox')
  const trim = trimBox ?? crop
  const pages = doc.getPageCount()
  if (pages > 1) findings.push({ level: 'info', title: `${pages} pages`, detail: 'Checks run on page 1. For Illustrator, each artboard is a page.' })

  const trimMm = { w: mm(trim.width), h: mm(trim.height) }
  const t = target ?? trimMm
  const scale = t.w / trimMm.w // >1 when the file is built at reduced scale (e.g. 1:10)
  if (target) {
    const ar = Math.abs(Math.log((trimMm.w / trimMm.h) / (t.w / t.h)))
    if (ar > 0.01) findings.push({ level: 'fail', title: 'Document proportions differ from the print size', detail: `Trim is ${fmt(trimMm.w)} × ${fmt(trimMm.h)} mm, print is ${fmt(t.w)} × ${fmt(t.h)} mm. The design would be distorted or cropped.` })
    else if (Math.abs(scale - 1) > 0.01) findings.push({ level: 'info', title: `File is built at ${scale > 1 ? `1:${fmt(scale)}` : `${fmt(1 / scale)}:1`} scale`, detail: `Trim ${fmt(trimMm.w)} × ${fmt(trimMm.h)} mm → printed ${fmt(t.w)} × ${fmt(t.h)} mm. Tell the printer to output at ${Math.round(scale * 100)}%. All checks below account for this.` })
    else findings.push({ level: 'pass', title: `Size: ${fmt(trimMm.w)} × ${fmt(trimMm.h)} mm`, detail: 'Matches the print size.' })
  } else findings.push({ level: 'info', title: `Size: ${fmt(trimMm.w)} × ${fmt(trimMm.h)} mm`, detail: 'Set the final print size to check scale and resolution against it.' })

  if (!trimBox) findings.push({ level: 'warn', title: 'No TrimBox', detail: 'The printer has to guess where to cut. Export with "Use document bleed settings" and trim marks, or set the artboard to the final size.' })
  const outer = bleedBox ?? media
  const bleedMm = Math.min(trim.x - outer.x, trim.y - outer.y, outer.x + outer.width - (trim.x + trim.width), outer.y + outer.height - (trim.y + trim.height))
  const realBleed = mm(Math.max(0, bleedMm)) * scale
  if (realBleed + 0.2 >= p.bleed) findings.push({ level: 'pass', title: `Bleed: ${fmt(realBleed)} mm`, detail: `Meets the ${p.bleed} mm needed for this product.` })
  else findings.push({ level: realBleed > 0 ? 'warn' : 'fail', title: `Bleed: ${fmt(realBleed)} mm`, detail: `This product needs ${p.bleed} mm. Background and images must extend past the trim, or a white edge may appear after cutting.` })

  // fonts & colour spaces
  const unembedded = new Set<string>()
  let rgbImages = 0, cmykImages = 0, rgbOps = 0, cmykOps = 0, spotColours = 0
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFDict ? obj : obj instanceof PDFRawStream ? obj.dict : null
    if (!dict) continue
    const type = dict.get(PDFName.of('Type'))?.toString()
    if (type === '/Font') {
      const sub = dict.get(PDFName.of('Subtype'))?.toString()
      if (sub === '/Type3') continue
      let desc = dict.lookup(PDFName.of('FontDescriptor'))
      if (!desc && sub === '/Type0') {
        const kids = dict.lookup(PDFName.of('DescendantFonts'))
        const kid = kids instanceof PDFArray ? kids.lookup(0) : null
        desc = kid instanceof PDFDict ? kid.lookup(PDFName.of('FontDescriptor')) : undefined
      }
      const embedded = desc instanceof PDFDict && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => desc.get(PDFName.of(k)))
      if (!embedded) unembedded.add((dict.get(PDFName.of('BaseFont'))?.toString() ?? '?').replace(/^\/([A-Z]{6}\+)?/, ''))
    }
    if (obj instanceof PDFRawStream) {
      if (dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
        const cs = dict.get(PDFName.of('ColorSpace'))?.toString() ?? ''
        if (/DeviceCMYK/.test(cs)) cmykImages++
        else if (/DeviceRGB|ICCBased|CalRGB/.test(cs)) rgbImages++
      } else if (!type) {
        try {
          const txt = new TextDecoder('latin1').decode(decodePDFRawStream(obj).decode())
          rgbOps += (txt.match(/\s(rg|RG)\s/g) ?? []).length
          cmykOps += (txt.match(/\s(k|K)\s/g) ?? []).length
        } catch { /* not a content stream */ }
      }
    }
    if (obj instanceof PDFArray && obj.size() >= 4 && obj.get(0)?.toString() === '/Separation') spotColours++
  }
  if (unembedded.size) findings.push({ level: 'fail', title: `${unembedded.size} font(s) not embedded`, detail: `${[...unembedded].slice(0, 6).join(', ')}. Embed fonts or convert text to outlines before sending.` })
  else findings.push({ level: 'pass', title: 'Fonts embedded or outlined', detail: 'No missing-font surprises at the print shop.' })
  if (rgbOps + rgbImages > 0 && cmykOps + cmykImages === 0) findings.push({ level: 'warn', title: 'Document is RGB', detail: 'Large-format digital printers convert RGB fine; for offset print convert to CMYK (FOGRA39/51 or your printer’s profile) and check bright colours on a proof.' })
  else if (rgbOps + rgbImages > 0) findings.push({ level: 'warn', title: 'Mixed RGB and CMYK', detail: `${rgbImages} RGB image(s) and ${rgbOps} RGB colour operation(s) alongside CMYK. Usually from placed RGB images or pasted elements — convert for consistent colour.` })
  else if (cmykOps + cmykImages > 0) findings.push({ level: 'pass', title: 'CMYK colour', detail: 'All colour is defined in CMYK.' })
  if (spotColours) findings.push({ level: 'info', title: `${spotColours} spot colour(s)`, detail: 'Fine for offset with Pantone inks; most digital/large-format printers will convert them to CMYK.' })

  // --- content (pdf.js) ---
  const task = pdfjs.getDocument({ data: bytes.slice() })
  const pdf = await task.promise
  const pg = await pdf.getPage(1)
  const vp1 = pg.getViewport({ scale: 1 })
  const ps = 1200 / Math.max(vp1.width, vp1.height)
  const vp = pg.getViewport({ scale: ps })
  const preview = document.createElement('canvas')
  preview.width = Math.round(vp.width); preview.height = Math.round(vp.height)
  await pg.render({ canvas: preview, viewport: vp }).promise
  const toFrac = (x: number, y: number) => { const [vx, vy] = vp.convertToViewportPoint(x, y); return [vx / vp.width, vy / vp.height] }
  const rectFrac = (x0: number, y0: number, x1: number, y1: number) => {
    const a = toFrac(x0, y0), b = toFrac(x1, y1)
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) }
  }
  const tr = rectFrac(trim.x, trim.y, trim.x + trim.width, trim.y + trim.height)
  const safePt = (p.safe / scale) * (72 / 25.4)
  const sf = rectFrac(trim.x + safePt, trim.y + safePt, trim.x + trim.width - safePt, trim.y + trim.height - safePt)

  const ops = await pg.getOperatorList()
  const O = pdfjs.OPS
  let ctm: M = [1, 0, 0, 1, 0, 0]
  const stack: M[] = []
  let lw = 1
  const lwStack: number[] = []
  const images: { dpi: number; r: ReturnType<typeof rectFrac> }[] = []
  let hairlines = 0
  const STROKES = new Set([O.stroke, O.closeStroke, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke])
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i] as unknown[]
    if (fn === O.save) { stack.push(ctm); lwStack.push(lw) }
    else if (fn === O.restore) { ctm = stack.pop() ?? ctm; lw = lwStack.pop() ?? lw }
    else if (fn === O.transform) ctm = mul(ctm, args as M)
    else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); lwStack.push(lw); if (Array.isArray(args[0])) ctm = mul(ctm, args[0] as M) }
    else if (fn === O.paintFormXObjectEnd) { ctm = stack.pop() ?? ctm; lw = lwStack.pop() ?? lw }
    else if (fn === O.setLineWidth) lw = Number(args[0])
    else if (fn === O.constructPath && STROKES.has(args[0] as number)) {
      const eff = lw === 0 ? 0 : lw * Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) * scale
      if (eff < 0.25) hairlines++
    } else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject) {
      let pw = Number(args[1]), ph = Number(args[2])
      if (fn === O.paintInlineImageXObject) { const d = args[0] as { width: number; height: number }; pw = d.width; ph = d.height }
      if (!pw || !ph) continue
      const dw = Math.hypot(ctm[0], ctm[1]) * scale, dh = Math.hypot(ctm[2], ctm[3]) * scale // pt at final size
      const dpi = Math.min(pw / (dw / 72), ph / (dh / 72))
      const pts = [apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)]
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
      images.push({ dpi, r: rectFrac(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)) })
    }
  }
  if (!images.length) findings.push({ level: 'pass', title: 'No raster images', detail: 'Pure vector artwork — scales to any size without quality loss.' })
  else {
    const worst = Math.min(...images.map((i) => i.dpi))
    const f = dpiFinding(worst, p, images.length === 1 ? 'Image resolution' : `Lowest of ${images.length} images`)
    findings.push(f)
    images.forEach((im) => {
      const lvl: Level = im.dpi >= p.good ? 'pass' : im.dpi >= p.min ? 'warn' : 'fail'
      if (lvl !== 'pass') markers.push({ kind: 'image', level: lvl, ...im.r, label: `${Math.round(im.dpi)} dpi` })
    })
  }
  if (hairlines) findings.push({ level: 'warn', title: `${hairlines} hairline stroke(s)`, detail: 'Lines thinner than 0.25 pt at print size may disappear or break up. Use at least 0.25–0.5 pt.' })

  const text = await pg.getTextContent()
  let nearEdge = 0
  for (const it of text.items) {
    if (!('str' in it) || !it.str.trim()) continue
    const [, , , d, e, f] = it.transform as number[]
    const h = Math.abs(d) || it.height
    const r = rectFrac(e, f, e + it.width, f + h)
    const outside = r.x < sf.x || r.y < sf.y || r.x + r.w > sf.x + sf.w || r.y + r.h > sf.y + sf.h
    if (outside) { nearEdge++; if (nearEdge <= 40) markers.push({ kind: 'text', level: 'warn', ...r, label: it.str.slice(0, 30) }) }
  }
  if (nearEdge) findings.push({ level: 'warn', title: `${nearEdge} text item(s) in the danger zone`, detail: `Text closer than ${p.safe} mm to the trim can be cut, folded into hems or hidden by eyelets. Highlighted in amber.` })
  else if (text.items.length) findings.push({ level: 'pass', title: 'Text inside the safe area', detail: `Live text keeps ${p.safe} mm from the trim.` })
  else findings.push({ level: 'info', title: 'No live text', detail: 'Text is outlined (or absent) — position cannot be checked, check the preview visually.' })

  await task.destroy()
  return {
    name: file.name, kind: 'pdf', preview, pages, docMm: trimMm, findings, markers,
    trim: { x0: tr.x, y0: tr.y, x1: tr.x + tr.w, y1: tr.y + tr.h },
    safe: { x0: sf.x, y0: sf.y, x1: sf.x + sf.w, y1: sf.y + sf.h },
  }
}
