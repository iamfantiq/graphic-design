import ImageTracer from 'imagetracerjs'

self.onmessage = (e: MessageEvent<{ imgd: ImageData; options: Record<string, unknown> }>) => {
  try {
    const svg = ImageTracer.imagedataToSVG(e.data.imgd, e.data.options)
    ;(self as unknown as Worker).postMessage({ svg })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ error: String(err) })
  }
}
