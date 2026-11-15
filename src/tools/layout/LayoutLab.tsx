import { useEffect, useMemo, useRef, useState } from 'react'
import { Dices, Lock, Unlock, Pencil, Package, X, Image as ImageIcon, Info, Trash2, FolderOpen } from 'lucide-react'
import { Button, Dropzone, Field, Panel, Select, Spinner, TextArea, TextInput } from '../../components/ui'
import { contrast, extractPalette, rgbToHex, saturation, type RGB } from '../../lib/color'
import { loadImageEl } from '../../lib/files'
import { downloadZip } from '../../lib/download'
import { DOC_FORMATS, FONT_PAIRS, PALETTES, SAMPLE, ensureFonts, type Content, type FontPair, type Palette } from './design'
import { ARCHETYPES, generate, type GenImage, type Idea } from './generator'
import { renderScene } from './fabricScene'
import type { Scene } from './scene'
import Editor from './Editor'
import { deleteDesign, listDesigns, onDesignsChange, putDesign, type SavedDesign } from '../../lib/store'
import { renderJson } from './adapt'
import type { DocFormat } from './design'
import { kitPalette, useBrandKits } from '../../lib/brand'
import { ALL_FONTS } from './design'
import type { LoadedSource } from '../../lib/files'

function paletteFromImage(img: HTMLImageElement, name: string): Palette | null {
  const cols = extractPalette(img, 7)
  if (cols.length < 2) return null
  const bg = cols[0].color
  const rest = cols.slice(1).map((c) => c.color)
  let fg = rest.reduce((best, c) => (contrast(c, bg) > contrast(best, bg) ? c : best), rest[0])
  if (contrast(fg, bg) < 4.5) fg = contrast([0, 0, 0], bg) > contrast([255, 255, 255], bg) ? [17, 17, 17] : [245, 245, 245]
  const others = rest.filter((c) => c !== fg).sort((a, b) => saturation(b) - saturation(a))
  const accent: RGB = others[0] ?? fg
  const alt: RGB = others[1] ?? bg
  return { name, bg: rgbToHex(bg), fg: rgbToHex(fg), accent: rgbToHex(accent), alt: rgbToHex(alt) }
}

interface Ref { id: string; url: string; palette: Palette | null }

const rand = () => Math.floor(Math.random() * 1e9)
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }

