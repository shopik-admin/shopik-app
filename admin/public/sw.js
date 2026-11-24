// Service worker for Shopik Admin PWA installability and Web Push.
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

// Same-origin app icon (so a domain's uploaded icon is used) plus the favicon
// rasterised to a badge PNG: Android draws the status-bar icon from the badge's
// alpha channel, so it must be small and transparent.
const DEFAULT_ICON = '/icons/app/192.png'
const DEFAULT_BADGE = '/icons/app/badge.png'

// Payload is JSON built by the server. The notification is plain text only —
// no HTML is ever rendered from the message.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = typeof data.title === 'string' && data.title ? data.title : 'התראה חדשה'
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: data.icon || DEFAULT_ICON,
    badge: data.badge || DEFAULT_BADGE,
    tag: data.tag || undefined,
    dir: 'rtl',
    lang: 'he',
    data: { url: typeof data.url === 'string' ? data.url : '/ops' }
  }

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options)
    // A visible tab should refresh its inbox without waiting for focus.
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) client.postMessage({ type: 'push-received' })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data && event.notification.data.url
  let url = '/ops'
  try {
    // Same-origin only: the server sends an internal path, never a full URL.
    const parsed = new URL(target || '/ops', self.location.origin)
    if (parsed.origin === self.location.origin) url = parsed.pathname + parsed.search + parsed.hash
  } catch { }

  event.waitUntil((async () => {
    const absolute = new URL(url, self.location.origin).href
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      if (client.url === absolute && 'focus' in client) return client.focus()
    }
    if (self.clients.openWindow) return self.clients.openWindow(absolute)
  })())
})

// The browser rotated the endpoint. Re-subscribe with the stored application
// server key and hand the new subscription to the server. The request carries
// the admin's session cookie (same-origin), so no token is stored in the SW.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const old = event.oldSubscription
      const key = old && old.options && old.options.applicationServerKey
      if (!key) return
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key
      })
      const json = subscription.toJSON()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          expirationTime: json.expirationTime,
          deviceLabel: 'pushsubscriptionchange'
        })
      })
    } catch {
      // The next admin page load re-subscribes silently.
    }
  })())
})
