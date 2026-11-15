# Formatter — design production toolkit

A browser-based toolkit for the production work that follows the creative part of graphic design. Everything runs client-side: files never leave the user's computer.

## Tools

### 1. Social Resizer (+ batch, smart crop, AI layout)
Drop a finished poster (**.ai**, PDF, SVG, PNG, JPG, WebP) and get every social format at once:
1:1, 4:5, 9:16, 16:9, plus Pinterest 2:3, link preview 1.91:1, X header 3:1, and YouTube thumbnail.

- **Auto** mode picks per format: *Fill* (nearly the same shape, tiny crop), *Solid colour* (flat poster edges are extended with the sampled colour), *Edge extend* (stretched, softened edge pixels), or *Blurred backdrop*.
- Drag any preview to reposition. Scale, padding, blur, darken and background colour can be set per format, or applied to all.
- Platform safe-zone overlays for Stories/Reels and the X header.
- Exports render from the full-resolution source, as PNG/JPG, individually or as a ZIP.
- Illustrator files work when saved with *Create PDF Compatible File* (the default). Multi-artboard PDFs get a page picker.
- **Batch mode**: drop many posters and download every file × every format as one ZIP, in a folder per poster.
- **Smart crop** runs on the device. It finds the content area (where colour and edges differ from the background) and keeps it fully visible in each format, cropping only empty margins and respecting safe zones.
- **AI layout** (optional, Claude). It reads the poster like a designer: it lists elements (title, info, subject, logo, fine print) with importance, then picks per format between *crop*, *fit* and *recompose* (rearranging cut-out elements, for example a portrait poster into 16:9), plus the background fill. AI boxes are snapped to real pixels on the device. Recompose is skipped automatically when elements overlap in the original.

### 2. Logo → Print Banner
Turns a logo into a clean **vector PDF** for large-format print.

- SVG / PDF / AI logos are embedded as the original vectors and auto-trimmed to the artwork.
- PNG/JPG logos are **traced into vectors** in a Web Worker, with controls for colour count, smoothness, specks and background removal (outside only, or including counters). Traced colours can be recoloured (e.g. all white for dark banners).
- Presets: 3×1 m, 2×1 m, 4×1 m, 6×1 m, 3×2 m press wall, 2.4×2.4 m backdrop, roll-ups, X-banner, A0, or a custom size.
- Layouts: centred, logo left/right with text, or **step & repeat** (staggered press-wall grid).
- **CMYK** output with editable CMYK values per colour, or RGB.
- Bleed, safe margin guides, crop marks, slug info, and **TrimBox/BleedBox** set for the RIP.
- Text is converted to outlines with opentype.js (Latin + Cyrillic), so no fonts are needed at the print shop.
- PDF pages are limited to 5.08 m, so larger formats are built at **1:10** and labelled as such.
- The live preview is the real PDF rendered with pdf.js, so the preview matches the print file.

### 3. Print Check (preflight)
Resolution at the real print size (per image, accounting for 1:10 files), bleed against product needs, TrimBox, unembedded fonts, RGB/CMYK/spot colour, hairlines under 0.25 pt, and live text inside the danger zone. Problems are marked on a preview.

### 4. Brand Kits
Each client's logo, colours with official CMYK values, and fonts, stored in the browser. The banner builder uses the kit's logo, swatches and CMYK overrides. The Layout Lab uses the brand palette and type. The editor gets a logo button and swatches.

### 5. Illustrator script (beta)
`public/scripts/Formatter-Artboards.jsx` adds social-format artboards next to the active one, with the artwork copied in as vectors (one group per layer, fit or fill). It was written without access to Illustrator, so try it on a copy first.

### 6. Layout Lab + Editor
- 12 rule-based poster archetypes: Swiss grid, type stack, split screen, full-bleed overlay, quiet minimal, Bauhaus geometry, editorial cover, vertical title, festival frame, diagonal band, brutalist grid, and circle focus. Each is parametric (seeded), so *New ideas* gives real variations rather than random noise.
- 12 curated palettes and 10 type pairings (Google Fonts), each lockable.
- **References**: drop screenshots saved from Pinterest/Instagram/Are.na. Their palettes are extracted with k-means and fed into the generator.
- **Reflow export**: rebuilds the same composition natively for poster, 4:5, 1:1, 9:16 and 16:9 (type and grid re-flowed, not cropped). Poster formats export at A3 / 300 dpi.
- Fabric.js editor with text, shapes, lines and images; fonts, weights, tracking, leading, colours, opacity and rotation; layers (hide/lock); snapping; undo/redo; and keyboard shortcuts. Exports PNG/JPG (1–4×), SVG and PDF. *Resize for social* sends the design straight to the Social Resizer.

## Stack
Vite + React + TypeScript + Tailwind v4 · pdf.js · pdf-lib · jsPDF + svg2pdf.js · imagetracerjs · opentype.js · Fabric.js · JSZip. It is a static site with no backend.

## Develop
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
```

## AI layout setup
The AI feature is a Vercel Function (`api/analyze.ts`) calling Claude (`claude-opus-5-5`, structured output). In Vercel → Project → Settings → Environment Variables:
- `ANTHROPIC_API_KEY`: a key from console.anthropic.com (prepaid credits). It stays server-side.
- `ACCESS_CODE` (optional but recommended if the site is public): visitors must enter this code before AI runs, so strangers can't spend your credits.

Without the key, the app still works and uses on-device smart crop. One analysis sends a ~1024 px JPEG and costs roughly a few cents.

## Deploy
The site is static, and `vercel.json` is included. Import the repo in Vercel, or run `npx vercel --prod`.
