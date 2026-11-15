import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { AnalysisSchema, type AnalyzeRequest } from '../shared/analysis.js'

const SYSTEM = `You are a senior graphic designer who adapts finished posters to other formats (social media, banners) without damaging the design.

You receive one poster image and a list of target formats. Work in two steps.

1. Map the poster. List every distinct element: each text block (title, subtitle, date/venue/info lines, body copy, fine print such as sponsor logos or legal text), each logo, and the main subject (person, object, illustration). Give tight bounding boxes in pixels of the image as sent (origin top-left). Rate importance:
- essential: must stay fully visible and legible in every format (the title, the date/venue or call to action, the main subject, the main brand logo)
- important: keep when space allows (subtitle, body copy)
- optional: may be cropped (decoration, texture, background shapes, small fine print)

2. Decide per target format:
- "crop": scale and crop the poster so the essential elements fill the frame well; uncovered areas get the chosen fill. Prefer this when the essential elements are compact relative to the poster.
- "fit": show the whole poster unchanged on a fill. Prefer this for dense typographic posters or artwork where any crop hurts.
- "recompose": cut the elements out and arrange them anew. Only when the background is flat (or a very soft gradient) so cut-outs blend in, when the elements you place do not overlap each other in the original (rectangular cut-outs would carry pieces of their neighbours), and when the target shape is very different (portrait poster into 16:9 or 3:1). Give placements for the elements you keep, as normalised boxes (0–1) in the target, roughly preserving each element's aspect ratio, aligned to a clear grid with generous margins, never overlapping, and keeping the visual hierarchy.
- fill: "color" for flat backgrounds, "extend" for gradients and soft edges, "blur" for photographic or busy backgrounds.
Respect each format's safe zone notes (UI overlays): keep essential text out of them.

Be honest and conservative: a clean "fit" beats a clumsy recompose.`

export async function GET() {
  return Response.json({
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    needsCode: Boolean(process.env.ACCESS_CODE),
  })
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'AI is not configured on this deployment (missing ANTHROPIC_API_KEY).' }, { status: 503 })
  if (process.env.ACCESS_CODE && req.headers.get('x-access-code') !== process.env.ACCESS_CODE)
    return Response.json({ error: 'Wrong or missing access code.' }, { status: 401 })

  let body: AnalyzeRequest
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
  if (!body?.image || body.image.length > 4_000_000 || !Array.isArray(body.formats) || body.formats.length > 12)
    return Response.json({ error: 'Send one JPEG under ~3 MB and at most 12 formats.' }, { status: 400 })

  const formats = body.formats.map((f) => `- id "${f.id}": ${f.w}×${f.h}px (aspect ${(f.w / f.h).toFixed(3)})${f.safe ? `; safe zone: ${f.safe}` : ''}`).join('\n')
  const client = new Anthropic()
  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(AnalysisSchema) },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.image } },
          { type: 'text', text: `The poster image is ${body.width}×${body.height}px. Target formats:\n${formats}\n\nReturn one entry in "formats" for every id above.` },
        ],
      }],
    })
    if (response.stop_reason === 'refusal') return Response.json({ error: 'The model declined to analyse this image.' }, { status: 422 })
    if (!response.parsed_output) return Response.json({ error: 'Could not read the model response, please retry.' }, { status: 502 })
    return Response.json({ analysis: response.parsed_output, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return Response.json({ error: 'The ANTHROPIC_API_KEY on the server is invalid.' }, { status: 502 })
    if (error instanceof Anthropic.RateLimitError) return Response.json({ error: 'Rate limited by the AI provider — try again in a minute.' }, { status: 429 })
    if (error instanceof Anthropic.BadRequestError) return Response.json({ error: `AI request rejected: ${error.message}` }, { status: 502 })
    if (error instanceof Anthropic.APIConnectionError) return Response.json({ error: 'Could not reach the AI provider — try again.' }, { status: 504 })
    if (error instanceof Anthropic.APIError) return Response.json({ error: `AI provider error (${error.status}).` }, { status: 502 })
    return Response.json({ error: 'Unexpected server error.' }, { status: 500 })
  }
}
