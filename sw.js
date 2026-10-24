// Garde l'appli et ses bibliothèques en cache pour qu'elle s'ouvre même sans connexion.
const CACHE = 'stock-croquettes-v6';
const CDN = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'unpkg.com'];

const LIBS = ['https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js', 'https://cdn.tailwindcss.com'];
const SHELL = LIBS.concat(['./', 'index.html', 'vendeur.html', 'sync-config.js', 'manifest.json', 'manifest-vendeur.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']);
self.addEventListener('install', e => {
    // pré-charge l'appli et les icônes ; une absence de réseau ne bloque pas l'installation
    e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
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
    } else if (url.origin === location.origin && /\.(png|svg)$/.test(url.pathname)) {
        // icônes : cache d'abord
        e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(garder)));
    } else if (url.origin === location.origin && (req.mode === 'navigate' || /\.(html|js|json)$/.test(url.pathname))) {
        // l'appli et sync-config.js : réseau d'abord (dernière version), mais si le réseau traîne (> 4 s) ou tombe, on prend le cache
        const secours = /vendeur/.test(url.pathname) ? 'vendeur.html' : 'index.html';
        const depuisCache = () => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match(secours) || caches.match(self.registration.scope));
        // une navigation ne doit jamais recevoir une réponse "redirigée" (ex : /index.html -> /) : sinon l'appli installée reste blanche
        const propre = res => res.redirected ? res.clone().blob().then(b => new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers })) : res;
        const reseau = fetch(req.mode === 'navigate' ? new Request(req.url, { credentials: 'same-origin' }) : req).then(propre).then(garder);
        reseau.catch(() => {});
        const delai = new Promise((_, non) => setTimeout(non, 4000));
        e.respondWith(
            Promise.race([reseau, delai])
                .catch(() => depuisCache().then(hit => hit || reseau))
                .catch(() => new Response('Hors connexion : ouvre l\'appli une fois avec du réseau.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))
        );
    }
});
