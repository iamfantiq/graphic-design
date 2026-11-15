import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, RotateCcw, Copy, Package, Sparkles, X, KeyRound, ScanSearch } from 'lucide-react'
import { Button, Dropzone, Panel, Segmented, Slider, Toggle, ColorInput, Spinner, Select, TextInput } from '../../components/ui'
import { ACCEPT_DESIGN, loadSource, type LoadedSource } from '../../lib/files'
import { baseName, canvasToBlob, downloadBlob, downloadZip } from '../../lib/download'
import { contentBox, foregroundMask, normaliseAnalysis, type AiResult, type Mask } from '../../lib/smart'
import { aiStatus, analyzePoster, getCode, setCode, type AiStatus } from '../../lib/ai'
import {
  analyse, DEFAULT_ADJUST, DEFAULT_FORMATS, FORMATS, renderFormat, resolveFill, resolvePlacement,
  type Adjust, type Fill, type FormatSpec, type Placement, type SourceInfo,
} from './render'

const PLACEMENT_LABEL: Record<Exclude<Placement, 'auto'>, string> = { smart: 'Smart crop', fit: 'Whole poster', fill: 'Fill frame', recompose: 'AI recompose' }
const FILL_LABEL: Record<Exclude<Fill, 'auto'>, string> = { color: 'Solid colour', extend: 'Edge extend', blur: 'Blurred backdrop' }

