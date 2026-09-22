/* Service worker — Poissonnerie de l'Est
 * - Coquille de l'application mise en cache : le dashboard s'ouvre hors ligne.
 * - Pages : réseau d'abord (les mises à jour arrivent vite), cache en secours.
 * - Fichiers statiques : cache d'abord, rafraîchi en arrière-plan.
 * - Appels Apps Script (autre domaine) : jamais interceptés.
 * Pour forcer une mise à jour chez tous les utilisateurs, changer CACHE_VERSION.
 */
const CACHE_VERSION = 'pe-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './logo.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // logo.png est facultatif : un fichier absent ne doit pas bloquer l'installation
    await Promise.allSettled(SHELL.map(url => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Apps Script, polices, etc. : réseau direct

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) { const c = await caches.open(CACHE_VERSION); c.put('./index.html', fresh.clone()); }
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(async res => {
      if (res && res.ok) { const c = await caches.open(CACHE_VERSION); c.put(req, res.clone()); }
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
