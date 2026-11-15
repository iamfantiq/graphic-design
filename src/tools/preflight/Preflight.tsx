import { useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, RefreshCw } from 'lucide-react'
import { Button, Dropzone, Field, NumberInput, Panel, Select, Spinner, Toggle } from '../../components/ui'
import { checkFile, PRODUCTS, type Level, type Report } from './check'

const ICON: Record<Level, typeof Info> = { pass: CheckCircle2, warn: AlertTriangle, fail: XCircle, info: Info }
const COLOR: Record<Level, string> = { pass: 'text-emerald-400', warn: 'text-amber-300', fail: 'text-red-400', info: 'text-ink-400' }

const SIZES = [
  { id: 'doc', label: 'Use the document size', w: 0, h: 0 },
  { id: 'a3', label: 'A3 297 × 420', w: 297, h: 420 }, { id: 'a2', label: 'A2 420 × 594', w: 420, h: 594 },
  { id: 'a1', label: 'A1 594 × 841', w: 594, h: 841 }, { id: 'a0', label: 'A0 841 × 1189', w: 841, h: 1189 },
  { id: 'b1', label: 'B1 700 × 1000', w: 700, h: 1000 }, { id: 'rollup', label: 'Roll-up 850 × 2000', w: 850, h: 2000 },
  { id: '3x1', label: 'Banner 3000 × 1000', w: 3000, h: 1000 }, { id: 'custom', label: 'Custom…', w: 0, h: 0 },
]