interface Item {
  id: string
  file: File | null
  source: LoadedSource
  full: SourceInfo
  preview: SourceInfo
  mask: Mask
  adjust: Record<string, Adjust>
  ai: AiResult | null
  aiBusy: boolean
  aiError: string | null
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

function makeItem(source: LoadedSource, file: File | null): Item {
  const canvas = downscale(source.canvas, 3000)
  const small = downscale(canvas, 1100)
  const mask = foregroundMask(small)
  const keep = contentBox(mask)
  return {
    id: Math.random().toString(36).slice(2), file, source: { ...source, canvas },
    full: analyse(canvas, keep), preview: analyse(small, keep), mask, adjust: {}, ai: null, aiBusy: false, aiError: null,
  }
}

const safeNote = (f: FormatSpec) => f.safe
  ? `top ${Math.round((f.safe.top / f.h) * 100)}% and bottom ${Math.round((f.safe.bottom / f.h) * 100)}% are covered by app UI`
  : undefined

function Preview({ item, fmt, adj, selected, onSelect, onPan, showSafe }: {
  item: Item; fmt: FormatSpec; adj: Adjust; selected: boolean; onSelect: () => void
  onPan: (ox: number, oy: number) => void; showSafe: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [res, setRes] = useState<{ placement: string; fill: string } | null>(null)
  const scale = (fmt.slices ? 900 : 520) / Math.max(fmt.w, fmt.h)
  useEffect(() => {
    if (ref.current) setRes(renderFormat(item.preview, fmt, adj, ref.current, scale, item.ai))
  }, [item.preview, item.ai, fmt, adj, scale])
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const reason = item.ai?.analysis.formats.find((f) => f.id === fmt.id)?.reasoning
  return (
    <div onClick={onSelect}
      className={`group flex flex-col rounded-xl border p-3 transition-colors ${fmt.slices ? 'col-span-full' : ''} ${selected ? 'border-acid bg-ink-850' : 'border-ink-800 bg-ink-900 hover:border-ink-600'}`}>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-ink-100">{fmt.short} <span className="text-ink-400">· {fmt.label}</span></span>
        <span className="font-mono text-ink-400">{fmt.w}×{fmt.h}</span>
      </div>
      <div className="checker relative flex flex-1 items-center justify-center overflow-hidden rounded-md p-3" style={{ minHeight: 220 }}>
        <div className="relative" style={{ aspectRatio: `${fmt.w}/${fmt.h}`, width: fmt.w >= fmt.h ? '100%' : undefined, height: fmt.h > fmt.w ? 360 : undefined, maxWidth: '100%' }}>
          <canvas ref={ref} className="block h-full w-full cursor-grab touch-pan-y shadow-lg md:touch-none active:cursor-grabbing"
            onPointerDown={(e) => { onSelect(); (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: adj.ox, oy: adj.oy } }}
            onPointerMove={(e) => {
              if (!drag.current) return
              const r = (e.target as HTMLElement).getBoundingClientRect()
              const k = res?.placement === 'fill' ? -2 : res?.placement === 'smart' ? 4 : res?.placement === 'recompose' ? 10 : 2
              const nx = Math.max(-1, Math.min(1, drag.current.ox + ((e.clientX - drag.current.x) / r.width) * k))
              const ny = Math.max(-1, Math.min(1, drag.current.oy + ((e.clientY - drag.current.y) / r.height) * k))
              onPan(nx, ny)
            }}
            onPointerUp={() => { drag.current = null }} />
          {fmt.slices && (
            <div className="pointer-events-none absolute inset-0 flex">
              {Array.from({ length: fmt.slices }, (_, i) => <div key={i} className="flex-1 border-r border-dashed border-white/70 last:border-r-0"><span className="m-1 inline-block rounded bg-black/60 px-1 font-mono text-[10px] text-white">{i + 1}</span></div>)}
            </div>
          )}
          {showSafe && fmt.safe && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-0 bg-red-500/25" style={{ height: `${(fmt.safe.top / fmt.h) * 100}%` }} />
              <div className="absolute inset-x-0 bottom-0 bg-red-500/25" style={{ height: `${(fmt.safe.bottom / fmt.h) * 100}%` }} />
              {fmt.safe.right && <div className="absolute right-0 bg-red-500/15" style={{ top: `${(fmt.safe.top / fmt.h) * 100}%`, bottom: `${(fmt.safe.bottom / fmt.h) * 100}%`, width: `${(fmt.safe.right / fmt.w) * 100}%` }} />}
              {fmt.id === 'x-header' && <div className="absolute bottom-0 left-[3%] aspect-square w-[22%] translate-y-1/3 rounded-full bg-red-500/30" />}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 text-[11px] text-ink-400">
        <div className="flex items-center justify-between">
          <span>{adj.placement === 'auto' ? 'Auto → ' : ''}{res ? `${PLACEMENT_LABEL[res.placement as keyof typeof PLACEMENT_LABEL]} · ${FILL_LABEL[res.fill as keyof typeof FILL_LABEL]}` : ''}</span>
          <span>drag to reposition</span>
        </div>
        {reason && <p className="mt-1 flex gap-1 text-ink-300"><Sparkles className="mt-px h-3 w-3 shrink-0 text-acid" />{reason}</p>}
      </div>
    </div>
  )
}

export default function Resizer({ handoff }: { handoff?: LoadedSource | null }) {
  const [items, setItems] = useState<Item[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<string[]>(DEFAULT_FORMATS)
  const [selected, setSelected] = useState<string>('story')
  const [format, setFormat] = useState<'png' | 'jpg'>('png')
  const [showSafe, setShowSafe] = useState(true)
  const [showBoxes, setShowBoxes] = useState(true)
  const [carousel, setCarousel] = useState<{ on: boolean; n: number; ratio: '4:5' | '1:1' }>({ on: false, n: 3, ratio: '4:5' })
  const [exporting, setExporting] = useState(false)
  const [ai, setAi] = useState<AiStatus | null>(null)
  const [code, setCodeState] = useState(getCode())

  useEffect(() => { aiStatus().then(setAi) }, [])
  useEffect(() => {
    if (!handoff) return
    const it = makeItem(handoff, null)
    setItems((xs) => [...xs, it]); setActiveId(it.id)
  }, [handoff])

  const item = items.find((i) => i.id === activeId) ?? items[0]
  const patchItem = (id: string, p: Partial<Item> | ((i: Item) => Partial<Item>)) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...(typeof p === 'function' ? p(x) : p) } : x)))

  async function addFiles(files: File[]) {
    setError(null)
    for (const [n, f] of files.entries()) {
      setLoading(`Rendering ${f.name} (${n + 1}/${files.length})…`)
      try {
        const s = await loadSource(f, { longSide: 3000 })
        const it = makeItem(s, f)
        setItems((xs) => [...xs, it])
        if (n === 0) setActiveId(it.id)
      } catch (e) { setError(`${f.name}: ${(e as Error).message}`) }
    }
    setLoading(null)
  }
  async function changePage(it: Item, page: number) {
    if (!it.file) return
    setLoading('Rendering page…')
    try {
      const s = await loadSource(it.file, { longSide: 3000, page })
      const fresh = makeItem(s, it.file)
      patchItem(it.id, { ...fresh, id: it.id })
    } finally { setLoading(null) }
  }

