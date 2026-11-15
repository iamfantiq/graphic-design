// Formatter service worker: the app runs fully in the browser, so cache it for offline use.
// Hashed /assets/ files are immutable (cache-first); the page itself is network-first.
const CACHE = 'formatter-v1'
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest', '/icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.pathname.startsWith('/api/')) return

  const cacheFirst = async () => {
    const hit = await caches.match(req)
    if (hit) return hit
    const res = await fetch(req)
    if (res.ok || res.type === 'opaque') (await caches.open(CACHE)).put(req, res.clone())
    return res
  }

  if (url.origin === location.origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/scripts/'))) {
    e.respondWith(cacheFirst())
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst())
  } else if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      caches.open(CACHE).then((c) => c.put('/index.html', res.clone()))
      return res
    }).catch(async () => (await caches.match('/index.html')) || Response.error()))
  }
})
