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

// El panel se repinta solo (cada pocos segundos): recordar si "Por qué este reparto" está abierto
let porqueAbierto = false;
document.addEventListener('toggle', (e) => {
  if (e.target.classList?.contains('esq-porque')) porqueAbierto = e.target.open;
}, true);

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
        ${h.hotel ? `<small><b class="esq-hotel-nombre">${esc(h.hotel)} <span class="estrellas">${'★'.repeat(h.estrellas || 0)}</span></b>${esc(h.direccion)}</small>` : `<small>${esc(h.zona)}</small>`}
        <ul>${h.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </button>`).join('');
  return `
    <section class="esquema">
      <h3 class="esq-titulo">🗺️ ${esc(E.titulo)}</h3>
      <p class="consejo" style="margin-top:0">${esc(E.subtitulo)}. Toca un día para verlo.</p>
      <div class="esq-dias">${tarjetas}</div>
      <h3>Noches de hotel</h3>
      <div class="esq-hoteles">${hoteles}</div>
      <details class="consejos esq-porque" ${porqueAbierto ? 'open' : ''}><summary>💡 Por qué este reparto</summary>
        ${E.porque.map((p) => `<p class="consejo">• ${esc(p)}</p>`).join('')}
      </details>
    </section>`;
}

// Rutas de cada día y hoteles, en el mapa de "Todo"
function pintarEsquemaMapa() {
  const E = DATOS.esquema;
  if (!E || diaSel !== 'todo') return;
  vigilarZoomEsquema();
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
  // Nombres de los hoteles y de cada pueblo del viaje. Cada etiqueta se coloca en el primer
  // lado libre (los hoteles primero); si no cabe, aparece al acercar el mapa.
  // Tocar un pueblo = ir a ese día y ese pueblo.
  const nombreCorto = { oliveto: 'Monte Oliveto', sanquirico: 'San Quirico' };
  const conHotel = new Set(E.hoteles.map((h) => h.nombre));   // Siena: ya lo dice la etiqueta de su hotel
  const aqui = sitioDondeEstoy();               // pueblo donde estoy según el GPS
  const etiquetas = [];
  for (const h of E.hoteles) {
    etiquetas.push({ tipo: 'hotel', h, lat: h.lat, lng: h.lng, radio: 17, ancho: 7.2, alto: 21, extra: 16,
      texto: `${h.nombre === aqui ? '📍 ' : ''}${h.nombre} · ${h.noches.split(' (')[0]}`, aqui: h.nombre === aqui });
  }
  for (const p of E.puntos || []) {           // ✈️ aeropuerto, donde se recoge y devuelve el coche
    etiquetas.push({ tipo: 'punto', p, lat: p.lat, lng: p.lng, radio: 7, ancho: 7, alto: 19, extra: 14, texto: `${p.icono} ${p.nombre}` });
  }
  for (const d of DATOS.dias) {
    for (const pt of d.partes || []) {
      etiquetas.push({ tipo: 'pueblo', d, pt, lat: pt.lat, lng: pt.lng, radio: 7, ancho: 7, alto: 19, extra: 14,
        texto: conHotel.has(pt.nombre) ? '' : (pt.nombre === aqui ? '📍 ' : '') + (nombreCorto[pt.id] || pt.nombre),
        aqui: pt.nombre === aqui && !conHotel.has(pt.nombre) });
    }
  }
  const sitios = colocarEtiquetas(etiquetas);
  etiquetas.forEach((e, i) => {
    const sitio = sitios[i];
    if (e.tipo === 'hotel') {
      const m = marcaHotel(e.h, e.aqui);
      if (sitio) capa.addLayer(marcaTexto(e, sitio, 'etq-hotel-txt' + (e.aqui ? ' aqui' : '')).on('click', () => abrirHotel(e.h)));
    } else if (e.tipo === 'punto') {
      const { p } = e;
      const icono = L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: '<div class="esq-pueblo" style="background:#475569"></div>' });
      const abrir = () => abrirVentana(`<h2>${p.icono} ${esc(p.titulo)}</h2><ul class="hotel-notas">${p.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        <div class="fila-botones"><a class="btn btn-principal" href="${urlComoLlegar(p.lat, p.lng, 'driving')}" target="_blank" rel="noopener">🚗 Cómo llegar</a></div>`);
      capa.addLayer(L.marker([p.lat, p.lng], { icon: icono, zIndexOffset: 1200, title: p.titulo }).on('click', abrir));
      if (sitio) capa.addLayer(marcaTexto(e, sitio, 'etq-pueblo-txt').on('click', abrir));
    } else {
      const { d, pt } = e;
      const icono = L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: `<div class="esq-pueblo ${e.aqui ? 'aqui' : ''}" style="background:${d.color}"></div>` });
      const m = L.marker([e.lat, e.lng], { icon: icono, zIndexOffset: 1200, title: `${pt.nombre} · ${d.corto}` });
      m.on('click', () => irAPueblo(d.fecha, pt.id));
      capa.addLayer(m);
      if (sitio) capa.addLayer(marcaTexto(e, sitio, 'etq-pueblo-txt' + (e.aqui ? ' aqui' : '')).on('click', () => irAPueblo(d.fecha, pt.id)));
    }
  });
}

// ---------- Hoteles ----------
// El 🏨 sale en "Todo" y también en el mapa de cada día (el hotel de la noche anterior y el de esa noche).
// Tocarlo abre su ficha: nombre, estrellas, dirección, horas de entrada y salida, Guiarme y cómo llegar.

function fichaHotel(h) {
  const titulo = h.hotel ? `${esc(h.hotel)} <span class="estrellas">${'★'.repeat(h.estrellas || 0)}</span>` : `Hotel en ${esc(h.nombre)}`;
  const dist = miPos ? distancia(miPos, h) : null;
  return `
    <h2>🏨 ${titulo}</h2>
    <p class="tipo">${esc(h.nombre)} · ${esc(h.noches)}${h.fechas ? ' · ' + esc(h.fechas) : ''}</p>
    ${dist != null ? `<div class="dato"><span class="etq">Desde donde estás</span>${esc(textoDistancia(dist))}</div>` : ''}
    <div class="dato"><span class="etq">Dirección</span>${esc(h.direccion || h.zona)}</div>
    ${h.entrada ? `<div class="dos"><div class="dato"><span class="etq">🔑 Entrada</span>${esc(h.entrada)}</div><div class="dato"><span class="etq">🚪 Salida</span>${esc(h.salida)}</div></div>` : ''}
    <div class="dato"><span class="etq">Notas</span><ul class="hotel-notas">${h.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
    <div class="fila-botones">
      <button class="btn btn-principal" data-guiar="hotel:${esc(h.id)}">🧭 Guiarme</button>
      <a class="btn" href="${urlComoLlegar(h.lat, h.lng, 'driving')}" target="_blank" rel="noopener">🚗 En coche</a>
      <a class="btn" href="${urlComoLlegar(h.lat, h.lng, 'walking')}" target="_blank" rel="noopener">🚶 A pie</a>
    </div>`;
}
function abrirHotel(h) { abrirVentana(fichaHotel(h)); }

// Para "Guiarme" hasta un hotel (clave "hotel:siena")
function hotelPorClave(clave) {
  if (!String(clave).startsWith('hotel:')) return null;
  const h = DATOS.esquema?.hoteles.find((x) => x.id === clave.slice(6));
  return h ? { nombre: h.hotel || `Hotel en ${h.nombre}`, lat: h.lat, lng: h.lng, clase: 'hotel' } : null;
}

function marcaHotel(h, aqui = false) {
  const icono = L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 17], html: '<div class="esq-hotel-marca">🏨</div>' });
  const m = L.marker([h.lat, h.lng], { icon: icono, zIndexOffset: 1500, title: h.hotel || `Hotel en ${h.nombre}` });
  if (aqui) m.on('add', () => m.getElement()?.querySelector('.esq-hotel-marca')?.classList.add('aqui'));
  m.on('click', () => abrirHotel(h));
  capa.addLayer(m);
  return m;
}

// Mapa de un día: el hotel donde has dormido y el de esa noche (si es otro)
function pintarHotelesDia() {
  const E = DATOS.esquema;
  if (!E || diaSel === 'todo') return;
  const i = E.dias.findIndex((d) => d.fecha === diaSel);
  if (i < 0) return;
  const ids = new Set([E.dias[i - 1]?.noche, E.dias[i].noche].filter(Boolean));
  for (const id of ids) {
    const h = E.hoteles.find((x) => x.id === id);
    if (h) marcaHotel(h);
  }
}

// Un nombre en el mapa: un marcador de solo texto colocado al lado elegido de su punto
function marcaTexto(e, sitio, clase) {
  const g = e.radio + 1;
  const mover = {
    right: `translate(${g}px, calc(-50% + ${sitio.dy}px))`,
    left: `translate(calc(-100% - ${g}px), calc(-50% + ${sitio.dy}px))`,
    top: `translate(-50%, calc(-100% - ${g}px))`,
    bottom: `translate(-50%, ${g}px)`
  }[sitio.lado];
  const icono = L.divIcon({ className: '', iconSize: [0, 0], iconAnchor: [0, 0],
    html: `<span class="${clase}" style="transform:${mover}">${esc(e.texto)}</span>` });
  return L.marker([e.lat, e.lng], { icon: icono, zIndexOffset: 1100, keyboard: false });
}

// Elige para cada etiqueta el primer lado libre (4 lados y 4 diagonales) que no choca con
// otra etiqueta ni con un punto. Primero los hoteles; luego los pueblos con más vecinos cerca
// (son los que menos sitio tienen). Devuelve { lado, dy } o null si no cabe.
function colocarEtiquetas(items) {
  const t = 2;   // tolerancia en píxeles: rozarse por un borde no cuenta como choque
  const choca = (a, b) => a.x + t < b.x + b.w && b.x + t < a.x + a.w && a.y + t < b.y + b.h && b.y + t < a.y + a.h;
  const pts = items.map((it) => mapa.latLngToContainerPoint([it.lat, it.lng]));
  const ocupado = items.map((it, i) => ({ x: pts[i].x - it.radio, y: pts[i].y - it.radio, w: it.radio * 2, h: it.radio * 2 }));
  // Zonas prohibidas: botones flotantes (💬 👥 📍) y el panel de abajo; y no salirse del mapa
  const caja = $('#mapa').getBoundingClientRect();
  for (const b of document.querySelectorAll('.flotante:not([hidden]), #panel')) {
    const r = b.getBoundingClientRect();
    if (r.width) ocupado.push({ x: r.left - caja.left - 4, y: r.top - caja.top - 4, w: r.width + 8, h: r.height + 8 });
  }
  const dentro = (r) => r.x >= 2 && r.y >= 2 && r.x + r.w <= caja.width - 2 && r.y + r.h <= caja.height - 2;
  const vecinos = pts.map((p) => pts.filter((q) => q !== p && Math.hypot(p.x - q.x, p.y - q.y) < 70).length);
  const prioridad = (it) => (it.aqui ? -2 : 0) + (it.tipo === 'hotel' ? -1 : 0);   // primero donde estoy, luego hoteles
  const orden = items.map((_, i) => i).sort((a, b) => prioridad(items[a]) - prioridad(items[b]) || vecinos[b] - vecinos[a]);
  const res = new Array(items.length).fill(null);
  for (const i of orden) {
    const it = items[i], p = pts[i];
    if (!it.texto) continue;
    const grande = it.aqui ? 1 : 0;   // la etiqueta de donde estoy es algo mayor
    const w = it.texto.length * (it.ancho + grande) + it.extra + grande * 10, h = it.alto + grande * 5, g = it.radio + 1;
    const opciones = [['right', 0], ['left', 0], ['top', 0], ['bottom', 0], ['right', -13], ['right', 13], ['left', -13], ['left', 13],
      ['right', -24], ['right', 24], ['left', -24], ['left', 24]];
    for (const [lado, dy] of opciones) {
      const x = { right: p.x + g, left: p.x - g - w, top: p.x - w / 2, bottom: p.x - w / 2 }[lado];
      const y = { right: p.y - h / 2, left: p.y - h / 2, top: p.y - g - h, bottom: p.y + g }[lado] + dy;
      const r = { x, y, w, h };
      if (dentro(r) && !ocupado.some((o) => choca(o, r))) { ocupado.push(r); res[i] = { lado, dy }; break; }
    }
  }
  return res;
}

// Al acercar o alejar el mapa de "Todo", recolocar los nombres
let zoomEsquemaListo = false;
function vigilarZoomEsquema() {
  if (zoomEsquemaListo || !mapa) return;
  zoomEsquemaListo = true;
  // Esperar a que acabe la animación del zoom antes de redibujar (si no, quedan nombres repetidos)
  let espera = null;
  mapa.on('zoomstart', () => clearTimeout(espera));
  mapa.on('zoomend', () => {
    clearTimeout(espera);
    espera = setTimeout(() => { if (diaSel === 'todo') pintar(); }, 250);
  });
}

function irAPueblo(fecha, parte) {
  mapa.closePopup();
  diaSel = fecha;
  parteElegida[fecha] = parte;
  pintar();
  setTimeout(verDiaEnMapa, 60);
}

// Martes 24 (no tiene pestaña): ventana con la vuelta
function abrirDiaSinPestana(d) {
  const destino = d.ruta ? d.ruta[d.ruta.length - 1] : null;
  abrirVentana(`
    <h2>${d.icono} ${esc(d.corto)} · ${esc(d.zona)}</h2>
    <p class="tipo">${esc(d.resumen)}.</p>
    ${destino ? `<a class="btn btn-principal" style="width:100%" href="${urlComoLlegar(destino[0], destino[1], 'driving')}" target="_blank" rel="noopener">🚗 Ir al aeropuerto de Florencia</a>` : ''}
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
    if (h) { seguir = false; mapa.setView([h.lat, h.lng], 14); abrirHotel(h); }
  }
});
