import { useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { Upload } from 'lucide-react'

export function Button({
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger' }) {
  const v = {
    default: 'bg-ink-800 hover:bg-ink-700 text-ink-100 border border-ink-700',
    primary: 'bg-acid hover:bg-acid-dim text-ink-950 font-semibold border border-acid',
    ghost: 'hover:bg-ink-800 text-ink-300 hover:text-ink-100 border border-transparent',
    danger: 'bg-ink-800 hover:bg-red-950 text-red-300 border border-ink-700',
  }[variant]
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none ${v} ${className}`}
    />
  )
}

export function Panel({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-ink-800 px-4 py-4">
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">{title}</h3>
          {right}
        </div>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between text-xs text-ink-300">
        <span>{label}</span>
        {hint && <span className="font-mono text-[11px] text-ink-400">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

export function Slider({
  label, value, min, max, step = 1, onChange, format,
}: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <Field label={label} hint={format ? format(value) : String(value)}>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  )
}

const inputCls = 'w-full rounded-md border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-sm text-ink-100 outline-none focus:border-acid'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} resize-y ${props.className ?? ''}`} />
}

export function NumberInput({ value, onChange, min, max, step, suffix }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string
}) {
  return (
    <div className="relative">
      <input type="number" className={`${inputCls} pr-9`} value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n) }} />
      {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-400">{suffix}</span>}
    </div>
  )
}

export function Select<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]
}) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]
}) {
  return (
    <div className="flex rounded-md border border-ink-700 bg-ink-900 p-0.5">
      {options.map((o) => (
        <button key={o.value} title={o.title} onClick={() => onChange(o.value)}
          className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${value === o.value ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-8 w-9 cursor-pointer rounded border border-ink-700 bg-transparent p-0.5" />
      <input className={`${inputCls} font-mono uppercase`} value={value}
        onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase()) }}
        onBlur={(e) => { e.target.value = value }} defaultValue={undefined} />
      {label && <span className="whitespace-nowrap text-xs text-ink-400">{label}</span>}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function Dropzone({ onFiles, accept, multiple, title, subtitle, compact }: {
  onFiles: (files: File[]) => void; accept?: string; multiple?: boolean; title: string; subtitle?: string; compact?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = [...e.dataTransfer.files]; if (f.length) onFiles(f) }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed text-center transition-colors ${compact ? 'gap-1 px-3 py-4' : 'gap-3 px-6 py-14'} ${over ? 'border-acid bg-acid/5' : 'border-ink-600 hover:border-ink-400 bg-ink-900/50'}`}
    >
      <Upload className={compact ? 'h-4 w-4 text-ink-400' : 'h-7 w-7 text-ink-400'} />
      <div className={compact ? 'text-xs text-ink-100' : 'text-base font-medium text-ink-100'}>{title}</div>
      {subtitle && <div className="text-xs text-ink-400">{subtitle}</div>}
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple}
        onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) onFiles(f); e.target.value = '' }} />
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-300">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-600 border-t-acid" />
      {label}
    </div>
  )
}
