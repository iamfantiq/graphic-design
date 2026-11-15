import { edgeStats, rgbToHex } from '../../lib/color'

import type { AiResult, Box } from '../../lib/smart'

export type Placement = 'auto' | 'smart' | 'fit' | 'fill' | 'recompose'
export type Fill = 'auto' | 'color' | 'extend' | 'blur'

export interface FormatSpec {
  id: string
  label: string
  short: string
  w: number
  h: number
  safe?: { top: number; bottom: number; left?: number; right?: number; note: string }
  /** carousel: number of equal slides the image is cut into */
  slices?: number
}

export const FORMATS: FormatSpec[] = [
  { id: 'square', label: 'Instagram / Facebook post', short: '1:1', w: 1080, h: 1080 },
  { id: 'portrait', label: 'Instagram portrait', short: '4:5', w: 1080, h: 1350 },
  { id: 'story', label: 'Stories · Reels · TikTok', short: '9:16', w: 1080, h: 1920,
    safe: { top: 250, bottom: 340, right: 120, note: 'Keep text out of the shaded UI areas' } },
  { id: 'landscape', label: 'YouTube · X · LinkedIn', short: '16:9', w: 1920, h: 1080 },
  { id: 'pin', label: 'Pinterest pin', short: '2:3', w: 1000, h: 1500 },
  { id: 'link', label: 'Link preview / LinkedIn', short: '1.91:1', w: 1200, h: 628 },
  { id: 'x-header', label: 'X header', short: '3:1', w: 1500, h: 500,
    safe: { top: 0, bottom: 0, left: 0, note: 'Profile photo overlaps bottom-left on mobile' } },
  { id: 'yt-thumb', label: 'YouTube thumbnail', short: '16:9', w: 1280, h: 720 },
]

export const DEFAULT_FORMATS = ['square', 'portrait', 'story', 'landscape']

export interface Adjust {
  placement: Placement
  fill: Fill
  zoom: number // multiplies the computed scale
  ox: number // -1..1
  oy: number // -1..1
  padding: number // 0..0.25 extra margin (fit / smart)
  bg: string | null // null = automatic
  blur: number
  dim: number
}

export const DEFAULT_ADJUST: Adjust = { placement: 'auto', fill: 'auto', zoom: 1, ox: 0, oy: 0, padding: 0, bg: null, blur: 24, dim: 0.15 }

export interface SourceInfo {
  canvas: HTMLCanvasElement
  edgeHex: string
  edgeVariance: number
  /** on-device content box (fractions) */
  keep: Box
}

export function analyse(canvas: HTMLCanvasElement, keep: Box): SourceInfo {
  const { color, variance } = edgeStats(canvas)
  return { canvas, edgeHex: rgbToHex(color), edgeVariance: variance, keep }
}

export function resolvePlacement(src: SourceInfo, fmt: FormatSpec, adj: Adjust, ai?: AiResult | null): Exclude<Placement, 'auto'> {
  if (adj.placement !== 'auto') {
    if (adj.placement === 'recompose' && !aiFormat(ai, fmt)?.placements.length) return 'smart'
    return adj.placement
  }
  if (fmt.slices) return 'fill' // a carousel is a panorama: fill the full width
  const f = aiFormat(ai, fmt)
  if (f) return f.strategy === 'crop' ? 'smart' : f.strategy === 'recompose' && f.placements.length ? 'recompose' : f.strategy === 'fit' ? 'fit' : 'smart'
  const ratio = Math.abs(Math.log((src.canvas.width / src.canvas.height) / (fmt.w / fmt.h)))
  if (ratio < 0.06) return 'fill' // nearly the same shape: a tiny crop is safe
  return 'smart'
}

export function resolveFill(src: SourceInfo, fmt: FormatSpec, adj: Adjust, ai?: AiResult | null): Exclude<Fill, 'auto'> {
  if (adj.fill !== 'auto') return adj.fill
  const f = aiFormat(ai, fmt)
  if (f) return f.fill
  if (src.edgeVariance < 14) return 'color'
  if (src.edgeVariance < 40) return 'extend'
  return 'blur'
}

const aiFormat = (ai: AiResult | null | undefined, fmt: FormatSpec) => ai?.analysis.formats.find((f) => f.id === fmt.id)

