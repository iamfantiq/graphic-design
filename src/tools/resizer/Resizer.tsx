import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, RotateCcw, Copy, FileImage, Package } from 'lucide-react'
import { Button, Dropzone, Panel, Segmented, Slider, Toggle, ColorInput, Spinner, Select } from '../../components/ui'
import { ACCEPT_DESIGN, loadSource, type LoadedSource } from '../../lib/files'
import { baseName, canvasToBlob, downloadBlob, downloadZip } from '../../lib/download'
import { analyse, DEFAULT_ADJUST, DEFAULT_FORMATS, FORMATS, renderFormat, resolveMode, type Adjust, type FitMode, type FormatSpec, type SourceInfo } from './render'

const MODE_LABEL: Record<Exclude<FitMode, 'auto'>, string> = {
  fill: 'Fill (crop)', blur: 'Blurred backdrop', extend: 'Edge extend', color: 'Solid colour',
}

function downscale(c: HTMLCanvasElement, long: number) {
  const s = Math.min(1, long / Math.max(c.width, c.height))
  if (s === 1) return c
  const o = document.createElement('canvas')
  o.width = Math.round(c.width * s); o.height = Math.round(c.height * s)
  const x = o.getContext('2d')!
  x.imageSmoothingQuality = 'high'
  x.drawImage(c, 0, 0, o.width, o.height)
  return o
}

