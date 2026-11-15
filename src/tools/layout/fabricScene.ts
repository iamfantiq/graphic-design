import { Circle, FabricImage, FabricObject, Line, Rect, StaticCanvas, Textbox, filters } from 'fabric'
import type { El, Scene } from './scene'

// Fabric v7 defaults to centre origin; the scene model uses top-left like every design tool.
FabricObject.ownDefaults.originX = 'left'
FabricObject.ownDefaults.originY = 'top'
FabricObject.ownDefaults.objectCaching = true

const imgCache = new Map<string, Promise<HTMLImageElement>>()
export function loadImg(src: string) {
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise((res, rej) => {
      const i = new Image()
      i.crossOrigin = 'anonymous'
      i.onload = () => res(i)
      i.onerror = rej
      i.src = src
    }))
  }
  return imgCache.get(src)!
}

export async function elToObject(e: El): Promise<FabricObject> {
  const common = { angle: e.angle ?? 0, opacity: e.opacity ?? 1 }
  let o: FabricObject
  switch (e.type) {
    case 'text':
      o = new Textbox(e.text, {
        ...common, left: e.x, top: e.y, width: e.w, fontSize: e.size, fontFamily: e.font, fontWeight: e.weight,
        fill: e.fill, textAlign: e.align ?? 'left', lineHeight: e.lh ?? 1.2, charSpacing: (e.ls ?? 0) * 1000,
        fontStyle: e.italic ? 'italic' : 'normal', splitByGrapheme: false,
      })
      break
    case 'rect':
      o = new Rect({ ...common, left: e.x, top: e.y, width: e.w, height: e.h, fill: e.fill, stroke: e.stroke, strokeWidth: e.sw ?? 0, rx: e.rx ?? 0, ry: e.rx ?? 0, strokeUniform: true })
      if (e.stroke) o.set({ left: e.x - (e.sw ?? 0) / 2, top: e.y - (e.sw ?? 0) / 2 })
      break
    case 'circle':
      o = new Circle({ ...common, left: e.cx - e.r, top: e.cy - e.r, radius: e.r, fill: e.fill, stroke: e.stroke, strokeWidth: e.sw ?? 0 })
      break
    case 'line':
      o = new Line([e.x1, e.y1, e.x2, e.y2], { ...common, stroke: e.stroke, strokeWidth: e.sw, strokeLineCap: 'butt' })
      break
    case 'image': {
      const el = await loadImg(e.src)
      const iw = el.naturalWidth, ih = el.naturalHeight
      const s = Math.max(e.w / iw, e.h / ih)
      const cw = e.w / s, ch = e.h / s
      const img = new FabricImage(el, { ...common, left: e.x, top: e.y, cropX: (iw - cw) / 2, cropY: (ih - ch) / 2, width: cw, height: ch, scaleX: s, scaleY: s })
      if (e.gray) { img.filters = [new filters.Grayscale()]; img.applyFilters() }
      if (e.clip === 'circle') img.clipPath = new Circle({ radius: Math.min(cw, ch) / 2, originX: 'center', originY: 'center' })
      o = img
      break
    }
  }
  if (e.name) (o as FabricObject & { name?: string }).name = e.name
  return o
}

export async function sceneObjects(scene: Scene) {
  return Promise.all(scene.els.map(elToObject))
}

const thumbCanvas = typeof document !== 'undefined' ? new StaticCanvas(document.createElement('canvas'), { renderOnAddRemove: false }) : null

/** Render a scene to a data URL at the given scale (used for idea thumbnails and reflowed exports). */
export async function renderScene(scene: Scene, scale: number, type: 'png' | 'jpeg' = 'jpeg'): Promise<string> {
  const c = thumbCanvas!
  const objs = await sceneObjects(scene)
  c.clear()
  c.setDimensions({ width: Math.round(scene.w * scale), height: Math.round(scene.h * scale) })
  c.setZoom(scale)
  c.backgroundColor = scene.bg
  objs.forEach((o) => c.add(o))
  c.renderAll()
  const url = c.toDataURL({ format: type, quality: 0.9, multiplier: 1 })
  c.clear()
  return url
}
