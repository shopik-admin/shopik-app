// Service worker for Shopik PWA installability.
//
// Intentionally does not intercept fetch requests: the app is server-rendered
// and every request must hit the network (API, auth cookies, SSR HTML).
// Older Android Chrome versions only required *a* service worker for
// installability; a pass-through fetch handler is not needed and risks
// breaking POST/API traffic.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
