import { PDFDocument, StandardFonts, cmyk, rgb, type Color, type PDFEmbeddedPage } from 'pdf-lib'
import { hexToRgb, rgbToCmyk } from '../../lib/color'
import type { Logo } from './logo'
import { loadFamily, textToPath, type FontKey } from './fonts'

export type Layout = 'center' | 'left' | 'right' | 'repeat'

export interface BannerConfig {
  widthMm: number
  heightMm: number
  bleedMm: number
  safeMm: number
  cropMarks: boolean
  colorMode: 'rgb' | 'cmyk'
  bg: string
  /** manual CMYK overrides keyed by hex colour */
  cmykOverrides: Record<string, [number, number, number, number]>
  layout: Layout
  logoSize: number // fraction of safe-area height
  offsetX: number // -1..1
  offsetY: number // -1..1
  logoColorMap: Record<string, string>
  text1: string
  text2: string
  textColor: string
  font: FontKey
  textSize: number // text1 cap height as fraction of logo height
  tracking: number
  uppercase: boolean
  repeatSize: number // logo height in mm for step & repeat
  repeatGap: number // fraction of logo width
  repeatStagger: boolean
}

export const DEFAULT_CONFIG: BannerConfig = {
  widthMm: 3000, heightMm: 1000, bleedMm: 20, safeMm: 50, cropMarks: true, colorMode: 'cmyk',
  bg: '#ffffff', cmykOverrides: {}, layout: 'center', logoSize: 0.6, offsetX: 0, offsetY: 0, logoColorMap: {},
  text1: '', text2: '', textColor: '#111111', font: 'inter', textSize: 0.22, tracking: 0, uppercase: false,
  repeatSize: 180, repeatGap: 0.6, repeatStagger: true,
}

/** PDF pages are limited to 200 × 200 in (5080 mm). Larger formats are built at 1:10 — standard practice for large-format print. */
export const MAX_PAGE_MM = 5080
export function pdfScale(cfg: BannerConfig) {
  const slug = cfg.cropMarks ? 15 : 0
  const big = Math.max(cfg.widthMm, cfg.heightMm) + 2 * (cfg.bleedMm + slug)
  return big > MAX_PAGE_MM ? 0.1 : 1
}

export function geometry(cfg: BannerConfig) {
  const scale = pdfScale(cfg)
  const slug = cfg.cropMarks ? 15 : 0
  const k = (72 / 25.4) * scale // mm → pt
  const pageW = (cfg.widthMm + 2 * (cfg.bleedMm + slug)) * k
  const pageH = (cfg.heightMm + 2 * (cfg.bleedMm + slug)) * k
  const off = slug + cfg.bleedMm // trim origin offset in mm
  return { scale, slug, k, pageW, pageH, off }
}

export function colorFor(cfg: BannerConfig, hex: string): Color {
  const [r, g, b] = hexToRgb(hex)
  if (cfg.colorMode === 'rgb') return rgb(r / 255, g / 255, b / 255)
  const c = cfg.cmykOverrides[hex] ?? rgbToCmyk([r, g, b])
  return cmyk(c[0] / 100, c[1] / 100, c[2] / 100, c[3] / 100)
}

interface Box { x: number; y: number; w: number; h: number } // mm, trim space, top-left origin

