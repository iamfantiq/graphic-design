import {
  PDFDocument, StandardFonts, cmyk, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix,
  moveTo, appendBezierCurve, closePath, clip, endPath, type Color, type PDFPage,
} from 'pdf-lib'
import { Circle, FabricImage, Line, Path, Rect, Textbox, util, type Canvas, type FabricObject } from 'fabric'
import { hexToRgb, outOfGamut, rgbToCmyk } from '../../lib/color'
import { fontStack, glyphFor } from '../../lib/fontFiles'
import { pathToD } from '../../lib/pathData'

export interface PdfOptions {
  widthMm: number
  heightMm: number
  bleedMm: number
  cropMarks: boolean
  colorMode: 'rgb' | 'cmyk'
  cmykOverrides?: Record<string, [number, number, number, number]>
  title: string
}

type M = [number, number, number, number, number, number]
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
]
const FLIP: M = [1, 0, 0, -1, 0, 0]
/** pdf-lib's SVG path parser can't read exponent notation (1e-13) — round every coordinate. */
const n = (v: number) => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? 0 : r }

function parseColor(c: unknown): { hex: string; alpha: number } | null {
  if (typeof c !== 'string' || !c || c === 'transparent') return null
  if (c.startsWith('#')) {
    const h = c.length === 4 ? '#' + [...c.slice(1)].map((x) => x + x).join('') : c.slice(0, 7)
    return { hex: h.toLowerCase(), alpha: 1 }
  }
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim())
    const hex = '#' + [r, g, b].map((v) => Math.round(Number(v)).toString(16).padStart(2, '0')).join('')
    return { hex, alpha: Number(a) }
  }
  return null
}

/**
 * Export the editor canvas as a print-ready vector PDF:
 * shapes stay vector, text is converted to outlines (same font files as on screen),
 * images are embedded at full source resolution, with bleed, crop marks and Trim/BleedBox.
 */
