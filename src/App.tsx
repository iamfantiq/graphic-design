import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { LayoutGrid, Maximize2, Printer, Home as HomeIcon, ArrowRight, ShieldCheck, Palette, FileCode2 } from 'lucide-react'
import { Spinner } from './components/ui'
const Resizer = lazy(() => import('./tools/resizer/Resizer'))
const Banner = lazy(() => import('./tools/banner/Banner'))
const LayoutLab = lazy(() => import('./tools/layout/LayoutLab'))
const Preflight = lazy(() => import('./tools/preflight/Preflight'))
const BrandKit = lazy(() => import('./tools/brand/BrandKit'))
import type { LoadedSource } from './lib/files'

type Tool = 'home' | 'resize' | 'banner' | 'layouts' | 'check' | 'brand'
const TOOLS: { id: Exclude<Tool, 'home'>; label: string; icon: typeof HomeIcon; blurb: string }[] = [
  { id: 'resize', label: 'Social Resizer', icon: Maximize2, blurb: 'One poster — or a whole campaign — in; 1:1, 4:5, 9:16, 16:9 and panorama carousels out. Smart crop keeps titles safe; optional AI layout.' },
  { id: 'banner', label: 'Logo → Print Banner', icon: Printer, blurb: 'Any logo → clean vector PDF for large-format print: 3×1 m banners, roll-ups, sponsor walls, with QR codes, CMYK, bleed and crop marks.' },
  { id: 'layouts', label: 'Layout Lab', icon: LayoutGrid, blurb: 'Grid-based poster ideas from your references, a full editor, and print-ready vector PDFs from A5 to A0 and business cards.' },
  { id: 'check', label: 'Print Check', icon: ShieldCheck, blurb: 'Preflight before you send: real-size resolution, bleed, fonts, RGB/CMYK, hairlines, text near the edge.' },
  { id: 'brand', label: 'Brand Kits', icon: Palette, blurb: 'Each client’s logo, colours with official CMYK, and fonts — used by every tool.' },
]

const readHash = (): Tool => {
  const h = window.location.hash.replace('#/', '') as Tool
  return ['resize', 'banner', 'layouts', 'check', 'brand'].includes(h) ? h : 'home'
}

function Home({ go }: { go: (t: Tool) => void }) {
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-16">
      <div className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-acid">Design production toolkit</div>
      <h1 className="mb-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">Design once.<br />Ship every format.</h1>
      <p className="mb-10 max-w-2xl text-base text-ink-300 md:mb-12 md:text-lg">The boring production work after the creative part — resizing for every platform, building print files, exploring layouts — done in seconds, right in your browser. Files never leave your computer.</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)} className="group flex flex-col rounded-xl border border-ink-800 bg-ink-900 p-6 text-left transition hover:border-acid/60 hover:bg-ink-850">
            <t.icon className="mb-6 h-6 w-6 text-acid" />
            <div className="mb-2 text-lg font-semibold">{t.label}</div>
            <p className="mb-6 flex-1 text-sm leading-relaxed text-ink-400">{t.blurb}</p>
            <span className="flex items-center gap-1 text-sm text-ink-300 group-hover:text-acid">Open <ArrowRight className="h-4 w-4" /></span>
          </button>
        ))}
      </div>
      <a href="/scripts/Formatter-Artboards.jsx" download className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-ink-700 p-5 transition hover:border-acid/60">
        <FileCode2 className="h-6 w-6 shrink-0 text-acid" />
        <div className="min-w-[220px] flex-1">
          <div className="font-semibold">Illustrator script: social artboards <span className="ml-1 rounded bg-amber-400/15 px-1.5 py-0.5 text-[11px] font-normal text-amber-300">beta · try on a copy first</span></div>
          <p className="text-sm text-ink-400">Run inside Illustrator: adds 1:1, 4:5, 9:16, 16:9 artboards next to your poster with the artwork copied in as editable vectors, one group per layer. File → Scripts → Other Script…</p>
        </div>
        <span className="text-sm text-ink-300">Download .jsx</span>
      </a>
      <div className="mt-14 grid gap-8 border-t border-ink-800 pt-10 text-sm text-ink-400 md:grid-cols-3">
        <div><div className="mb-1 font-medium text-ink-100">Private by default</div>Everything runs in the browser. Only the optional AI layout sends a downscaled preview to the AI — and only when you click it.</div>
        <div><div className="mb-1 font-medium text-ink-100">Print-ready output</div>Vector PDFs with bleed, crop marks, TrimBox/BleedBox, CMYK colour and outlined text.</div>
        <div><div className="mb-1 font-medium text-ink-100">AI where it helps</div>Claude reads a poster like a designer to decide what can be cropped — layouts themselves come from grid systems, not generators.</div>
      </div>
    </div>
  )
}

export default function App() {
  const [tool, setTool] = useState<Tool>(readHash)
  const [handoff, setHandoff] = useState<LoadedSource | null>(null)
  const [visited, setVisited] = useState<Set<Tool>>(() => new Set([readHash()]))
  useEffect(() => {
    const on = () => setTool(readHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => { setVisited((v) => (v.has(tool) ? v : new Set([...v, tool]))) }, [tool])
  const go = (t: Tool) => { window.location.hash = t === 'home' ? '' : `/${t}`; setTool(t) }

  // Keep visited tools mounted so work isn't lost when switching tabs.
  const keep = (t: Tool, node: ReactNode) => visited.has(t) && (
    <div className={tool === t ? 'md:h-full' : 'hidden'}>
      <Suspense fallback={<div className="p-8"><Spinner label="Loading tool…" /></div>}>{node}</Suspense>
    </div>
  )

  return (
    <div className="flex h-full">
      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-ink-800 bg-ink-950/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:w-14 md:shrink-0 md:flex-col md:justify-start md:gap-1 md:border-r md:border-t-0 md:bg-ink-950 md:px-0 md:py-3 md:pb-3">
        <button onClick={() => go('home')} title="Home" className="flex h-12 w-10 items-center justify-center md:mb-3 md:h-auto">
          <img src="/favicon.svg" className="h-8 w-8" alt="Formatter" />
        </button>
        {TOOLS.map((t) => (
          <button key={t.id} title={t.label} onClick={() => go(t.id)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${tool === t.id ? 'bg-ink-800 text-acid' : 'text-ink-400 hover:bg-ink-900 hover:text-ink-100'}`}>
            <t.icon className="h-5 w-5" />
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:overflow-hidden md:pb-0">
        {tool === 'home' && <div className="md:h-full md:overflow-y-auto"><Home go={go} /></div>}
        {keep('resize', <Resizer handoff={handoff} />)}
        {keep('banner', <Banner />)}
        {keep('check', <Preflight />)}
        {keep('brand', <BrandKit />)}
        {keep('layouts', <LayoutLab onSendToResizer={(s) => { setHandoff(s); go('resize') }} />)}
      </div>
    </div>
  )
}
