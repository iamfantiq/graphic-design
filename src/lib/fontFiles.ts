import opentype, { type Font } from 'opentype.js'

// Every editor typeface as static WOFF files (same Google Fonts sources the browser uses),
// loaded lazily only when a vector PDF is exported.
const FILES = import.meta.glob('/node_modules/@fontsource/*/files/*-{latin,latin-ext,cyrillic}-{100,200,300,400,500,600,700,800,900}-normal.woff', {
  query: '?url', import: 'default',
}) as Record<string, () => Promise<string>>

interface Entry { pkg: string; subset: string; weight: number; load: () => Promise<string> }
const ENTRIES: Entry[] = Object.entries(FILES).map(([path, load]) => {
  const m = path.match(/@fontsource\/([^/]+)\/files\/.+-(latin-ext|latin|cyrillic)-(\d00)-normal\.woff$/)!
  return { pkg: m[1], subset: m[2], weight: Number(m[3]), load }
})

export const pkgFor = (family: string) => family.toLowerCase().replace(/\s+/g, '-')

const cache = new Map<string, Promise<Font>>()
function parse(e: Entry) {
  const key = `${e.pkg}/${e.subset}/${e.weight}`
  if (!cache.has(key)) cache.set(key, e.load().then((u) => fetch(u)).then((r) => r.arrayBuffer()).then((b) => opentype.parse(b)))
  return cache.get(key)!
}

/** Fonts for a family at the nearest available weight: subsets in order, then Inter as a last-resort fallback. */
export async function fontStack(family: string, weight: number): Promise<Font[]> {
  const pick = (pkg: string) => {
    const own = ENTRIES.filter((e) => e.pkg === pkg)
    if (!own.length) return []
    const weights = [...new Set(own.map((e) => e.weight))]
    const w = weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a))
    return ['latin', 'latin-ext', 'cyrillic'].map((s) => own.find((e) => e.subset === s && e.weight === w)).filter(Boolean) as Entry[]
  }
  const primary = pick(pkgFor(family))
  const fallback = pkgFor(family) === 'inter' ? [] : pick('inter')
  return Promise.all([...primary, ...fallback].map(parse))
}

export function glyphFor(fonts: Font[], ch: string) {
  for (const f of fonts) { const g = f.charToGlyph(ch); if (g.index !== 0) return { f, g } }
  return { f: fonts[0], g: fonts[0].charToGlyph(ch) }
}

export const hasFontFiles = (family: string) => ENTRIES.some((e) => e.pkg === pkgFor(family))