/** Layout maths shared by the PDF builder and the on-screen guides. */
export function layoutBoxes(cfg: BannerConfig, logoAspect: number, text: { w1: number; w2: number; h1: number; h2: number } | null) {
  const safe: Box = { x: cfg.safeMm, y: cfg.safeMm, w: cfg.widthMm - 2 * cfg.safeMm, h: cfg.heightMm - 2 * cfg.safeMm }
  let lh = safe.h * cfg.logoSize
  let lw = lh * logoAspect
  // text dimensions are given per mm of logo height
  const t = text ?? { w1: 0, w2: 0, h1: 0, h2: 0 }
  const hasText = t.w1 > 0 || t.w2 > 0
  const gap = 0.18 // of logo height
  const measure = (h: number) => {
    const tw = Math.max(t.w1, t.w2) * h, th = (t.h1 + t.h2) * h + (t.h1 && t.h2 ? 0.12 * h : 0)
    if (!hasText) return { gw: lh * logoAspect * (h / lh), gh: h }
    if (cfg.layout === 'center') return { gw: Math.max(h * logoAspect, tw), gh: h + gap * h + th }
    return { gw: h * logoAspect + gap * h * 1.4 + tw, gh: Math.max(h, th) }
  }
  let { gw, gh } = measure(lh)
  const fit = Math.min(1, safe.w / gw, safe.h / gh)
  lh *= fit; lw = lh * logoAspect
  ;({ gw, gh } = measure(lh))
  const gx = safe.x + (safe.w - gw) / 2 + (cfg.offsetX * (safe.w - gw)) / 2
  const gy = safe.y + (safe.h - gh) / 2 + (cfg.offsetY * (safe.h - gh)) / 2
  const logo: Box = { x: gx, y: gy, w: lw, h: lh }
  const lines: { x: number; y: number; size: number; align: 'left' | 'center' | 'right'; which: 1 | 2 }[] = []
  if (hasText) {
    if (cfg.layout === 'center') {
      logo.x = gx + (gw - lw) / 2
      let y = gy + lh + gap * lh
      if (t.h1) { lines.push({ x: gx + gw / 2, y: y + t.h1 * lh, size: lh, align: 'center', which: 1 }); y += t.h1 * lh + 0.12 * lh }
      if (t.h2) lines.push({ x: gx + gw / 2, y: y + t.h2 * lh, size: lh, align: 'center', which: 2 })
    } else {
      const th = (t.h1 + t.h2) * lh + (t.h1 && t.h2 ? 0.12 * lh : 0)
      const textLeft = cfg.layout === 'left'
      logo.x = textLeft ? gx : gx + gw - lw
      logo.y = gy + (gh - lh) / 2
      const tx = textLeft ? gx + lw + gap * lh * 1.4 : gx
      let y = gy + (gh - th) / 2
      const align = textLeft ? 'left' : 'right'
      const ax = textLeft ? tx : gx + gw - lw - gap * lh * 1.4
      if (t.h1) { lines.push({ x: ax, y: y + t.h1 * lh, size: lh, align, which: 1 }); y += t.h1 * lh + 0.12 * lh }
      if (t.h2) lines.push({ x: ax, y: y + t.h2 * lh, size: lh, align, which: 2 })
    }
  }
  return { safe, logo, lines }
}

async function logoPage(doc: PDFDocument, logo: Logo, cfg: BannerConfig): Promise<PDFEmbeddedPage> {
  if (logo.kind === 'traced' && logo.traced) {
    const t = logo.traced
    const ld = await PDFDocument.create()
    const p = ld.addPage([t.w, t.h])
    for (const path of t.paths) {
      const col = cfg.logoColorMap[path.color] ?? path.color
      p.drawSvgPath(path.d, { x: 0, y: t.h, color: colorFor(cfg, col), borderWidth: 0 })
    }
    const [emb] = await doc.embedPdf(await ld.save())
    return emb
  }
  const src = await PDFDocument.load(logo.pdfBytes!, { ignoreEncryption: true })
  const page = src.getPage(0)
  const cb = page.getCropBox()
  const b = logo.bounds ?? { x0: 0, y0: 0, x1: 1, y1: 1 }
  return doc.embedPage(page, {
    left: cb.x + b.x0 * cb.width,
    right: cb.x + b.x1 * cb.width,
    top: cb.y + cb.height - b.y0 * cb.height,
    bottom: cb.y + cb.height - b.y1 * cb.height,
  })
}

