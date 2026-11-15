import type { Path } from 'opentype.js'

type Cmd = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }

/** opentype.js' toPathData() glues "-0" onto the previous number ("48.55" + "0" → "48.550"); serialise safely. */
export function pathToD(p: Path, digits = 2): string {
  const f = (v = 0) => { const r = Number(v.toFixed(digits)); return String(Object.is(r, -0) ? 0 : r) }
  let d = ''
  for (const c of p.commands as Cmd[]) {
    if (c.type === 'M' || c.type === 'L') d += `${c.type}${f(c.x)} ${f(c.y)}`
    else if (c.type === 'Q') d += `Q${f(c.x1)} ${f(c.y1)} ${f(c.x)} ${f(c.y)}`
    else if (c.type === 'C') d += `C${f(c.x1)} ${f(c.y1)} ${f(c.x2)} ${f(c.y2)} ${f(c.x)} ${f(c.y)}`
    else if (c.type === 'Z') d += 'Z'
  }
  return d
}
