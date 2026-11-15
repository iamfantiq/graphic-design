import { useCallback, useEffect, useRef, useState } from 'react'
import { ActiveSelection, Canvas, Circle, FabricImage, Line, Path, Rect, Textbox, cache, type FabricObject } from 'fabric'
import {
  ArrowLeft, Type, Square, Circle as CircleIcon, Minus, ImagePlus, Undo2, Redo2, Copy, Trash2,
  BringToFront, SendToBack, Download, Send, Eye, EyeOff, Lock, Unlock, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter,
  AlignLeft, AlignCenter, AlignRight, Star, QrCode, Printer, SpellCheck, CheckCircle2, AlertTriangle, XCircle, Info,
} from 'lucide-react'
import { Button, ColorInput, Field, NumberInput, Panel, Segmented, Select, Slider, Spinner, Toggle } from '../../components/ui'
import { ALL_FONTS, type DocFormat } from './design'
import { sceneObjects } from './fabricScene'
import type { Scene } from './scene'
import type { LoadedSource } from '../../lib/files'
import { baseName, downloadBlob } from '../../lib/download'
import { kitLogoFile, type BrandKit } from '../../lib/brand'
import { loadSource } from '../../lib/files'
import { exportVectorPdf } from './pdfExport'
import { qrPath } from '../../lib/qr'
import { inlineBlobUrls, putDesign } from '../../lib/store'
import { aiStatus, proofread } from '../../lib/ai'
import type { Proof } from '../../../shared/proof'

type Named = FabricObject & { name?: string }
const PROPS = ['name', 'selectable', 'evented', 'lockMovementX', 'lockMovementY', 'svgD']

