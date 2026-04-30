/**
 * Service Worker customizado — Ellos Juventude
 *
 * Estratégia: injectManifest (vite-plugin-pwa injeta __WB_MANIFEST aqui)
 * Responsabilidades:
 *   1. Precaching de assets (via Workbox)
 *   2. Runtime caching de chamadas Supabase
 *   3. Receber e exibir Web Push notifications
 *   4. Redirecionar clique na notificação para a URL correta
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute }                            from 'workbox-routing'
import { NetworkFirst, NetworkOnly }               from 'workbox-strategies'
import { ExpirationPlugin }                        from 'workbox-expiration'

// ── Controle de ciclo de vida ─────────────────────────────────────────────────

self.skipWaiting()
self.__WB_DISABLE_DEV_LOGS = true

// ── Precaching (Vite injeta a lista de assets aqui) ───────────────────────────

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// ── Runtime caching ───────────────────────────────────────────────────────────

// Auth do Supabase: nunca cachear — tokens expirados causam loop infinito
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && url.pathname.includes('/auth/'),
  new NetworkOnly()
)

// API do Supabase: network-first, TTL curto
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 }),
    ],
  })
)

// ── Web Push ──────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try { data = event.data.json() } catch { return }

  const title   = data.title ?? 'Ellos Juventude'
  const options = {
    body:      data.body    ?? '',
    icon:      '/pwa-192x192.png',
    badge:     '/pwa-192x192.png',
    tag:       data.tag     ?? 'ellos-push',
    renotify:  true,
    data:      { url: data.url ?? '/' },
    // Vibração padrão Android (suportado onde disponível)
    vibrate:   [200, 100, 200],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Clique na notificação ─────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url ?? '/'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        // Reutiliza aba já aberta do app
        for (const client of list) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl)
            return client.focus()
          }
        }
        // Abre nova aba
        if (clients.openWindow) return clients.openWindow(targetUrl)
      })
  )
})
