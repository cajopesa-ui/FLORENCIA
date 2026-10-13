/* =========================================================
   BRÚJULA y modo "🧭 Guiarme"
   - Un cono en mi punto azul indica hacia dónde miro.
   - Al guiar, una flecha grande apunta al destino: si la flecha
     señala hacia arriba, voy en la dirección buena.
   Usa cosas de app.js: miPos, mapa, marcaYo, buscar, cambiar...
   ========================================================= */

'use strict';

let rumbo = null;            // grados hacia donde miro (0 = norte, 90 = este)
let rumboFuente = null;      // 'brujula' (sensor del móvil) o 'gps' (al caminar)
let ultimaBrujula = 0;       // cuándo llegó el último dato de la brújula
let brujulaActiva = false;
let guia = null;             // destino al que me guía: { clave, nombre, lat, lng, trazado }
let lineaGuia = null;        // línea de puntos de mí al destino
let llegadaAvisada = false;
const DISTANCIA_LLEGADA = 30; // metros

// Dirección (0-360) para ir del punto a al punto b
function rumboHacia(a, b) {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) -
            Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

// ---------- Sensor de brújula ----------

// En iPhone hay que pedir permiso y solo se puede al tocar un botón.
function iniciarBrujula() {
  if (brujulaActiva || !window.DeviceOrientationEvent) return;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then((r) => { if (r === 'granted') escucharBrujula(); })
      .catch(() => { /* hay que pedirlo desde un toque: se reintenta al pulsar 📍 o 🧭 */ });
  } else {
    escucharBrujula();
  }
}

function escucharBrujula() {
  if (brujulaActiva) return;
  brujulaActiva = true;
  if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', alGirar);
  else window.addEventListener('deviceorientation', alGirar);
}

function alGirar(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') {
    h = e.webkitCompassHeading;                       // iPhone: ya viene como rumbo
  } else if ((e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null) {
    h = 360 - e.alpha;                                // Android: alpha va al revés
  } else {
    return;                                           // sin norte de referencia: no sirve
  }
  // Si el móvil está en horizontal, corregir
  const giroPantalla = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  ultimaBrujula = Date.now();
  fijarRumbo((h + giroPantalla + 360) % 360, 'brujula');
}

// Sin brújula (o si no da datos), uso la dirección en la que camino según el GPS
function rumboPorGPS(coords) {
  if (Date.now() - ultimaBrujula < 3000) return;      // la brújula tiene prioridad
  if (coords.heading != null && !isNaN(coords.heading) && (coords.speed ?? 0) > 0.7) {
    fijarRumbo(coords.heading, 'gps');
  }
}

// Suaviza el giro para que la flecha no tiemble
function fijarRumbo(h, fuente) {
  if (rumbo == null) rumbo = h;
  else {
    const diferencia = ((h - rumbo + 540) % 360) - 180;   // camino más corto
    rumbo = (rumbo + diferencia * (fuente === 'gps' ? 1 : 0.25) + 360) % 360;
  }
  rumboFuente = fuente;
  pedirPintarRumbo();
}

let pintarRumboPedido = false;
function pedirPintarRumbo() {
  if (pintarRumboPedido) return;
  pintarRumboPedido = true;
  requestAnimationFrame(() => { pintarRumboPedido = false; pintarRumbo(); });
}

function pintarRumbo() {
  // Cono en mi punto azul (el mapa siempre tiene el norte arriba)
  const cono = marcaYo?.getElement()?.querySelector('.yo-cono');
  if (cono) {
    cono.hidden = rumbo == null;
    if (rumbo != null) cono.style.transform = `rotate(${rumbo}deg)`;
  }
  // Flecha del modo guía
  if (guia && miPos) {
    const destino = puntoDestino();
    const haciaDestino = rumboHacia(miPos, destino);
    const giro = rumbo == null ? haciaDestino : haciaDestino - rumbo;
    $('#guia-flecha').style.transform = `rotate(${giro}deg)`;
  }
}

// ---------- Modo guía ----------

function puntoDestino() {
  if (guia.persona) {                                   // la otra persona: su última posición
    const p = posiciones.find((x) => x.nombre === guia.persona);
    if (p) { guia.lat = p.lat; guia.lng = p.lng; }
  }
  if (guia.trazado) {                                   // calle: su punto más cercano a mí
    const p = puntoMasCercano(miPos, guia.trazado);
    return { lat: p.lat, lng: p.lng };
  }
  return { lat: guia.lat, lng: guia.lng };
}

