import {
  PDFDict, PDFName, PDFNumber, PDFOperator, PDFOperatorNames, drawSvgPath, cmyk,
  type Color, type LineCapStyle, type PDFDocument, type PDFPage, type PDFRef,
} from 'pdf-lib'

/** A named spot ink (e.g. "PANTONE 806 C") with the CMYK used when it isn't run as a separate ink. */
export interface Spot { name: string; cmyk: [number, number, number, number] }
export type Paint = { color: Color } | { spot: Spot }

export const FLUO_SPOTS: Spot[] = [
  { name: 'PANTONE 801 C', cmyk: [100, 0, 9, 0] },
  { name: 'PANTONE 802 C', cmyk: [44, 0, 74, 0] },
  { name: 'PANTONE 803 C', cmyk: [0, 9, 100, 0] },
  { name: 'PANTONE 804 C', cmyk: [0, 46, 67, 0] },
  { name: 'PANTONE 805 C', cmyk: [0, 75, 64, 0] },
  { name: 'PANTONE 806 C', cmyk: [0, 91, 0, 0] },
]

const opName = (op: PDFOperator) => (op as unknown as { name: string }).name

/**
 * Low-level painting with what pdf-lib's high-level API lacks for print:
 * Separation (spot) colour spaces, overprint and opacity via ExtGState.
 */
export class Ink {
  private spotRefs = new Map<string, PDFRef>()
  private pageCs = new Map<PDFPage, Map<string, PDFName>>()
  private pageGs = new Map<PDFPage, Map<string, PDFName>>()
  private doc: PDFDocument
  constructor(doc: PDFDocument) { this.doc = doc }

  private colorSpaceName(page: PDFPage, s: Spot) {
    let ref = this.spotRefs.get(s.name)
    if (!ref) {
      const ctx = this.doc.context
      const tint = ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: s.cmyk.map((v) => v / 100), N: 1 })
      ref = ctx.register(ctx.obj([PDFName.of('Separation'), PDFName.of(s.name), PDFName.of('DeviceCMYK'), tint]))
      this.spotRefs.set(s.name, ref)
    }
    let names = this.pageCs.get(page)
    if (!names) { names = new Map(); this.pageCs.set(page, names) }
    let key = names.get(s.name)
    if (!key) {
      page.node.normalize()
      const res = page.node.Resources()!
      let dict = res.lookup(PDFName.of('ColorSpace')) as PDFDict | undefined
      if (!dict) { dict = this.doc.context.obj({}); res.set(PDFName.of('ColorSpace'), dict) }
      key = PDFName.of(`CS${this.spotRefs.size}_${names.size}`)
      dict.set(key, ref)
      names.set(s.name, key)
    }
    return key
  }

  private graphicsState(page: PDFPage, fillAlpha: number, strokeAlpha: number, overprint: boolean) {
    if (fillAlpha >= 1 && strokeAlpha >= 1 && !overprint) return undefined
    const id = `${fillAlpha}|${strokeAlpha}|${overprint}`
    let names = this.pageGs.get(page)
    if (!names) { names = new Map(); this.pageGs.set(page, names) }
    let key = names.get(id)
    if (!key) {
      const gs: Record<string, unknown> = { Type: 'ExtGState', ca: fillAlpha, CA: strokeAlpha }
      if (overprint) Object.assign(gs, { OP: true, op: true, OPM: 1 })
      key = page.node.newExtGState('GS', this.doc.context.obj(gs as never) as unknown as PDFDict)
      names.set(id, key)
    }
    return key
  }

  /** Same coordinate contract as page.drawSvgPath (x, y = top-left, SVG y-down, uniform scale). */
  path(page: PDFPage, d: string, o: {
    x?: number; y?: number; scale?: number
    fill?: Paint; stroke?: Paint; strokeWidth?: number; lineCap?: LineCapStyle
    fillAlpha?: number; strokeAlpha?: number; overprint?: boolean
  }) {
    const placeholder = cmyk(0, 0, 0, 1)
    const ops = drawSvgPath(d, {
      x: o.x ?? 0, y: o.y ?? 0, scale: o.scale,
      color: o.fill ? ('color' in o.fill ? o.fill.color : placeholder) : undefined,
      borderColor: o.stroke ? ('color' in o.stroke ? o.stroke.color : placeholder) : undefined,
      borderWidth: o.stroke ? o.strokeWidth ?? 1 : 0,
      borderLineCap: o.lineCap,
      graphicsState: this.graphicsState(page, o.fillAlpha ?? 1, o.strokeAlpha ?? 1, !!o.overprint),
    })
    const out: PDFOperator[] = []
    for (const op of ops) {
      if (o.fill && 'spot' in o.fill && ['k', 'rg', 'g'].includes(opName(op))) {
        out.push(PDFOperator.of(PDFOperatorNames.NonStrokingColorspace, [this.colorSpaceName(page, o.fill.spot)]), PDFOperator.of(PDFOperatorNames.NonStrokingColorN, [PDFNumber.of(1)]))
      } else if (o.stroke && 'spot' in o.stroke && ['K', 'RG', 'G'].includes(opName(op))) {
        out.push(PDFOperator.of(PDFOperatorNames.StrokingColorspace, [this.colorSpaceName(page, o.stroke.spot)]), PDFOperator.of(PDFOperatorNames.StrokingColorN, [PDFNumber.of(1)]))
      } else out.push(op)
    }
    page.pushOperators(...out)
  }
}