export default function LayoutLab({ onSendToResizer }: { onSendToResizer: (s: LoadedSource) => void }) {
  const [content, setContent] = useState<Content>(SAMPLE)
  const [formatId, setFormatId] = useState('a')
  const [img, setImg] = useState<GenImage | null>(null)
  const [refs, setRefs] = useState<Ref[]>([])
  const [palette, setPalette] = useState<Palette>(PALETTES[0])
  const [lockPalette, setLockPalette] = useState(false)
  const [fonts, setFonts] = useState<FontPair>(FONT_PAIRS[0])
  const [lockFonts, setLockFonts] = useState(false)
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [ready, setReady] = useState(false)
  const [editing, setEditing] = useState<{ scene: Scene; title: string; format: DocFormat; json?: string; id?: string } | null>(null)
  const [saved, setSaved] = useState<SavedDesign[]>([])
  useEffect(() => { const load = () => listDesigns().then(setSaved); load(); return onDesignsChange(load) }, [])
  const [exporting, setExporting] = useState<string | null>(null)
  const fmt = DOC_FORMATS.find((f) => f.id === formatId)!

  useEffect(() => {
    Promise.all(FONT_PAIRS.map(ensureFonts)).then(() => document.fonts.ready).then(() => setReady(true))
  }, [])

  const { active: kit } = useBrandKits()
  const brandPalette = useMemo(() => (kit ? kitPalette(kit) : null), [kit])
  const brandFonts = useMemo<FontPair | null>(() => {
    if (!kit) return null
    const w = (f: string) => Math.max(...(ALL_FONTS.find(([n]) => n === f)?.[1] ?? [700]))
    return { name: `Brand: ${kit.name}`, display: kit.fonts.display, dw: w(kit.fonts.display), text: kit.fonts.text, tw: 400, upper: false }
  }, [kit])
  const fontPool = useMemo(() => (brandFonts ? [brandFonts, ...FONT_PAIRS] : FONT_PAIRS), [brandFonts])
  useEffect(() => { if (brandFonts) ensureFonts(brandFonts) }, [brandFonts])
  const pool = useMemo(() => [...(brandPalette ? [brandPalette] : []), ...refs.map((r) => r.palette).filter(Boolean) as Palette[], ...PALETTES], [refs, brandPalette])

  function roll() {
    const order = shuffle(ARCHETYPES.map((a) => a.id))
    const refPalettes = refs.map((r) => r.palette).filter(Boolean) as Palette[]
    setIdeas(order.map((archetype) => ({
      archetype, seed: rand(),
      // if there are references, lean on them: research-driven palettes first
      palette: lockPalette ? palette : brandPalette && Math.random() < 0.5 ? brandPalette : refPalettes.length && Math.random() < 0.6 ? refPalettes[Math.floor(Math.random() * refPalettes.length)] : pool[Math.floor(Math.random() * pool.length)],
      fonts: lockFonts ? fonts : brandFonts && Math.random() < 0.5 ? brandFonts : FONT_PAIRS[Math.floor(Math.random() * FONT_PAIRS.length)],
    })))
  }

  useEffect(() => { if (ready && !ideas.length) roll() }, [ready]) // eslint-disable-line

  // render thumbnails sequentially (one shared offscreen canvas)
  const job = useRef(0)
  useEffect(() => {
    if (!ready || !ideas.length) return
    const id = ++job.current
    setThumbs({})
    ;(async () => {
      for (const idea of ideas) {
        const scene = generate(idea, fmt.w, fmt.h, content, img)
        const url = await renderScene(scene, 360 / Math.max(fmt.w, fmt.h))
        if (job.current !== id) return
        setThumbs((t) => ({ ...t, [idea.seed]: url }))
      }
    })()
  }, [ideas, content, img, fmt, ready])

  async function addRefs(files: File[]) {
    const out: Ref[] = []
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue
      const url = URL.createObjectURL(f)
      const el = await loadImageEl(url)
      out.push({ id: url, url, palette: paletteFromImage(el, `Reference ${refs.length + out.length + 1}`) })
    }
    setRefs((r) => [...r, ...out])
  }

  async function setImage(f: File) {
    const url = URL.createObjectURL(f)
    const el = await loadImageEl(url)
    setImg({ src: url, w: el.naturalWidth, h: el.naturalHeight })
  }

  async function exportReflow(idea: Idea) {
    setExporting(String(idea.seed))
    try {
      const files = []
      for (const f of DOC_FORMATS.filter((x) => ['a', '45', '11', '916', '169'].includes(x.id))) {
        const scene = generate(idea, f.w, f.h, content, img)
        const scale = f.print ? 2.83 : 1 // A-series at 2.83× ≈ A3 @ 300 dpi
        const url = await renderScene(scene, scale, 'png')
        const blob = await (await fetch(url)).blob()
        files.push({ name: `${idea.archetype}_${f.id}_${Math.round(f.w * scale)}x${Math.round(f.h * scale)}.png`, data: blob })
      }
      await downloadZip(files, `layout_${idea.archetype}_all-formats.zip`)
    } finally { setExporting(null) }
  }

  const openIdea = (idea: Idea) => setEditing({ scene: generate(idea, fmt.w, fmt.h, content, img), format: fmt, title: `${content.title || 'Design'} — ${ARCHETYPES.find((a) => a.id === idea.archetype)?.name ?? ''}` })
  const openSaved = (d: SavedDesign) => setEditing({ scene: { w: d.w, h: d.h, bg: '#ffffff', els: [] }, format: DOC_FORMATS.find((f) => f.id === d.formatId) ?? fmt, title: d.name, json: d.json, id: d.id })

  if (editing) {
    return <Editor key={editing.id ?? 'new'} scene={editing.scene} kit={kit} title={editing.title} format={editing.format} initialJson={editing.json} designId={editing.id} onOpenDesign={openSaved}
      onBack={() => setEditing(null)} onSendToResizer={onSendToResizer} />
  }

  const set = (k: keyof Content) => (e: { target: { value: string } }) => setContent((c) => ({ ...c, [k]: e.target.value }))

  return (
    <div className="flex min-h-0 flex-col md:h-full md:flex-row">
      <aside className="w-full shrink-0 border-b border-ink-800 bg-ink-900 md:w-80 md:overflow-y-auto md:border-b-0 md:border-r">
        <Panel title="Content">
          <TextInput value={content.title} onChange={set('title')} placeholder="Title" />
          <TextInput value={content.subtitle} onChange={set('subtitle')} placeholder="Subtitle" />
          <div className="grid grid-cols-2 gap-2">
            <TextInput value={content.date} onChange={set('date')} placeholder="Date" />
            <TextInput value={content.place} onChange={set('place')} placeholder="Place" />
          </div>
          <TextArea rows={3} value={content.body} onChange={set('body')} placeholder="Details / line-up (one per line)" />
          <TextInput value={content.footer} onChange={set('footer')} placeholder="Website / handle" />
        </Panel>
        <Panel title="Image (optional)">
          {img ? (
            <div className="flex items-center gap-3">
              <img src={img.src} className="h-14 w-14 rounded object-cover" />
              <Button variant="ghost" onClick={() => setImg(null)}><X className="h-4 w-4" />Remove</Button>
            </div>
          ) : <Dropzone compact accept="image/*" onFiles={(f) => setImage(f[0])} title="Add a photo" subtitle="Layouts adapt to it" />}
        </Panel>
        <Panel title="Format">
          <Select value={formatId} onChange={setFormatId} options={DOC_FORMATS.map((f) => ({ value: f.id, label: `${f.label} — ${f.w}×${f.h}` }))} />
        </Panel>
        <Panel title="Style" right={null}>
          <Field label="Palette">
            <div className="flex flex-wrap gap-1.5">
              {pool.map((p) => (
                <button key={p.name} title={p.name} onClick={() => { setPalette(p); setLockPalette(true) }}
                  className={`flex overflow-hidden rounded border ${lockPalette && palette.name === p.name ? 'border-acid' : 'border-ink-700'}`}>
                  {[p.bg, p.fg, p.accent, p.alt].map((c, i) => <span key={i} className="h-5 w-3" style={{ background: c }} />)}
                </button>
              ))}
            </div>
          </Field>
          <button onClick={() => setLockPalette(!lockPalette)} className="flex items-center gap-1.5 text-xs text-ink-300 hover:text-ink-100">
            {lockPalette ? <Lock className="h-3.5 w-3.5 text-acid" /> : <Unlock className="h-3.5 w-3.5" />}
            {lockPalette ? `Palette locked: ${palette.name}` : 'Palette: explore'}
          </button>
          <Field label="Type pairing">
            <Select value={fonts.name} onChange={(v) => { setFonts(fontPool.find((f) => f.name === v)!); setLockFonts(true) }}
              options={fontPool.map((f) => ({ value: f.name, label: `${f.name} — ${f.display} / ${f.text}` }))} />
          </Field>
          <button onClick={() => setLockFonts(!lockFonts)} className="flex items-center gap-1.5 text-xs text-ink-300 hover:text-ink-100">
            {lockFonts ? <Lock className="h-3.5 w-3.5 text-acid" /> : <Unlock className="h-3.5 w-3.5" />}
            {lockFonts ? `Type locked: ${fonts.name}` : 'Type: explore'}
          </button>
        </Panel>
        <Panel title="References">
          <p className="text-xs leading-relaxed text-ink-400">Save posters you like from Pinterest, Instagram or Are.na and drop the screenshots here. Their colour palettes join the generator, so ideas follow your research.</p>
          <Dropzone compact multiple accept="image/*" onFiles={addRefs} title="Drop reference screenshots" />
          <div className="grid grid-cols-3 gap-2">
            {refs.map((r) => (
              <div key={r.id} className="group relative">
                <img src={r.url} className="aspect-[3/4] w-full rounded object-cover" />
                {r.palette && (
                  <button onClick={() => { setPalette(r.palette!); setLockPalette(true) }} title="Use this palette" className="absolute inset-x-1 bottom-1 flex overflow-hidden rounded">
                    {[r.palette.bg, r.palette.fg, r.palette.accent, r.palette.alt].map((c, i) => <span key={i} className="h-3 flex-1" style={{ background: c }} />)}
                  </button>
                )}
                <button onClick={() => setRefs((x) => x.filter((y) => y.id !== r.id))} className="absolute right-1 top-1 rounded bg-black/70 p-0.5 md:hidden md:group-hover:block"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        </Panel>
      </aside>

      <main className="order-first min-w-0 flex-1 p-4 md:order-none md:overflow-y-auto md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Layout ideas</h1>
            <p className="text-sm text-ink-400">12 compositions built from real grid systems and poster traditions — Swiss, Bauhaus, editorial, brutalist. Rule-based, editable, no generative filler.</p>
          </div>
          <Button variant="primary" onClick={roll} disabled={!ready}><Dices className="h-4 w-4" />New ideas</Button>
        </div>
        <label className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-400 hover:text-ink-100">
          <FolderOpen className="h-3.5 w-3.5" />Open a .formatter.json design file
          <input type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ''
            if (!f) return
            try {
              const d = JSON.parse(await f.text())
              if (d.app !== 'formatter' || !d.json) throw new Error('Not a Formatter design file')
              const thumb = await renderJson(d.json, d.w, d.h, 360 / Math.max(d.w, d.h))
              const sd: SavedDesign = { id: Math.random().toString(36).slice(2), name: d.name ?? f.name, formatId: d.formatId, w: d.w, h: d.h, json: d.json, thumb, updated: Date.now() }
              await putDesign(sd); openSaved(sd)
            } catch (err) { alert((err as Error).message) }
          }} />
        </label>
        {saved.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-300"><FolderOpen className="h-4 w-4" />My designs <span className="font-normal text-ink-400">— saved on this device</span></h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {saved.map((d) => (
                <div key={d.id} className="group w-32 shrink-0">
                  <button onClick={() => openSaved(d)} className="block w-full overflow-hidden rounded-md bg-ink-850 ring-1 ring-ink-800 hover:ring-acid/60">
                    <img src={d.thumb} className="w-full" style={{ aspectRatio: `${d.w}/${d.h}`, objectFit: 'cover' }} />
                  </button>
                  <div className="mt-1 flex items-start justify-between gap-1">
                    <div className="min-w-0 text-[11px]">
                      <div className="truncate text-ink-100">{d.name}</div>
                      <div className="text-ink-400">{new Date(d.updated).toLocaleDateString()}</div>
                    </div>
                    <button title="Delete" onClick={() => { if (confirm(`Delete “${d.name}”?`)) deleteDesign(d.id) }} className="p-0.5 text-ink-400 hover:text-red-300"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {!ready && <Spinner label="Loading typefaces…" />}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-5">
          {ideas.map((idea) => {
            const a = ARCHETYPES.find((x) => x.id === idea.archetype)!
            const url = thumbs[idea.seed]
            return (
              <div key={idea.seed} className="group">
                <div className="relative overflow-hidden rounded-lg bg-ink-850 ring-1 ring-ink-800 transition group-hover:ring-ink-500" style={{ aspectRatio: `${fmt.w}/${fmt.h}` }}>
                  {url ? <img src={url} className="h-full w-full cursor-pointer object-cover" onClick={() => openIdea(idea)} />
                    : <div className="flex h-full items-center justify-center"><Spinner /></div>}
                  <div className="absolute bottom-2 right-2 flex gap-1.5 transition md:inset-x-2 md:opacity-0 md:group-hover:opacity-100">
                    <Button variant="primary" className="!hidden flex-1 !px-2 md:!inline-flex" onClick={() => openIdea(idea)}><Pencil className="h-3.5 w-3.5" />Edit</Button>
                    <Button className="!px-2" title="Reflow this layout into every format and download" onClick={() => exportReflow(idea)} disabled={!!exporting}>
                      {exporting === String(idea.seed) ? <Spinner /> : <Package className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-ink-100">{a.name}</span>
                  <span className="hidden items-center gap-1.5 text-ink-400 sm:flex">
                    <span className="flex overflow-hidden rounded-sm">{[idea.palette.bg, idea.palette.fg, idea.palette.accent].map((c, i) => <span key={i} className="h-2.5 w-2" style={{ background: c }} />)}</span>
                    {idea.fonts.name}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-8 flex max-w-2xl gap-2 text-xs leading-relaxed text-ink-400">
          <Info className="h-4 w-4 shrink-0" />
          <span>The <Package className="inline h-3 w-3" /> button re-builds the same composition natively for poster, 4:5, 1:1, 9:16 and 16:9 — type and grid are re-flowed, not cropped. Poster formats export at A3 / 300 dpi. <ImageIcon className="inline h-3 w-3" /> Add a photo to unlock image-led layouts.</span>
        </p>
      </main>
    </div>
  )
}

