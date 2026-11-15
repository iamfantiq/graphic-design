export interface Palette { name: string; bg: string; fg: string; accent: string; alt: string }
export interface FontPair { name: string; display: string; dw: number; text: string; tw: number; upper: boolean }

export const PALETTES: Palette[] = [
  { name: 'Swiss red', bg: '#efece6', fg: '#111111', accent: '#e2231a', alt: '#1d4ed8' },
  { name: 'Klein', bg: '#f4f1ea', fg: '#0a0a0a', accent: '#002fa7', alt: '#ffd400' },
  { name: 'Riso', bg: '#f7f1e3', fg: '#1a1a1a', accent: '#ff48b0', alt: '#0078bf' },
  { name: 'Acid night', bg: '#0d0d0d', fg: '#f2f2f2', accent: '#d4ff3a', alt: '#7a5cff' },
  { name: 'Terracotta', bg: '#efe2d0', fg: '#2b1a12', accent: '#c4572e', alt: '#2f5d50' },
  { name: 'Forest', bg: '#e8eadf', fg: '#14301f', accent: '#2e7d4f', alt: '#e0a526' },
  { name: 'Bauhaus', bg: '#f2e8d5', fg: '#1b1b1b', accent: '#d6312b', alt: '#1e4c9a' },
  { name: 'Deep sea', bg: '#0b1f33', fg: '#e6eef5', accent: '#58c4dd', alt: '#f25c54' },
  { name: 'Lemon', bg: '#fff35c', fg: '#111111', accent: '#ff5a1f', alt: '#ffffff' },
  { name: 'Concrete', bg: '#d9d9d6', fg: '#1e1e1e', accent: '#ff4f00', alt: '#5a5a5a' },
  { name: 'Blush', bg: '#f6d7d0', fg: '#3a1f1d', accent: '#e3462c', alt: '#ffffff' },
  { name: 'Mono', bg: '#ffffff', fg: '#000000', accent: '#000000', alt: '#9a9a9a' },
]

export const FONT_PAIRS: FontPair[] = [
  { name: 'Swiss Neo', display: 'Inter', dw: 900, text: 'Inter', tw: 500, upper: false },
  { name: 'Grotesk Heavy', display: 'Archivo Black', dw: 400, text: 'Archivo', tw: 400, upper: true },
  { name: 'Editorial', display: 'Playfair Display', dw: 900, text: 'Inter', tw: 400, upper: false },
  { name: 'Condensed + Mono', display: 'Bebas Neue', dw: 400, text: 'Space Mono', tw: 400, upper: true },
  { name: 'Soft Serif', display: 'DM Serif Display', dw: 400, text: 'DM Sans', tw: 500, upper: false },
  { name: 'Art School', display: 'Syne', dw: 800, text: 'Syne', tw: 500, upper: false },
  { name: 'Poster Bold', display: 'Anton', dw: 400, text: 'JetBrains Mono', tw: 400, upper: true },
  { name: 'Wide Future', display: 'Unbounded', dw: 900, text: 'Space Grotesk', tw: 400, upper: true },
  { name: 'Quiet Serif', display: 'Instrument Serif', dw: 400, text: 'Inter', tw: 500, upper: false },
  { name: 'Tech', display: 'Space Grotesk', dw: 700, text: 'Space Mono', tw: 400, upper: false },
]

export const ALL_FONTS = [
  ['Inter', [400, 500, 600, 700, 800, 900]], ['Archivo Black', [400]], ['Archivo', [400, 600, 800]],
  ['Playfair Display', [400, 700, 900]], ['Space Grotesk', [400, 500, 700]], ['Space Mono', [400, 700]],
  ['Bebas Neue', [400]], ['DM Serif Display', [400]], ['DM Sans', [400, 500, 700]], ['Syne', [500, 700, 800]],
  ['Anton', [400]], ['JetBrains Mono', [400, 700]], ['Instrument Serif', [400]], ['Unbounded', [400, 700, 900]],
] as const

export async function ensureFonts(pair: FontPair) {
  await Promise.all([
    document.fonts.load(`${pair.dw} 100px "${pair.display}"`),
    document.fonts.load(`${pair.tw} 100px "${pair.text}"`),
    document.fonts.load(`700 100px "${pair.text}"`),
  ]).catch(() => {})
}

export interface PrintSize { label: string; w: number; h: number } // mm
export interface DocFormat { id: string; label: string; w: number; h: number; print?: boolean; sizes: PrintSize[] }

const A_SERIES: PrintSize[] = [
  { label: 'A5', w: 148, h: 210 }, { label: 'A4', w: 210, h: 297 }, { label: 'A3', w: 297, h: 420 },
  { label: 'A2', w: 420, h: 594 }, { label: 'A1', w: 594, h: 841 }, { label: 'A0', w: 841, h: 1189 },
]
const px96 = (w: number, h: number): PrintSize[] => [{ label: 'Screen size (96 dpi)', w: Math.round(w * 0.2646 * 10) / 10, h: Math.round(h * 0.2646 * 10) / 10 }]

export const DOC_FORMATS: DocFormat[] = [
  { id: 'a', label: 'Poster A-series (A5–A0)', w: 1240, h: 1754, print: true, sizes: A_SERIES },
  { id: '57', label: 'Poster 50×70 / 70×100 cm', w: 1200, h: 1680, print: true, sizes: [{ label: '50 × 70 cm', w: 500, h: 700 }, { label: '70 × 100 cm', w: 700, h: 1000 }] },
  { id: '23', label: 'Poster 2:3', w: 1200, h: 1800, print: true, sizes: [{ label: '40 × 60 cm', w: 400, h: 600 }, { label: '60 × 90 cm', w: 600, h: 900 }, { label: '24 × 36 in', w: 610, h: 914 }] },
  { id: 'dl', label: 'Flyer DL (99 × 210)', w: 990, h: 2100, print: true, sizes: [{ label: 'DL 99 × 210', w: 99, h: 210 }] },
  { id: 'card', label: 'Business card (85 × 55)', w: 1020, h: 660, print: true, sizes: [{ label: '85 × 55 mm', w: 85, h: 55 }] },
  { id: '45', label: 'Instagram 4:5', w: 1080, h: 1350, sizes: px96(1080, 1350) },
  { id: '11', label: 'Square 1:1', w: 1080, h: 1080, sizes: px96(1080, 1080) },
  { id: '916', label: 'Story 9:16', w: 1080, h: 1920, sizes: px96(1080, 1920) },
  { id: '169', label: 'Landscape 16:9', w: 1920, h: 1080, sizes: px96(1920, 1080) },
]

export interface Content {
  title: string
  subtitle: string
  date: string
  place: string
  body: string
  footer: string
}

export const SAMPLE: Content = {
  title: 'Night of Sound',
  subtitle: 'An evening of experimental music and light',
  date: '21.03.2027',
  place: 'Warehouse 9, Berlin',
  body: 'Live: Aera · Mono Lake · Kite Theory\nDoors 20:00 · Free entry',
  footer: 'nightofsound.com',
}
