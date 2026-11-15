export interface Base { angle?: number; opacity?: number; name?: string }
export interface TextEl extends Base { type: 'text'; text: string; x: number; y: number; w: number; size: number; font: string; weight: number; fill: string; align?: 'left' | 'center' | 'right'; lh?: number; ls?: number; italic?: boolean }
export interface RectEl extends Base { type: 'rect'; x: number; y: number; w: number; h: number; fill: string; stroke?: string; sw?: number; rx?: number }
export interface CircleEl extends Base { type: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string; sw?: number }
export interface LineEl extends Base { type: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number }
export interface ImageEl extends Base { type: 'image'; x: number; y: number; w: number; h: number; src: string; gray?: boolean; clip?: 'circle' }
export type El = TextEl | RectEl | CircleEl | LineEl | ImageEl

export interface Scene {
  w: number
  h: number
  bg: string
  els: El[]
}

/** Fabric's line box is ~1.13 × fontSize × lineHeight. */
export const LINE_MULT = 1.13
