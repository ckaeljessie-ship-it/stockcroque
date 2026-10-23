// Garde l'appli et ses bibliothèques en cache pour qu'elle s'ouvre même sans connexion.
const CACHE = 'stock-croquettes-v1';
const CDN = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'unpkg.com'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
    caches.keys()
        .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    const garder = res => { const copie = res.clone(); caches.open(CACHE).then(c => c.put(req, copie)).catch(() => {}); return res; };

    if (CDN.includes(url.hostname)) {
        // bibliothèques : cache d'abord
        e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(garder)));
    } else if (url.origin === location.origin && (req.mode === 'navigate' || url.pathname.endsWith('.html'))) {
        // l'appli : réseau d'abord (toujours la dernière version), cache si hors-ligne
        e.respondWith(fetch(req).then(garder).catch(() => caches.match(req).then(hit => hit || caches.match(self.registration.scope))));
    }
});