  const carouselFmt: FormatSpec | null = carousel.on
    ? { id: 'carousel', label: `Carousel · ${carousel.n} slides`, short: `${carousel.n}×${carousel.ratio}`, w: 1080 * carousel.n, h: carousel.ratio === '4:5' ? 1350 : 1080, slices: carousel.n }
    : null
  const formats = [...FORMATS.filter((f) => enabled.includes(f.id)), ...(carouselFmt ? [carouselFmt] : [])]
  const sel = formats.find((f) => f.id === selected) ?? formats[0]
  const adj = (it: Item, id: string) => it.adjust[id] ?? DEFAULT_ADJUST
  const update = (id: string, patch: Partial<Adjust>) => item && patchItem(item.id, (x) => ({ adjust: { ...x.adjust, [id]: { ...adj(x, id), ...patch } } }))

  async function runAi(it: Item) {
    patchItem(it.id, { aiBusy: true, aiError: null })
    try {
      const { analysis, width, height } = await analyzePoster(it.full.canvas, formats.map((f) => ({ id: f.id, w: f.w, h: f.h, safe: safeNote(f) })))
      const res = normaliseAnalysis(analysis, width, height, it.mask)
      patchItem(it.id, { ai: res, aiBusy: false, adjust: {} })
    } catch (e) {
      patchItem(it.id, { aiBusy: false, aiError: (e as Error).message })
    }
  }

  const name = (it: Item) => baseName(it.source.name)
  const fileName = (it: Item, fmt: FormatSpec) => `${name(it)}_${fmt.short.replace(':', 'x')}_${fmt.w}x${fmt.h}.${format}`
  async function renderBlob(it: Item, fmt: FormatSpec) {
    const c = document.createElement('canvas')
    renderFormat(it.full, fmt, adj(it, fmt.id), c, 1, it.ai)
    return canvasToBlob(c, format === 'png' ? 'image/png' : 'image/jpeg', 0.93)
  }
  /** Carousel: render the whole panorama once, then cut it into seamless slides. */
  async function renderFiles(it: Item, fmt: FormatSpec): Promise<{ name: string; data: Blob }[]> {
    if (!fmt.slices) return [{ name: fileName(it, fmt), data: await renderBlob(it, fmt) }]
    const c = document.createElement('canvas')
    renderFormat(it.full, fmt, adj(it, fmt.id), c, 1, it.ai)
    const sw = fmt.w / fmt.slices
    const out = []
    for (let i = 0; i < fmt.slices; i++) {
      const s = document.createElement('canvas')
      s.width = sw; s.height = fmt.h
      s.getContext('2d')!.drawImage(c, i * sw, 0, sw, fmt.h, 0, 0, sw, fmt.h)
      out.push({ name: `${name(it)}_carousel_${String(i + 1).padStart(2, '0')}of${fmt.slices}.${format}`, data: await canvasToBlob(s, format === 'png' ? 'image/png' : 'image/jpeg', 0.93) })
    }
    return out
  }
  async function exportAll() {
    setExporting(true)
    try {
      const files = []
      const multi = items.length > 1
      for (const it of items) for (const f of formats)
        for (const file of await renderFiles(it, f)) files.push({ name: (multi ? `${name(it)}/` : '') + file.name, data: file.data })
      await downloadZip(files, multi ? `formatter_batch_${items.length}-files.zip` : `${name(items[0])}_social.zip`)
    } finally { setExporting(false) }
  }

  const thumbs = useMemo(() => Object.fromEntries(items.map((i) => [i.id, downscale(i.preview.canvas, 420).toDataURL('image/jpeg', 0.8)])), [items.length]) // eslint-disable-line

