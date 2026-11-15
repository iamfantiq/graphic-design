import { useMemo, useState } from 'react'
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Grid3x3, Play } from 'lucide-react'
import { FORMATS, renderFormat, type Adjust, type FormatSpec, type SourceInfo } from './render'
import type { AiResult } from '../../lib/smart'

interface Src { id: string; preview: SourceInfo; ai: AiResult | null; adjust: Record<string, Adjust> }

const byId = (id: string) => FORMATS.find((f) => f.id === id)!

function useRender(items: Src[], fmt: FormatSpec, adj: (it: Src, id: string) => Adjust, long = 640) {
  return useMemo(() => items.map((it) => {
    const c = document.createElement('canvas')
    renderFormat(it.preview, fmt, adj(it, fmt.id), c, long / Math.max(fmt.w, fmt.h), it.ai)
    return c.toDataURL('image/jpeg', 0.85)
  }), [items, fmt]) // eslint-disable-line
}

function Phone({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="relative w-[260px] overflow-hidden rounded-[38px] border-[8px] border-[#1b1b1f] bg-white shadow-2xl ring-1 ring-ink-700" style={{ aspectRatio: '9 / 19.5' }}>
        <div className="absolute left-1/2 top-2 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
        {children}
      </div>
      <figcaption className="text-xs text-ink-400">{label}</figcaption>
    </figure>
  )
}

/** Generic phone mock-ups (no platform branding) to judge crops, safe zones and the profile grid before posting. */
export default function Mockups({ items, active, adj }: { items: Src[]; active: Src; adj: (it: Src, id: string) => Adjust }) {
  const [handle, setHandle] = useState('yourbrand')
  const post = useRender([active], byId('portrait'), adj)[0]
  const story = useRender([active], byId('story'), adj, 900)[0]
  const wide = useRender([active], byId('landscape'), adj)[0]
  const grid = useRender(items, byId('portrait'), adj, 360)
  const avatar = <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-acid to-emerald-500 ring-2 ring-white" />

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-ink-300">
        Account name
        <input value={handle} onChange={(e) => setHandle(e.target.value)} className="w-40 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-ink-100 outline-none focus:border-acid" />
        <span className="text-xs text-ink-400">Generic mock-ups — check crops, text under the UI and how the grid reads.</span>
      </div>
      <div className="flex flex-wrap justify-center gap-8">
        <Phone label="Feed post · 4:5">
          <div className="h-full overflow-hidden bg-white pt-8 text-[11px] text-black">
            <div className="flex items-center gap-2 px-3 py-2">{avatar}<b className="flex-1">{handle}</b><MoreHorizontal className="h-4 w-4" /></div>
            <img src={post} className="block w-full" />
            <div className="flex gap-3 px-3 py-2"><Heart className="h-5 w-5" /><MessageCircle className="h-5 w-5" /><Send className="h-5 w-5" /><Bookmark className="ml-auto h-5 w-5" /></div>
            <div className="px-3"><b>1,284 likes</b></div>
            <div className="px-3"><b>{handle}</b> Save the date ✦ link in bio</div>
            <div className="mt-3 h-40 bg-neutral-100" />
          </div>
        </Phone>
        <Phone label="Story / Reel · 9:16">
          <div className="relative h-full bg-black">
            <img src={story} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-x-3 top-8 flex gap-1">{[0, 1, 2].map((i) => <div key={i} className={`h-0.5 flex-1 rounded ${i === 0 ? 'bg-white' : 'bg-white/40'}`} />)}</div>
            <div className="absolute inset-x-3 top-11 flex items-center gap-2 text-[11px] font-semibold text-white drop-shadow">{avatar}{handle}<span className="font-normal opacity-70">2h</span></div>
            <div className="absolute inset-x-3 bottom-4 flex items-center gap-2">
              <div className="flex-1 rounded-full border border-white/70 px-3 py-1.5 text-[11px] text-white/80">Send message</div>
              <Heart className="h-5 w-5 text-white" /><Send className="h-5 w-5 text-white" />
            </div>
          </div>
        </Phone>
        <Phone label="Profile grid · 3:4 tiles">
          <div className="h-full overflow-hidden bg-white pt-8 text-[11px] text-black">
            <div className="flex items-center gap-4 px-4 py-3">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-acid to-emerald-500" />
              {[['48', 'posts'], ['12.4k', 'followers'], ['310', 'following']].map(([n, l]) => <div key={l} className="text-center"><b className="block text-sm">{n}</b>{l}</div>)}
            </div>
            <div className="px-4 pb-2"><b>{handle}</b><br />Design studio · posters & prints</div>
            <div className="flex justify-center border-t border-neutral-200 py-1.5"><Grid3x3 className="h-4 w-4" /></div>
            <div className="grid grid-cols-3 gap-px bg-white">
              {Array.from({ length: 12 }, (_, i) => grid[i]
                ? <img key={i} src={grid[i]} className="aspect-[3/4] w-full object-cover" />
                : <div key={i} className="aspect-[3/4] bg-neutral-200" />)}
            </div>
          </div>
        </Phone>
        <figure className="flex w-[420px] max-w-full flex-col gap-2 self-center">
          <div className="overflow-hidden rounded-xl bg-[#0f0f0f] shadow-2xl ring-1 ring-ink-700">
            <div className="relative">
              <img src={wide} className="block w-full" />
              <Play className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 fill-white/90 text-white/90 drop-shadow" />
              <div className="absolute inset-x-0 bottom-0 h-1 bg-white/30"><div className="h-full w-1/3 bg-red-600" /></div>
            </div>
            <div className="flex gap-3 p-3 text-white">{avatar}<div className="text-xs"><div className="font-semibold">Your video title goes here</div><div className="text-white/60">{handle} · 12k views · 1 day ago</div></div></div>
          </div>
          <figcaption className="text-center text-xs text-ink-400">Video / link preview · 16:9</figcaption>
        </figure>
      </div>
      {items.length > 1 && <p className="mt-6 text-center text-xs text-ink-400">The grid shows all {items.length} files in this batch, newest first — reorder by removing and re-adding files.</p>}
    </div>
  )
}
