// Prueba la app en móviles simulados SIN tocar la base de datos real.
// Uso:  CODIGO=1234 node prueba_movil.mjs <carpeta_app> "<dispositivo>" [AAAA-MM-DD fecha simulada] [lat,lng]
//       node prueba_movil.mjs ./mi-app "iPhone SE" 2026-11-20 43.72,10.40
// Dispositivos útiles: "iPhone SE" (320 px), "iPhone 13", "Pixel 7".
// - Sirve los archivos con page.route (el proxy no deja usar localhost).
// - mi_posicion responde ok y guardar se aborta: nada se escribe en Supabase.
// - Recorre cada pestaña de día y cada botón de ciudad, saca capturas y lista errores.
import { chromium, devices } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs'; import path from 'path';
const [dir, dev = 'iPhone SE', fecha, pos = ''] = process.argv.slice(2);
const [lat, lng] = pos ? pos.split(',').map(Number) : [null, null];
const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
const ctx = await b.newContext({ ...devices[dev], ignoreHTTPSErrors: true, serviceWorkers: 'block', locale: 'es-ES',
  ...(lat != null ? { permissions: ['geolocation'], geolocation: { latitude: lat, longitude: lng, accuracy: 10 } } : {}) });
await ctx.route('http://localhost:8765/**', (route) => {
  let rel = new URL(route.request().url()).pathname; if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(path.resolve(dir), rel);
  const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream';
  fs.existsSync(f) ? route.fulfill({ body: fs.readFileSync(f), contentType: t }) : route.fulfill({ status: 404 });
});
await ctx.route('**/rest/v1/rpc/mi_posicion', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await ctx.route('**/rest/v1/rpc/guardar', (r) => r.abort());
await ctx.addInitScript((c) => localStorage.setItem('viaje-sesion', JSON.stringify({ nombre: 'Prueba', codigo: c })), process.env.CODIGO || '0000');
const p = await ctx.newPage(); const err = []; p.on('pageerror', (e) => err.push(e.message));
if (fecha) await p.clock.setFixedTime(new Date(fecha + 'T10:00:00+01:00'));
await p.goto('http://localhost:8765/'); await p.waitForTimeout(3500);
const salida = path.join(path.resolve(dir), '..', 'capturas'); fs.mkdirSync(salida, { recursive: true });
const tabs = await p.$$eval('#dias [data-dia]', (bs) => bs.map((x) => x.dataset.dia));
for (const t of tabs) {
  await p.click(`#dias [data-dia="${t}"]`); await p.waitForTimeout(700);
  const partes = await p.evaluate(() => { const n = document.querySelector('#partes'); return !n || n.hidden ? [] : [...n.querySelectorAll('[data-parte]')].map((x) => x.dataset.parte); });
  for (const pt of partes.length ? partes : [null]) {
    if (pt) { await p.click(`#partes [data-parte="${pt}"]`); await p.waitForTimeout(600); }
    const f = path.join(salida, `${dev.replace(/ /g, '')}-${t}${pt ? '-' + pt : ''}.png`);
    await p.screenshot({ path: f });
    const sobresale = await p.evaluate(() => [...document.querySelectorAll('#dias, .partes, #partes')].some((e) => e.scrollWidth > e.clientWidth + 1));
    console.log(`${t}${pt ? ' / ' + pt : ''}: captura ${f}${sobresale ? '  ⚠️ algo se sale de la pantalla' : ''}`);
  }
}
console.log(err.length ? 'ERRORES: ' + err.join(' | ') : 'Sin errores de JavaScript');
await b.close();
