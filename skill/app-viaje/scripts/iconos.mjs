// Genera iconos PNG (180, 192, 512) a partir de iconos/icono.svg con Chromium.
// Uso: node iconos.mjs <carpeta_app>
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs'; import path from 'path';
const dir = path.resolve(process.argv[2] || '.');
const svg = fs.readFileSync(path.join(dir, 'iconos', 'icono.svg'), 'utf8');
const b = await chromium.launch();
for (const n of [180, 192, 512]) {
  const p = await b.newPage({ viewport: { width: n, height: n } });
  await p.setContent(`<html><body style="margin:0">${svg.replace('<svg', `<svg width="${n}" height="${n}"`)}</body></html>`);
  await p.screenshot({ path: path.join(dir, 'iconos', `icono-${n}.png`), omitBackground: false });
  await p.close();
}
await b.close();
console.log('Iconos generados en', path.join(dir, 'iconos'));
