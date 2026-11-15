import { z } from 'zod'

/** Shape of Claude's design analysis. Coordinates are pixels on the image that was sent. */
export const Box = z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })

export const AnalysisSchema = z.object({
  summary: z.string().describe('One sentence: what the poster is and its visual style.'),
  background: z.enum(['flat', 'gradient', 'photo', 'pattern', 'illustration']),
  background_color: z.string().describe('Dominant background colour near the edges, as #rrggbb.'),
  elements: z.array(z.object({
    label: z.string().describe('Short name, e.g. "Title: SUMMER JAZZ", "Date & venue", "Sponsor logos".'),
    kind: z.enum(['title', 'subtitle', 'info', 'body', 'logo', 'subject', 'decoration', 'fine_print']),
    importance: z.enum(['essential', 'important', 'optional']),
    box: Box,
  })),
  formats: z.array(z.object({
    id: z.string(),
    strategy: z.enum(['crop', 'fit', 'recompose']),
    fill: z.enum(['color', 'extend', 'blur']),
    reasoning: z.string().describe('One short sentence a designer would agree with.'),
    placements: z.array(z.object({
      element: z.number().int().describe('Index into elements[].'),
      box: Box.describe('Target box in the output format, normalised 0–1.'),
    })).describe('Only for strategy "recompose"; empty otherwise.'),
  })),
})
export type Analysis = z.infer<typeof AnalysisSchema>

export interface AnalyzeRequest {
  /** base64 JPEG, no data: prefix */
  image: string
  width: number
  height: number
  formats: { id: string; w: number; h: number; safe?: string }[]
}