function softBlur(img: CanvasImageSource, w: number, h: number, strength: number) {
  // Downscale/upscale blur works in every browser (ctx.filter is not supported in older Safari).
  const factor = Math.max(4, strength)
  const sw = Math.max(2, Math.round(w / factor)), sh = Math.max(2, Math.round(h / factor))
  const small = document.createElement('canvas')
  small.width = sw; small.height = sh
  const sctx = small.getContext('2d')!
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(img, 0, 0, sw, sh)
  const mid = document.createElement('canvas')
  mid.width = Math.min(w, sw * 4); mid.height = Math.min(h, sh * 4)
  const mctx = mid.getContext('2d')!
  mctx.imageSmoothingQuality = 'high'
  mctx.drawImage(small, 0, 0, mid.width, mid.height)
  return mid
}

function drawFill(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, fill: Exclude<Fill, 'auto'>, adj: Adjust, bg: string, W: number, H: number,
  rect: { x: number; y: number; dw: number; dh: number } | null) {
  const sw = img.width, sh = img.height
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  if (fill === 'blur' || (fill === 'extend' && !rect)) {
    const cs = Math.max(W / sw, H / sh) * 1.08
    const bw = sw * cs, bh = sh * cs
    ctx.drawImage(softBlur(img, bw, bh, fill === 'blur' ? adj.blur : 40), (W - bw) / 2, (H - bh) / 2, bw, bh)
    if (adj.dim > 0 && fill === 'blur') { ctx.fillStyle = `rgba(0,0,0,${adj.dim})`; ctx.fillRect(0, 0, W, H) }
  } else if (fill === 'extend' && rect) {
    const { x, y, dw, dh } = rect
    const layer = document.createElement('canvas')
    layer.width = W; layer.height = H
    const l = layer.getContext('2d')!
    l.fillStyle = bg; l.fillRect(0, 0, W, H)
    const e = Math.max(1, Math.round(Math.min(sw, sh) * 0.01))
    if (x > 0) l.drawImage(img, 0, 0, e, sh, 0, y, x + 1, dh)
    if (x + dw < W) l.drawImage(img, sw - e, 0, e, sh, x + dw - 1, y, W - x - dw + 1, dh)
    if (y > 0) l.drawImage(img, 0, 0, sw, e, x, 0, dw, y + 1)
    if (y + dh < H) l.drawImage(img, 0, sh - e, sw, e, x, y + dh - 1, dw, H - y - dh + 1)
    const corner = (sx: number, sy: number, dx: number, dy: number, w: number, h: number) => { if (w > 0 && h > 0) l.drawImage(img, sx, sy, e, e, dx, dy, w, h) }
    corner(0, 0, 0, 0, x, y)
    corner(sw - e, 0, x + dw, 0, W - x - dw, y)
    corner(0, sh - e, 0, y + dh, x, H - y - dh)
    corner(sw - e, sh - e, x + dw, y + dh, W - x - dw, H - y - dh)
    ctx.drawImage(softBlur(layer, W, H, 10), 0, 0, W, H)
  }
}

/** Cut a region out with softly feathered edges, so it blends into gradient backgrounds. */
function featheredCut(img: HTMLCanvasElement, b: Box, feather: number) {
  const sx = b.x0 * img.width, sy = b.y0 * img.height
  const w = Math.max(1, (b.x1 - b.x0) * img.width), h = Math.max(1, (b.y1 - b.y0) * img.height)
  const c = document.createElement('canvas')
  c.width = Math.round(w); c.height = Math.round(h)
  const x = c.getContext('2d')!
  x.drawImage(img, sx, sy, w, h, 0, 0, c.width, c.height)
  if (feather > 0) {
    const f = Math.max(1, Math.min(c.width, c.height) * feather)
    x.globalCompositeOperation = 'destination-in'
    const gx = x.createLinearGradient(0, 0, c.width, 0)
    gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(f / c.width, '#000'); gx.addColorStop(1 - f / c.width, '#000'); gx.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = gx; x.fillRect(0, 0, c.width, c.height)
    const gy = x.createLinearGradient(0, 0, 0, c.height)
    gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(f / c.height, '#000'); gy.addColorStop(1 - f / c.height, '#000'); gy.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = gy; x.fillRect(0, 0, c.width, c.height)
  }
  return c
}

export interface RenderResult { placement: Exclude<Placement, 'auto'>; fill: Exclude<Fill, 'auto'> }