export default function Editor({ scene, title, onBack, onSendToResizer, kit, format, initialJson, designId }: {
  scene: Scene; title: string; onBack: () => void; onSendToResizer: (s: LoadedSource) => void; kit?: BrandKit | null
  format: DocFormat; initialJson?: string; designId?: string
}) {
  const idRef = useRef(designId ?? Math.random().toString(36).slice(2))
  const [docName, setDocName] = useState(title)
  const nameRef = useRef(title)
  nameRef.current = docName
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>(designId ? 'saved' : 'idle')
  const saveTimer = useRef<number | null>(null)
  const [pdf, setPdf] = useState({ size: 0, bleed: format.print ? 3 : 0, marks: !!format.print, cmyk: !!format.print })
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfNotes, setPdfNotes] = useState<string[]>([])
  const [ai, setAi] = useState(false)
  const [proof, setProof] = useState<Proof | null>(null)
  const [proofBusy, setProofBusy] = useState(false)
  const [proofErr, setProofErr] = useState<string | null>(null)
  useEffect(() => { aiStatus().then((s) => setAi(s.configured)) }, [])
  const hostRef = useRef<HTMLDivElement>(null)
  const elRef = useRef<HTMLCanvasElement>(null)
  const cRef = useRef<Canvas | null>(null)
  const zoomRef = useRef(1)
  const history = useRef<{ stack: string[]; i: number; lock: boolean }>({ stack: [], i: -1, lock: false })
  const [sel, setSel] = useState<Named | null>(null)
  const [, setTick] = useState(0)
  const [bg, setBg] = useState(scene.bg)
  const [scale, setScale] = useState(2)
  const refresh = () => setTick((t) => t + 1)
  const W = scene.w, H = scene.h

  const designIdRef = useRef(designId)
  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaved('saving')
    saveTimer.current = window.setTimeout(async () => {
      const cv = cRef.current
      if (!cv) return
      const json = await inlineBlobUrls(JSON.stringify(cv.toObject(PROPS)))
      const thumb = cv.toDataURL({ format: 'jpeg', quality: 0.7, multiplier: 360 / Math.max(W, H) / zoomRef.current })
      await putDesign({ id: idRef.current, name: nameRef.current, formatId: format.id, w: W, h: H, json, thumb, updated: Date.now() })
      designIdRef.current = idRef.current
      setSaved('saved')
    }, 1200)
  }

  const snapshot = useCallback(() => {
    const c = cRef.current, h = history.current
    if (!c || h.lock) return
    const json = JSON.stringify(c.toObject(PROPS))
    if (h.stack[h.i] === json) return
    h.stack = h.stack.slice(0, h.i + 1)
    h.stack.push(json)
    if (h.stack.length > 80) h.stack.shift()
    h.i = h.stack.length - 1
    refresh()
    // autosave once the design has been touched (the first snapshot is the untouched idea)
    if (h.stack.length > 1 || designIdRef.current) scheduleSave()
  }, []) // eslint-disable-line

  const fit = useCallback(() => {
    const c = cRef.current, host = hostRef.current
    if (!c || !host || host.clientWidth < 80 || host.clientHeight < 80) return
    const z = Math.min((host.clientWidth - 48) / W, (host.clientHeight - 48) / H)
    zoomRef.current = z
    c.setDimensions({ width: Math.round(W * z), height: Math.round(H * z) })
    c.setZoom(z)
    c.requestRenderAll()
  }, [W, H])

  useEffect(() => {
    const c = new Canvas(elRef.current!, { backgroundColor: scene.bg, preserveObjectStacking: true, skipOffscreen: false, selectionColor: 'rgba(212,255,58,0.08)', selectionBorderColor: '#d4ff3a' })
    cRef.current = c
    let disposed = false
    ;(async () => {
      if (initialJson) {
        const data = JSON.parse(initialJson) as { objects?: { fontFamily?: string; fontWeight?: number | string }[] }
        const fams = new Set((data.objects ?? []).filter((o) => o.fontFamily).map((o) => `${o.fontWeight ?? 400} 100px "${o.fontFamily}"`))
        await Promise.all([...fams].map((f) => document.fonts.load(f))).catch(() => {})
        await c.loadFromJSON(initialJson)
        if (disposed) return
        setBg(String(c.backgroundColor))
      } else {
        const fams = new Set(scene.els.flatMap((e) => (e.type === 'text' ? [`${e.weight} 100px "${e.font}"`] : [])))
        await Promise.all([...fams].map((f) => document.fonts.load(f))).catch(() => {})
        const objs = await sceneObjects(scene)
        if (disposed) return
        objs.forEach((o) => c.add(o))
      }
      fit()
      snapshot()
    })()
    const onSel = () => { setSel((c.getActiveObject() as Named) ?? null) }
    c.on('selection:created', onSel)
    c.on('selection:updated', onSel)
    c.on('selection:cleared', () => setSel(null))
    c.on('object:modified', () => { snapshot(); refresh() })
    c.on('text:changed', () => refresh())
    c.on('text:editing:exited', () => snapshot())
    // snap to centre lines and edges
    c.on('object:moving', (e) => {
      const o = e.target
      const t = 8 / zoomRef.current
      const b = o.getBoundingRect()
      const snaps: [number, number][] = [[b.left, 0], [b.left + b.width / 2, W / 2], [b.left + b.width, W]]
      for (const [v, target] of snaps) if (Math.abs(v - target) < t) { o.set({ left: o.left + (target - v) }); break }
      const snapsY: [number, number][] = [[b.top, 0], [b.top + b.height / 2, H / 2], [b.top + b.height, H]]
      for (const [v, target] of snapsY) if (Math.abs(v - target) < t) { o.set({ top: o.top + (target - v) }); break }
      o.setCoords()
    })
    const ro = new ResizeObserver(() => fit())
    ro.observe(hostRef.current!)
    return () => { disposed = true; ro.disconnect(); c.dispose() }
  }, [scene, fit, snapshot, W, H])

  const c = () => cRef.current!

  async function restore(i: number) {
    const h = history.current
    if (i < 0 || i >= h.stack.length) return
    h.lock = true
    await c().loadFromJSON(h.stack[i])
    h.i = i
    h.lock = false
    setBg(String(c().backgroundColor))
    c().requestRenderAll()
    setSel(null)
    refresh()
  }
  const undo = () => restore(history.current.i - 1)
  const redo = () => restore(history.current.i + 1)

  function add(o: FabricObject, name: string) {
    ;(o as Named).name = name
    c().add(o)
    c().setActiveObject(o)
    c().requestRenderAll()
    snapshot()
  }
  const addText = () => add(new Textbox('Your text', { left: W * 0.1, top: H * 0.4, width: W * 0.8, fontSize: W * 0.08, fontFamily: 'Inter', fontWeight: 800, fill: '#111111' }), 'Text')
  const addRect = () => add(new Rect({ left: W * 0.3, top: H * 0.3, width: W * 0.4, height: W * 0.25, fill: '#d4ff3a' }), 'Rectangle')
  const addCircle = () => add(new Circle({ left: W * 0.35, top: H * 0.35, radius: W * 0.15, fill: '#e2231a' }), 'Circle')
  const addLine = () => add(new Line([W * 0.1, H / 2, W * 0.9, H / 2], { stroke: '#111111', strokeWidth: Math.max(2, W * 0.004) }), 'Line')
  const imgInput = useRef<HTMLInputElement>(null)
  async function addImage(f: File) {
    const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f) })
    const img = await FabricImage.fromURL(url)
    const s = Math.min((W * 0.6) / img.width, (H * 0.6) / img.height)
    img.set({ left: W * 0.2, top: H * 0.2, scaleX: s, scaleY: s })
    add(img, f.name.replace(/\.[^.]+$/, ''))
  }

  async function addBrandLogo() {
    const f = kit && await kitLogoFile(kit)
    if (!f) return
    // PDF / AI logos are rendered to a crisp transparent PNG; SVG/PNG are used directly
    const src = await loadSource(f, { longSide: 1600, transparent: true })
    const img = await FabricImage.fromURL(src.canvas.toDataURL('image/png'))
    const s = (W * 0.3) / img.width
    img.set({ left: W * 0.06, top: H * 0.06, scaleX: s, scaleY: s })
    add(img, `${kit!.name} logo`)
  }

  function addQr() {
    const text = window.prompt('Link or text for the QR code', 'https://')
    if (!text || text === 'https://') return
    const { d, size } = qrPath(text)
    const qr = new Path(d, { fill: '#111111', objectCaching: false }) as Path & { svgD?: string }
    qr.svgD = d
    const s = (Math.min(W, H) * 0.2) / size
    qr.set({ scaleX: s, scaleY: s, left: W - Math.min(W, H) * 0.26, top: H - Math.min(W, H) * 0.26 })
    add(qr, `QR: ${text.replace(/^https?:\/\//, '').slice(0, 40)}`)
  }

  const printSize = format.sizes[pdf.size] ?? format.sizes[0]
  async function exportPdf() {
    setPdfBusy(true); setPdfNotes([])
    try {
      c().discardActiveObject(); c().requestRenderAll()
      const overrides = kit ? Object.fromEntries(kit.colors.filter((x) => x.cmyk).map((x) => [x.hex, x.cmyk!])) : {}
      const { bytes, warnings } = await exportVectorPdf(c(), W, H, {
        widthMm: printSize.w, heightMm: printSize.h, bleedMm: pdf.bleed, cropMarks: pdf.marks,
        colorMode: pdf.cmyk ? 'cmyk' : 'rgb', cmykOverrides: overrides, title: docName,
      })
      downloadBlob(new Blob([bytes.slice()], { type: 'application/pdf' }), `${baseName(docName)}_${printSize.w}x${printSize.h}mm${pdf.bleed ? `_bleed${pdf.bleed}` : ''}_${pdf.cmyk ? 'cmyk' : 'rgb'}.pdf`)
      setPdfNotes(warnings)
    } catch (e) { console.error(e); setPdfNotes([`Export failed: ${(e as Error).message}`]) } finally { setPdfBusy(false) }
  }
  async function runProof() {
    setProofBusy(true); setProofErr(null)
    try {
      const url = exportCanvas(1800 / Math.max(W, H))
      const img = new Image(); img.src = url; await img.decode()
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
      cv.getContext('2d')!.drawImage(img, 0, 0)
      const text = (c().getObjects().filter((o) => o instanceof Textbox) as Textbox[]).map((o) => o.text).join('\n---\n')
      setProof(await proofread(cv, { text, context: `${format.label}${format.print ? `, printed at ${printSize.label}` : ', shown on phones'}` }))
    } catch (e) { setProofErr((e as Error).message) } finally { setProofBusy(false) }
  }

  function remove() {
    const objs = c().getActiveObjects()
    objs.forEach((o) => c().remove(o))
    c().discardActiveObject(); c().requestRenderAll(); snapshot()
  }
  async function duplicate() {
    const a = c().getActiveObject()
    if (!a) return
    const cl = await a.clone(PROPS)
    cl.set({ left: (a.left ?? 0) + 20, top: (a.top ?? 0) + 20 })
    c().discardActiveObject()
    if (cl instanceof ActiveSelection) {
      cl.canvas = c()
      cl.forEachObject((o) => c().add(o))
      cl.setCoords()
    } else c().add(cl)
    c().setActiveObject(cl)
    c().requestRenderAll(); snapshot()
  }
  const order = (fn: 'bringObjectToFront' | 'sendObjectToBack' | 'bringObjectForward' | 'sendObjectBackwards') => {
    const a = c().getActiveObject(); if (!a) return
    c()[fn](a); c().requestRenderAll(); snapshot(); refresh()
  }
  function align(axis: 'h' | 'v') {
    const a = c().getActiveObject(); if (!a) return
    const b = a.getBoundingRect()
    if (axis === 'h') a.set({ left: a.left + (W / 2 - (b.left + b.width / 2)) })
    else a.set({ top: a.top + (H / 2 - (b.top + b.height / 2)) })
    a.setCoords(); c().requestRenderAll(); snapshot()
  }

  const setProp = (patch: Record<string, unknown>, commit = true) => {
    const a = c().getActiveObject(); if (!a) return
    const targets = a instanceof ActiveSelection ? a.getObjects() : [a]
    targets.forEach((o) => { o.set(patch); if (o instanceof Textbox) o.initDimensions() })
    a.setCoords()
    c().requestRenderAll()
    if (commit) snapshot()
    refresh()
  }
  async function setFont(family: string, weight?: number) {
    const w = weight ?? Number((sel as Textbox).fontWeight) ?? 400
    await document.fonts.load(`${w} 100px "${family}"`).catch(() => {})
    cache.clearFontCache(family)
    setProp({ fontFamily: family, fontWeight: w })
  }

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = cRef.current?.getActiveObject()
      if ((a as Textbox | undefined)?.isEditing) return
      if ((e.target as HTMLElement).closest('input,textarea,select')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && a) { e.preventDefault(); remove() }
      else if (a && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        a.set({ left: a.left + dx, top: a.top + dy }); a.setCoords(); cRef.current!.requestRenderAll(); snapshot()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function exportCanvas(mult: number) {
    c().discardActiveObject(); c().requestRenderAll()
    return c().toDataURL({ format: 'png', multiplier: mult / zoomRef.current })
  }
  const name = baseName(docName)
  async function exportAs(kind: 'png' | 'jpg' | 'svg') {
    if (kind === 'svg') {
      const cv = c(), z = zoomRef.current
      cv.setZoom(1); cv.setDimensions({ width: W, height: H })
      const svg = cv.toSVG()
      zoomRef.current = z
      fit()
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`)
      return
    }
    const url = kind === 'jpg'
      ? (c().discardActiveObject(), c().toDataURL({ format: 'jpeg', quality: 0.93, multiplier: scale / zoomRef.current }))
      : exportCanvas(scale)
    downloadBlob(await (await fetch(url)).blob(), `${name}_${W * scale}x${H * scale}.${kind}`)
  }
  async function sendToResizer() {
    const url = exportCanvas(2)
    const img = new Image(); img.src = url; await img.decode()
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
    cv.getContext('2d')!.drawImage(img, 0, 0)
    onSendToResizer({ name: `${name}.png`, kind: 'raster', canvas: cv })
  }

  const objects = (cRef.current?.getObjects() ?? []) as Named[]
  const isText = sel instanceof Textbox
  const t = sel as Textbox
  const weights = isText ? (ALL_FONTS.find(([f]) => f === t.fontFamily)?.[1] ?? [400, 700]) : []
  const fill = typeof sel?.fill === 'string' && sel.fill.startsWith('#') ? sel.fill : '#000000'
  const stroke = typeof sel?.stroke === 'string' && sel.stroke.startsWith('#') ? sel.stroke : '#000000'

  const Tool = ({ icon: I, label, onClick, disabled }: { icon: typeof Type; label: string; onClick: () => void; disabled?: boolean }) => (
    <button title={label} onClick={onClick} disabled={disabled} className="rounded-md p-2 text-ink-300 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-30"><I className="h-4 w-4" /></button>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-ink-800 bg-ink-900 px-2 py-1.5 md:px-3">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Ideas</span></Button>
        <input value={docName} onChange={(e) => { setDocName(e.target.value); scheduleSave() }} title="Design name"
          className="w-32 shrink-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-ink-100 outline-none hover:border-ink-700 focus:border-acid md:w-44" />
        <span className="w-12 shrink-0 text-[11px] text-ink-400">{saved === 'saving' ? 'saving…' : saved === 'saved' ? 'saved' : ''}</span>
        <div className="mx-1 h-5 w-px bg-ink-700" />
        <Tool icon={Type} label="Add text" onClick={addText} />
        <Tool icon={Square} label="Add rectangle" onClick={addRect} />
        <Tool icon={CircleIcon} label="Add circle" onClick={addCircle} />
        <Tool icon={Minus} label="Add line" onClick={addLine} />
        <Tool icon={ImagePlus} label="Add image" onClick={() => imgInput.current?.click()} />
        <Tool icon={QrCode} label="Add QR code (vector)" onClick={addQr} />
        {kit?.logo && <Tool icon={Star} label={`Add ${kit.name} logo`} onClick={addBrandLogo} />}
        <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) addImage(f); e.target.value = '' }} />
        <div className="mx-2 h-5 w-px bg-ink-700" />
        <Tool icon={Undo2} label="Undo (Ctrl+Z)" onClick={undo} disabled={history.current.i <= 0} />
        <Tool icon={Redo2} label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={history.current.i >= history.current.stack.length - 1} />
        <div className="mx-2 h-5 w-px bg-ink-700" />
        <Tool icon={Copy} label="Duplicate (Ctrl+D)" onClick={duplicate} disabled={!sel} />
        <Tool icon={BringToFront} label="Bring to front" onClick={() => order('bringObjectToFront')} disabled={!sel} />
        <Tool icon={SendToBack} label="Send to back" onClick={() => order('sendObjectToBack')} disabled={!sel} />
        <Tool icon={AlignHorizontalJustifyCenter} label="Centre horizontally" onClick={() => align('h')} disabled={!sel} />
        <Tool icon={AlignVerticalJustifyCenter} label="Centre vertically" onClick={() => align('v')} disabled={!sel} />
        <Tool icon={Trash2} label="Delete" onClick={remove} disabled={!sel} />
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden font-mono text-xs text-ink-400 md:inline">{W}×{H}</span>
          <Button onClick={sendToResizer} title="Open this design in the Social Resizer" className="whitespace-nowrap"><Send className="h-4 w-4" /><span className="hidden sm:inline">Resize for social</span></Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div ref={hostRef} className="checker flex h-[62vh] min-w-0 shrink-0 items-center justify-center overflow-hidden md:h-auto md:flex-1 md:shrink">
          <div className="shadow-2xl"><canvas ref={elRef} /></div>
        </div>

        <aside className="w-full shrink-0 border-b border-ink-800 bg-ink-900 md:w-72 md:overflow-y-auto md:border-b-0 md:border-l">
          {sel ? (
            <Panel title={isText ? 'Text' : (sel as Named).name ?? sel.type}>
              {isText && (<>
                <Select value={t.fontFamily as string} onChange={(v) => setFont(v)} options={ALL_FONTS.map(([f]) => ({ value: f, label: f }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={String(t.fontWeight)} onChange={(v) => setFont(t.fontFamily as string, Number(v))} options={weights.map((w) => ({ value: String(w), label: String(w) }))} />
                  <NumberInput value={Math.round(t.fontSize * (t.scaleY ?? 1))} min={4} onChange={(v) => setProp({ fontSize: v / (t.scaleY ?? 1) })} suffix="px" />
                </div>
                <Segmented value={(t.textAlign as string) ?? 'left'} onChange={(v) => setProp({ textAlign: v })}
                  options={[{ value: 'left', label: <AlignLeft className="mx-auto h-3.5 w-3.5" /> }, { value: 'center', label: <AlignCenter className="mx-auto h-3.5 w-3.5" /> }, { value: 'right', label: <AlignRight className="mx-auto h-3.5 w-3.5" /> }]} />
                <Slider label="Letter spacing" value={t.charSpacing ?? 0} min={-100} max={600} step={5} onChange={(v) => setProp({ charSpacing: v }, false)} />
                <Slider label="Line height" value={t.lineHeight ?? 1.16} min={0.6} max={2} step={0.01} onChange={(v) => setProp({ lineHeight: v }, false)} format={(v) => v.toFixed(2)} />
                <Button className="w-full" onClick={() => setProp({ text: t.text.toUpperCase() === t.text ? t.text.toLowerCase() : t.text.toUpperCase() })}>Toggle UPPERCASE</Button>
              </>)}
              {sel.type !== 'image' && sel.type !== 'line' && (
                <Field label="Fill">
                  <ColorInput value={fill} onChange={(v) => setProp({ fill: v })} />
                  {kit && <div className="mt-1.5 flex flex-wrap gap-1">{kit.colors.map((c) => <button key={c.hex + c.name} title={c.name} onClick={() => setProp({ fill: c.hex })} className="h-5 w-5 rounded border border-ink-600" style={{ background: c.hex }} />)}</div>}
                </Field>
              )}
              {(sel.type === 'line' || sel.type === 'rect' || sel.type === 'circle') && (<>
                <Field label="Stroke"><ColorInput value={stroke} onChange={(v) => setProp({ stroke: v })} /></Field>
                <Slider label="Stroke width" value={sel.strokeWidth ?? 0} min={0} max={60} step={0.5} onChange={(v) => setProp({ strokeWidth: v }, false)} format={(v) => v.toFixed(1)} />
              </>)}
              {sel.type === 'rect' && <Slider label="Corner radius" value={(sel as Rect).rx ?? 0} min={0} max={300} onChange={(v) => setProp({ rx: v, ry: v }, false)} />}
              <Slider label="Opacity" value={sel.opacity ?? 1} min={0} max={1} step={0.01} onChange={(v) => setProp({ opacity: v }, false)} format={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Rotation" value={Math.round(sel.angle ?? 0)} min={-180} max={180} onChange={(v) => setProp({ angle: v }, false)} format={(v) => `${v}°`} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="X"><NumberInput value={Math.round(sel.left ?? 0)} onChange={(v) => setProp({ left: v })} /></Field>
                <Field label="Y"><NumberInput value={Math.round(sel.top ?? 0)} onChange={(v) => setProp({ top: v })} /></Field>
              </div>
            </Panel>
          ) : (
            <Panel title="Canvas">
              <Field label="Background"><ColorInput value={bg} onChange={(v) => { setBg(v); c().backgroundColor = v; c().requestRenderAll(); snapshot() }} /></Field>
              <p className="text-xs text-ink-400">Double-click text to edit. Shift+arrows nudge 10px. Objects snap to edges and centre.</p>
            </Panel>
          )}

          <Panel title="Layers">
            <div className="-mx-2 max-h-64 space-y-0.5 overflow-y-auto">
              {[...objects].reverse().map((o, i) => (
                <div key={i} onClick={() => { if (o.selectable !== false) { c().setActiveObject(o); c().requestRenderAll(); setSel(o) } }}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs ${sel === o ? 'bg-ink-700 text-ink-100' : 'text-ink-300 hover:bg-ink-800'}`}>
                  <span className="h-3 w-3 shrink-0 rounded-sm border border-ink-600" style={{ background: typeof o.fill === 'string' ? o.fill : typeof o.stroke === 'string' ? o.stroke : '#888' }} />
                  <span className="flex-1 truncate">{o instanceof Textbox ? o.text.split('\n')[0] : o.name ?? o.type}</span>
                  <button onClick={(e) => { e.stopPropagation(); o.set({ visible: !o.visible }); c().requestRenderAll(); snapshot() }}>{o.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-ink-400" />}</button>
                  <button onClick={(e) => { e.stopPropagation(); const l = o.selectable !== false; o.set({ selectable: !l, evented: !l }); if (l) c().discardActiveObject(); c().requestRenderAll(); refresh() }}>
                    {o.selectable === false ? <Lock className="h-3 w-3 text-acid" /> : <Unlock className="h-3 w-3 text-ink-400" />}</button>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Export">
            <Segmented value={String(scale)} onChange={(v) => setScale(Number(v))}
              options={[1, 2, 3, 4].map((s) => ({ value: String(s), label: `${s}× · ${W * s}px` }))} />
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => exportAs('png')}><Download className="h-3.5 w-3.5" />PNG</Button>
              <Button onClick={() => exportAs('jpg')}><Download className="h-3.5 w-3.5" />JPG</Button>
              <Button onClick={() => exportAs('svg')} className="col-span-2" title="Vector SVG (fonts referenced by name)"><Download className="h-3.5 w-3.5" />SVG</Button>
            </div>
          </Panel>

          <Panel title="Print PDF (vector)">
            <Select value={String(pdf.size)} onChange={(v) => setPdf({ ...pdf, size: Number(v) })}
              options={format.sizes.map((z, i) => ({ value: String(i), label: `${z.label}${z.label.includes('×') ? '' : ` — ${z.w} × ${z.h} mm`}` }))} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Bleed"><NumberInput value={pdf.bleed} min={0} max={50} onChange={(v) => setPdf({ ...pdf, bleed: v })} suffix="mm" /></Field>
              <Field label="Colour"><Segmented value={pdf.cmyk ? 'cmyk' : 'rgb'} onChange={(v) => setPdf({ ...pdf, cmyk: v === 'cmyk' })} options={[{ value: 'cmyk', label: 'CMYK' }, { value: 'rgb', label: 'RGB' }]} /></Field>
            </div>
            <Toggle checked={pdf.marks} onChange={(v) => setPdf({ ...pdf, marks: v })} label="Crop marks + slug" />
            <Button variant="primary" className="w-full" onClick={exportPdf} disabled={pdfBusy}>{pdfBusy ? <Spinner label="Building PDF…" /> : <><Printer className="h-4 w-4" />Download print PDF</>}</Button>
            <p className="text-xs text-ink-400">Text becomes outlines, shapes stay vector, photos keep full resolution. Elements touching the edge are extended into the bleed.</p>
            {pdfNotes.map((n, i) => <p key={i} className="flex gap-1.5 text-xs text-amber-300"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{n}</p>)}
          </Panel>

          {ai && (
            <Panel title="AI proofread">
              <Button className="w-full" onClick={runProof} disabled={proofBusy}>{proofBusy ? <Spinner label="Reading your design…" /> : <><SpellCheck className="h-4 w-4" />Check text & layout</>}</Button>
              {proofErr && <p className="text-xs text-red-300">{proofErr}</p>}
              {proof && (<>
                <p className="text-xs leading-relaxed text-ink-300">{proof.verdict}</p>
                <ul className="space-y-2">
                  {proof.findings.map((f, i) => {
                    const I = f.level === 'fail' ? XCircle : f.level === 'warn' ? AlertTriangle : Info
                    return (
                      <li key={i} className="flex gap-2 text-xs">
                        <I className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${f.level === 'fail' ? 'text-red-400' : f.level === 'warn' ? 'text-amber-300' : 'text-ink-400'}`} />
                        <div><div className="font-medium text-ink-100">{f.title}</div><div className="text-ink-400">{f.detail}</div></div>
                      </li>
                    )
                  })}
                  {!proof.findings.length && <li className="flex gap-2 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />No issues found.</li>}
                </ul>
              </>)}
            </Panel>
          )}
        </aside>
      </div>
    </div>
  )
}