export async function buildBannerPdf(cfg: BannerConfig, logo: Logo | null, fileLabel: string): Promise<Uint8Array> {
  const g = geometry(cfg)
  const doc = await PDFDocument.create()
  doc.setTitle(`${fileLabel} ${cfg.widthMm}x${cfg.heightMm}mm`)
  doc.setCreator('Formatter')
  doc.setProducer('Formatter (pdf-lib)')
  const page = doc.addPage([g.pageW, g.pageH])
  const X = (mm: number) => (g.off + mm) * g.k
  const Y = (mm: number) => g.pageH - (g.off + mm) * g.k

  // Boxes printers rely on
  const bleedX = g.slug * g.k, bleedW = (cfg.widthMm + 2 * cfg.bleedMm) * g.k, bleedH = (cfg.heightMm + 2 * cfg.bleedMm) * g.k
  page.setBleedBox(bleedX, bleedX, bleedW, bleedH)
  page.setTrimBox(X(0), Y(cfg.heightMm), cfg.widthMm * g.k, cfg.heightMm * g.k)

  page.drawRectangle({ x: bleedX, y: bleedX, width: bleedW, height: bleedH, color: colorFor(cfg, cfg.bg), borderWidth: 0 })

  if (logo) {
    const emb = await logoPage(doc, logo, cfg)
    if (cfg.layout === 'repeat') {
      const h = cfg.repeatSize, w = h * logo.aspect
      const stepX = w * (1 + cfg.repeatGap), stepY = h * (1 + cfg.repeatGap * 0.8)
      const x0 = -cfg.bleedMm, y0 = -cfg.bleedMm, x1 = cfg.widthMm + cfg.bleedMm, y1 = cfg.heightMm + cfg.bleedMm
      // centre the grid on the trim
      const cols = Math.ceil((x1 - x0) / stepX) + 2, rows = Math.ceil((y1 - y0) / stepY) + 2
      const startX = cfg.widthMm / 2 - Math.floor(cols / 2) * stepX - w / 2
      const startY = cfg.heightMm / 2 - Math.floor(rows / 2) * stepY - h / 2
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols + 1; c++) {
          const x = startX + c * stepX + (cfg.repeatStagger && r % 2 ? stepX / 2 : 0)
          const y = startY + r * stepY
          if (x + w < x0 || x > x1 || y + h < y0 || y > y1) continue
          page.drawPage(emb, { x: X(x), y: Y(y + h), width: w * g.k, height: h * g.k })
        }
      }
    } else {
      const fonts = cfg.text1 || cfg.text2 ? await loadFamily(cfg.font) : null
      const prep = (s: string) => (cfg.uppercase ? s.toUpperCase() : s).trim()
      const t1 = prep(cfg.text1), t2 = prep(cfg.text2)
      // measure text at size 1 (per mm of logo height)
      const ref = 1000
      const s1 = fonts && t1 ? textToPath(fonts, t1, ref, cfg.tracking) : null
      const s2 = fonts && t2 ? textToPath(fonts, t2, ref * 0.55, cfg.tracking) : null
      const ts = cfg.textSize / (s1 ? s1.ascent / ref : 1)
      const tm = {
        w1: s1 ? (s1.width / ref) * ts : 0, h1: s1 ? (s1.ascent / ref) * ts : 0,
        w2: s2 ? (s2.width / ref) * ts : 0, h2: s2 ? (s2.ascent / ref) * ts : 0,
      }
      const L = layoutBoxes(cfg, logo.aspect, s1 || s2 ? tm : null)
      page.drawPage(emb, { x: X(L.logo.x), y: Y(L.logo.y + L.logo.h), width: L.logo.w * g.k, height: L.logo.h * g.k })
      for (const line of L.lines) {
        const shape = line.which === 1 ? s1! : s2!
        const scale = (line.size * ts / ref) * g.k
        const w = (shape.width / ref) * ts * line.size
        const x = line.align === 'left' ? line.x : line.align === 'center' ? line.x - w / 2 : line.x - w
        page.drawSvgPath(shape.d, { x: X(x), y: Y(line.y), scale, color: colorFor(cfg, cfg.textColor), borderWidth: 0 })
      }
    }
  }

  if (cfg.cropMarks) {
    const reg = cfg.colorMode === 'cmyk' ? cmyk(1, 1, 1, 1) : rgb(0, 0, 0)
    const th = 0.5 * Math.max(0.3, g.scale)
    const gapMm = cfg.bleedMm + 3, len = g.slug - 4
    const marks: [number, number, number, number][] = []
    for (const tx of [0, cfg.widthMm]) for (const ty of [0, cfg.heightMm]) {
      const sx = tx === 0 ? -1 : 1, sy = ty === 0 ? -1 : 1
      marks.push([tx + sx * gapMm, ty, tx + sx * (gapMm + len), ty]) // horizontal
      marks.push([tx, ty + sy * gapMm, tx, ty + sy * (gapMm + len)]) // vertical
    }
    for (const [a, b, c, d] of marks) page.drawLine({ start: { x: X(a), y: Y(b) }, end: { x: X(c), y: Y(d) }, thickness: th, color: reg })
    const helv = await doc.embedFont(StandardFonts.Helvetica)
    const info = `${fileLabel.replace(/[^\x20-\x7e]/g, '')}  |  trim ${cfg.widthMm} x ${cfg.heightMm} mm  |  bleed ${cfg.bleedMm} mm  |  ${cfg.colorMode.toUpperCase()}${g.scale !== 1 ? '  |  SCALE 1:10 - print at 1000%' : ''}`
    page.drawText(info, { x: X(0), y: g.pageH - g.slug * g.k * 0.55, size: Math.max(4, 7 * g.scale * 1.6), font: helv, color: reg })
  }

  return doc.save()
}
