declare module 'imagetracerjs' {
  const ImageTracer: {
    imagedataToSVG(imgd: ImageData, options?: Record<string, unknown> | string): string
  }
  export default ImageTracer
}
declare module 'opentype.js' {
  export interface Path { toPathData(decimals?: number): string; commands: unknown[] }
  export interface Glyph { index: number; advanceWidth?: number; getPath(x: number, y: number, size: number): Path }
  export interface Font {
    unitsPerEm: number
    ascender: number
    descender: number
    charToGlyph(c: string): Glyph
    getKerningValue(a: Glyph, b: Glyph): number
  }
  export function parse(buf: ArrayBuffer): Font
  const _default: { parse: typeof parse }
  export default _default
}
