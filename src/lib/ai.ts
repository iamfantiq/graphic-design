import type { Analysis, AnalyzeRequest } from '../../shared/analysis'

export interface AiStatus { configured: boolean; needsCode: boolean }

export async function aiStatus(): Promise<AiStatus> {
  try {
    const r = await fetch('/api/analyze')
    if (!r.ok) return { configured: false, needsCode: false }
    return await r.json()
  } catch { return { configured: false, needsCode: false } }
}

const CODE_KEY = 'formatter.accessCode'
export const getCode = () => { try { return localStorage.getItem(CODE_KEY) ?? '' } catch { return '' } }
export const setCode = (c: string) => { try { localStorage.setItem(CODE_KEY, c) } catch { /* private mode */ } }

/** Downscale to a JPEG the model can read well (long side 1024px) and ask for a layout analysis. */
export async function analyzePoster(src: HTMLCanvasElement, formats: AnalyzeRequest['formats']) {
  const s = Math.min(1, 1024 / Math.max(src.width, src.height))
  const c = document.createElement('canvas')
  c.width = Math.round(src.width * s); c.height = Math.round(src.height * s)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(src, 0, 0, c.width, c.height)
  const image = c.toDataURL('image/jpeg', 0.88).split(',')[1]
  const body: AnalyzeRequest = { image, width: c.width, height: c.height, formats }
  const r = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-code': getCode() },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({ error: `Server error ${r.status}` }))
  if (!r.ok) throw new Error(j.error ?? `Server error ${r.status}`)
  return { analysis: j.analysis as Analysis, width: c.width, height: c.height }
}
