import type { Content, FontPair, Palette } from './design'
import { LINE_MULT, type El, type Scene, type TextEl } from './scene'

export interface GenImage { src: string; w: number; h: number }
export interface GenInput { W: number; H: number; P: Palette; F: FontPair; C: Content; img?: GenImage | null; seed: number }

export function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (a: number, b: number) => a + next() * (b - a),
    pick: <T,>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  }
}
type R = ReturnType<typeof rng>

const mctx = document.createElement('canvas').getContext('2d')!
export function measure(text: string, font: string, weight: number, size: number, ls = 0, italic = false) {
  mctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px "${font}"`
  return mctx.measureText(text).width + ls * size * Math.max(0, [...text].length - 1)
}

/** Split text into n lines with balanced lengths. */
export function balance(text: string, n: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (n <= 1 || words.length <= 1) return [words.join(' ')]
  if (words.length <= n) return words
  const total = words.join(' ').length
  const target = total / n
  const lines: string[] = []
  let cur: string[] = []
  for (let i = 0; i < words.length; i++) {
    const remainingLines = n - lines.length
    const remainingWords = words.length - i
    cur.push(words[i])
    const len = cur.join(' ').length
    const nextLen = i + 1 < words.length ? len + 1 + words[i + 1].length : len
    if (remainingLines > 1 && (Math.abs(nextLen - target) > Math.abs(len - target) || remainingWords - 1 < remainingLines)) {
      lines.push(cur.join(' ')); cur = []
    }
  }
  if (cur.length) lines.push(cur.join(' '))
  return lines
}

interface Fit { text: string; size: number; height: number; width: number; lines: number }
/** Largest font size such that the (re-broken) text fits maxW × maxH. */
export function fitText(text: string, font: string, weight: number, maxW: number, maxH: number, opts: { lh?: number; ls?: number; maxLines?: number; minLines?: number; maxSize?: number } = {}): Fit {
  const lh = opts.lh ?? 0.9
  const words = text.trim().split(/\s+/).length
  let best: Fit = { text, size: 10, height: 10, width: 10, lines: 1 }
  for (let n = opts.minLines ?? 1; n <= Math.min(opts.maxLines ?? 4, Math.max(1, words)); n++) {
    const lines = balance(text, n)
    const wMax = Math.max(...lines.map((l) => measure(l, font, weight, 100, opts.ls)))
    let size = (maxW / wMax) * 100
    size = Math.min(size, maxH / (lines.length * lh * LINE_MULT), opts.maxSize ?? Infinity)
    if (size > best.size) best = { text: lines.join('\n'), size, height: lines.length * lh * LINE_MULT * size, width: (wMax * size) / 100, lines: lines.length }
  }
  return best
}

export function textHeight(t: Pick<TextEl, 'text' | 'size' | 'lh'>) {
  return t.text.split('\n').length * (t.lh ?? 1.2) * LINE_MULT * t.size
}

const U = (F: FontPair, s: string) => (F.upper ? s.toUpperCase() : s)
const lines = (...parts: string[]) => parts.filter(Boolean).join('\n')

function imageOrBlock(g: GenInput, x: number, y: number, w: number, h: number, fill: string, r: R, opts: { gray?: boolean; clip?: 'circle' } = {}): El[] {
  if (g.img) return [{ type: 'image', x, y, w, h, src: g.img.src, gray: opts.gray, clip: opts.clip, name: 'Image' }]
  if (opts.clip === 'circle') return [{ type: 'circle', cx: x + w / 2, cy: y + h / 2, r: Math.min(w, h) / 2, fill, name: 'Circle' }]
  // Without a photo, fill the slot with an abstract graphic instead of a grey placeholder.
  const els: El[] = [{ type: 'rect', x, y, w, h, fill, name: 'Block' }]
  const kind = r.pick(['circle', 'stripes', 'none'] as const)
  if (kind === 'circle') els.push({ type: 'circle', cx: x + w * r.range(0.3, 0.7), cy: y + h * r.range(0.3, 0.7), r: Math.min(w, h) * r.range(0.25, 0.42), fill: g.P.alt === fill ? g.P.bg : g.P.alt, name: 'Circle' })
  if (kind === 'stripes') {
    const n = Math.round(r.range(4, 9))
    for (let i = 0; i < n; i += 2) els.push({ type: 'rect', x, y: y + (h / n) * i, w, h: h / n, fill: g.P.fg, opacity: 0.9, name: 'Stripe' })
  }
  return els
}

type Arche = { id: string; name: string; build: (g: GenInput, r: R) => El[] }

export const ARCHETYPES: Arche[] = [
  {
    id: 'swiss', name: 'Swiss grid', build: (g, r) => {
      const { W, H, P, F, C } = g
      const m = Math.min(W, H) * r.range(0.05, 0.07)
      const cw = W - 2 * m
      const els: El[] = []
      const shape = r.pick(['circle', 'rect'] as const)
      const sr = Math.min(W, H) * r.range(0.3, 0.45)
      if (shape === 'circle') els.push({ type: 'circle', cx: W * r.pick([0.72, 0.62, 0.3]), cy: H * r.range(0.42, 0.62), r: sr, fill: P.accent, name: 'Accent' })
      else els.push({ type: 'rect', x: W * r.pick([0.38, 0.5]), y: H * r.range(0.3, 0.45), w: W * 0.62, h: H * 0.32, fill: P.accent, name: 'Accent' })
      const titleTop = r.chance(0.6)
      const fit = fitText(U(F, C.title), F.display, F.dw, cw, H * 0.34, { lh: 0.88, ls: -0.02, maxLines: 3 })
      const ty = titleTop ? m : H - m - fit.height - H * 0.16
      els.push({ type: 'text', text: fit.text, x: m, y: ty, w: cw, size: fit.size, font: F.display, weight: F.dw, fill: P.fg, lh: 0.88, ls: -0.02, name: 'Title' })
      const small = Math.max(14, Math.min(W, H) * 0.022)
      if (C.subtitle) els.push({ type: 'text', text: C.subtitle, x: m, y: ty + fit.height + small, w: cw * 0.6, size: small * 1.25, font: F.text, weight: F.tw, fill: P.fg, lh: 1.2, name: 'Subtitle' })
      const infoY = H - m - small * 4.4
      els.push({ type: 'line', x1: m, y1: infoY - small, x2: W - m, y2: infoY - small, stroke: P.fg, sw: Math.max(1.5, small * 0.1), name: 'Rule' })
      const col = cw / 3
      els.push({ type: 'text', text: lines(C.date), x: m, y: infoY, w: col - small, size: small, font: F.text, weight: 700, fill: P.fg, lh: 1.25, name: 'Date' })
      els.push({ type: 'text', text: C.place, x: m + col, y: infoY, w: col - small, size: small, font: F.text, weight: F.tw, fill: P.fg, lh: 1.25, name: 'Place' })
      els.push({ type: 'text', text: lines(C.body, C.footer), x: m + col * 2, y: infoY, w: col, size: small, font: F.text, weight: F.tw, fill: P.fg, lh: 1.25, name: 'Info' })
      return els
    },
  },
  {
    id: 'stack', name: 'Type stack', build: (g, r) => {
      const { W, H, P, F, C } = g
      const m = Math.min(W, H) * 0.05
      const swap = r.chance(0.5)
      const bg = swap ? P.fg : P.bg
      const c1 = swap ? P.bg : P.fg
      const els: El[] = [{ type: 'rect', x: 0, y: 0, w: W, h: H, fill: bg, name: 'Background' }]
      const small = Math.max(14, Math.min(W, H) * 0.022)
      const words = U(F, C.title).split(/\s+/)
      const top = m + small * 2.6, bottom = H - m - small * 3
      const avail = bottom - top
      const lh = 0.86
      // each word fills the full width
      const sizes = words.map((w) => (W - 2 * m) / measure(w, F.display, F.dw, 100, -0.01) * 100)
      const totalH = sizes.reduce((a, s) => a + s * lh * LINE_MULT, 0)
      const k = Math.min(1, avail / totalH)
      let y = top + (avail - totalH * k) * (r.chance(0.5) ? 1 : 0.5)
      words.forEach((w, i) => {
        const size = sizes[i] * k
        const fill = i % 2 === (r.chance(0.5) ? 1 : 0) ? P.accent : c1
        els.push({ type: 'text', text: w, x: m, y, w: W - 2 * m, size, font: F.display, weight: F.dw, fill, lh, ls: -0.01, align: k < 1 ? 'left' : 'left', name: `Title ${i + 1}` })
        y += size * lh * LINE_MULT
      })
      els.push({ type: 'text', text: C.date, x: m, y: m, w: W / 2 - m, size: small, font: F.text, weight: 700, fill: c1, name: 'Date' })
      els.push({ type: 'text', text: C.place, x: W / 2, y: m, w: W / 2 - m, size: small, font: F.text, weight: F.tw, fill: c1, align: 'right', name: 'Place' })
      els.push({ type: 'text', text: lines(C.subtitle, C.footer), x: m, y: H - m - small * 2.8, w: W - 2 * m, size: small, font: F.text, weight: F.tw, fill: c1, lh: 1.3, name: 'Footer' })
      return els
    },
  },
  {
    id: 'split', name: 'Split screen', build: (g, r) => {
      const { W, H, P, F, C } = g
      const land = W / H > 1.15
      const ratio = r.range(0.45, 0.6)
      const imgFirst = r.chance(0.6)
      const els: El[] = []
      const m = Math.min(W, H) * 0.06
      const small = Math.max(14, Math.min(W, H) * 0.022)
      let tx: number, ty: number, tw: number, th: number
      if (land) {
        const iw = W * ratio
        const ix = imgFirst ? 0 : W - iw
        els.push(...imageOrBlock(g, ix, 0, iw, H, P.accent, r))
        tx = (imgFirst ? iw : 0) + m; ty = m; tw = W - iw - 2 * m; th = H - 2 * m
      } else {
        const ih = H * ratio
        const iy = imgFirst ? 0 : H - ih
        els.push(...imageOrBlock(g, 0, iy, W, ih, P.accent, r))
        tx = m; ty = (imgFirst ? ih : 0) + m; tw = W - 2 * m; th = H - ih - 2 * m
      }
      const fit = fitText(U(F, C.title), F.display, F.dw, tw, th * 0.55, { lh: 0.92, maxLines: 4 })
      els.push({ type: 'text', text: fit.text, x: tx, y: ty, w: tw, size: fit.size, font: F.display, weight: F.dw, fill: P.fg, lh: 0.92, name: 'Title' })
      const sub = { type: 'text' as const, text: C.subtitle, x: tx, y: ty + fit.height + small * 1.2, w: tw * 0.9, size: small * 1.3, font: F.text, weight: F.tw, fill: P.fg, lh: 1.25, name: 'Subtitle' }
      if (C.subtitle) els.push(sub)
      const info = lines(C.date + (C.place ? ' — ' + C.place : ''), C.body, C.footer)
      els.push({ type: 'text', text: info, x: tx, y: ty + th - small * 1.3 * LINE_MULT * info.split('\n').length, w: tw, size: small, font: F.text, weight: F.tw, fill: P.fg, lh: 1.3, name: 'Info' })
      els.push({ type: 'rect', x: tx, y: ty + th - small * 1.3 * LINE_MULT * info.split('\n').length - small * 1.4, w: small * 3, h: Math.max(3, small * 0.3), fill: P.accent, name: 'Marker' })
      return els
    },
  },
  {
    id: 'fullbleed', name: 'Full-bleed overlay', build: (g, r) => {
      const { W, H, P, F, C } = g
      const els: El[] = []
      const m = Math.min(W, H) * 0.06
      const small = Math.max(14, Math.min(W, H) * 0.022)
      if (g.img) {
        els.push({ type: 'image', x: 0, y: 0, w: W, h: H, src: g.img.src, gray: r.chance(0.3), name: 'Image' })
        els.push({ type: 'rect', x: 0, y: H * 0.45, w: W, h: H * 0.55, fill: '#000000', opacity: 0.35, name: 'Shade' })
      } else {
        els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, fill: P.accent, name: 'Background' })
        const n = Math.round(r.range(3, 6))
        for (let i = 0; i < n; i++) els.push({ type: 'circle', cx: W * r.next(), cy: H * r.range(0, 0.4), r: Math.min(W, H) * r.range(0.12, 0.32), fill: r.pick([P.alt, P.fg]), opacity: r.range(0.7, 1), name: 'Shape' })
      }
      const light = g.img ? '#ffffff' : P.bg
      const fit = fitText(U(F, C.title), F.display, F.dw, W - 2 * m, H * 0.3, { lh: 0.9, maxLines: 3 })
      const ty = H - m - small * 4 - fit.height
      els.push({ type: 'text', text: fit.text, x: m, y: ty, w: W - 2 * m, size: fit.size, font: F.display, weight: F.dw, fill: light, lh: 0.9, name: 'Title' })
      els.push({ type: 'text', text: lines(C.subtitle), x: m, y: H - m - small * 2.6, w: (W - 2 * m) * 0.6, size: small * 1.1, font: F.text, weight: F.tw, fill: light, lh: 1.25, name: 'Subtitle' })
      els.push({ type: 'text', text: lines(C.date, C.place), x: m, y: m, w: W / 2, size: small, font: F.text, weight: 700, fill: light, lh: 1.3, name: 'Date' })
      els.push({ type: 'text', text: C.footer, x: W / 2, y: m, w: W / 2 - m, size: small, font: F.text, weight: F.tw, fill: light, align: 'right', name: 'Footer' })
      return els
    },
  },
  {
    id: 'minimal', name: 'Quiet minimal', build: (g, r) => {
      const { W, H, P, F, C } = g
      const m = Math.min(W, H) * r.range(0.05, 0.08)
      const small = Math.max(13, Math.min(W, H) * 0.019)
      const els: El[] = [{ type: 'rect', x: m, y: m, w: W - 2 * m, h: H - 2 * m, fill: 'rgba(0,0,0,0)', stroke: P.fg, sw: Math.max(1.5, small * 0.08), name: 'Frame' }]
      const fit = fitText(C.title, F.display, F.dw, W * 0.6, H * 0.22, { lh: 1, maxLines: 3, maxSize: Math.min(W, H) * 0.12 })
      const cy = H * r.range(0.42, 0.5)
      els.push({ type: 'circle', cx: W / 2, cy: cy - fit.height / 2 - small * 3, r: small * 0.7, fill: P.accent, name: 'Dot' })
      els.push({ type: 'text', text: fit.text, x: W * 0.15, y: cy - fit.height / 2, w: W * 0.7, size: fit.size, font: F.display, weight: F.dw, fill: P.fg, align: 'center', lh: 1, name: 'Title' })
      if (C.subtitle) els.push({ type: 'text', text: C.subtitle, x: W * 0.2, y: cy + fit.height / 2 + small * 1.5, w: W * 0.6, size: small * 1.1, font: F.text, weight: F.tw, fill: P.fg, align: 'center', lh: 1.4, italic: false, name: 'Subtitle' })
      els.push({ type: 'text', text: [C.date, C.place].filter(Boolean).join('   ·   '), x: m * 2, y: H - m * 2 - small * 1.2, w: W - m * 4, size: small, font: F.text, weight: F.tw, fill: P.fg, align: 'center', ls: 0.12, name: 'Info' })
      return els
    },
  },
  {
    id: 'bauhaus', name: 'Bauhaus geometry', build: (g, r) => {
      const { W, H, P, F, C } = g
      const els: El[] = []
      const land = W / H > 1.15
      const cols = land ? 4 : 2, rows = land ? 2 : 3
      const gw = land ? W * 0.62 : W, gh = land ? H : H * 0.66
      const cw = gw / cols, ch = gh / rows
      const colors = [P.accent, P.alt, P.fg, P.accent]
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = i * cw, y = j * ch
        const kind = r.pick(['rect', 'circle', 'circleOnRect', 'half', 'empty'] as const)
        const c = r.pick(colors)
        if (kind === 'rect') els.push({ type: 'rect', x, y, w: cw, h: ch, fill: c, name: 'Block' })
        if (kind === 'circle') els.push({ type: 'circle', cx: x + cw / 2, cy: y + ch / 2, r: Math.min(cw, ch) / 2, fill: c, name: 'Circle' })
        if (kind === 'circleOnRect') {
          els.push({ type: 'rect', x, y, w: cw, h: ch, fill: c, name: 'Block' })
          els.push({ type: 'circle', cx: x + cw / 2, cy: y + ch / 2, r: Math.min(cw, ch) / 2.4, fill: c === P.fg ? P.bg : P.fg, name: 'Circle' })
        }
        if (kind === 'half') els.push({ type: 'rect', x, y: y + ch / 2, w: cw, h: ch / 2, fill: c, name: 'Bar' })
      }
      const m = Math.min(W, H) * 0.05
      const small = Math.max(14, Math.min(W, H) * 0.022)
      const tx = land ? gw + m : m, ty = land ? m : gh + m
      const tw = land ? W - gw - 2 * m : W - 2 * m, th = land ? H * 0.6 : H - gh - 2 * m - small * 4
      const fit = fitText(U(F, C.title), F.display, F.dw, tw, th, { lh: 0.9, maxLines: 3 })
      els.push({ type: 'text', text: fit.text, x: tx, y: ty, w: tw, size: fit.size, font: F.display, weight: F.dw, fill: P.fg, lh: 0.9, name: 'Title' })
      els.push({ type: 'text', text: lines(C.date + ' / ' + C.place, C.footer), x: tx, y: H - m - small * 2.7, w: tw, size: small, font: F.text, weight: F.tw, fill: P.fg, lh: 1.3, name: 'Info' })
      return els
    },
  },
  {
    id: 'editorial', name: 'Editorial cover', build: (g, r) => {
      const { W, H, P, F, C } = g
      const m = Math.min(W, H) * 0.05
      const small = Math.max(13, Math.min(W, H) * 0.019)
      const els: El[] = []
      const fit = fitText(C.title, F.display, F.dw, W - 2 * m, H * 0.2, { lh: 0.9, maxLines: 2 })
      els.push({ type: 'text', text: fit.text, x: m, y: m, w: W - 2 * m, size: fit.size, font: F.display, weight: F.dw, fill: P.fg, align: 'center', lh: 0.9, name: 'Masthead' })
      const ry = m + fit.height + small * 0.8
      const sw = Math.max(1.5, small * 0.08)
      els.push({ type: 'line', x1: m, y1: ry, x2: W - m, y2: ry, stroke: P.fg, sw, name: 'Rule' })
      els.push({ type: 'line', x1: m, y1: ry + sw * 3, x2: W - m, y2: ry + sw * 3, stroke: P.fg, sw, name: 'Rule' })
      els.push({ type: 'text', text: C.date, x: m, y: ry + small, w: W / 3, size: small, font: F.text, weight: 700, fill: P.fg, ls: 0.08, name: 'Date' })
      els.push({ type: 'text', text: C.place, x: W / 2, y: ry + small, w: W / 2 - m, size: small, font: F.text, weight: F.tw, fill: P.fg, align: 'right', ls: 0.08, name: 'Place' })
      const iy = ry + small * 3.4
      const capH = small * 6
      const ih = H - iy - m - capH
      els.push(...imageOrBlock(g, m, iy, W - 2 * m, ih, P.accent, r, { gray: r.chance(0.4) }))
      const cy = iy + ih + small * 1.4
      els.push({ type: 'text', text: C.subtitle, x: m, y: cy, w: (W - 2 * m) * 0.55, size: small * 1.5, font: F.display, weight: F.dw > 600 ? 700 : F.dw, fill: P.fg, lh: 1.1, name: 'Deck' })
      els.push({ type: 'text', text: lines(C.body, C.footer), x: m + (W - 2 * m) * 0.6, y: cy, w: (W - 2 * m) * 0.4, size: small, font: F.text, weight: F.tw, fill: P.fg, lh: 1.35, name: 'Caption' })
      return els
    },
  },
  {
    id: 'vertical', name: 'Vertical title', build: (g, r) => {
      const { W, H, P, F, C } = g
      const m = Math.min(W, H) * 0.05
      const small = Math.max(14, Math.min(W, H) * 0.022)
      const els: El[] = []
      const bandW = W * r.range(0.3, 0.42)
      if (r.chance(0.5)) els.push({ type: 'rect', x: 0, y: 0, w: bandW, h: H, fill: P.accent, name: 'Band' })
      const title = U(F, C.title)
      const fit = fitText(title, F.display, F.dw, H - 2 * m, bandW - m, { lh: 0.85, maxLines: 2 })
      // rotated -90°: x/y is the bottom-left start of the text run
      els.push({ type: 'text', text: fit.text, x: m * 0.8, y: H - m, w: H - 2 * m, size: fit.size, font: F.display, weight: F.dw, fill: P.fg, lh: 0.85, angle: -90, name: 'Title' })
      const tx = bandW + m, tw = W - bandW - 2 * m
      els.push({ type: 'text', text: C.date, x: tx, y: m, w: tw, size: small * 2.2, font: F.display, weight: F.dw, fill: P.fg, lh: 1, name: 'Date' })
      els.push({ type: 'text', text: C.subtitle, x: tx, y: m + small * 4, w: tw, size: small * 1.2, font: F.text, weight: F.tw, fill: P.fg, lh: 1.3, name: 'Subtitle' })
      const info = lines(C.place, C.body, C.footer)
      els.push({ type: 'text', text: info, x: tx, y: H - m - info.split('\n').length * small * 1.35 * LINE_MULT, w: tw, size: small, font: F.text, weight: F.tw, fill: P.fg, lh: 1.35, name: 'Info' })
      if (g.img) els.push({ type: 'image', x: tx, y: H * 0.3, w: tw, h: H * 0.38, src: g.img.src, name: 'Image' })
      else els.push({ type: 'circle', cx: tx + tw * 0.5, cy: H * 0.5, r: Math.min(tw, H * 0.4) * 0.45, fill: P.alt === P.bg ? P.accent : P.alt, name: 'Circle' })
      return els
    },
  },
  {
    id: 'frame', name: 'Festival frame', build: (g, r) => {
      const { W, H, P, F, C } = g
      const b = Math.min(W, H) * r.range(0.035, 0.06)
      const small = Math.max(14, Math.min(W, H) * 0.022)
      const els: El[] = [
        { type: 'rect', x: 0, y: 0, w: W, h: H, fill: P.accent, name: 'Frame' },
        { type: 'rect', x: b, y: b, w: W - 2 * b, h: H - 2 * b, fill: P.bg, name: 'Inner' },
      ]
      const m = b * 2.2
      const fit = fitText(U(F, C.title), F.display, F.dw, W - 2 * m, H * 0.3, { lh: 0.9, maxLines: 3 })
      els.push({ type: 'text', text: fit.text, x: m, y: m, w: W - 2 * m, size: fit.size, font: F.display, weight: F.dw, fill: P.fg, align: 'center', lh: 0.9, name: 'Title' })
      const acts = C.body.split(/[\n·•|,]+/).map((s) => s.replace(/^\s*live:\s*/i, '').trim()).filter(Boolean)
      let y = m + fit.height + small * 2
      const actSize = Math.min(small * 2.2, (H - y - m - small * 5) / Math.max(1, acts.length) / (1.15 * LINE_MULT))
      acts.forEach((a, i) => {
        els.push({ type: 'text', text: U(F, a), x: m, y, w: W - 2 * m, size: actSize * (i === 0 ? 1.15 : 0.9), font: i % 2 ? F.text : F.display, weight: i % 2 ? 700 : F.dw, fill: i === 0 ? P.accent : P.fg, align: 'center', lh: 1.1, name: `Line ${i + 1}` })
        y += actSize * 1.15 * LINE_MULT * (i === 0 ? 1.15 : 0.9)
      })
      els.push({ type: 'rect', x: b, y: H - b - small * 4, w: W - 2 * b, h: small * 4, fill: P.fg, name: 'Bar' })
      els.push({ type: 'text', text: [C.date, C.place, C.footer].filter(Boolean).join('   ·   '), x: b, y: H - b - small * 2.6, w: W - 2 * b, size: small, font: F.text, weight: 700, fill: P.bg, align: 'center', ls: 0.05, name: 'Info' })
      return els
    },
  },
  {
    id: 'diagonal', name: 'Diagonal band', build: (g, r) => {
      const { W, H, P, F, C } = g
      const small = Math.max(14, Math.min(W, H) * 0.022)
      const m = Math.min(W, H) * 0.05
      const ang = r.pick([-12, -8, 8, -15])
      const els: El[] = [{ type: 'rect', x: 0, y: 0, w: W, h: H, fill: P.fg, name: 'Background' }]
      if (g.img) els.push({ type: 'image', x: 0, y: 0, w: W, h: H, src: g.img.src, gray: true, opacity: 0.45, name: 'Image' })
      const diag = Math.hypot(W, H)
      const fit = fitText(U(F, C.title), F.display, F.dw, diag * 0.62, H * 0.25, { lh: 0.9, maxLines: 2 })
      const bandH = fit.height + small * 3
      const cx = W / 2, cy = H * r.range(0.42, 0.55)
      const rad = (ang * Math.PI) / 180
      // place a rotated band centred on (cx, cy): fabric rotates around the top-left corner
      const rot = (x: number, y: number) => ({ x: cx + x * Math.cos(rad) - y * Math.sin(rad), y: cy + x * Math.sin(rad) + y * Math.cos(rad) })
      const bandTL = rot(-diag / 2, -bandH / 2)
      els.push({ type: 'rect', x: bandTL.x, y: bandTL.y, w: diag, h: bandH, fill: P.accent, angle: ang, name: 'Band' })
      const tTL = rot(-fit.width / 2, -fit.height / 2 + small * 0.3)
      els.push({ type: 'text', text: fit.text, x: tTL.x, y: tTL.y, w: fit.width * 1.05, size: fit.size, font: F.display, weight: F.dw, fill: P.fg, lh: 0.9, angle: ang, name: 'Title' })
      const light = P.bg
      els.push({ type: 'text', text: lines(C.date, C.place), x: m, y: m, w: W / 2, size: small * 1.2, font: F.text, weight: 700, fill: light, lh: 1.3, name: 'Date' })
      els.push({ type: 'text', text: lines(C.subtitle, C.footer), x: m, y: H - m - small * 2.8, w: W - 2 * m, size: small, font: F.text, weight: F.tw, fill: light, lh: 1.3, name: 'Footer' })
      return els
    },
  },
  {
    id: 'brutal', name: 'Brutalist grid', build: (g, r) => {
      const { W, H, P, F, C } = g
      const cols = 4, rows = W / H > 1.15 ? 4 : 6
      const cw = W / cols, rh = H / rows
      const small = Math.max(13, Math.min(W, H) * 0.02)
      const mono = r.chance(0.6) ? 'JetBrains Mono' : F.text
      const els: El[] = []
      const sw = Math.max(1.2, small * 0.07)
      for (let i = 1; i < cols; i++) els.push({ type: 'line', x1: i * cw, y1: 0, x2: i * cw, y2: H, stroke: P.fg, sw, name: 'Grid' })
      for (let j = 1; j < rows; j++) els.push({ type: 'line', x1: 0, y1: j * rh, x2: W, y2: j * rh, stroke: P.fg, sw, name: 'Grid' })
      const hi = { c: Math.floor(r.range(0, cols)), r: Math.floor(r.range(0, rows - 2)) }
      els.push({ type: 'rect', x: hi.c * cw, y: hi.r * rh, w: cw, h: rh, fill: P.accent, name: 'Cell' })
      const p = small * 0.8
      els.push({ type: 'text', text: '01/', x: p, y: p, w: cw - 2 * p, size: small, font: mono, weight: 700, fill: P.fg, name: 'Index' })
      els.push({ type: 'text', text: C.date, x: cw + p, y: p, w: cw * 2 - 2 * p, size: small, font: mono, weight: 400, fill: P.fg, name: 'Date' })
      els.push({ type: 'text', text: C.place, x: cw * 3 + p, y: p, w: cw - 2 * p, size: small * 0.9, font: mono, weight: 400, fill: P.fg, lh: 1.25, name: 'Place' })
      const day = C.date.match(/\d+/)?.[0] ?? '01'
      const big = fitText(day, F.display, F.dw, cw * 2 - 2 * p, rh * 2 - 2 * p, { lh: 0.85, maxLines: 1 })
      els.push({ type: 'text', text: day, x: cw * 2 + p, y: rh + p, w: cw * 2 - 2 * p, size: big.size, font: F.display, weight: F.dw, fill: P.fg, lh: 0.85, align: 'right', name: 'Number' })
      els.push({ type: 'text', text: lines(C.subtitle, '', C.body), x: p, y: rh * (rows - 3) + p, w: cw * 2 - 2 * p, size: small, font: mono, weight: 400, fill: P.fg, lh: 1.3, name: 'Body' })
      const fit = fitText(C.title.toUpperCase(), F.display, F.dw, W - 2 * p, rh * 2 - 2 * p, { lh: 0.85, maxLines: 2 })
      els.push({ type: 'text', text: fit.text, x: p, y: H - p - fit.height, w: W - 2 * p, size: fit.size, font: F.display, weight: F.dw, fill: P.fg, lh: 0.85, name: 'Title' })
      els.push({ type: 'text', text: C.footer, x: cw * 2 + p, y: rh * (rows - 3) + p, w: cw * 2 - 2 * p, size: small, font: mono, weight: 700, fill: P.fg, align: 'right', name: 'Footer' })
      return els
    },
  },
  {
    id: 'orbit', name: 'Circle focus', build: (g, r) => {
      const { W, H, P, F, C } = g
      const m = Math.min(W, H) * 0.05
      const small = Math.max(14, Math.min(W, H) * 0.021)
      const els: El[] = []
      const d = Math.min(W - 2 * m, H * 0.6) * r.range(0.82, 1)
      const cx = W / 2, cy = H * (W / H > 1.15 ? 0.5 : 0.42)
      els.push(...imageOrBlock(g, cx - d / 2, cy - d / 2, d, d, P.accent, r, { clip: 'circle' }))
      const fit = fitText(U(F, C.title), F.display, F.dw, W - 2 * m, H * 0.22, { lh: 0.9, maxLines: 2 })
      const overlap = r.chance(0.5) && !g.img
      const ty = overlap ? cy - fit.height / 2 : Math.min(H - m - small * 3 - fit.height, cy + d / 2 + small * 1.5)
      els.push({ type: 'text', text: fit.text, x: m, y: ty, w: W - 2 * m, size: fit.size, font: F.display, weight: F.dw, fill: P.fg, align: 'center', lh: 0.9, name: 'Title' })
      els.push({ type: 'text', text: C.date, x: m, y: m, w: W / 2 - m, size: small, font: F.text, weight: 700, fill: P.fg, name: 'Date' })
      els.push({ type: 'text', text: C.place, x: W / 2, y: m, w: W / 2 - m, size: small, font: F.text, weight: F.tw, fill: P.fg, align: 'right', name: 'Place' })
      els.push({ type: 'text', text: C.subtitle, x: m, y: H - m - small * 1.3, w: W / 2 - m, size: small, font: F.text, weight: F.tw, fill: P.fg, name: 'Subtitle' })
      els.push({ type: 'text', text: C.footer, x: W / 2, y: H - m - small * 1.3, w: W / 2 - m, size: small, font: F.text, weight: 700, fill: P.fg, align: 'right', name: 'Footer' })
      return els
    },
  },
]

export interface Idea { archetype: string; seed: number; palette: Palette; fonts: FontPair }

export function generate(idea: Idea, W: number, H: number, C: Content, img: GenImage | null): Scene {
  const a = ARCHETYPES.find((x) => x.id === idea.archetype) ?? ARCHETYPES[0]
  const r = rng(idea.seed)
  const els = a.build({ W, H, P: idea.palette, F: idea.fonts, C, img, seed: idea.seed }, r)
    .filter((e) => e.type !== 'text' || e.text.trim().length > 0)
  return { w: W, h: H, bg: idea.palette.bg, els }
}
