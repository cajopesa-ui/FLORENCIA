/* =========================================================
   ESQUEMA DEL VIAJE (sale en la pestaña "Todo")
   - Tarjetas de los 8 días: tocar una lleva a ese día.
   - Hoteles: tocar uno lleva el mapa a su zona.
   - En el mapa: la ruta de cada día con su color y los 🏨 hoteles;
     tocar una ruta enseña el día y un botón "Ver día".
   Usa cosas de app.js: DATOS, diaSel, mapa, capa, pintar, diaInfo...
   ========================================================= */

'use strict';

function colorEsquema(d) {
  return d.color || (DATOS.dias.find((x) => x.fecha === d.fecha) || {}).color || '#475569';
}

// HTML que va arriba de la lista en "Todo"
function htmlEsquema() {
  const E = DATOS.esquema;
  if (!E) return '';
  const hoy = ahora().fecha;
  const hotel = (id) => E.hoteles.find((h) => h.id === id);
  const tarjetas = E.dias.map((d) => {
    const enApp = DATOS.dias.some((x) => x.fecha === d.fecha);
    const [sem, num] = d.corto.split(' ');
    return `<button class="esq-dia ${d.fecha === hoy ? 'hoy' : ''}" style="--c:${colorEsquema(d)}" data-esq-dia="${d.fecha}" aria-label="${esc(d.corto + ' · ' + d.zona)}">
        <span class="esq-fecha"><b>${esc(sem)}</b> ${esc(num)}${d.fecha === hoy ? ' · HOY' : ''}</span>
        <span class="esq-zona">${esc(d.zona)}</span>
        <span class="esq-res">${esc(d.resumen)}</span>
        <span class="esq-pie">${d.icono} ${esc(d.modo)}${d.noche ? ` · 🏨 ${esc(hotel(d.noche).nombre)}` : ''}${enApp ? '' : ' ›'}</span>
      </button>`;
  }).join('');
  const hoteles = E.hoteles.map((h) => `
      <button class="esq-hotel" data-esq-hotel="${h.id}">
        <b>🏨 ${esc(h.nombre)}</b> <span>${esc(h.noches)}</span>
        <small>${esc(h.zona)}</small>
        <ul>${h.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </button>`).join('');
  return `
    <section class="esquema">
      <h3 class="esq-titulo">🗺️ ${esc(E.titulo)}</h3>
      <p class="consejo" style="margin-top:0">${esc(E.subtitulo)}. Toca un día para verlo.</p>
      <div class="esq-dias">${tarjetas}</div>
      <h3>Noches de hotel</h3>
      <div class="esq-hoteles">${hoteles}</div>
      <details class="consejos"><summary>💡 Por qué este reparto</summary>
        ${E.porque.map((p) => `<p class="consejo">• ${esc(p)}</p>`).join('')}
      </details>
    </section>`;
}

// Rutas de cada día y hoteles, en el mapa de "Todo"
function pintarEsquemaMapa() {
  const E = DATOS.esquema;
  if (!E || diaSel !== 'todo') return;
  for (const d of E.dias) {
    if (!d.ruta) continue;
    const color = colorEsquema(d);
    const linea = L.polyline(d.ruta, { color, weight: 5, opacity: .75, dashArray: d.tren ? '3 10' : null, lineCap: 'round' });
    const toque = L.polyline(d.ruta, { weight: 24, opacity: 0 });
    const popup = `<div class="esq-popup"><b style="color:${color}">${esc(d.corto)} · ${esc(d.zona)}</b><br>${esc(d.rutaTexto || d.resumen)}<br>
      <button class="btn btn-principal" data-esq-dia="${d.fecha}">${DATOS.dias.some((x) => x.fecha === d.fecha) ? 'Ver día' : 'Ver detalles'}</button></div>`;
    // Que la ventanita no quede debajo de los botones flotantes ni del panel
    const opciones = { autoPanPaddingTopLeft: [20, 20], autoPanPaddingBottomRight: [80, $('#panel').offsetHeight + 20] };
    linea.bindPopup(popup, opciones); toque.bindPopup(popup, opciones);
    capa.addLayer(linea).addLayer(toque);
  }
  for (const h of E.hoteles) {
    const icono = L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 17], html: '<div class="esq-hotel-marca">🏨</div>' });
    const m = L.marker([h.lat, h.lng], { icon: icono, zIndexOffset: 1500, title: `Hotel en ${h.nombre}` });
    m.bindTooltip(`${esc(h.nombre)} · ${esc(h.noches.split(' (')[0])}`, { permanent: true, direction: 'top', offset: [0, -16], className: 'etq-hotel' });
    m.bindPopup(`<div class="esq-popup"><b>🏨 ${esc(h.nombre)} · ${esc(h.noches)}</b><br>${esc(h.zona)}<ul>${h.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`);
    capa.addLayer(m);
  }
}

// Martes 24 (no tiene pestaña): ventana con la vuelta
function abrirDiaSinPestana(d) {
  const destino = d.ruta ? d.ruta[d.ruta.length - 1] : null;
  abrirVentana(`
    <h2>${d.icono} ${esc(d.corto)} · ${esc(d.zona)}</h2>
    <p class="tipo">${esc(d.resumen)}.</p>
    ${destino ? `<a class="btn btn-principal" style="width:100%" href="${urlComoLlegar(destino[0], destino[1], 'driving')}" target="_blank" rel="noopener">🚗 Ir a Florencia</a>` : ''}
    <p class="consejo" style="margin-top:12px">Reposta antes de devolver el coche si el contrato lo pide.</p>
  `);
}

document.addEventListener('click', (e) => {
  const dia = e.target.closest('[data-esq-dia]');
  if (dia) {
    const fecha = dia.dataset.esqDia;
    mapa.closePopup();
    if (DATOS.dias.some((x) => x.fecha === fecha)) {
      diaSel = fecha;
      delete parteElegida[fecha];
      pintar();
      setTimeout(verDiaEnMapa, 60);
    } else {
      const d = DATOS.esquema.dias.find((x) => x.fecha === fecha);
      if (d) abrirDiaSinPestana(d);
    }
    return;
  }
  const hotel = e.target.closest('[data-esq-hotel]');
  if (hotel) {
    const h = DATOS.esquema.hoteles.find((x) => x.id === hotel.dataset.esqHotel);
    if (h) { seguir = false; mapa.setView([h.lat, h.lng], 14); }
  }
});
