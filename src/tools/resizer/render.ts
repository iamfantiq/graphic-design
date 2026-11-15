import { edgeStats, rgbToHex } from '../../lib/color'

export type FitMode = 'auto' | 'fill' | 'blur' | 'extend' | 'color'

export interface FormatSpec {
  id: string
  label: string
  short: string
  w: number
  h: number
  safe?: { top: number; bottom: number; left?: number; right?: number; note: string }
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
  mode: FitMode
  zoom: number // 1 = fit (or cover for fill)
  ox: number // -1..1
  oy: number // -1..1
  padding: number // 0..0.3 fraction of the shorter side (non-fill modes)
  bg: string | null // null = automatic
  blur: number // 4..60 strength for blur mode
  dim: number // 0..0.6 darkening of blurred background
}

export const DEFAULT_ADJUST: Adjust = { mode: 'auto', zoom: 1, ox: 0, oy: 0, padding: 0, bg: null, blur: 24, dim: 0.15 }

export interface SourceInfo {
  canvas: HTMLCanvasElement
  edgeHex: string
  edgeVariance: number
}

export function analyse(canvas: HTMLCanvasElement): SourceInfo {
  const { color, variance } = edgeStats(canvas)
  return { canvas, edgeHex: rgbToHex(color), edgeVariance: variance }
}

export function resolveMode(src: SourceInfo, fmt: FormatSpec, adj: Adjust): Exclude<FitMode, 'auto'> {
  if (adj.mode !== 'auto') return adj.mode
  const ratio = Math.abs(Math.log((src.canvas.width / src.canvas.height) / (fmt.w / fmt.h)))
  if (ratio < 0.06) return 'fill' // nearly the same shape: a tiny crop is safe
  if (src.edgeVariance < 14) return 'color' // flat background: extend with the poster's own colour
  if (src.edgeVariance < 40) return 'extend'
  return 'blur'
}

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

export function renderFormat(src: SourceInfo, fmt: FormatSpec, adj: Adjust, out: HTMLCanvasElement, scale = 1) {
  const W = Math.round(fmt.w * scale), H = Math.round(fmt.h * scale)
  out.width = W; out.height = H
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const img = src.canvas
  const sw = img.width, sh = img.height
  const mode = resolveMode(src, fmt, adj)
  const bg = adj.bg ?? src.edgeHex

  const fit = Math.min(W / sw, H / sh)
  const cover = Math.max(W / sw, H / sh)
  const pad = mode === 'fill' ? 0 : adj.padding
  const s = mode === 'fill' ? cover * adj.zoom : fit * adj.zoom * (1 - 2 * pad)
  const dw = sw * s, dh = sh * s
  const freeX = W - dw, freeY = H - dh
  const x = freeX / 2 + (adj.ox * Math.abs(freeX)) / 2
  const y = freeY / 2 + (adj.oy * Math.abs(freeY)) / 2

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  if (mode === 'blur') {
    const cs = cover * 1.08
    const bw = sw * cs, bh = sh * cs
    const blurred = softBlur(img, bw, bh, adj.blur)
    ctx.drawImage(blurred, (W - bw) / 2, (H - bh) / 2, bw, bh)
    if (adj.dim > 0) { ctx.fillStyle = `rgba(0,0,0,${adj.dim})`; ctx.fillRect(0, 0, W, H) }
  } else if (mode === 'extend') {
    // Stretch the outermost pixels of the artwork into the empty space, then soften.
    const layer = document.createElement('canvas')
    layer.width = W; layer.height = H
    const l = layer.getContext('2d')!
    l.fillStyle = bg; l.fillRect(0, 0, W, H)
    const e = Math.max(1, Math.round(Math.min(sw, sh) * 0.01))
    if (x > 0) l.drawImage(img, 0, 0, e, sh, 0, y, x + 1, dh)
    if (x + dw < W) l.drawImage(img, sw - e, 0, e, sh, x + dw - 1, y, W - x - dw + 1, dh)
    if (y > 0) l.drawImage(img, 0, 0, sw, e, x, 0, dw, y + 1)
    if (y + dh < H) l.drawImage(img, 0, sh - e, sw, e, x, y + dh - 1, dw, H - y - dh + 1)
    // corners
    const corner = (sx: number, sy: number, dx: number, dy: number, w: number, h: number) => { if (w > 0 && h > 0) l.drawImage(img, sx, sy, e, e, dx, dy, w, h) }
    corner(0, 0, 0, 0, x, y)
    corner(sw - e, 0, x + dw, 0, W - x - dw, y)
    corner(0, sh - e, 0, y + dh, x, H - y - dh)
    corner(sw - e, sh - e, x + dw, y + dh, W - x - dw, H - y - dh)
    ctx.drawImage(softBlur(layer, W, H, 10), 0, 0, W, H)
  }

  if (mode !== 'fill' && adj.padding > 0 && mode !== 'color') {
    // subtle shadow so a padded poster reads as an object
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 40 * scale
    ctx.shadowOffsetY = 12 * scale
    ctx.fillStyle = '#000'
    ctx.fillRect(x, y, dw, dh)
    ctx.restore()
  }
  ctx.drawImage(img, x, y, dw, dh)
  return mode
}