export function renderFormat(src: SourceInfo, fmt: FormatSpec, adj: Adjust, out: HTMLCanvasElement, scale = 1, ai?: AiResult | null): RenderResult {
  const W = Math.round(fmt.w * scale), H = Math.round(fmt.h * scale)
  out.width = W; out.height = H
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const img = src.canvas
  const sw = img.width, sh = img.height
  const placement = resolvePlacement(src, fmt, adj, ai)
  const fill = resolveFill(src, fmt, adj, ai)
  const bg = adj.bg ?? (ai?.analysis.background_color?.match(/^#[0-9a-f]{6}$/i) ? ai.analysis.background_color : src.edgeHex)

  if (placement === 'recompose') {
    drawFill(ctx, img, fill === 'extend' ? 'blur' : fill, { ...adj, dim: fill === 'blur' ? adj.dim : 0 }, bg, W, H, null)
    const f = aiFormat(ai, fmt)!
    const feather = ai!.analysis.background === 'flat' ? 0 : 0.06
    for (const p of f.placements) {
      const el = ai!.elements[p.element]
      if (!el) continue
      const cut = featheredCut(img, el.box, feather)
      const tx0 = Math.min(p.box.x0, p.box.x1) * W, ty0 = Math.min(p.box.y0, p.box.y1) * H
      const tw = Math.abs(p.box.x1 - p.box.x0) * W, th = Math.abs(p.box.y1 - p.box.y0) * H
      const s = Math.min(tw / cut.width, th / cut.height) * adj.zoom
      const dw = cut.width * s, dh = cut.height * s
      ctx.drawImage(cut, tx0 + (tw - dw) / 2 + adj.ox * W * 0.1, ty0 + (th - dh) / 2 + adj.oy * H * 0.1, dw, dh)
    }
    return { placement, fill }
  }

  const fit = Math.min(W / sw, H / sh)
  const cover = Math.max(W / sw, H / sh)
  let s: number, x: number, y: number
  if (placement === 'fill') {
    s = cover * adj.zoom
    const freeX = W - sw * s, freeY = H - sh * s
    x = freeX / 2 + (adj.ox * Math.abs(freeX)) / 2
    y = freeY / 2 + (adj.oy * Math.abs(freeY)) / 2
  } else if (placement === 'fit') {
    s = fit * adj.zoom * (1 - 2 * adj.padding)
    const freeX = W - sw * s, freeY = H - sh * s
    x = freeX / 2 + (adj.ox * Math.abs(freeX)) / 2
    y = freeY / 2 + (adj.oy * Math.abs(freeY)) / 2
  } else {
    // smart: keep the important region fully visible, as large as possible, crop the rest
    const k = ai?.keep ?? src.keep
    const kx = k.x0 * sw, ky = k.y0 * sh, kw = Math.max(1, (k.x1 - k.x0) * sw), kh = Math.max(1, (k.y1 - k.y0) * sh)
    const m = Math.min(W, H) * (0.04 + adj.padding)
    const safeT = fmt.safe ? (fmt.safe.top / fmt.h) * H : 0, safeB = fmt.safe ? (fmt.safe.bottom / fmt.h) * H : 0
    const top = Math.max(m, safeT), bottom = Math.max(m, safeB)
    const availW = W - 2 * m, availH = H - top - bottom
    s = Math.min(availW / kw, availH / kh, cover) * adj.zoom
    s = Math.max(s, fit * 0.5)
    const dw = sw * s, dh = sh * s
    x = m + availW / 2 - (kx + kw / 2) * s
    y = top + availH / 2 - (ky + kh / 2) * s
    // avoid empty gaps when the image is big enough to cover that side
    x = dw >= W ? Math.min(0, Math.max(W - dw, x)) : Math.max(0, Math.min(W - dw, x))
    y = dh >= H ? Math.min(0, Math.max(H - dh, y)) : Math.max(0, Math.min(H - dh, y))
    x += adj.ox * W * 0.25
    y += adj.oy * H * 0.25
  }
  const dw = sw * s, dh = sh * s
  const covers = x <= 0.5 && y <= 0.5 && x + dw >= W - 0.5 && y + dh >= H - 0.5
  if (!covers) drawFill(ctx, img, fill, adj, bg, W, H, { x, y, dw, dh })
  if (!covers && adj.padding > 0 && fill !== 'color') {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 40 * scale; ctx.shadowOffsetY = 12 * scale
    ctx.fillStyle = '#000'; ctx.fillRect(x, y, dw, dh)
    ctx.restore()
  }
  ctx.drawImage(img, x, y, dw, dh)
  return { placement, fill }
}
