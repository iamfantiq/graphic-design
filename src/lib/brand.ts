import { useEffect, useState } from 'react'
import { contrast, hexToRgb, luminance, saturation } from './color'

export interface BrandColor { hex: string; name: string; cmyk?: [number, number, number, number]; spot?: string }
export interface BrandKit {
  id: string
  name: string
  colors: BrandColor[]
  logo?: { name: string; type: string; dataUrl: string }
  fonts: { display: string; text: string }
}

const KEY = 'formatter.brandKits'
const ACTIVE = 'formatter.activeKit'
const EVT = 'formatter:brandkits'

function read(): BrandKit[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}
export function saveKits(kits: BrandKit[]): string | null {
  try { localStorage.setItem(KEY, JSON.stringify(kits)); window.dispatchEvent(new Event(EVT)); return null }
  catch { return 'Could not save — browser storage is full or blocked. Try a smaller logo file (SVG is ideal).' }
}
export function setActiveKit(id: string | null) {
  try { id ? localStorage.setItem(ACTIVE, id) : localStorage.removeItem(ACTIVE) } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT))
}

/** All kits plus the active one, kept in sync across tools. */
export function useBrandKits() {
  const [kits, setKits] = useState<BrandKit[]>(read)
  const [activeId, setActiveId] = useState<string | null>(() => { try { return localStorage.getItem(ACTIVE) } catch { return null } })
  useEffect(() => {
    const on = () => { setKits(read()); try { setActiveId(localStorage.getItem(ACTIVE)) } catch { /* ignore */ } }
    window.addEventListener(EVT, on)
    window.addEventListener('storage', on)
    return () => { window.removeEventListener(EVT, on); window.removeEventListener('storage', on) }
  }, [])
  const active = kits.find((k) => k.id === activeId) ?? null
  return { kits, active }
}

export async function kitLogoFile(kit: BrandKit): Promise<File | null> {
  if (!kit.logo) return null
  const blob = await (await fetch(kit.logo.dataUrl)).blob()
  return new File([blob], kit.logo.name, { type: kit.logo.type })
}

/** Derive a 4-role poster palette from brand colours. */
export function kitPalette(kit: BrandKit) {
  const cols = kit.colors.map((c) => c.hex)
  if (!cols.length) return null
  const sorted = [...cols].sort((a, b) => luminance(hexToRgb(b)) - luminance(hexToRgb(a)))
  let bg = sorted[0], fg = sorted[sorted.length - 1]
  if (contrast(hexToRgb(bg), hexToRgb(fg)) < 4.5) { fg = luminance(hexToRgb(bg)) > 0.4 ? '#111111' : '#f5f5f5' }
  if (cols.length === 1) { bg = luminance(hexToRgb(cols[0])) > 0.5 ? cols[0] : '#f4f1ea'; fg = '#111111' }
  const rest = cols.filter((c) => c !== bg && c !== fg).sort((a, b) => saturation(hexToRgb(b)) - saturation(hexToRgb(a)))
  return { name: `Brand: ${kit.name}`, bg, fg, accent: rest[0] ?? cols[0], alt: rest[1] ?? fg }
}
