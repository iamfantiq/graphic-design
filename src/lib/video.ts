import { ArrayBufferTarget, Muxer } from 'mp4-muxer'

export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3),
  inOutSine: (t: number) => -(Math.cos(Math.PI * Math.min(1, Math.max(0, t))) - 1) / 2,
}

export function videoSupported() {
  return typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window
}

/**
 * Encode an animation to MP4 in the browser (WebCodecs + mp4-muxer): H.264 when available
 * (Chrome, Edge, Safari), VP9-in-MP4 otherwise. Runs faster than real time, no upload.
 */
export async function encodeMp4(opts: {
  width: number; height: number; fps?: number; seconds: number
  draw: (frame: number, t: number) => HTMLCanvasElement | OffscreenCanvas
  onProgress?: (p: number) => void
}): Promise<{ blob: Blob; codec: string }> {
  if (!videoSupported()) throw new Error('Video export needs a browser with WebCodecs (Chrome, Edge, Safari 16.4+, Firefox 130+).')
  const fps = opts.fps ?? 30
  const W = opts.width - (opts.width % 2), H = opts.height - (opts.height % 2) // encoders want even sizes
  const candidates = [
    { codec: 'avc1.640028', mux: 'avc' as const }, // High 4.0: up to 1080p
    { codec: 'avc1.640033', mux: 'avc' as const }, // High 5.1: larger print-size frames
    { codec: 'avc1.4d0033', mux: 'avc' as const },
    { codec: 'vp09.00.40.08', mux: 'vp9' as const },
  ]
  let chosen: (typeof candidates)[number] | null = null
  for (const c of candidates) {
    const s = await VideoEncoder.isConfigSupported({ codec: c.codec, width: W, height: H, bitrate: 10_000_000, framerate: fps }).catch(() => null)
    if (s?.supported) { chosen = c; break }
  }
  if (!chosen) throw new Error('This browser cannot encode H.264 or VP9 video.')

  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: chosen.mux, width: W, height: H, frameRate: fps }, fastStart: 'in-memory' })
  let failure: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failure = e as Error },
  })
  encoder.configure({ codec: chosen.codec, width: W, height: H, bitrate: 10_000_000, framerate: fps })

  const total = Math.round(opts.seconds * fps)
  for (let i = 0; i < total; i++) {
    if (failure) throw failure
    const src = opts.draw(i, i / fps)
    const frame = new VideoFrame(src, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) })
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })
    frame.close()
    while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2))
    if (i % 10 === 0) { opts.onProgress?.(i / total); await new Promise((r) => setTimeout(r, 0)) }
  }
  await encoder.flush()
  encoder.close()
  if (failure) throw failure
  muxer.finalize()
  opts.onProgress?.(1)
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), codec: chosen.codec.startsWith('avc') ? 'H.264' : 'VP9' }
}
