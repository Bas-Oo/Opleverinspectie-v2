/* Service worker: de hele app in één versie-cache, zodat hij offline werkt en alle bestanden altijd bij elkaar passen.
   Nieuwe versie uitrollen = VERSIE ophogen. De app meldt dan "Er is een nieuwe versie" en wisselt pas na een tik. */
const VERSIE = '2.1.0';
/* Eigen voorvoegsel 'oi2-app-': versie 1 ruimt bij een update alle caches op die met 'opleverinspectie-' beginnen */
const CACHE = 'oi2-app-' + VERSIE;
const BESTANDEN = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/backup.js', 'js/config.js', 'js/documenten.js', 'js/excel.js', 'js/foto.js', 'js/handtekening.js', 'js/lader.js',
  'js/model.js', 'js/nav.js', 'js/pdf.js', 'js/scherm-afronden.js', 'js/scherm-object.js', 'js/scherm-overig.js', 'js/scherm-overzicht.js', 'js/scherm-punten.js', 'js/scherm-tekenen.js',
  'js/sha256.js', 'js/staat.js', 'js/store.js', 'js/stukjes.js', 'js/ui.js',
  'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js', 'vendor/xlsx.full.min.js',
  'fonts/RedditSans-Regular.woff2', 'fonts/RedditSans-Bold.woff2', 'fonts/RedditSans-Regular.ttf', 'fonts/RedditSans-Bold.ttf',
  'img/logo_beeld.png', 'img/logo_vol.png', 'img/icon-180.png', 'img/icon-192.png', 'img/icon-512.png'
];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(BESTANDEN.map(u => new Request(u, { cache: 'reload' }))))));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith('oi2-app-') || k.startsWith('opleverinspectie-v2-')) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener('message', e => { if (e.data === 'activeer') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const pad = req.mode === 'navigate' ? 'index.html' : req;
    const uitCache = await cache.match(pad, { ignoreSearch: true });
    if (uitCache) return uitCache;
    try { return await fetch(req); }
    catch (err) { const fb = req.mode === 'navigate' ? await cache.match('index.html') : null; if (fb) return fb; throw err; }
  })());
});
