import opentype, { type Font, type Glyph } from 'opentype.js'
import { pathToD } from '../../lib/pathData'
import interLatin from '@fontsource/inter/files/inter-latin-700-normal.woff?url'
import interLatinExt from '@fontsource/inter/files/inter-latin-ext-700-normal.woff?url'
import interCyr from '@fontsource/inter/files/inter-cyrillic-700-normal.woff?url'
import sgLatin from '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff?url'
import sgLatinExt from '@fontsource/space-grotesk/files/space-grotesk-latin-ext-700-normal.woff?url'
import pfLatin from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff?url'
import pfLatinExt from '@fontsource/playfair-display/files/playfair-display-latin-ext-700-normal.woff?url'
import pfCyr from '@fontsource/playfair-display/files/playfair-display-cyrillic-700-normal.woff?url'
import abLatin from '@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff?url'
import abLatinExt from '@fontsource/archivo-black/files/archivo-black-latin-ext-400-normal.woff?url'

export type FontKey = 'inter' | 'space-grotesk' | 'playfair' | 'archivo-black'

export const FONTS: { key: FontKey; label: string; css: string; files: string[] }[] = [
  { key: 'inter', label: 'Inter Bold', css: '700 1em Inter', files: [interLatin, interLatinExt, interCyr] },
  { key: 'space-grotesk', label: 'Space Grotesk Bold', css: '700 1em "Space Grotesk"', files: [sgLatin, sgLatinExt] },
  { key: 'playfair', label: 'Playfair Display Bold', css: '700 1em "Playfair Display"', files: [pfLatin, pfLatinExt, pfCyr] },
  { key: 'archivo-black', label: 'Archivo Black', css: '400 1em "Archivo Black"', files: [abLatin, abLatinExt] },
]

const cache = new Map<string, Promise<Font>>()
function load(url: string) {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => r.arrayBuffer()).then((b) => opentype.parse(b)))
  return cache.get(url)!
}

/** Load a font family as an ordered list of subset files, with Inter as a fallback for missing glyphs (e.g. Cyrillic). */
export async function loadFamily(key: FontKey): Promise<Font[]> {
  const f = FONTS.find((x) => x.key === key)!
  const fallback = FONTS[0].files.filter((u) => !f.files.includes(u))
  return Promise.all([...f.files, ...fallback].map(load))
}

export interface TextShape { d: string; width: number; ascent: number; descent: number }

/** Convert a line of text into outlined SVG path data (y-down, baseline at y=0). Text becomes vector shapes — no fonts needed at the print shop. */
export function textToPath(fonts: Font[], text: string, size: number, tracking = 0): TextShape {
  let x = 0
  let d = ''
  let prev: { g: Glyph; f: Font } | null = null
  const main = fonts[0]
  for (const ch of text) {
    let f = fonts.find((ff) => ff.charToGlyph(ch).index !== 0) ?? main
    if (ch === ' ') f = main
    const g = f.charToGlyph(ch)
    if (prev && prev.f === f) x += (f.getKerningValue(prev.g, g) / f.unitsPerEm) * size
    const p = pathToD(g.getPath(x, 0, size), 3)
    if (p) d += p
    x += ((g.advanceWidth ?? f.unitsPerEm * 0.5) / f.unitsPerEm) * size + tracking * size
    prev = { g, f }
  }
  if (text.length) x -= tracking * size
  return {
    d,
    width: Math.max(0, x),
    ascent: (main.ascender / main.unitsPerEm) * size * 0.75, // cap-height-ish for visual centring
    descent: (-main.descender / main.unitsPerEm) * size,
  }
}
