// "Service worker": guarda copias de la app y del mapa para que funcione con mala cobertura.
// Si cambias la app, sube el número de VERSION para que los móviles cojan la nueva.
const VERSION = 'florencia-v20';
const MAPA = 'florencia-mapa';
const MAX_TESELAS = 3000;

const ARCHIVOS = [
  './', 'index.html', 'style.css', 'app.js', 'chat.js', 'brujula.js', 'esquema.js', 'config.js', 'datos/florencia.json',
  'manifest.webmanifest', 'iconos/icono.svg', 'iconos/icono-192.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION && k !== MAPA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La base de datos siempre en directo (nunca desde la copia)
  if (url.hostname.endsWith('supabase.co')) return;

  // Trozos del mapa: primero la copia guardada (ya vistos antes), si no, internet
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(caches.open(MAPA).then(async (cache) => {
      const guardada = await cache.match(req);
      if (guardada) return guardada;
      const resp = await fetch(req);
      if (resp.ok) { cache.put(req, resp.clone()); recortar(cache); }
      return resp;
    }));
    return;
  }

  // Librerías externas (versiones fijas): copia guardada si existe
  if (url.hostname === 'unpkg.com' || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(VERSION).then(async (cache) => {
      const guardada = await cache.match(req);
      if (guardada) return guardada;
      const resp = await fetch(req);
      if (resp.ok || resp.type === 'opaque') cache.put(req, resp.clone());
      return resp;
    }));
    return;
  }

  // Archivos de la app: primero internet (para tener lo último), si falla, la copia
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp.ok) { const copia = resp.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
          return resp;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
    );
  }
});

let recortando = false;
async function recortar(cache) {
  if (recortando) return;
  recortando = true;
  try {
    const claves = await cache.keys();
    for (let i = 0; i < claves.length - MAX_TESELAS; i++) await cache.delete(claves[i]);
  } finally {
    recortando = false;
  }
}
