import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Image as ImageIcon, Info, RefreshCw, Wand2 } from 'lucide-react'
import { Button, ColorInput, Dropzone, Field, NumberInput, Panel, Segmented, Select, Slider, Spinner, TextInput, Toggle } from '../../components/ui'
import { renderPdfPage } from '../../lib/files'
import { baseName, canvasToBlob, downloadBlob } from '../../lib/download'
import { hexToRgb, rgbToCmyk } from '../../lib/color'
import { DEFAULT_TRACE, isVectorFile, loadVectorLogo, traceRaster, type Logo, type TraceOptions } from './logo'
import { buildBannerPdf, DEFAULT_CONFIG, geometry, pdfScale, type BannerConfig, type Layout } from './buildPdf'
import { FONTS, type FontKey } from './fonts'
import { kitLogoFile, useBrandKits, type BrandKit } from '../../lib/brand'

function KitSwatches({ kit, onPick }: { kit: BrandKit | null; onPick: (hex: string) => void }) {
  if (!kit) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {kit.colors.map((c) => <button key={c.hex + c.name} title={`${kit.name}: ${c.name}`} onClick={() => onPick(c.hex)} className="h-5 w-5 rounded border border-ink-600" style={{ background: c.hex }} />)}
    </div>
  )
}

const PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: '3000x1000', label: 'Banner 3 × 1 m', w: 3000, h: 1000 },
  { id: '2000x1000', label: 'Banner 2 × 1 m', w: 2000, h: 1000 },
  { id: '4000x1000', label: 'Banner 4 × 1 m', w: 4000, h: 1000 },
  { id: '6000x1000', label: 'Banner 6 × 1 m (built 1:10)', w: 6000, h: 1000 },
  { id: '3000x2000', label: 'Press wall 3 × 2 m', w: 3000, h: 2000 },
  { id: '2400x2400', label: 'Backdrop 2.4 × 2.4 m', w: 2400, h: 2400 },
  { id: '850x2000', label: 'Roll-up 85 × 200 cm', w: 850, h: 2000 },
  { id: '1000x2000', label: 'Roll-up 100 × 200 cm', w: 1000, h: 2000 },
  { id: '600x1600', label: 'X-banner 60 × 160 cm', w: 600, h: 1600 },
  { id: '841x1189', label: 'A0 poster', w: 841, h: 1189 },
  { id: 'custom', label: 'Custom size', w: 0, h: 0 },
]

function CmykFields({ hex, cfg, set }: { hex: string; cfg: BannerConfig; set: (c: Partial<BannerConfig>) => void }) {
  if (cfg.colorMode !== 'cmyk') return null
  const v = cfg.cmykOverrides[hex] ?? rgbToCmyk(hexToRgb(hex))
  const overridden = !!cfg.cmykOverrides[hex]
  return (
    <div className="mt-1.5 grid grid-cols-4 gap-1">
      {(['C', 'M', 'Y', 'K'] as const).map((ch, i) => (
        <label key={ch} className="relative">
          <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">{ch}</span>
          <input type="number" min={0} max={100} value={v[i]}
            className={`w-full rounded border bg-ink-900 py-1 pl-4 pr-1 text-right font-mono text-xs outline-none focus:border-acid ${overridden ? 'border-acid/50 text-acid' : 'border-ink-700 text-ink-300'}`}
            onChange={(e) => {
              const n = [...v] as [number, number, number, number]
              n[i] = Math.max(0, Math.min(100, Number(e.target.value)))
              set({ cmykOverrides: { ...cfg.cmykOverrides, [hex]: n } })
            }} />
        </label>
      ))}
    </div>
  )
}