function Preview({ src, fmt, adj, selected, onSelect, onPan, showSafe }: {
  src: SourceInfo; fmt: FormatSpec; adj: Adjust; selected: boolean; onSelect: () => void
  onPan: (ox: number, oy: number) => void; showSafe: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<string>('')
  const scale = 520 / Math.max(fmt.w, fmt.h)
  useEffect(() => {
    if (ref.current) setMode(renderFormat(src, fmt, adj, ref.current, scale))
  }, [src, fmt, adj, scale])
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  return (
    <div onClick={onSelect}
      className={`group flex flex-col rounded-xl border p-3 transition-colors ${selected ? 'border-acid bg-ink-850' : 'border-ink-800 bg-ink-900 hover:border-ink-600'}`}>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-ink-100">{fmt.short} <span className="text-ink-400">· {fmt.label}</span></span>
        <span className="font-mono text-ink-400">{fmt.w}×{fmt.h}</span>
      </div>
      <div className="checker relative flex flex-1 items-center justify-center overflow-hidden rounded-md p-3" style={{ minHeight: 220 }}>
        <div className="relative" style={{ aspectRatio: `${fmt.w}/${fmt.h}`, width: fmt.w >= fmt.h ? '100%' : undefined, height: fmt.h > fmt.w ? 360 : undefined, maxWidth: '100%' }}>
          <canvas ref={ref} className="block h-full w-full cursor-grab touch-none shadow-lg active:cursor-grabbing"
            onPointerDown={(e) => { onSelect(); (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: adj.ox, oy: adj.oy } }}
            onPointerMove={(e) => {
              if (!drag.current) return
              const r = (e.target as HTMLElement).getBoundingClientRect()
              const k = mode === 'fill' ? -2 : 2
              const nx = Math.max(-1, Math.min(1, drag.current.ox + ((e.clientX - drag.current.x) / r.width) * k))
              const ny = Math.max(-1, Math.min(1, drag.current.oy + ((e.clientY - drag.current.y) / r.height) * k))
              onPan(nx, ny)
            }}
            onPointerUp={() => { drag.current = null }} />
          {showSafe && fmt.safe && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-0 bg-red-500/25" style={{ height: `${(fmt.safe.top / fmt.h) * 100}%` }} />
              <div className="absolute inset-x-0 bottom-0 bg-red-500/25" style={{ height: `${(fmt.safe.bottom / fmt.h) * 100}%` }} />
              {fmt.safe.right && <div className="absolute right-0 bg-red-500/15" style={{ top: `${(fmt.safe.top / fmt.h) * 100}%`, bottom: `${(fmt.safe.bottom / fmt.h) * 100}%`, width: `${(fmt.safe.right / fmt.w) * 100}%` }} />}
              {fmt.safe.left !== undefined && fmt.id === 'x-header' && <div className="absolute bottom-0 left-[3%] aspect-square w-[22%] translate-y-1/3 rounded-full bg-red-500/30" />}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-400">
        <span>{adj.mode === 'auto' ? `Auto → ${MODE_LABEL[mode as keyof typeof MODE_LABEL] ?? ''}` : MODE_LABEL[adj.mode as keyof typeof MODE_LABEL]}</span>
        <span>drag to reposition</span>
      </div>
    </div>
  )
}

export default function Resizer({ handoff }: { handoff?: LoadedSource | null }) {
  const [source, setSource] = useState<LoadedSource | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<string[]>(DEFAULT_FORMATS)
  const [adjust, setAdjust] = useState<Record<string, Adjust>>({})
  const [selected, setSelected] = useState<string>('story')
  const [format, setFormat] = useState<'png' | 'jpg'>('png')
  const [showSafe, setShowSafe] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => { if (handoff) { setSource(handoff); setFile(null); setAdjust({}) } }, [handoff])

  const full = useMemo(() => (source ? analyse(source.canvas) : null), [source])
  const preview = useMemo(() => (source ? analyse(downscale(source.canvas, 1100)) : null), [source])

  async function open(f: File, page = 1) {
    setLoading(true); setError(null)
    try {
      const s = await loadSource(f, { longSide: 3600, page })
      setSource(s); setFile(f); if (page === 1) setAdjust({})
    } catch (e) {
      setError((e as Error).message)
    } finally { setLoading(false) }
  }

  const adj = (id: string) => adjust[id] ?? DEFAULT_ADJUST
  const update = (id: string, patch: Partial<Adjust>) => setAdjust((a) => ({ ...a, [id]: { ...(a[id] ?? DEFAULT_ADJUST), ...patch } }))
  const formats = FORMATS.filter((f) => enabled.includes(f.id))
  const sel = formats.find((f) => f.id === selected) ?? formats[0]
  const name = baseName(source?.name ?? 'design')

  async function renderBlob(fmt: FormatSpec) {
    const c = document.createElement('canvas')
    renderFormat(full!, fmt, adj(fmt.id), c, 1)
    return canvasToBlob(c, format === 'png' ? 'image/png' : 'image/jpeg', 0.93)
  }
  const fileName = (fmt: FormatSpec) => `${name}_${fmt.short.replace(':', 'x')}_${fmt.w}x${fmt.h}.${format}`

  async function exportAll() {
    setExporting(true)
    try {
      const files = []
      for (const f of formats) files.push({ name: fileName(f), data: await renderBlob(f) })
      await downloadZip(files, `${name}_social.zip`)
    } finally { setExporting(false) }
  }

  if (!source || !preview) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">Social Resizer</h1>
        <p className="mb-8 text-ink-300">Drop a finished poster and get every social format at once — 1:1, 4:5, 9:16, 16:9 and more. Illustrator <code className="text-acid">.ai</code> files work directly when saved with “Create PDF Compatible File” (the default).</p>
        <Dropzone accept={ACCEPT_DESIGN} onFiles={(f) => open(f[0])} title="Drop your poster here" subtitle="AI · PDF · SVG · PNG · JPG · WebP" />
        {loading && <div className="mt-6"><Spinner label="Rendering artwork…" /></div>}
        {error && <p className="mt-6 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
      </div>
    )
  }

  const a = sel ? adj(sel.id) : DEFAULT_ADJUST
  const resolved = sel ? resolveMode(preview, sel, a) : 'fill'

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 shrink-0 overflow-y-auto border-r border-ink-800 bg-ink-900">
        <Panel title="Source">
          <div className="flex items-center gap-3">
            <div className="checker h-14 w-14 shrink-0 overflow-hidden rounded">
              <img src={source.canvas.toDataURL('image/jpeg', 0.6)} className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0 text-xs">
              <div className="truncate font-medium text-ink-100">{source.name}</div>
              <div className="font-mono text-ink-400">{source.canvas.width}×{source.canvas.height}px · {source.kind.toUpperCase()}</div>
            </div>
          </div>
          {source.pageCount && source.pageCount > 1 && file && (
            <Select value={String(source.page ?? 1)} onChange={(v) => open(file, Number(v))}
              options={Array.from({ length: source.pageCount }, (_, i) => ({ value: String(i + 1), label: `Page / artboard ${i + 1}` }))} />
          )}
          <Dropzone compact accept={ACCEPT_DESIGN} onFiles={(f) => open(f[0])} title="Replace file" />
          {loading && <Spinner label="Rendering…" />}
        </Panel>
        <Panel title="Formats">
          {FORMATS.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={enabled.includes(f.id)}
                  onChange={(e) => setEnabled((en) => (e.target.checked ? [...en, f.id] : en.filter((x) => x !== f.id)))} />
                <span className="text-ink-100">{f.short}</span>
                <span className="truncate text-xs text-ink-400">{f.label}</span>
              </span>
            </label>
          ))}
        </Panel>
        <Panel title="Export">
          <Segmented value={format} onChange={setFormat} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }]} />
          <Toggle checked={showSafe} onChange={setShowSafe} label="Show platform safe zones" />
          <Button variant="primary" className="w-full" onClick={exportAll} disabled={exporting || !formats.length}>
            <Package className="h-4 w-4" /> {exporting ? 'Exporting…' : `Download all (${formats.length}) .zip`}
          </Button>
        </Panel>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {formats.map((f) => (
            <Preview key={f.id} src={preview} fmt={f} adj={adj(f.id)} selected={sel?.id === f.id}
              showSafe={showSafe} onSelect={() => setSelected(f.id)} onPan={(ox, oy) => update(f.id, { ox, oy })} />
          ))}
        </div>
        {!formats.length && <p className="text-ink-400">Pick at least one format on the left.</p>}
      </main>

      {sel && (
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-ink-800 bg-ink-900">
          <Panel title={`Adjust ${sel.short}`} right={<span className="font-mono text-[11px] text-ink-400">{sel.w}×{sel.h}</span>}>
            <div className="grid grid-cols-2 gap-1.5">
              {(['auto', 'fill', 'blur', 'extend', 'color'] as FitMode[]).map((m) => (
                <button key={m} onClick={() => update(sel.id, { mode: m, zoom: 1, ox: 0, oy: 0 })}
                  className={`rounded-md border px-2 py-1.5 text-xs ${a.mode === m ? 'border-acid text-acid' : 'border-ink-700 text-ink-300 hover:border-ink-500'}`}>
                  {m === 'auto' ? 'Auto' : MODE_LABEL[m]}
                </button>
              ))}
            </div>
            <Slider label="Scale" value={a.zoom} min={0.5} max={2.5} step={0.01} onChange={(v) => update(sel.id, { zoom: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Horizontal" value={a.ox} min={-1} max={1} step={0.01} onChange={(v) => update(sel.id, { ox: v })} format={(v) => v.toFixed(2)} />
            <Slider label="Vertical" value={a.oy} min={-1} max={1} step={0.01} onChange={(v) => update(sel.id, { oy: v })} format={(v) => v.toFixed(2)} />
            {resolved !== 'fill' && (
              <Slider label="Padding" value={a.padding} min={0} max={0.25} step={0.005} onChange={(v) => update(sel.id, { padding: v })} format={(v) => `${Math.round(v * 100)}%`} />
            )}
            {resolved === 'blur' && (<>
              <Slider label="Blur" value={a.blur} min={6} max={80} onChange={(v) => update(sel.id, { blur: v })} />
              <Slider label="Darken" value={a.dim} min={0} max={0.7} step={0.01} onChange={(v) => update(sel.id, { dim: v })} format={(v) => `${Math.round(v * 100)}%`} />
            </>)}
            {(resolved === 'color' || resolved === 'extend') && (
              <div>
                <div className="mb-1 text-xs text-ink-300">Background {a.bg ? '' : <span className="text-ink-400">(auto from edges)</span>}</div>
                <ColorInput value={a.bg ?? preview.edgeHex} onChange={(v) => update(sel.id, { bg: v })} />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={() => update(sel.id, DEFAULT_ADJUST)}><RotateCcw className="h-3.5 w-3.5" />Reset</Button>
              <Button className="flex-1" title="Copy these settings to all formats"
                onClick={() => setAdjust(Object.fromEntries(formats.map((f) => [f.id, { ...a }])))}><Copy className="h-3.5 w-3.5" />Apply all</Button>
            </div>
            {sel.safe && <p className="text-xs text-ink-400">{sel.safe.note}.</p>}
          </Panel>
          <Panel title="Download">
            <Button className="w-full" onClick={async () => downloadBlob(await renderBlob(sel), fileName(sel))}>
              <Download className="h-4 w-4" /> {sel.short} as {format.toUpperCase()}
            </Button>
            <p className="flex gap-2 text-xs leading-relaxed text-ink-400"><FileImage className="h-4 w-4 shrink-0" />
              Exports render from the full-resolution source ({full?.canvas.width}px), not the preview.</p>
          </Panel>
        </aside>
      )}
    </div>
  )
}
