import { FabricImage, Rect, StaticCanvas, Textbox, type FabricObject } from 'fabric'
import './fabricScene' // top-left origin defaults

const PROPS = ['name', 'selectable', 'evented', 'lockMovementX', 'lockMovementY', 'svgD']

/**
 * Re-flow an edited design into another size.
 * Rules a designer would apply by hand: full-width/height elements stretch, everything else keeps
 * its scale relative to the shorter side and stays anchored to the edge (or centre) it sits on;
 * background photos are re-cropped to cover the new frame.
 */
export async function adaptDesign(json: string, W: number, H: number, W2: number, H2: number) {
  const sc = new StaticCanvas(document.createElement('canvas'), { width: W, height: H, renderOnAddRemove: false })
  await sc.loadFromJSON(json)
  const sx = W2 / W, sy = H2 / H, k = Math.min(sx, sy)

  for (const o of sc.getObjects() as FabricObject[]) {
    const b = o.getBoundingRect()
    const fullW = b.width >= W * 0.85, fullH = b.height >= H * 0.85
    const unrotated = Math.abs((o.angle ?? 0) % 180) < 0.01

    if (o instanceof FabricImage && fullW && fullH && unrotated) {
      // cover the new frame from the original photo
      const el = o.getElement() as HTMLImageElement
      const nw = el.naturalWidth || el.width, nh = el.naturalHeight || el.height
      const tw = b.width * sx, th = b.height * sy
      const s = Math.max(tw / nw, th / nh)
      const cw = tw / s, ch = th / s
      o.set({ cropX: (nw - cw) / 2, cropY: (nh - ch) / 2, width: cw, height: ch, scaleX: s, scaleY: s, left: b.left * sx, top: b.top * sy })
      o.setCoords()
      continue
    }

    if (o instanceof Textbox) {
      o.set({ fontSize: o.fontSize * k, width: o.width * (fullW ? sx : k) })
      o.initDimensions()
    } else if (o instanceof Rect && unrotated && (fullW || fullH)) {
      o.set({ width: o.width * (fullW ? sx : k), height: o.height * (fullH ? sy : k), strokeWidth: (o.strokeWidth ?? 0) * k })
    } else {
      o.set({ scaleX: (o.scaleX ?? 1) * k, scaleY: (o.scaleY ?? 1) * k })
    }
    o.setCoords()
    const nb = o.getBoundingRect()

    const place = (start: number, size: number, total: number, total2: number, full: boolean, scale: number, newSize: number) => {
      const c = start + size / 2
      if (full) return (c / total) * total2
      if (c < total * 0.4) return start * k + newSize / 2 // anchored to the start edge
      if (c > total * 0.6) return total2 - (total - start - size) * k - newSize / 2 // anchored to the end edge
      return (c / total) * total2 + 0 * scale // centred
    }
    const cx = place(b.left, b.width, W, W2, fullW, sx, nb.width)
    const cy = place(b.top, b.height, H, H2, fullH, sy, nb.height)
    o.set({ left: o.left + (cx - (nb.left + nb.width / 2)), top: o.top + (cy - (nb.top + nb.height / 2)) })
    o.setCoords()
  }
  sc.setDimensions({ width: W2, height: H2 })
  const out = JSON.stringify(sc.toObject(PROPS))
  sc.dispose()
  return out
}

/** Render a saved design JSON at its native size (for batch exports). */
export async function renderJson(json: string, W: number, H: number, scale = 1) {
  const sc = new StaticCanvas(document.createElement('canvas'), { width: W, height: H, renderOnAddRemove: false })
  await sc.loadFromJSON(json)
  sc.renderAll()
  const url = sc.toDataURL({ format: 'png', multiplier: scale })
  sc.dispose()
  return url
}