export default function Preflight() {
  const [file, setFile] = useState<File | null>(null)
  const [product, setProduct] = useState('poster')
  const [size, setSize] = useState('doc')
  const [custom, setCustom] = useState({ w: 1000, h: 1000 })
  const [landscape, setLandscape] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [overlay, setOverlay] = useState(true)

  async function run(f = file) {
    if (!f) return
    setBusy(true); setError(null)
    try {
      const p = PRODUCTS.find((x) => x.id === product)!
      const s = SIZES.find((x) => x.id === size)!
      let target = size === 'doc' ? null : size === 'custom' ? custom : { w: s.w, h: s.h }
      if (target && landscape && size !== 'custom') target = { w: target.h, h: target.w }
      setReport(await checkFile(f, p, target))
    } catch (e) { setError((e as Error).message); setReport(null) } finally { setBusy(false) }
  }

  const counts = report ? (['fail', 'warn', 'pass'] as Level[]).map((l) => [l, report.findings.filter((f) => f.level === l).length] as const) : []
  const verdict = report ? (report.findings.some((f) => f.level === 'fail') ? 'fail' : report.findings.some((f) => f.level === 'warn') ? 'warn' : 'pass') : null

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-80 shrink-0 overflow-y-auto border-r border-ink-800 bg-ink-900">
        <Panel title="File">
          <Dropzone compact={!!file} accept=".pdf,.ai,.png,.jpg,.jpeg,.webp,.tif,image/*,application/pdf" onFiles={(f) => { setFile(f[0]); run(f[0]) }}
            title={file ? `Replace — ${file.name}` : 'Drop a print file'} subtitle={file ? undefined : 'PDF · AI · PNG · JPG'} />
        </Panel>
        <Panel title="Job">
          <Field label="Product"><Select value={product} onChange={setProduct} options={PRODUCTS.map((p) => ({ value: p.id, label: p.label }))} /></Field>
          <Field label="Final print size (mm)"><Select value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s.id, label: s.label }))} /></Field>
          {size === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <NumberInput value={custom.w} onChange={(w) => setCustom({ ...custom, w })} suffix="mm" />
              <NumberInput value={custom.h} onChange={(h) => setCustom({ ...custom, h })} suffix="mm" />
            </div>
          )}
          {size !== 'doc' && size !== 'custom' && <Toggle checked={landscape} onChange={setLandscape} label="Landscape" />}
          <Button variant="primary" className="w-full" disabled={!file || busy} onClick={() => run()}><RefreshCw className="h-4 w-4" />Check again</Button>
          {(() => { const p = PRODUCTS.find((x) => x.id === product)!; return <p className="text-xs text-ink-400">Targets: {p.good} dpi ideal, {p.min} dpi minimum, {p.bleed} mm bleed, {p.safe} mm safe margin.</p> })()}
        </Panel>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {!report && !busy && (
          <div className="mx-auto max-w-xl px-6 py-16">
            <h1 className="mb-2 text-3xl font-semibold tracking-tight">Print Check</h1>
            <p className="mb-6 text-ink-300">Catch the problems that cost a reprint — before the file leaves your desk. Checks resolution at the real print size, bleed, TrimBox, fonts, RGB vs CMYK, hairlines, and text too close to the edge.</p>
            <Dropzone accept=".pdf,.ai,.png,.jpg,.jpeg,.webp,image/*,application/pdf" onFiles={(f) => { setFile(f[0]); run(f[0]) }} title="Drop a print file" subtitle="PDF · AI · PNG · JPG" />
            {error && <p className="mt-4 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
          </div>
        )}
        {busy && <div className="p-8"><Spinner label="Inspecting file…" /></div>}
        {report && !busy && (
          <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="checker relative flex items-start justify-center overflow-hidden rounded-xl p-6">
              <div className="relative max-h-[78vh]" style={{ aspectRatio: `${report.preview.width}/${report.preview.height}`, width: '100%', maxWidth: `calc(78vh * ${report.preview.width / report.preview.height})` }}>
                <img src={report.preview.toDataURL('image/jpeg', 0.85)} className="block h-full w-full shadow-2xl" />
                {overlay && report.trim && <div className="pointer-events-none absolute outline outline-1 outline-fuchsia-500" style={{ left: `${report.trim.x0 * 100}%`, top: `${report.trim.y0 * 100}%`, width: `${(report.trim.x1 - report.trim.x0) * 100}%`, height: `${(report.trim.y1 - report.trim.y0) * 100}%` }} />}
                {overlay && report.safe && <div className="pointer-events-none absolute border border-dashed border-acid/70" style={{ left: `${report.safe.x0 * 100}%`, top: `${report.safe.y0 * 100}%`, width: `${(report.safe.x1 - report.safe.x0) * 100}%`, height: `${(report.safe.y1 - report.safe.y0) * 100}%` }} />}
                {overlay && report.markers.map((m, i) => (
                  <div key={i} title={m.label} className={`absolute border-2 ${m.level === 'fail' ? 'border-red-500 bg-red-500/15' : 'border-amber-400 bg-amber-400/10'}`}
                    style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}>
                    {m.kind === 'image' && <span className="absolute left-0 top-0 bg-red-600 px-1 font-mono text-[10px] text-white">{m.label}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className={`mb-4 rounded-xl border p-4 ${verdict === 'fail' ? 'border-red-900 bg-red-950/30' : verdict === 'warn' ? 'border-amber-900 bg-amber-950/20' : 'border-emerald-900 bg-emerald-950/20'}`}>
                <div className="text-lg font-semibold">{verdict === 'fail' ? 'Not ready to print' : verdict === 'warn' ? 'Printable, with caveats' : 'Ready to print'}</div>
                <div className="mt-1 flex gap-4 text-xs text-ink-300">
                  {counts.map(([l, n]) => <span key={l} className={COLOR[l]}>{n} {l === 'fail' ? 'problems' : l === 'warn' ? 'warnings' : 'passed'}</span>)}
                  <span className="text-ink-400">{report.name}</span>
                </div>
              </div>
              <Toggle checked={overlay} onChange={setOverlay} label="Show markers on preview" />
              <ul className="mt-4 space-y-2">
                {[...report.findings].sort((a, b) => ['fail', 'warn', 'info', 'pass'].indexOf(a.level) - ['fail', 'warn', 'info', 'pass'].indexOf(b.level)).map((f, i) => {
                  const I = ICON[f.level]
                  return (
                    <li key={i} className="flex gap-3 rounded-lg border border-ink-800 bg-ink-900 p-3">
                      <I className={`mt-0.5 h-4 w-4 shrink-0 ${COLOR[f.level]}`} />
                      <div><div className="text-sm font-medium text-ink-100">{f.title}</div><div className="text-xs leading-relaxed text-ink-400">{f.detail}</div></div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
