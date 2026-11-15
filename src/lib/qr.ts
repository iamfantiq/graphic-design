import QRCode from 'qrcode'

/** QR code as one SVG path (module units, 1 module = 1 unit), including the 4-module quiet zone. */
export function qrPath(text: string, ecc: 'L' | 'M' | 'Q' | 'H' = 'M') {
  const q = QRCode.create(text, { errorCorrectionLevel: ecc })
  const n = q.modules.size, data = q.modules.data
  const quiet = 4
  let d = ''
  for (let y = 0; y < n; y++) {
    let x = 0
    while (x < n) {
      if (!data[y * n + x]) { x++; continue }
      const start = x
      while (x < n && data[y * n + x]) x++
      d += `M${start + quiet} ${y + quiet}h${x - start}v1h${start - x}z`
    }
  }
  return { d, size: n + quiet * 2 }
}
