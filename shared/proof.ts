import { z } from 'zod'

export const ProofSchema = z.object({
  verdict: z.string().describe('One or two sentences: overall readiness and the single most important fix.'),
  findings: z.array(z.object({
    level: z.enum(['fail', 'warn', 'info']).describe('fail = must fix before printing/posting; warn = should fix; info = suggestion.'),
    category: z.enum(['typo', 'grammar', 'consistency', 'facts', 'missing', 'legibility', 'contrast', 'hierarchy', 'layout']),
    title: z.string().describe('Short headline, e.g. "Typo: “Recieve”".'),
    detail: z.string().describe('What is wrong and the exact fix.'),
    quote: z.string().describe('The exact text from the design this refers to, or an empty string.'),
  })),
})
export type Proof = z.infer<typeof ProofSchema>

export interface ProofRequest {
  image: string // base64 JPEG
  /** live text extracted from the PDF, when available — helps with exact spelling */
  text?: string
  /** e.g. "A2 poster, viewed from 1–2 m" */
  context?: string
}