export async function exportVectorPdf(canvas: Canvas, W: number, H: number, opt: PdfOptions): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const warnings: string[] = []
  const slug = opt.cropMarks ? 10 : 0
  const ptPerMm = 72 / 25.4
  const k = (opt.widthMm / W) * ptPerMm // pt per design px
  const ky = (opt.heightMm / H) * ptPerMm
  if (Math.abs(k - ky) / k > 0.01) warnings.push('Paper proportions differ from the design — it was scaled to the width.')
  const bleedPx = (opt.bleedMm * ptPerMm) / k
  const off = (slug + opt.bleedMm) * ptPerMm // trim origin in pt
  const pageW = opt.widthMm * ptPerMm + 2 * off
  const pageH = H * k + 2 * off

  const doc = await PDFDocument.create()
  doc.setTitle(opt.title)
  doc.setCreator('Formatter')
  const page = doc.addPage([pageW, pageH])
  page.setTrimBox(off, off, W * k, H * k)
  page.setBleedBox(slug * ptPerMm, slug * ptPerMm, W * k + 2 * opt.bleedMm * ptPerMm, H * k + 2 * opt.bleedMm * ptPerMm)
  // canvas px (y down) → PDF pt (y up)
  const BASE: M = [k, 0, 0, -k, off, pageH - off]

  const vivid = new Set<string>()
  const col = (hex: string): Color => {
    if (opt.colorMode === 'cmyk' && !opt.cmykOverrides?.[hex] && outOfGamut(hex)) vivid.add(hex)
    const [r, g, b] = hexToRgb(hex)
    if (opt.colorMode === 'rgb') return rgb(r / 255, g / 255, b / 255)
    const c = opt.cmykOverrides?.[hex] ?? rgbToCmyk([r, g, b])
    return cmyk(c[0] / 100, c[1] / 100, c[2] / 100, c[3] / 100)
  }
  const withMatrix = (p: PDFPage, m: M, draw: () => void) => {
    p.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m))
    draw()
    p.pushOperators(popGraphicsState())
  }

  // background, extended into the bleed
  const bg = parseColor(canvas.backgroundColor)
  if (bg) page.drawRectangle({ x: slug * ptPerMm, y: slug * ptPerMm, width: W * k + 2 * opt.bleedMm * ptPerMm, height: H * k + 2 * opt.bleedMm * ptPerMm, color: col(bg.hex), opacity: bg.alpha })

  const near = (a: number, b: number) => Math.abs(a - b) < 1.5
  let imageCount = 0

  for (const obj of canvas.getObjects() as FabricObject[]) {
    if (!obj.visible) continue
    try {
    const opacity = obj.opacity ?? 1
    const M0 = obj.calcTransformMatrix() as unknown as M
    const unrotated = Math.abs(((obj.angle ?? 0) % 360 + 360) % 90) < 0.01 && (obj.angle ?? 0) % 180 === 0
    const br = obj.getBoundingRect()

    // Full-bleed elements: grow edges that touch the trim out into the bleed
    let grow = { l: 0, t: 0, r: 0, b: 0 }
    if (unrotated && (obj instanceof Rect || obj instanceof FabricImage)) {
      grow = {
        l: near(br.left, 0) ? bleedPx : 0, t: near(br.top, 0) ? bleedPx : 0,
        r: near(br.left + br.width, W) ? bleedPx : 0, b: near(br.top + br.height, H) ? bleedPx : 0,
      }
    }

    if (obj instanceof Textbox) {
      const fill = parseColor(obj.fill)
      if (!fill) continue
      const fonts = await fontStack(String(obj.fontFamily), Number(obj.fontWeight) || 400)
      if (!fonts.length) { warnings.push(`No outline font for “${obj.fontFamily}” — text skipped.`); continue }
      if (obj.fontStyle === 'italic') warnings.push(`Italic “${obj.fontFamily}” exported upright.`)
      const t = obj as unknown as { __charBounds: { left: number }[][]; getHeightOfLineImpl(i: number): number; _fontSizeFraction: number; _getLineLeftOffset(i: number): number; _textLines: string[][] }
      const size = obj.fontSize
      let d = ''
      let y = -obj.height / 2
      for (let i = 0; i < t._textLines.length; i++) {
        const lineImpl = t.getHeightOfLineImpl(i)
        const baseline = y + lineImpl * (1 - t._fontSizeFraction)
        const left = -obj.width / 2 + t._getLineLeftOffset(i)
        const line = t._textLines[i]
        for (let j = 0; j < line.length; j++) {
          const ch = line[j]
          if (!ch.trim()) continue
          const { g } = glyphFor(fonts, ch)
          d += pathToD(g.getPath(left + (t.__charBounds[i]?.[j]?.left ?? 0), baseline, size))
        }
        y += obj.getHeightOfLine(i)
      }
      if (d) withMatrix(page, mul(mul(BASE, M0), FLIP), () => page.drawSvgPath(d, { x: 0, y: 0, color: col(fill.hex), opacity: opacity * fill.alpha, borderWidth: 0 }))
      continue
    }

    if (obj instanceof FabricImage) {
      const el = obj.getElement() as HTMLImageElement | HTMLCanvasElement
      const natW = (el as HTMLImageElement).naturalWidth || el.width, natH = (el as HTMLImageElement).naturalHeight || el.height
      const sx = obj.scaleX ?? 1, sy = obj.scaleY ?? 1
      // extend the crop into the bleed when the source has the pixels, otherwise stretch slightly
      let cx = obj.cropX ?? 0, cy = obj.cropY ?? 0, cw = obj.width, ch = obj.height
      const want = { l: grow.l / sx, t: grow.t / sy, r: grow.r / sx, b: grow.b / sy }
      const take = { l: Math.min(want.l, cx), t: Math.min(want.t, cy), r: Math.min(want.r, natW - cx - cw), b: Math.min(want.b, natH - cy - ch) }
      cx -= take.l; cy -= take.t; cw += take.l + take.r; ch += take.t + take.b
      // drawn box in object-local px (before scale), centred at the object centre
      const x0 = -obj.width / 2 - want.l, y0 = -obj.height / 2 - want.t
      const dw = obj.width + want.l + want.r, dh = obj.height + want.t + want.b
      const c = document.createElement('canvas')
      const cap = Math.min(1, 6000 / Math.max(cw, ch))
      c.width = Math.max(1, Math.round(cw * cap)); c.height = Math.max(1, Math.round(ch * cap))
      const ctx = c.getContext('2d')!
      ctx.drawImage(el, cx, cy, cw, ch, 0, 0, c.width, c.height)
      const hasAlpha = (() => { const d = ctx.getImageData(0, 0, Math.min(64, c.width), Math.min(64, c.height)).data; for (let i = 3; i < d.length; i += 16) if (d[i] < 250) return true; return false })()
      const bytes = await (await fetch(c.toDataURL(hasAlpha || obj.clipPath ? 'image/png' : 'image/jpeg', 0.92))).arrayBuffer()
      const img = hasAlpha || obj.clipPath ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
      imageCount++
      const L = mul(BASE, M0)
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...L))
      if (obj.clipPath instanceof Circle) {
        const r = obj.clipPath.radius * (obj.clipPath.scaleX ?? 1), q = r * 0.5523
        page.pushOperators(moveTo(r, 0), appendBezierCurve(r, q, q, r, 0, r), appendBezierCurve(-q, r, -r, q, -r, 0),
          appendBezierCurve(-r, -q, -q, -r, 0, -r), appendBezierCurve(q, -r, r, -q, r, 0), closePath(), clip(), endPath())
      }
      // unit image square → local box (image rows go downwards)
      page.pushOperators(concatTransformationMatrix(dw, 0, 0, -dh, x0, y0 + dh))
      page.drawImage(img, { x: 0, y: 0, width: 1, height: 1, opacity })
      page.pushOperators(popGraphicsState())
      continue
    }

    let d = ''
    let local: M = [1, 0, 0, 1, 0, 0]
    if (obj instanceof Rect) {
      const w = obj.width, h = obj.height
      const x = -w / 2 - grow.l / (obj.scaleX ?? 1), y = -h / 2 - grow.t / (obj.scaleY ?? 1)
      const ww = w + (grow.l + grow.r) / (obj.scaleX ?? 1), hh = h + (grow.t + grow.b) / (obj.scaleY ?? 1)
      const rx = Math.min(obj.rx ?? 0, ww / 2), ry = Math.min(obj.ry ?? 0, hh / 2)
      d = rx > 0
        ? `M${n(x + rx)} ${n(y)} H${n(x + ww - rx)} A${n(rx)} ${n(ry)} 0 0 1 ${n(x + ww)} ${n(y + ry)} V${n(y + hh - ry)} A${n(rx)} ${n(ry)} 0 0 1 ${n(x + ww - rx)} ${n(y + hh)} H${n(x + rx)} A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(y + hh - ry)} V${n(y + ry)} A${n(rx)} ${n(ry)} 0 0 1 ${n(x + rx)} ${n(y)} Z`
        : `M${n(x)} ${n(y)} H${n(x + ww)} V${n(y + hh)} H${n(x)} Z`
    } else if (obj instanceof Circle) {
      const r = obj.radius
      d = `M${n(r)} 0 A${n(r)} ${n(r)} 0 1 1 ${n(-r)} 0 A${n(r)} ${n(r)} 0 1 1 ${n(r)} 0 Z`
    } else if (obj instanceof Line) {
      const p = obj.calcLinePoints()
      d = `M${n(p.x1)} ${n(p.y1)} L${n(p.x2)} ${n(p.y2)}`
    } else if (obj instanceof Path) {
      d = (obj as Path & { svgD?: string }).svgD ?? util.joinPath(obj.path, 3)
      local = [1, 0, 0, 1, -obj.pathOffset.x, -obj.pathOffset.y]
    } else {
      warnings.push(`Unsupported element “${obj.type}” skipped.`)
      continue
    }
    const fill = obj instanceof Line ? null : parseColor(obj.fill)
    const stroke = parseColor(obj.stroke)
    const sw = obj.strokeWidth ?? 0
    if (!fill && !(stroke && sw > 0)) continue
    withMatrix(page, mul(mul(mul(BASE, M0), local), FLIP), () => page.drawSvgPath(d, {
      x: 0, y: 0,
      color: fill ? col(fill.hex) : undefined,
      opacity: fill ? opacity * fill.alpha : undefined,
      borderColor: stroke && sw > 0 ? col(stroke.hex) : undefined,
      borderWidth: stroke && sw > 0 ? sw : 0,
      borderOpacity: stroke ? opacity * stroke.alpha : undefined,
      borderLineCap: obj instanceof Line ? 0 : undefined,
    }))
    } catch (e) {
      const nm = (obj as FabricObject & { name?: string }).name ?? obj.type
      console.error('PDF export: element failed', nm, e)
      warnings.push(`Skipped “${nm}”: ${(e as Error).message}`)
    }
  }

  if (opt.cropMarks) {
    const reg = opt.colorMode === 'cmyk' ? cmyk(1, 1, 1, 1) : rgb(0, 0, 0)
    const gap = (opt.bleedMm + 2) * ptPerMm, len = (slug - 3) * ptPerMm
    const tx = [off, off + W * k], ty = [off, off + H * k]
    for (const x of tx) for (const y of ty) {
      const sx = x === off ? -1 : 1, sy = y === off ? -1 : 1
      page.drawLine({ start: { x: x + sx * gap, y }, end: { x: x + sx * (gap + len), y }, thickness: 0.3, color: reg })
      page.drawLine({ start: { x, y: y + sy * gap }, end: { x, y: y + sy * (gap + len) }, thickness: 0.3, color: reg })
    }
    const helv = await doc.embedFont(StandardFonts.Helvetica)
    page.drawText(`${opt.title.replace(/[^\x20-\x7e]/g, '')}  |  ${opt.widthMm} x ${opt.heightMm} mm  |  bleed ${opt.bleedMm} mm  |  ${opt.colorMode.toUpperCase()}`,
      { x: off, y: pageH - slug * ptPerMm * 0.6, size: 6, font: helv, color: reg })
  }
  if (vivid.size) warnings.push(`${[...vivid].map((h) => h.toUpperCase()).join(', ')} ${vivid.size > 1 ? 'are' : 'is'} brighter than CMYK ink can print — ${vivid.size > 1 ? 'they' : 'it'} will come out duller. Ask for a printed proof, or use a spot/fluorescent ink.`)
  if (imageCount && opt.colorMode === 'cmyk') warnings.push('Photos stay RGB inside the PDF — the printer converts them. Shapes and text are CMYK.')
  return { bytes: await doc.save(), warnings }
}
