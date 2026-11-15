import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { LayoutGrid, Maximize2, Printer, Home as HomeIcon, ArrowRight } from 'lucide-react'
import { Spinner } from './components/ui'
const Resizer = lazy(() => import('./tools/resizer/Resizer'))
const Banner = lazy(() => import('./tools/banner/Banner'))
const LayoutLab = lazy(() => import('./tools/layout/LayoutLab'))
import type { LoadedSource } from './lib/files'

type Tool = 'home' | 'resize' | 'banner' | 'layouts'
const TOOLS: { id: Exclude<Tool, 'home'>; label: string; icon: typeof HomeIcon; blurb: string }[] = [
  { id: 'resize', label: 'Social Resizer', icon: Maximize2, blurb: 'One poster in — 1:1, 4:5, 9:16, 16:9 and more out. Works with .ai, PDF, SVG, PNG, JPG.' },
  { id: 'banner', label: 'Logo → Print Banner', icon: Printer, blurb: 'Turn any logo into a clean vector PDF for large-format print: 3×1 m banners, roll-ups, press walls.' },
  { id: 'layouts', label: 'Layout Lab', icon: LayoutGrid, blurb: 'Grid-based poster ideas driven by your references, with a full editor built in.' },
]

const readHash = (): Tool => {
  const h = window.location.hash.replace('#/', '') as Tool
  return ['resize', 'banner', 'layouts'].includes(h) ? h : 'home'
}

function Home({ go }: { go: (t: Tool) => void }) {
  return (
    <div className="mx-auto max-w-5xl px-8 py-16">
      <div className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-acid">Design production toolkit</div>
      <h1 className="mb-4 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight">Design once.<br />Ship every format.</h1>
      <p className="mb-12 max-w-2xl text-lg text-ink-300">The boring production work after the creative part — resizing for every platform, building print files, exploring layouts — done in seconds, right in your browser. Files never leave your computer.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {TOOLS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)} className="group flex flex-col rounded-xl border border-ink-800 bg-ink-900 p-6 text-left transition hover:border-acid/60 hover:bg-ink-850">
            <t.icon className="mb-6 h-6 w-6 text-acid" />
            <div className="mb-2 text-lg font-semibold">{t.label}</div>
            <p className="mb-6 flex-1 text-sm leading-relaxed text-ink-400">{t.blurb}</p>
            <span className="flex items-center gap-1 text-sm text-ink-300 group-hover:text-acid">Open <ArrowRight className="h-4 w-4" /></span>
          </button>
        ))}
      </div>
      <div className="mt-14 grid gap-8 border-t border-ink-800 pt-10 text-sm text-ink-400 md:grid-cols-3">
        <div><div className="mb-1 font-medium text-ink-100">Private by design</div>Everything runs locally in the browser — no uploads, no accounts, works on client NDAs.</div>
        <div><div className="mb-1 font-medium text-ink-100">Print-ready output</div>Vector PDFs with bleed, crop marks, TrimBox/BleedBox, CMYK colour and outlined text.</div>
        <div><div className="mb-1 font-medium text-ink-100">No AI slop</div>Layouts are composed from grid systems and poster traditions, then you edit every detail.</div>
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
    <div className={tool === t ? 'h-full' : 'hidden'}>
      <Suspense fallback={<div className="p-8"><Spinner label="Loading tool…" /></div>}>{node}</Suspense>
    </div>
  )

  return (
    <div className="flex h-full">
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-ink-800 bg-ink-950 py-3">
        <button onClick={() => go('home')} title="Home" className="mb-3">
          <img src="/favicon.svg" className="h-8 w-8" alt="Formatter" />
        </button>
        {TOOLS.map((t) => (
          <button key={t.id} title={t.label} onClick={() => go(t.id)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${tool === t.id ? 'bg-ink-800 text-acid' : 'text-ink-400 hover:bg-ink-900 hover:text-ink-100'}`}>
            <t.icon className="h-5 w-5" />
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-hidden">
        {tool === 'home' && <div className="h-full overflow-y-auto"><Home go={go} /></div>}
        {keep('resize', <Resizer handoff={handoff} />)}
        {keep('banner', <Banner />)}
        {keep('layouts', <LayoutLab onSendToResizer={(s) => { setHandoff(s); go('resize') }} />)}
      </div>
    </div>
  )
}
