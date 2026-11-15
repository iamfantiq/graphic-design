import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { ProofSchema, type ProofRequest } from '../shared/proof.js'

const SYSTEM = `You are a meticulous proofreader and senior art director checking a design before it goes to print or gets posted. Mistakes on printed banners are expensive, so be precise.

Check, in this order:
1. Spelling and typos in every visible word, in whatever language the design uses (including mixed languages). Quote the exact wrong text and give the correction. Brand names, invented names and stylised spellings are not errors unless clearly inconsistent.
2. Grammar and punctuation, dashes and quotes used inconsistently, double spaces.
3. Facts you can verify from the design itself: if a date and a weekday both appear, check they match; times in a consistent format; a website, email or handle that looks malformed.
4. Missing essentials for this kind of design (for an event: date, time, place, how to get tickets/info).
5. Legibility at the stated size and viewing distance: text that will be too small, too thin, or too low in contrast against its background.
6. Visual hierarchy and layout: what reads first, crowding, elements too close to the edge.

Report only real issues; do not pad the list. If something is fine, don't mention it. Order findings by severity. Use level "fail" only for things that would embarrass the client (typos, wrong facts, unreadable key info).`

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'AI is not configured on this deployment (missing ANTHROPIC_API_KEY).' }, { status: 503 })
  if (process.env.ACCESS_CODE && req.headers.get('x-access-code') !== process.env.ACCESS_CODE)
    return Response.json({ error: 'Wrong or missing access code.' }, { status: 401 })
  let body: ProofRequest
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
  if (!body?.image || body.image.length > 4_000_000) return Response.json({ error: 'Send one JPEG under ~3 MB.' }, { status: 400 })

  const notes = [
    body.context ? `Design context: ${body.context}.` : '',
    body.text ? `Live text extracted from the file (use it for exact spelling; the image shows layout):\n"""\n${body.text.slice(0, 6000)}\n"""` : '',
    'Proofread and review this design.',
  ].filter(Boolean).join('\n\n')

  const client = new Anthropic()
  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(ProofSchema) },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.image } },
          { type: 'text', text: notes },
        ],
      }],
    })
    if (response.stop_reason === 'refusal') return Response.json({ error: 'The model declined to review this image.' }, { status: 422 })
    if (!response.parsed_output) return Response.json({ error: 'Could not read the model response, please retry.' }, { status: 502 })
    return Response.json({ proof: response.parsed_output })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return Response.json({ error: 'The ANTHROPIC_API_KEY on the server is invalid.' }, { status: 502 })
    if (error instanceof Anthropic.RateLimitError) return Response.json({ error: 'Rate limited by the AI provider — try again in a minute.' }, { status: 429 })
    if (error instanceof Anthropic.BadRequestError) return Response.json({ error: `AI request rejected: ${error.message}` }, { status: 502 })
    if (error instanceof Anthropic.APIConnectionError) return Response.json({ error: 'Could not reach the AI provider — try again.' }, { status: 504 })
    if (error instanceof Anthropic.APIError) return Response.json({ error: `AI provider error (${error.status}).` }, { status: 502 })
    return Response.json({ error: 'Unexpected server error.' }, { status: 500 })
  }
}
