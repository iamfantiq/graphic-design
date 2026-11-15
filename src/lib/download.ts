import JSZip from 'jszip'

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), type, quality),
  )
}

export async function downloadZip(files: { name: string; data: Blob | Uint8Array | string }[], zipName: string) {
  const zip = new JSZip()
  for (const f of files) zip.file(f.name, f.data)
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, zipName)
}

export function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 60) || 'design'
}