  if (!item) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">Social Resizer</h1>
        <p className="mb-8 text-ink-300">Drop one poster — or a whole campaign — and get every social format at once. Smart crop finds the important part of each design so titles and dates never get cut. Illustrator <code className="text-acid">.ai</code> files work directly when saved with “Create PDF Compatible File” (the default).</p>
        <Dropzone multiple accept={ACCEPT_DESIGN} onFiles={addFiles} title="Drop posters here" subtitle="AI · PDF · SVG · PNG · JPG · WebP — several at once for batch mode" />
        {loading && <div className="mt-6"><Spinner label={loading} /></div>}
        {error && <p className="mt-6 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
      </div>
    )
  }

  const a = sel ? adj(item, sel.id) : DEFAULT_ADJUST
  const placement = sel ? resolvePlacement(item.preview, sel, a, item.ai) : 'fit'
  const fill = sel ? resolveFill(item.preview, sel, a, item.ai) : 'color'
  const hasRecompose = !!item.ai?.analysis.formats.find((f) => f.id === sel?.id)?.placements.length
  const anyBusy = items.some((i) => i.aiBusy)

  return (
    <div className="flex min-h-0 flex-col md:h-full md:flex-row">
      <aside className="w-full shrink-0 border-b border-ink-800 bg-ink-900 md:w-72 md:overflow-y-auto md:border-b-0 md:border-r">
        <Panel title={`Files (${items.length})`}>
          <div className="space-y-1">
            {items.map((it) => (
              <div key={it.id} onClick={() => setActiveId(it.id)}
                className={`group flex cursor-pointer items-center gap-2 rounded-md p-1.5 ${it.id === item.id ? 'bg-ink-700' : 'hover:bg-ink-800'}`}>
                <img src={thumbs[it.id]} className="h-10 w-10 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1 text-xs">
                  <div className="truncate text-ink-100">{it.source.name}</div>
                  <div className="flex items-center gap-1 text-ink-400">
                    {it.aiBusy ? <><span className="h-2.5 w-2.5 animate-spin rounded-full border border-ink-500 border-t-acid" />analysing…</>
                      : it.ai ? <><Sparkles className="h-3 w-3 text-acid" />AI layout</> : <><ScanSearch className="h-3 w-3" />smart crop</>}
                  </div>
                </div>
                <button title="Remove" className="p-1 text-ink-400 hover:text-ink-100 md:hidden md:group-hover:block"
                  onClick={(e) => { e.stopPropagation(); setItems((xs) => xs.filter((x) => x.id !== it.id)) }}><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          {item.source.pageCount && item.source.pageCount > 1 && item.file && (
            <Select value={String(item.source.page ?? 1)} onChange={(v) => changePage(item, Number(v))}
              options={Array.from({ length: item.source.pageCount }, (_, i) => ({ value: String(i + 1), label: `Page / artboard ${i + 1}` }))} />
          )}
          <Dropzone compact multiple accept={ACCEPT_DESIGN} onFiles={addFiles} title="Add more files" />
          {loading && <Spinner label={loading} />}
          {error && <p className="rounded border border-red-900 bg-red-950/40 p-2 text-xs text-red-300">{error}</p>}
        </Panel>
        <Panel title="Formats">
          {FORMATS.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled.includes(f.id)}
                onChange={(e) => setEnabled((en) => (e.target.checked ? [...en, f.id] : en.filter((x) => x !== f.id)))} />
              <span className="text-ink-100">{f.short}</span>
              <span className="truncate text-xs text-ink-400">{f.label}</span>
            </label>
          ))}
        </Panel>
        <Panel title="Carousel">
          <Toggle checked={carousel.on} onChange={(v) => setCarousel({ ...carousel, on: v })} label="Panorama carousel (swipe across)" />
          {carousel.on && (<>
            <Slider label="Slides" value={carousel.n} min={2} max={10} onChange={(v) => setCarousel({ ...carousel, n: v })} />
            <Segmented value={carousel.ratio} onChange={(v) => setCarousel({ ...carousel, ratio: v })} options={[{ value: '4:5', label: '4:5 slides' }, { value: '1:1', label: '1:1 slides' }]} />
            <p className="text-xs text-ink-400">One wide image cut into seamless slides — post them in order as one carousel. Works best with a wide design ({carousel.n * 1080}×{carousel.ratio === '4:5' ? 1350 : 1080} px); drag the preview to choose the crop.</p>
          </>)}
        </Panel>
        <Panel title="Export">
          <Segmented value={format} onChange={setFormat} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }]} />
          <Toggle checked={showSafe} onChange={setShowSafe} label="Show platform safe zones" />
          <Button variant="primary" className="w-full" onClick={exportAll} disabled={exporting || !formats.length}>
            <Package className="h-4 w-4" /> {exporting ? 'Exporting…' : `Download ${items.length * formats.length} images (.zip)`}
          </Button>
        </Panel>
      </aside>

      <main className="order-first min-w-0 flex-1 p-4 md:order-none md:overflow-y-auto md:p-6">
        <Button variant="primary" className="mb-3 w-full md:hidden" onClick={exportAll} disabled={exporting || !formats.length}>
          <Package className="h-4 w-4" /> {exporting ? 'Exporting…' : `Download ${items.length * formats.length} images (.zip)`}
        </Button>
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-ink-800 bg-ink-900 px-4 py-3">
          <Sparkles className="h-4 w-4 text-acid" />
          <div className="min-w-0 flex-1 text-sm">
            {item.ai ? <span className="text-ink-100">{item.ai.analysis.summary}</span>
              : ai?.configured ? <span className="text-ink-300">On-device smart crop is active. <b className="text-ink-100">AI layout</b> reads the poster like a designer: what’s essential, what can be cropped, and when to rearrange elements.</span>
              : <span className="text-ink-400">On-device smart crop is active. AI layout isn’t enabled on this deployment — add an <code className="text-ink-300">ANTHROPIC_API_KEY</code> in Vercel to turn it on.</span>}
            {item.aiError && <div className="mt-1 text-xs text-red-300">{item.aiError}</div>}
          </div>
          {ai?.configured && (<>
            {ai.needsCode && (
              <div className="flex w-40 items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                <TextInput type="password" placeholder="Access code" value={code} onChange={(e) => { setCodeState(e.target.value); setCode(e.target.value) }} />
              </div>
            )}
            <Button onClick={() => runAi(item)} disabled={item.aiBusy}>{item.aiBusy ? <Spinner label="Analysing…" /> : <><Sparkles className="h-4 w-4" />{item.ai ? 'Re-analyse' : 'AI layout'}</>}</Button>
            {items.length > 1 && <Button onClick={() => items.filter((i) => !i.ai).forEach(runAi)} disabled={anyBusy}>All files</Button>}
          </>)}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4">
          {formats.map((f) => (
            <Preview key={f.id} item={item} fmt={f} adj={adj(item, f.id)} selected={sel?.id === f.id}
              showSafe={showSafe} onSelect={() => setSelected(f.id)} onPan={(ox, oy) => update(f.id, { ox, oy })} />
          ))}
        </div>
        {!formats.length && <p className="text-ink-400">Pick at least one format on the left.</p>}
      </main>

      {sel && (
        <aside className="w-full shrink-0 border-b border-ink-800 bg-ink-900 md:w-72 md:overflow-y-auto md:border-b-0 md:border-l">
          <Panel title={`Adjust ${sel.short}`} right={<span className="font-mono text-[11px] text-ink-400">{sel.w}×{sel.h}</span>}>
            <div className="text-xs text-ink-300">Placement</div>
            <div className="grid grid-cols-2 gap-1.5">
              {(['auto', 'smart', 'fit', 'fill', 'recompose'] as Placement[]).map((m) => (
                <button key={m} disabled={m === 'recompose' && !hasRecompose} onClick={() => update(sel.id, { placement: m, zoom: 1, ox: 0, oy: 0 })}
                  title={m === 'recompose' && !hasRecompose ? 'Run AI layout; offered when the poster can be rearranged cleanly' : undefined}
                  className={`rounded-md border px-2 py-1.5 text-xs disabled:opacity-30 ${a.placement === m ? 'border-acid text-acid' : 'border-ink-700 text-ink-300 hover:border-ink-500'}`}>
                  {m === 'auto' ? 'Auto' : PLACEMENT_LABEL[m]}
                </button>
              ))}
            </div>
            {placement !== 'fill' && (<>
              <div className="pt-1 text-xs text-ink-300">Background</div>
              <Segmented value={a.fill} onChange={(v) => update(sel.id, { fill: v })}
                options={[{ value: 'auto', label: 'Auto' }, { value: 'color', label: 'Colour' }, { value: 'extend', label: 'Extend' }, { value: 'blur', label: 'Blur' }]} />
            </>)}
            <Slider label="Scale" value={a.zoom} min={0.5} max={2.5} step={0.01} onChange={(v) => update(sel.id, { zoom: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Horizontal" value={a.ox} min={-1} max={1} step={0.01} onChange={(v) => update(sel.id, { ox: v })} format={(v) => v.toFixed(2)} />
            <Slider label="Vertical" value={a.oy} min={-1} max={1} step={0.01} onChange={(v) => update(sel.id, { oy: v })} format={(v) => v.toFixed(2)} />
            {(placement === 'fit' || placement === 'smart') && (
              <Slider label="Margin" value={a.padding} min={0} max={0.25} step={0.005} onChange={(v) => update(sel.id, { padding: v })} format={(v) => `${Math.round(v * 100)}%`} />
            )}
            {fill === 'blur' && placement !== 'fill' && (<>
              <Slider label="Blur" value={a.blur} min={6} max={80} onChange={(v) => update(sel.id, { blur: v })} />
              <Slider label="Darken" value={a.dim} min={0} max={0.7} step={0.01} onChange={(v) => update(sel.id, { dim: v })} format={(v) => `${Math.round(v * 100)}%`} />
            </>)}
            {(fill === 'color' || fill === 'extend' || placement === 'recompose') && placement !== 'fill' && (
              <div>
                <div className="mb-1 text-xs text-ink-300">Background colour {a.bg ? '' : <span className="text-ink-400">(auto)</span>}</div>
                <ColorInput value={a.bg ?? item.preview.edgeHex} onChange={(v) => update(sel.id, { bg: v })} />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={() => update(sel.id, DEFAULT_ADJUST)}><RotateCcw className="h-3.5 w-3.5" />Reset</Button>
              <Button className="flex-1" title="Copy these settings to all formats of this file"
                onClick={() => patchItem(item.id, { adjust: Object.fromEntries(formats.map((f) => [f.id, { ...a }])) })}><Copy className="h-3.5 w-3.5" />Apply all</Button>
            </div>
            {sel.safe && <p className="text-xs text-ink-400">{sel.safe.note}.</p>}
          </Panel>

          <Panel title={item.ai ? 'What the AI found' : 'What smart crop keeps'} right={<Toggle checked={showBoxes} onChange={setShowBoxes} label="Boxes" />}>
            <div className="relative overflow-hidden rounded">
              <img src={thumbs[item.id]} className="block w-full" />
              {showBoxes && (item.ai ? item.ai.elements : []).map((e, i) => (
                <div key={i} title={e.label} className={`absolute border ${e.importance === 'essential' ? 'border-acid bg-acid/10' : e.importance === 'important' ? 'border-cyan-400' : 'border-dashed border-ink-400'}`}
                  style={{ left: `${e.box.x0 * 100}%`, top: `${e.box.y0 * 100}%`, width: `${(e.box.x1 - e.box.x0) * 100}%`, height: `${(e.box.y1 - e.box.y0) * 100}%` }} />
              ))}
              {showBoxes && (() => {
                const k = item.ai?.keep ?? item.preview.keep
                return <div className="absolute border-2 border-dashed border-fuchsia-500" style={{ left: `${k.x0 * 100}%`, top: `${k.y0 * 100}%`, width: `${(k.x1 - k.x0) * 100}%`, height: `${(k.y1 - k.y0) * 100}%` }} />
              })()}
            </div>
            {item.ai ? (
              <ul className="space-y-1 text-xs">
                {item.ai.elements.map((e, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${e.importance === 'essential' ? 'bg-acid' : e.importance === 'important' ? 'bg-cyan-400' : 'bg-ink-600'}`} />
                    <span className="truncate text-ink-300">{e.label}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-ink-400">The pink frame is the content area detected on your device. Smart crop keeps it fully visible in every format and crops only empty margins.</p>}
          </Panel>

          <Panel title="Download">
            <Button className="w-full" onClick={async () => {
              const files = await renderFiles(item, sel)
              if (files.length === 1) downloadBlob(files[0].data, files[0].name)
              else await downloadZip(files, `${name(item)}_carousel.zip`)
            }}>
              <Download className="h-4 w-4" /> {sel.short} as {format.toUpperCase()}
            </Button>
          </Panel>
        </aside>
      )}
    </div>
  )
}
