import { useState } from 'react'
import { Plus, Trash2, Star, Wand2, X } from 'lucide-react'
import { Button, ColorInput, Dropzone, Field, Panel, Select, TextInput } from '../../components/ui'
import { setActiveKit, saveKits, useBrandKits, type BrandKit as Kit } from '../../lib/brand'
import { extractPalette, hexToRgb, rgbToCmyk, rgbToHex } from '../../lib/color'
import { loadSource } from '../../lib/files'
import { ALL_FONTS } from '../layout/design'

const blank = (): Kit => ({ id: Math.random().toString(36).slice(2), name: 'New brand', colors: [{ hex: '#111111', name: 'Ink' }], fonts: { display: 'Inter', text: 'Inter' } })

export default function BrandKit() {
  const { kits, active } = useBrandKits()
  const [selId, setSelId] = useState<string | null>(kits[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const kit = kits.find((k) => k.id === selId) ?? null

  const save = (next: Kit[]) => setError(saveKits(next))
  const update = (patch: Partial<Kit>) => kit && save(kits.map((k) => (k.id === kit.id ? { ...k, ...patch } : k)))
  const setColor = (i: number, patch: Partial<Kit['colors'][number]>) => kit && update({ colors: kit.colors.map((c, j) => (j === i ? { ...c, ...patch } : c)) })

  async function setLogo(f: File) {
    if (!kit) return
    if (f.size > 1_500_000) { setError('Logo is over 1.5 MB — use an SVG or a smaller PNG so it fits in browser storage.'); return }
    const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f) })
    update({ logo: { name: f.name, type: f.type || (f.name.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream'), dataUrl } })
  }
  async function coloursFromLogo() {
    if (!kit?.logo) return
    const blob = await (await fetch(kit.logo.dataUrl)).blob()
    const src = await loadSource(new File([blob], kit.logo.name, { type: kit.logo.type }), { longSide: 600, transparent: true })
    const pal = extractPalette(src.canvas, 6).filter((p) => p.share > 0.03).slice(0, 5)
    const existing = new Set(kit.colors.map((c) => c.hex))
    const add = pal.map((p) => rgbToHex(p.color)).filter((h) => !existing.has(h)).map((hex, i) => ({ hex, name: `Logo ${i + 1}` }))
    update({ colors: [...kit.colors, ...add] })
  }

  return (
    <div className="flex min-h-0 flex-col md:h-full md:flex-row">
      <aside className="w-full shrink-0 border-b border-ink-800 bg-ink-900 md:w-72 md:overflow-y-auto md:border-b-0 md:border-r">
        <Panel title="Brand kits" right={<Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => { const k = blank(); save([...kits, k]); setSelId(k.id); if (!active) setActiveKit(k.id) }}><Plus className="h-3.5 w-3.5" />New</Button>}>
          {!kits.length && <p className="text-sm text-ink-400">Save a client’s logo, colours (with exact CMYK) and fonts once — every tool can then use them.</p>}
          {kits.map((k) => (
            <div key={k.id} onClick={() => setSelId(k.id)} className={`flex cursor-pointer items-center gap-2 rounded-md p-2 ${k.id === selId ? 'bg-ink-700' : 'hover:bg-ink-800'}`}>
              <div className="flex overflow-hidden rounded">{k.colors.slice(0, 4).map((c, i) => <span key={i} className="h-6 w-3" style={{ background: c.hex }} />)}</div>
              <span className="flex-1 truncate text-sm">{k.name}</span>
              {active?.id === k.id && <Star className="h-3.5 w-3.5 fill-acid text-acid" />}
            </div>
          ))}
          {error && <p className="rounded border border-red-900 bg-red-950/40 p-2 text-xs text-red-300">{error}</p>}
          <p className="text-xs text-ink-400">Kits are stored in this browser only.</p>
        </Panel>
      </aside>
      <main className="min-w-0 flex-1 md:overflow-y-auto">
        {!kit ? (
          <div className="mx-auto max-w-xl px-6 py-16">
            <h1 className="mb-2 text-3xl font-semibold tracking-tight">Brand Kits</h1>
            <p className="mb-6 text-ink-300">One place for each client’s logo, colours with their official CMYK values, and typefaces. The banner builder, Layout Lab and editor pick up the <b className="text-ink-100">active</b> kit automatically.</p>
            <Button variant="primary" onClick={() => { const k = blank(); save([...kits, k]); setSelId(k.id); setActiveKit(k.id) }}><Plus className="h-4 w-4" />Create a brand kit</Button>
          </div>
        ) : (
          <div className="mx-auto grid max-w-4xl gap-6 p-4 md:p-6 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Name"><TextInput value={kit.name} onChange={(e) => update({ name: e.target.value })} /></Field>
              <div className="flex gap-2">
                <Button variant={active?.id === kit.id ? 'primary' : 'default'} onClick={() => setActiveKit(active?.id === kit.id ? null : kit.id)}>
                  <Star className="h-4 w-4" />{active?.id === kit.id ? 'Active kit' : 'Make active'}</Button>
                <Button variant="danger" onClick={() => { save(kits.filter((k) => k.id !== kit.id)); if (active?.id === kit.id) setActiveKit(null); setSelId(null) }}><Trash2 className="h-4 w-4" />Delete</Button>
              </div>
              <Field label="Logo">
                {kit.logo ? (
                  <div className="flex items-center gap-3">
                    <div className="checker flex h-24 flex-1 items-center justify-center rounded p-2"><img src={kit.logo.dataUrl} className="max-h-full max-w-full" /></div>
                    <div className="flex flex-col gap-1.5">
                      <Button onClick={coloursFromLogo} title="Add the logo’s colours to the palette"><Wand2 className="h-3.5 w-3.5" />Colours</Button>
                      <Button variant="ghost" onClick={() => update({ logo: undefined })}><X className="h-3.5 w-3.5" />Remove</Button>
                    </div>
                  </div>
                ) : <Dropzone compact accept=".svg,.pdf,.ai,.png,.jpg,.jpeg,.webp" onFiles={(f) => setLogo(f[0])} title="Drop logo" subtitle="SVG / PDF / AI preferred" />}
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Display font"><Select value={kit.fonts.display} onChange={(v) => update({ fonts: { ...kit.fonts, display: v } })} options={ALL_FONTS.map(([f]) => ({ value: f, label: f }))} /></Field>
                <Field label="Text font"><Select value={kit.fonts.text} onChange={(v) => update({ fonts: { ...kit.fonts, text: v } })} options={ALL_FONTS.map(([f]) => ({ value: f, label: f }))} /></Field>
              </div>
              <div className="rounded-lg border border-ink-800 p-4" style={{ background: kit.colors[0]?.hex }}>
                <div style={{ fontFamily: kit.fonts.display, color: kit.colors[kit.colors.length - 1]?.hex, fontWeight: 800 }} className="text-3xl leading-tight">{kit.name}</div>
                <div style={{ fontFamily: kit.fonts.text, color: kit.colors[kit.colors.length - 1]?.hex }} className="mt-1 text-sm opacity-80">The quick brown fox jumps over the lazy dog.</div>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">Colours</h3>
                <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => update({ colors: [...kit.colors, { hex: '#888888', name: `Colour ${kit.colors.length + 1}` }] })}><Plus className="h-3.5 w-3.5" />Add</Button>
              </div>
              <div className="space-y-3">
                {kit.colors.map((c, i) => {
                  const cm = c.cmyk ?? rgbToCmyk(hexToRgb(c.hex))
                  return (
                    <div key={i} className="rounded-lg border border-ink-800 bg-ink-900 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <TextInput value={c.name} onChange={(e) => setColor(i, { name: e.target.value })} className="!py-1 text-xs" />
                        <button className="p-1 text-ink-400 hover:text-red-300" onClick={() => update({ colors: kit.colors.filter((_, j) => j !== i) })}><X className="h-3.5 w-3.5" /></button>
                      </div>
                      <ColorInput value={c.hex} onChange={(v) => setColor(i, { hex: v })} />
                      <div className="mt-1.5 grid grid-cols-4 gap-1">
                        {(['C', 'M', 'Y', 'K'] as const).map((ch, k) => (
                          <label key={ch} className="relative">
                            <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">{ch}</span>
                            <input type="number" min={0} max={100} value={cm[k]}
                              className={`w-full rounded border bg-ink-950 py-1 pl-4 pr-1 text-right font-mono text-xs outline-none focus:border-acid ${c.cmyk ? 'border-acid/50 text-acid' : 'border-ink-700 text-ink-300'}`}
                              onChange={(e) => { const n = [...cm] as [number, number, number, number]; n[k] = Math.max(0, Math.min(100, Number(e.target.value))); setColor(i, { cmyk: n }) }} />
                          </label>
                        ))}
                      </div>
                      {!c.cmyk && <p className="mt-1 text-[11px] text-ink-400">Converted from RGB — type the official values from the brand book.</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