function guiar(clave) {
  const x = buscar(clave) || hotelPorClave(clave) || personaPorClave(clave);   // lugar, calle, hotel o la otra persona
  if (!x) return;
  iniciarBrujula();                                     // estamos dentro de un toque: vale para iPhone
  cerrarVentana();
  cerrarChat();
  guia = { clave, nombre: x.nombre, lat: x.lat, lng: x.lng, trazado: x.clase === 'calle' ? x.trazado : null, persona: x.persona || null };
  llegadaAvisada = false;
  $('#guia').hidden = false;
  $('#guia-visto').hidden = true;
  $('#app').classList.add('guiando');
  if (miPos) {
    const d = puntoDestino();
    mapa.fitBounds([[miPos.lat, miPos.lng], [d.lat, d.lng]], { paddingTopLeft: [40, 170], paddingBottomRight: [40, $('#panel').offsetHeight + 30], maxZoom: 18 });
  } else if (x.lat) {
    mapa.setView([x.lat, x.lng], 17);
  }
  actualizarGuia();
}

function terminarGuia() {
  guia = null;
  $('#guia').hidden = true;
  $('#app').classList.remove('guiando');
  if (lineaGuia) { lineaGuia.remove(); lineaGuia = null; }
}

// Se llama al moverme y al abrir la guía
function actualizarGuia() {
  if (!guia) return;
  $('#guia-nombre').textContent = guia.nombre;
  if (!miPos) {
    $('#guia-dist').textContent = 'Esperando tu posición GPS…';
    $('#guia-nota').textContent = '';
    return;
  }
  const destino = puntoDestino();
  const metros = distancia(miPos, destino);
  const tramo = [[miPos.lat, miPos.lng], [destino.lat, destino.lng]];
  if (!lineaGuia) lineaGuia = L.polyline(tramo, { color: '#111827', weight: 3, dashArray: '4 8', opacity: .7, interactive: false }).addTo(mapa);
  else lineaGuia.setLatLngs(tramo);

  if (metros <= DISTANCIA_LLEGADA) {
    $('#guia-dist').textContent = guia.persona ? '🎉 ¡Os habéis encontrado!' : '🎉 ¡Has llegado!';
    const yaVisto = guia.persona || guia.clave.startsWith('hotel:') || buscar(guia.clave)?.visitado;   // un hotel o una persona no se marcan
    $('#guia-visto').hidden = !!yaVisto;
    if (!llegadaAvisada) { llegadaAvisada = true; if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
  } else {
    $('#guia-dist').textContent = `${textoDistancia(metros)} a pie`;
    $('#guia-visto').hidden = true;
    if (metros > DISTANCIA_LLEGADA * 2) llegadaAvisada = false;
  }
  $('#guia-nota').textContent = rumboFuente === 'brujula'
    ? 'Si la flecha apunta hacia arriba, vas bien'
    : (rumboFuente === 'gps'
      ? 'Flecha según la dirección en la que caminas'
      : 'Sin brújula: la flecha indica la dirección en el mapa (norte arriba). Camina unos pasos.');
  if (guia.persona) {                                   // aviso si su posición es antigua
    const p = posiciones.find((x) => x.nombre === guia.persona);
    const min = p ? (Date.now() - new Date(p.actualizado).getTime()) / 60000 : Infinity;
    if (min > 10) $('#guia-nota').textContent = `⚠️ Su posición es de ${p ? haceCuanto(p.actualizado) : 'hace rato'}: puede que ya no esté ahí.`;
  }
  pintarRumbo();
}

// ---------- Botones ----------

document.addEventListener('click', (e) => {
  const boton = e.target.closest('[data-guiar]');
  if (boton) { e.preventDefault(); guiar(boton.dataset.guiar); }
});

function iniciarGuiaBotones() {
  $('#guia-cerrar').onclick = terminarGuia;
  $('#guia-visto').onclick = () => {
    if (guia) cambiar(guia.clave, { visitado: true });
    mostrarToast('Marcado como visitado ✔');
    terminarGuia();
  };
  // Tocar la flecha centra el mapa en mí y en el destino
  $('#guia-flecha').onclick = () => { if (guia) guiar(guia.clave); };
  // En Android no hace falta permiso: la brújula puede empezar ya
  if (!(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function')) iniciarBrujula();
}