export default function Banner() {
  const [logo, setLogo] = useState<Logo | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [trace, setTrace] = useState<TraceOptions>(DEFAULT_TRACE)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cfg, setCfg] = useState<BannerConfig>(DEFAULT_CONFIG)
  const [preset, setPreset] = useState('3000x1000')
  const [previewing, setPreviewing] = useState(false)
  const [guides, setGuides] = useState(true)
  const canvasHost = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<Uint8Array | null>(null)
  const set = (p: Partial<BannerConfig>) => setCfg((c) => ({ ...c, ...p }))
  const { active: kit } = useBrandKits()
  // official CMYK values from the active brand kit win over the automatic conversion
  useEffect(() => {
    if (!kit) return
    const o = Object.fromEntries(kit.colors.filter((c) => c.cmyk).map((c) => [c.hex, c.cmyk!]))
    if (Object.keys(o).length) setCfg((c) => ({ ...c, cmykOverrides: { ...c.cmykOverrides, ...o } }))
  }, [kit])

  async function openLogo(f: File, opt = trace) {
    setError(null)
    setBusy(isVectorFile(f) ? 'Reading vector artwork…' : 'Tracing logo into vectors…')
    try {
      const l = isVectorFile(f) ? await loadVectorLogo(f) : await traceRaster(f, opt)
      setLogo(l); setLogoFile(f); set({ logoColorMap: {} })
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  // Live preview: build the real PDF and render it with pdf.js, so what you see is what prints.
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      setPreviewing(true)
      try {
        const bytes = await buildBannerPdf(cfg, logo, baseName(logo?.name ?? 'banner'))
        if (cancelled) return
        pdfRef.current = bytes
        const host = canvasHost.current
        const long = Math.min(2400, Math.max(900, (host?.clientWidth ?? 900) * window.devicePixelRatio))
        const { canvas } = await renderPdfPage(bytes, 1, long)
        if (cancelled || !host) return
        canvas.className = 'block h-auto w-full shadow-2xl'
        host.querySelector('canvas')?.remove()
        host.prepend(canvas)
      } catch (e) { if (!cancelled) setError((e as Error).message) } finally { if (!cancelled) setPreviewing(false) }
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [cfg, logo])

  const g = geometry(cfg)
  const pageWmm = cfg.widthMm + 2 * (cfg.bleedMm + g.slug)
  const pageHmm = cfg.heightMm + 2 * (cfg.bleedMm + g.slug)
  const pct = (mm: number, total: number) => `${(mm / total) * 100}%`
  const scaled = pdfScale(cfg) !== 1
  const fileName = useMemo(() => `${baseName(logo?.name ?? 'banner')}_${cfg.widthMm}x${cfg.heightMm}mm_${cfg.colorMode}${scaled ? '_scale1-10' : ''}.pdf`, [logo, cfg, scaled])

  async function downloadPdf() {
    setBusy('Building print PDF…')
    try {
      const bytes = await buildBannerPdf(cfg, logo, baseName(logo?.name ?? 'banner'))
      downloadBlob(new Blob([bytes.slice()], { type: 'application/pdf' }), fileName)
    } finally { setBusy(null) }
  }
  async function downloadProof() {
    if (!pdfRef.current) return
    setBusy('Rendering proof…')
    try {
      const { canvas } = await renderPdfPage(pdfRef.current, 1, 4000)
      downloadBlob(await canvasToBlob(canvas, 'image/jpeg', 0.9), fileName.replace('.pdf', '_proof.jpg'))
    } finally { setBusy(null) }
  }

  const logoColors = logo?.traced?.colors ?? []

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-80 shrink-0 overflow-y-auto border-r border-ink-800 bg-ink-900">
        <Panel title="Logo">
          {logo ? (
            <div className="flex items-center gap-3">
              <div className="checker flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded p-1">
                <img src={logo.preview.toDataURL()} className="max-h-full max-w-full" />
              </div>
              <div className="min-w-0 text-xs">
                <div className="truncate font-medium">{logo.name}</div>
                <div className={logo.kind === 'vector' ? 'text-acid' : 'text-amber-300'}>
                  {logo.kind === 'vector' ? 'Original vector — embedded as-is, original colours' : `Auto-traced · ${logo.traced?.paths.length} shapes`}
                </div>
              </div>
            </div>
          ) : null}
          <Dropzone compact={!!logo} accept=".svg,.pdf,.ai,.png,.jpg,.jpeg,.webp,image/*,application/pdf" onFiles={(f) => openLogo(f[0])}
            title={logo ? 'Replace logo' : 'Drop your logo'} subtitle={logo ? undefined : 'SVG · PDF · AI stay vector. PNG/JPG get traced.'} />
          {kit?.logo && (
            <Button className="w-full" onClick={async () => { const f = await kitLogoFile(kit); if (f) openLogo(f) }}>Use logo from “{kit.name}”</Button>
          )}
          {busy && <Spinner label={busy} />}
          {error && <p className="rounded border border-red-900 bg-red-950/40 p-2 text-xs text-red-300">{error}</p>}
        </Panel>

        {logo?.kind === 'traced' && logoFile && (
          <Panel title="Vectorise" right={<Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => openLogo(logoFile, trace)}><RefreshCw className="h-3 w-3" />Re-trace</Button>}>
            <Slider label="Colours" value={trace.colors} min={1} max={16} onChange={(v) => setTrace({ ...trace, colors: v })} />
            <Slider label="Smoothness" value={trace.smooth} min={0} max={1} step={0.05} onChange={(v) => setTrace({ ...trace, smooth: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Ignore specks under" value={trace.despeckle} min={0} max={80} onChange={(v) => setTrace({ ...trace, despeckle: v })} format={(v) => `${v}px`} />
            <Field label="Background removal">
              <Segmented value={trace.removeBg} onChange={(v) => setTrace({ ...trace, removeBg: v })}
                options={[{ value: 'none', label: 'Keep' }, { value: 'edges', label: 'Outside', title: 'Remove only the background connected to the edges' }, { value: 'all', label: 'All', title: 'Remove every pixel of the background colour, including counters' }]} />
            </Field>
            <Segmented value={trace.detail} onChange={(v) => setTrace({ ...trace, detail: v })}
              options={[{ value: 'balanced', label: 'Balanced' }, { value: 'high', label: 'High detail (slower)' }]} />
            <p className="text-xs text-ink-400">Tracing is only as good as the source. If you have the logo as SVG, PDF or AI, use that — it stays 100% original.</p>
          </Panel>
        )}

        {logoColors.length > 0 && (
          <Panel title="Logo colours" right={
            <div className="flex gap-1">
              {['#ffffff', '#000000'].map((c) => (
                <button key={c} title={`All ${c === '#ffffff' ? 'white' : 'black'}`} className="h-5 w-5 rounded border border-ink-600" style={{ background: c }}
                  onClick={() => set({ logoColorMap: Object.fromEntries(logoColors.map((x) => [x.color, c])) })} />
              ))}
              <button className="px-1 text-[11px] text-ink-400 hover:text-ink-100" onClick={() => set({ logoColorMap: {} })}>reset</button>
            </div>}>
            {logoColors.map(({ color }) => {
              const cur = cfg.logoColorMap[color] ?? color
              return (
                <div key={color}>
                  <ColorInput value={cur} onChange={(v) => set({ logoColorMap: { ...cfg.logoColorMap, [color]: v } })} />
                  <KitSwatches kit={kit} onPick={(v) => set({ logoColorMap: { ...cfg.logoColorMap, [color]: v } })} />
                  <CmykFields hex={cur} cfg={cfg} set={set} />
                </div>
              )
            })}
          </Panel>
        )}
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-2.5 text-xs text-ink-400">
          <div className="flex items-center gap-4">
            <span className="font-mono text-ink-100">{cfg.widthMm} × {cfg.heightMm} mm</span>
            <span>bleed {cfg.bleedMm} mm</span>
            <span>{cfg.colorMode.toUpperCase()}</span>
            {scaled && <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-amber-300">built at 1:10 — tell the printer to output at 1000%</span>}
          </div>
          <div className="flex items-center gap-3">
            {previewing && <Spinner />}
            <Toggle checked={guides} onChange={setGuides} label="Guides" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto bg-ink-950 p-10">
          <div ref={canvasHost} className="relative w-full" style={{ maxWidth: `min(100%, calc((100vh - 200px) * ${pageWmm / pageHmm}))` }}>
            {guides && (
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute border border-dashed border-cyan-400/70" title="bleed"
                  style={{ left: pct(g.slug, pageWmm), top: pct(g.slug, pageHmm), right: pct(g.slug, pageWmm), bottom: pct(g.slug, pageHmm) }} />
                <div className="absolute outline outline-1 outline-fuchsia-500" title="trim"
                  style={{ left: pct(g.off, pageWmm), top: pct(g.off, pageHmm), right: pct(g.off, pageWmm), bottom: pct(g.off, pageHmm) }} />
                <div className="absolute border border-dashed border-acid/70" title="safe area"
                  style={{ left: pct(g.off + cfg.safeMm, pageWmm), top: pct(g.off + cfg.safeMm, pageHmm), right: pct(g.off + cfg.safeMm, pageWmm), bottom: pct(g.off + cfg.safeMm, pageHmm) }} />
              </div>
            )}
          </div>
        </div>
        {guides && (
          <div className="flex gap-5 border-t border-ink-800 px-5 py-2 text-[11px] text-ink-400">
            <span><span className="mr-1.5 inline-block h-2 w-3 border border-dashed border-cyan-400" />bleed (printed, trimmed off)</span>
            <span><span className="mr-1.5 inline-block h-2 w-3 border border-fuchsia-500" />trim (final size)</span>
            <span><span className="mr-1.5 inline-block h-2 w-3 border border-dashed border-acid" />safe area (eyelets, hems)</span>
          </div>
        )}
      </main>

      <aside className="w-80 shrink-0 overflow-y-auto border-l border-ink-800 bg-ink-900">
        <Panel title="Size">
          <Select value={preset} onChange={(v) => { setPreset(v); const p = PRESETS.find((x) => x.id === v)!; if (p.w) set({ widthMm: p.w, heightMm: p.h }) }}
            options={PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Width"><NumberInput value={cfg.widthMm} min={50} onChange={(v) => { setPreset('custom'); set({ widthMm: v }) }} suffix="mm" /></Field>
            <Field label="Height"><NumberInput value={cfg.heightMm} min={50} onChange={(v) => { setPreset('custom'); set({ heightMm: v }) }} suffix="mm" /></Field>
            <Field label="Bleed"><NumberInput value={cfg.bleedMm} min={0} max={100} onChange={(v) => set({ bleedMm: v })} suffix="mm" /></Field>
            <Field label="Safe margin"><NumberInput value={cfg.safeMm} min={0} max={500} onChange={(v) => set({ safeMm: v })} suffix="mm" /></Field>
          </div>
          <Toggle checked={cfg.cropMarks} onChange={(v) => set({ cropMarks: v })} label="Crop marks + slug info" />
          <p className="flex gap-1.5 text-xs leading-relaxed text-ink-400"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Ask your printer for bleed: vinyl banners with hems/eyelets often want 20–50 mm, rigid boards 3–5 mm.</p>
        </Panel>

        <Panel title="Colour">
          <Segmented value={cfg.colorMode} onChange={(v) => set({ colorMode: v })}
            options={[{ value: 'cmyk', label: 'CMYK (print)' }, { value: 'rgb', label: 'RGB' }]} />
          <Field label="Background">
            <ColorInput value={cfg.bg} onChange={(v) => set({ bg: v })} />
            <KitSwatches kit={kit} onPick={(v) => set({ bg: v })} />
            <CmykFields hex={cfg.bg} cfg={cfg} set={set} />
          </Field>
          {cfg.colorMode === 'cmyk' && <p className="text-xs text-ink-400">CMYK values are converted from RGB as a starting point — type your brand’s exact CMYK from the guideline. For rich black use e.g. 60/40/40/100.</p>}
        </Panel>

        <Panel title="Layout">
          <div className="grid grid-cols-4 gap-1.5">
            {([['center', 'Centre'], ['left', 'Logo left'], ['right', 'Logo right'], ['repeat', 'Step & repeat']] as [Layout, string][]).map(([v, l]) => (
              <button key={v} onClick={() => set({ layout: v })}
                className={`rounded-md border px-1 py-1.5 text-[11px] leading-tight ${cfg.layout === v ? 'border-acid text-acid' : 'border-ink-700 text-ink-300 hover:border-ink-500'}`}>{l}</button>
            ))}
          </div>
          {cfg.layout === 'repeat' ? (<>
            <Slider label="Logo height" value={cfg.repeatSize} min={40} max={Math.max(100, Math.round(cfg.heightMm / 2))} onChange={(v) => set({ repeatSize: v })} format={(v) => `${v} mm`} />
            <Slider label="Spacing" value={cfg.repeatGap} min={0.1} max={2} step={0.05} onChange={(v) => set({ repeatGap: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Toggle checked={cfg.repeatStagger} onChange={(v) => set({ repeatStagger: v })} label="Staggered rows (classic press wall)" />
          </>) : (<>
            <Slider label="Logo size" value={cfg.logoSize} min={0.1} max={1} step={0.01} onChange={(v) => set({ logoSize: v })} format={(v) => `${Math.round(v * 100)}% of safe height`} />
            <Slider label="Horizontal position" value={cfg.offsetX} min={-1} max={1} step={0.01} onChange={(v) => set({ offsetX: v })} format={(v) => v.toFixed(2)} />
            <Slider label="Vertical position" value={cfg.offsetY} min={-1} max={1} step={0.01} onChange={(v) => set({ offsetY: v })} format={(v) => v.toFixed(2)} />
          </>)}
        </Panel>

        {cfg.layout !== 'repeat' && (
          <Panel title="Text (converted to outlines)">
            <TextInput placeholder="Tagline, e.g. Coffee roasters since 2009" value={cfg.text1} onChange={(e) => set({ text1: e.target.value })} />
            <TextInput placeholder="Second line, e.g. www.example.com" value={cfg.text2} onChange={(e) => set({ text2: e.target.value })} />
            {(cfg.text1 || cfg.text2) && (<>
              <Select<FontKey> value={cfg.font} onChange={(v) => set({ font: v })} options={FONTS.map((f) => ({ value: f.key, label: f.label }))} />
              <Slider label="Text size" value={cfg.textSize} min={0.06} max={0.6} step={0.01} onChange={(v) => set({ textSize: v })} format={(v) => `${Math.round(v * 100)}% of logo`} />
              <Slider label="Letter spacing" value={cfg.tracking} min={-0.05} max={0.4} step={0.01} onChange={(v) => set({ tracking: v })} format={(v) => v.toFixed(2)} />
              <Toggle checked={cfg.uppercase} onChange={(v) => set({ uppercase: v })} label="Uppercase" />
              <Field label="Text colour">
                <ColorInput value={cfg.textColor} onChange={(v) => set({ textColor: v })} />
                <KitSwatches kit={kit} onPick={(v) => set({ textColor: v })} />
                <CmykFields hex={cfg.textColor} cfg={cfg} set={set} />
              </Field>
            </>)}
          </Panel>
        )}

        <Panel title="Export">
          <Button variant="primary" className="w-full" onClick={downloadPdf} disabled={!!busy}><Download className="h-4 w-4" />Download print PDF</Button>
          <Button className="w-full" onClick={downloadProof} disabled={!!busy || !pdfRef.current}><ImageIcon className="h-4 w-4" />Client proof (JPG)</Button>
          <p className="flex gap-1.5 text-xs leading-relaxed text-ink-400"><Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />Vector PDF with TrimBox/BleedBox set, text outlined, no raster images — scales to any size without quality loss.</p>
        </Panel>
      </aside>
    </div>
  )
}
