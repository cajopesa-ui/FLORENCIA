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
        <span class="esq-fecha"><b>${esc(sem)}</b> ${esc(num)}${d.fecha === hoy ? ' · HOY' : ''}${iconoTiempoDia(d.fecha)}</span>
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
      ${(E.vuelos || []).length || E.coche ? `<h3>Vuelos y coche</h3><div class="esq-hoteles">${(E.vuelos || []).map((v) => `
      <button class="esq-hotel" data-esq-vuelo="${v.id}">
        <b>✈️ ${esc(v.tipo)}</b> <span>${esc(diaCorto(v.fecha))} · ${esc(v.numero)}</span>
        <small><b class="esq-hotel-nombre">${esc(v.sale.iata)} ${esc(v.sale.hora)} → ${esc(v.llega.iata)} ${esc(v.llega.hora)}</b>${esc(v.compania)}</small>
      </button>`).join('')}${E.coche ? `
      <button class="esq-hotel" data-esq-coche="1">
        <b>🚗 Coche</b> <span>${esc(E.coche.compania)}</span>
        <small><b class="esq-hotel-nombre">${esc(diaCorto(E.coche.recogida.fecha))} ${esc(E.coche.recogida.hora)} → ${esc(diaCorto(E.coche.devolucion.fecha))} ${esc(E.coche.devolucion.hora)}</b>${esc(E.coche.grupo)}</small>
      </button>` : ''}</div>` : ''}
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
  const conHotel = new Set(E.hoteles.map((h) => h.nombre));   // Siena: ya lo dice la etiqueta de su hotel
  const aqui = sitioDondeEstoy();               // pueblo donde estoy según el GPS
  const etiquetas = [];
  for (const h of E.hoteles) {
    etiquetas.push({ tipo: 'hotel', h, lat: h.lat, lng: h.lng, radio: 17, ancho: 7.2, alto: 21, extra: 16,
      texto: `${h.nombre === aqui ? '📍 ' : ''}${h.nombre} · ${h.noches.split(' (')[0]}`, aqui: h.nombre === aqui });
  }
  for (const p of E.puntos || []) {           // ✈️ aeropuerto, donde se recoge y devuelve el coche
    if (p.oculto) continue;                  // p. ej. la oficina del coche: solo para Guiarme
    etiquetas.push({ tipo: 'punto', p, lat: p.lat, lng: p.lng, radio: 7, ancho: 7, alto: 19, extra: 14, texto: `${p.icono} ${p.nombre}` });
  }
  for (const d of DATOS.dias) {
    for (const pt of d.partes || []) {
      etiquetas.push({ tipo: 'pueblo', d, pt, lat: pt.lat, lng: pt.lng, radio: 7, ancho: 7, alto: 19, extra: 14,
        texto: conHotel.has(pt.nombre) ? '' : (pt.nombre === aqui ? '📍 ' : '') + (pt.etiqueta || pt.nombre),
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

// ---------- Vuelos ----------
// Lo público (número, horas, aeropuertos) va en datos/viaje.json.
// Lo privado (pasajeros, equipaje, localizador) va en la base de datos, clave "privado:vuelos":
// solo llega al móvil después de entrar con el código.
function diaCorto(fecha) {
  const d = DATOS.dias.find((x) => x.fecha === fecha) || (DATOS.esquema.dias || []).find((x) => x.fecha === fecha);
  return d ? d.corto : fecha;
}

function abrirVuelo(id) {
  const v = (DATOS.esquema.vuelos || []).find((x) => x.id === id);
  if (!v) return;
  const ap = (DATOS.esquema.puntos || []).find((p) => p.id === 'aeropuerto');
  const priv = estadoActual()['privado:vuelos'];
  const reserva = priv ? `
    <div class="dato"><span class="etq">🔒 Pasajeros y equipaje</span>
      ${(priv.pasajeros || []).map((p) => `<b>${esc(p.nombre)}</b><ul class="hotel-notas">${(p.equipaje || []).map((q) => `<li>${esc(q)}</li>`).join('')}</ul>`).join('')}
      ${priv.asientos ? `<div>${esc(priv.asientos)}</div>` : ''}
    </div>
    <label class="campo">🔒 Localizador de la reserva
      <input id="vuelo-localizador" maxlength="20" autocomplete="off" value="${esc(priv.localizador || '')}" placeholder="Escríbelo aquí">
    </label>
    <button class="btn" id="vuelo-guardar" style="width:100%">💾 Guardar localizador</button>
    <p class="consejo">Estos datos solo se ven después de entrar con el código.</p>`
    : '<p class="consejo">🔒 Los datos de la reserva (pasajeros, equipaje, localizador) salen al entrar con el código y con conexión.</p>';
  abrirVentana(`
    <h2>✈️ ${esc(v.tipo)} · ${esc(v.numero)}</h2>
    <p class="tipo">${esc(v.compania)} · ${esc(diaCorto(v.fecha))}</p>
    <div class="dos">
      <div class="dato"><span class="etq">🛫 Sale</span>${esc(v.sale.iata)} ${esc(v.sale.ciudad)}<br><b>${esc(v.sale.hora)}</b></div>
      <div class="dato"><span class="etq">🛬 Llega</span>${esc(v.llega.iata)} ${esc(v.llega.ciudad)}<br><b>${esc(v.llega.hora)}</b></div>
    </div>
    ${v.notas?.length ? `<div class="dato"><span class="etq">Notas</span><ul class="hotel-notas">${v.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
    <div class="fila-botones">
      <a class="btn btn-principal" href="https://www.flightradar24.com/data/flights/${encodeURIComponent(v.numero.toLowerCase())}" target="_blank" rel="noopener">📡 Estado del vuelo</a>
      ${ap ? `<button class="btn" data-guiar="punto:${esc(ap.id)}">🧭 Guiarme</button>
      <a class="btn" href="${urlComoLlegar(ap.lat, ap.lng, 'driving')}" target="_blank" rel="noopener">🚗 Aeropuerto</a>` : ''}
    </div>
    ${reserva}`);
}

// Coche de alquiler: lo público en esquema.coche; bono, conductor y precio en "privado:coche"
function abrirCoche() {
  const c = DATOS.esquema.coche;
  if (!c) return;
  const of = (DATOS.esquema.puntos || []).find((p) => p.id === 'coche');
  const priv = estadoActual()['privado:coche'];
  const filas = priv ? Object.entries({ Bono: priv.bono, Conductor: priv.conductor, 'Conductor adicional': priv.adicional, Tarifa: priv.tarifa, Precio: priv.precio })
    .filter(([, v]) => v).map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join('') : '';
  abrirVentana(`
    <h2>🚗 ${esc(c.compania)}</h2>
    <p class="tipo">${esc(c.grupo)}</p>
    <div class="dos">
      <div class="dato"><span class="etq">🔑 Recogida</span>${esc(diaCorto(c.recogida.fecha))} · <b>${esc(c.recogida.hora)}</b><br>${esc(c.recogida.lugar)}</div>
      <div class="dato"><span class="etq">↩️ Devolución</span>${esc(diaCorto(c.devolucion.fecha))} · <b>${esc(c.devolucion.hora)}</b><br>${esc(c.devolucion.lugar)}</div>
    </div>
    <div class="dato"><span class="etq">Incluye</span><ul class="hotel-notas">${c.incluye.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
    <div class="dato"><span class="etq">Notas</span><ul class="hotel-notas">${c.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
    ${of ? `<div class="fila-botones">
      <button class="btn btn-principal" data-guiar="punto:coche">🧭 Guiarme</button>
      <a class="btn" href="${urlComoLlegar(of.lat, of.lng, 'walking')}" target="_blank" rel="noopener">🚶 A pie</a>
      <a class="btn" href="${urlComoLlegar(of.lat, of.lng, 'driving')}" target="_blank" rel="noopener">🚗 En coche</a>
    </div>` : ''}
    ${c.telefono ? `<a class="btn" style="width:100%;margin-top:8px" href="tel:${esc(c.telefono)}">📞 Llamar a ${esc(c.compania)} · ${esc(c.telefonoTexto || c.telefono)}</a>` : ''}
    ${priv ? `<div class="dato"><span class="etq">🔒 Datos de la reserva</span><ul class="hotel-notas">${filas}</ul></div>
      <p class="consejo">Estos datos solo se ven después de entrar con el código.</p>`
      : '<p class="consejo">🔒 El bono, el conductor y el precio salen al entrar con el código y con conexión.</p>'}`);
}

// Para "Guiarme" hasta un punto del esquema (clave "punto:aeropuerto")
function puntoPorClave(clave) {
  if (!String(clave).startsWith('punto:')) return null;
  const p = (DATOS.esquema?.puntos || []).find((x) => x.id === clave.slice(6));
  return p ? { nombre: p.titulo || p.nombre, lat: p.lat, lng: p.lng, clase: 'punto' } : null;
}

// Aviso arriba en el día de un vuelo (p. ej. la llegada)
function pintarVueloDia() {
  const caja = $('#vuelo-dia');
  if (!caja) return;
  const v = diaSel && diaSel !== 'todo' ? (DATOS.esquema?.vuelos || []).find((x) => x.fecha === diaSel) : null;
  caja.innerHTML = v ? `<button class="tiempo vuelo-dia" data-esq-vuelo="${v.id}">✈️ <b>${esc(v.numero)}</b> · ${esc(v.sale.iata)} ${esc(v.sale.hora)} → ${esc(v.llega.iata)} ${esc(v.llega.hora)} <span class="tiempo-nota">· toca para ver el vuelo</span></button>` : '';
}

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

// Día del esquema sin pestaña (p. ej. la vuelta): ventana con su ruta
function abrirDiaSinPestana(d) {
  const destino = d.ruta ? d.ruta[d.ruta.length - 1] : null;
  const vuelo = (DATOS.esquema.vuelos || []).find((v) => v.fecha === d.fecha);
  abrirVentana(`
    <h2>${d.icono} ${esc(d.corto)} · ${esc(d.zona)}</h2>
    <p class="tipo">${esc(d.resumen)}.</p>
    ${destino ? `<a class="btn btn-principal" style="width:100%" href="${urlComoLlegar(destino[0], destino[1], 'driving')}" target="_blank" rel="noopener">🚗 ${esc(d.irTexto || 'Cómo llegar')}</a>` : ''}
    ${vuelo ? `<button class="btn" style="width:100%;margin-top:8px" data-esq-vuelo="${vuelo.id}">✈️ Ver el vuelo ${esc(vuelo.numero)}</button>` : ''}
    ${d.nota ? `<p class="consejo" style="margin-top:12px">${esc(d.nota)}</p>` : ''}
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
  if (e.target.closest('[data-esq-coche]')) { abrirCoche(); return; }
  const vuelo = e.target.closest('[data-esq-vuelo]');
  if (vuelo) { abrirVuelo(vuelo.dataset.esqVuelo); return; }
  const guardarLoc = e.target.closest('#vuelo-guardar');
  if (guardarLoc) {
    cambiar('privado:vuelos', { localizador: $('#vuelo-localizador').value.trim().slice(0, 20) });
    mostrarToast('Localizador guardado 🔒');
    return;
  }
  const hotel = e.target.closest('[data-esq-hotel]');
  if (hotel) {
    const h = DATOS.esquema.hoteles.find((x) => x.id === hotel.dataset.esqHotel);
    if (h) { seguir = false; mapa.setView([h.lat, h.lng], 14); abrirHotel(h); }
  }
});
