/* =========================================================
   FLORENCIA · app del viaje (17-19 de noviembre)
   ---------------------------------------------------------
   - Los lugares, calles y transporte vienen de datos/florencia.json
   - Los cambios (visitado, notas, horas, lugares nuevos) y la
     posición GPS se guardan en Supabase, compartidos entre los dos.
   - Si no hay cobertura, los cambios esperan en el móvil y se
     envían solos cuando vuelve la conexión.
   ========================================================= */

'use strict';

// ---------- Utilidades pequeñas ----------

const $ = (sel) => document.querySelector(sel);

// Escapa texto para meterlo en HTML sin riesgos (las notas las escribe la gente).
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// localStorage puede fallar (modo privado, etc.): siempre con try/catch.
const almacen = {
  leer(clave, porDefecto) {
    try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : porDefecto; }
    catch { return porDefecto; }
  },
  guardar(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin espacio o bloqueado */ }
  },
  borrar(clave) {
    try { localStorage.removeItem(clave); } catch { /* nada */ }
  }
};

// Fecha y hora actuales EN FLORENCIA (aunque el móvil tenga otra zona horaria).
function ahora() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute) };
}

const aMinutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// Distancia en metros entre dos puntos {lat, lng}.
function distancia(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Punto de una calle (varias líneas) más cercano a "p", y su distancia.
function puntoMasCercano(p, trazado) {
  const kx = Math.cos(p.lat * Math.PI / 180) * 111320, ky = 110540;
  let mejor = { d: Infinity, lat: 0, lng: 0 };
  for (const linea of trazado) {
    for (let i = 0; i < linea.length; i++) {
      const a = linea[i], b = linea[Math.min(i + 1, linea.length - 1)];
      const ax = (a[1] - p.lng) * kx, ay = (a[0] - p.lat) * ky;
      const bx = (b[1] - p.lng) * kx, by = (b[0] - p.lat) * ky;
      const dx = bx - ax, dy = by - ay, largo = dx * dx + dy * dy;
      const t = largo ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo)) : 0;
      const x = ax + t * dx, y = ay + t * dy, d = Math.hypot(x, y);
      if (d < mejor.d) mejor = { d, lat: p.lat + y / ky, lng: p.lng + x / kx };
    }
  }
  return mejor;
}

function textoDistancia(m) {
  if (m == null) return '';
  if (m > 50000) return `${Math.round(m / 1000)} km (estás lejos)`;
  const aPie = Math.max(1, Math.round(m * 1.3 / 80)); // ~4,8 km/h y calles no rectas
  const d = m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  return `${d} · ${aPie} min`;
}

function haceCuanto(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

function urlComoLlegar(lat, lng, modo = 'walking') {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${modo}`;
}

// ---------- Estado de la app ----------

let DATOS = null;                                   // contenido de florencia.json
let sesion = almacen.leer('flo-sesion', null);      // { nombre, codigo }
let servidor = {};                                  // cambios guardados en Supabase
let posiciones = [];                                // posiciones GPS de los dos
let pendientes = almacen.leer('flo-pendientes', []); // cambios aún sin enviar
let miPos = null;                                   // mi posición GPS
let diaSel = null;                                  // fecha seleccionada o 'todo'
const parteElegida = {};
let consejosAbiertos = false;                       // el desplegable de consejos                            // días con dos ciudades: { fecha: 'pisa' } elegido a mano
let seguir = false;                                 // el mapa sigue mi posición
let ultimaLectura = 0;                              // ms de la última lectura correcta
const avisadas = new Set();                         // calles ya avisadas por cercanía
let ajustes = Object.assign({
  opcionales: true, imprescindibles: true, fuera: true, ocultarVistos: false, avisoCalles: true, plegado: false
}, almacen.leer('flo-ajustes', {}));

let sb = null, canal = null, mapa = null, capa = null;
let marcaYo = null, circuloYo = null;
const marcasOtros = new Map();

// ---------- Conexión con Supabase ----------

function conectar() {
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  // Canal en tiempo real: solo lleva avisos de "algo ha cambiado", nunca datos.
  canal = sb.channel('florencia-viaje', { config: { broadcast: { self: false } } });
  canal.on('broadcast', { event: 'cambio' }, () => refrescarPronto());
  canal.subscribe((estado) => { if (estado === 'SUBSCRIBED') refrescarPronto(); });
}

function avisarAlOtro() {
  try { canal?.send({ type: 'broadcast', event: 'cambio', payload: {} }); } catch { /* sin conexión */ }
}

let leyendo = false, temporizadorRefresco = null;
function refrescarPronto() {
  clearTimeout(temporizadorRefresco);
  temporizadorRefresco = setTimeout(refrescar, 300);
}

async function refrescar() {
  if (leyendo || !sesion || !navigator.onLine) { pintarSync(); return; }
  leyendo = true;
  try {
    const { data, error } = await sb.rpc('leer', { p_codigo: sesion.codigo });
    if (error) throw error;
    if (!data.ok) { codigoNoValido(); return; }
    servidor = data.estado || {};
    posiciones = data.posiciones || [];
    ultimaLectura = Date.now();
    recibirMensajes(data.mensajes || []);
    almacen.guardar('flo-cache', { servidor, posiciones, mensajes });
    pintar();
  } catch (e) {
    console.warn('No se pudo leer', e);
  } finally {
    leyendo = false;
    pintarSync();
  }
  enviarPendientes();
}

// Guarda un cambio: se ve al momento en tu móvil y se envía en cuanto se pueda.
function cambiar(clave, parche) {
  parche = Object.assign({}, parche, { por: sesion.nombre });
  pendientes.push({ clave, parche });
  almacen.guardar('flo-pendientes', pendientes);
  pintar();
  enviarPendientes();
}

let enviando = false;
async function enviarPendientes() {
  if (enviando || !pendientes.length || !navigator.onLine || !sesion) { pintarSync(); return; }
  enviando = true;
  pintarSync();
  let enviados = 0;
  try {
    while (pendientes.length) {
      const p = pendientes[0];
      const { data, error } = await sb.rpc('guardar', {
        p_codigo: sesion.codigo, p_clave: p.clave, p_parche: p.parche, p_autor: sesion.nombre
      });
      if (error) throw error;                       // sin red: se reintentará
      if (!data.ok && data.error !== 'datos') { codigoNoValido(); return; }
      if (data.ok) servidor[p.clave] = Object.assign({}, servidor[p.clave], p.parche);
      pendientes.shift();
      almacen.guardar('flo-pendientes', pendientes);
      enviados++;
    }
  } catch (e) {
    console.warn('No se pudo enviar', e);
  } finally {
    enviando = false;
    if (enviados) avisarAlOtro();
    pintarSync();
  }
}

// Estado compartido = lo del servidor + mis cambios aún pendientes.
function estadoActual() {
  const res = {};
  for (const [k, v] of Object.entries(servidor)) res[k] = Object.assign({}, v);
  for (const p of pendientes) res[p.clave] = Object.assign({}, res[p.clave], p.parche);
  return res;
}

function pintarSync() {
  const el = $('#sync');
  if (!el) return;
  el.className = 'sync';
  if (!navigator.onLine) { el.title = 'Sin conexión: los cambios se guardan en el móvil'; return; }
  if (pendientes.length || enviando) { el.classList.add('pendiente'); el.title = 'Enviando cambios…'; return; }
  if (ultimaLectura) { el.classList.add('ok'); el.title = 'Sincronizado'; }
}

// ---------- Datos combinados (fichero + cambios compartidos) ----------

function diaInfo(fecha) { return DATOS.dias.find((d) => d.fecha === fecha) || DATOS.dias[0]; }

function todosLosLugares(est) {
  const lista = DATOS.lugares.map((l) => Object.assign({ clave: `lugar:${l.id}`, clase: 'lugar' }, l, est[`lugar:${l.id}`] || {}));
  for (const [clave, v] of Object.entries(est)) {
    if (clave.startsWith('extra:') && !v.borrado && v.nombre && typeof v.lat === 'number') {
      lista.push(Object.assign({ clave, clase: 'extra', id: clave.slice(6), tipo: 'añadido por vosotros', opcional: false }, v));
    }
  }
  return lista;
}

function todasLasCalles(est) {
  return DATOS.calles.map((c) => Object.assign({ clave: `calle:${c.id}`, clase: 'calle' }, c, est[`calle:${c.id}`] || {}));
}

// ---------- Días con dos ciudades (ej. viernes: Pisa por la mañana, Lucca por la tarde) ----------

function partesDe(fecha) { return diaInfo(fecha).partes || null; }

// Qué ciudad se ve ese día: la elegida a mano; si no, la que tengo cerca;
// si no, según la hora (si es hoy); si no, la primera.
function parteActual(fecha) {
  const partes = partesDe(fecha);
  if (!partes) return null;
  if (parteElegida[fecha]) return parteElegida[fecha];
  if (miPos) {
    const cerca = partes.map((pt) => ({ id: pt.id, d: distancia(miPos, pt) })).sort((a, b) => a.d - b.d)[0];
    if (cerca.d < 15000) return cerca.id;
  }
  const { fecha: hoy, minutos } = ahora();
  if (hoy === fecha) {
    const porHora = partes.filter((pt) => pt.desde && aMinutos(pt.desde) <= minutos).pop();
    if (porHora) return porHora.id;
  }
  return partes[0].id;
}

// ¿Este lugar o calle pertenece a la ciudad que se está viendo?
function enParte(x, fecha = x.dia) {
  if (!partesDe(fecha) || !x.parte) return true;
  return x.parte === parteActual(fecha);
}

function parteInfo(fecha, id) { return (partesDe(fecha) || []).find((pt) => pt.id === id); }

// Visitas principales del día (y de su ciudad, si tiene dos) ordenadas por hora.
function visitasPorHora(lugares, fecha, parte) {
  return lugares
    .filter((l) => l.dia === fecha && l.clase === 'lugar' && !l.opcional && l.hora && (!parte || !l.parte || l.parte === parte))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}
// Igual, pero con el orden por cercanía si se ha pedido hoy en este móvil
function visitasDelDia(lugares, fecha, parte) {
  const lista = visitasPorHora(lugares, fecha, parte);
  const o = ordenActivo(fecha, parte);
  if (!o) return lista;
  const pos = (l) => { const i = o.claves.indexOf(l.clave); return i < 0 ? 1e9 : i; };
  return lista.sort((a, b) => pos(a) - pos(b));
}

// ---------- Orden por cercanía (solo en este móvil y solo el día en que se pide) ----------
let ordenCerca = almacen.leer('flo-orden', {});     // { "fecha|parte": { hoy, claves: [...] } }
const claveOrden = (fecha, parte) => `${fecha}|${parte || ''}`;
function ordenActivo(fecha, parte) {
  const o = ordenCerca[claveOrden(fecha, parte)];
  return o && o.hoy === ahora().fecha ? o : null;
}

// Recorrido seguido: desde donde estoy al sitio más cercano, de ahí al más cercano, etc.
// Lo ya visitado se queda delante y las salidas (tren, coche…) al final.
function ordenarPorCercania(fecha, parte) {
  if (!miPos) return;
  const lista = visitasPorHora(todosLosLugares(estadoActual()), fecha, parte);
  const vistas = lista.filter((l) => l.visitado);
  const salidas = lista.filter((l) => !l.visitado && l.salida);
  const quedan = lista.filter((l) => !l.visitado && !l.salida);
  const recorrido = [];
  let desde = miPos;
  while (quedan.length) {
    quedan.sort((a, b) => distancia(desde, a) - distancia(desde, b));
    desde = quedan.shift();
    recorrido.push(desde);
  }
  ordenCerca[claveOrden(fecha, parte)] = { hoy: ahora().fecha, claves: [...vistas, ...recorrido, ...salidas].map((l) => l.clave) };
  almacen.guardar('flo-orden', ordenCerca);
  pintar();
}
function ordenOriginal(fecha, parte) {
  delete ordenCerca[claveOrden(fecha, parte)];
  almacen.guardar('flo-orden', ordenCerca);
  pintar();
}

// Con el orden por cercanía: hora estimada de llegada a cada visita pendiente (andando,
// 40 min en cada sitio) y aviso si se llega tarde a algo que cierra o tiene hora fija.
function estimarOrden(visitas) {
  const res = new Map();
  if (!miPos) return res;
  let t = ahora().minutos, desde = miPos;
  for (const l of visitas) {
    if (l.visitado) continue;
    t += Math.round(distancia(desde, l) * 1.3 / 75);       // 75 m por minuto, calles no rectas
    const hh = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    let aviso = '';
    if (l.cierra && t > aMinutos(l.cierra) - 20) aviso = `⚠️ Cierra a las ${l.cierra}: puede que llegues tarde`;
    else if (/reserva|hora fija|hora reservada/i.test(`${l.nota} ${l.horario}`) && Math.abs(t - aMinutos(l.hora)) > 30) aviso = `⚠️ Tiene hora fija (${l.hora})`;
    res.set(l.clave, { llegada: hh, aviso });
    t += 40; desde = l;
  }
  return res;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ordenar], [data-orden-original]');
  if (!b) return;
  const [fecha, parte] = (b.dataset.ordenar || b.dataset.ordenOriginal).split('|');
  if (b.dataset.ordenar) ordenarPorCercania(fecha, parte || null);
  else ordenOriginal(fecha, parte || null);
});

function buscar(clave) {
  const est = estadoActual();
  return todosLosLugares(est).find((l) => l.clave === clave) || todasLasCalles(est).find((c) => c.clave === clave);
}

function diaReferencia() {
  const hoy = ahora().fecha;
  if (diaSel !== 'todo') return diaSel;
  return DATOS.dias.some((d) => d.fecha === hoy) ? hoy : DATOS.dias[0].fecha;
}

// ---------- Pintar todo ----------

let pintarPedido = false;
function pintar() {
  if (pintarPedido) return;
  pintarPedido = true;
  requestAnimationFrame(() => {
    pintarPedido = false;
    if (!DATOS || !mapa) return;
    pintarDias();
    pintarMapa();
    pintarPanel();
    pintarVueloDia();      // ✈️ el día de un vuelo (esquema.js)
    pintarTiempo();        // previsión del día y la ciudad que se ven (tiempo.js)
    pintarSync();
  });
}

function pintarDias() {
  const hoy = ahora().fecha;
  const botones = DATOS.dias.map((d) => {
    const activo = diaSel === d.fecha;
    const estilo = activo ? `background:${d.color};border-color:${d.color}` : `border-color:${d.color};color:${d.color}`;
    const [semana, numero] = d.corto.split(' ');       // "Sáb 21" -> "Sáb" y "21"
    return `<button class="dia ${activo ? 'activo' : ''}" style="${estilo}" data-dia="${d.fecha}" aria-label="${esc(d.nombre)}">
        <span class="d-sem ${d.fecha === hoy ? 'hoy' : ''}">${d.fecha === hoy ? 'HOY' : esc(semana)}</span><span class="d-num ${/\d/.test(numero) ? '' : 'txt'}">${esc(numero)}</span></button>`;
  });
  const todo = diaSel === 'todo';
  botones.push(`<button class="dia ${todo ? 'activo' : ''}" style="${todo ? 'background:#374151;border-color:#374151' : ''}" data-dia="todo" aria-label="Todos los días">
      <span class="d-sem">Ver</span><span class="d-num txt">Todo</span></button>`);
  $('#dias').innerHTML = botones.join('');

  // Selector de ciudad (solo en los días con dos ciudades)
  const partes = diaSel !== 'todo' && partesDe(diaSel);
  const nav = $('#partes');
  nav.hidden = !partes;
  if (partes) {
    const color = diaInfo(diaSel).color, actual = parteActual(diaSel);
    nav.style.setProperty('--color-dia', color);
    const compacto = partes.length > 2;
    nav.classList.toggle('compacto', compacto);
    const lugares = todosLosLugares(estadoActual());
    nav.innerHTML = partes.map((pt) => {
      const primera = visitasPorHora(lugares, diaSel, pt.id)[0];
      const sub = compacto ? (primera ? primera.hora : '') : pt.momento.toLowerCase();
      if (compacto) {   // dos líneas: icono + hora arriba, pueblo abajo (caben 4 o más en el ancho)
        return `<button class="parte ${pt.id === actual ? 'activa' : ''}" data-parte="${pt.id}" aria-label="${esc(pt.nombre)}">
          <small>${pt.icono} ${esc(sub)}</small><b>${esc(pt.corto || pt.nombre)}</b></button>`;
      }
      return `<button class="parte ${pt.id === actual ? 'activa' : ''}" data-parte="${pt.id}">
        ${pt.icono} <b>${esc(pt.nombre)}</b> <small>${esc(sub)}</small></button>`;
    }).join('');
  }
  medirCabecera();
}

// La guía y los avisos se colocan justo debajo de la cabecera (que crece con el selector de ciudad)
let altoCabAnterior = 0;
function medirCabecera() {
  const alto = $('.cabecera').offsetHeight + ($('#partes').hidden ? 0 : $('#partes').offsetHeight);
  $('#app').style.setProperty('--alto-cab', alto + 'px');
  // Si el selector de ciudad aparece o desaparece, el mapa cambia de tamaño: avisar a Leaflet
  if (alto !== altoCabAnterior) { altoCabAnterior = alto; if (mapa) mapa.invalidateSize(); }
}

function pintarMapa() {
  capa.clearLayers();
  // En "Todo" el mapa es el esquema del viaje: rutas de cada día y hoteles (los lugares, al entrar en cada día)
  if (diaSel === 'todo' && DATOS.esquema) { pintarEsquemaMapa(); pintarOtros(); return; }
  const est = estadoActual();
  const lugares = todosLosLugares(est);
  const verDia = (fecha) => diaSel === 'todo' || diaSel === fecha;
  const ver = (x) => verDia(x.dia) && (diaSel === 'todo' || enParte(x));

  // Calles (debajo de los marcadores)
  for (const c of todasLasCalles(est)) {
    if (!ver(c)) continue;
    if (c.grupo === 'imprescindible' && !ajustes.imprescindibles) continue;
    if (c.grupo === 'fuera' && !ajustes.fuera) continue;
    if (c.visitado && ajustes.ocultarVistos) continue;
    const color = c.visitado ? '#9ca3af' : diaInfo(c.dia).color;
    const linea = L.polyline(c.trazado, {
      color, weight: c.grupo === 'imprescindible' ? 6 : 5, opacity: .85,
      dashArray: c.grupo === 'fuera' ? '2 9' : null, lineCap: 'round'
    });
    // Línea invisible más gruesa para que sea fácil tocarla con el dedo
    const toque = L.polyline(c.trazado, { weight: 22, opacity: 0 });
    toque.on('click', () => abrirFicha(c.clave));
    linea.on('click', () => abrirFicha(c.clave));
    linea.bindTooltip(c.nombre, { sticky: true });
    capa.addLayer(linea).addLayer(toque);
  }

  // Marcadores de lugares
  const numeros = new Map();
  for (const d of DATOS.dias) {
    for (const pt of d.partes || [null]) {
      visitasDelDia(lugares, d.fecha, pt && pt.id).forEach((l, i) => numeros.set(l.clave, i + 1));
    }
  }

  for (const l of lugares) {
    if (!ver(l)) continue;
    if (l.opcional && !ajustes.opcionales) continue;
    if (l.visitado && ajustes.ocultarVistos) continue;
    const color = l.parking ? '#1d4ed8' : diaInfo(l.dia).color;
    let clases = 'marca', texto;
    if (l.clase === 'extra') { clases += ' extra'; texto = '★'; }
    else if (l.parking) { clases += ' parking'; texto = l.tipo === 'gasolinera' ? '⛽' : 'P'; }
    else if (l.opcional) { clases += ' opcional'; texto = '+'; }
    else texto = numeros.get(l.clave) || '•';
    if (l.visitado) { clases += ' visto'; texto = '✔'; }
    const borde = l.opcional && !l.parking && !l.visitado ? `border-color:${color};color:${color}` : '';
    const icono = L.divIcon({
      className: '', iconSize: [32, 32], iconAnchor: [16, 16],
      html: `<div class="${clases}" style="background:${color};${borde}">${texto}</div>`
    });
    const m = L.marker([l.lat, l.lng], { icon: icono, title: l.nombre, zIndexOffset: l.opcional ? 0 : 500 });
    m.on('click', () => abrirFicha(l.clave));
    capa.addLayer(m);
  }

  pintarHotelesDia();    // el 🏨 de la noche anterior y el de esta noche
  pintarEsquemaMapa();   // en "Todo": rutas de cada día y hoteles
  pintarOtros();
}

function pintarOtros() {
  const vistos = new Set();
  for (const p of posiciones) {
    if (!sesion || p.nombre === sesion.nombre) continue;
    vistos.add(p.nombre);
    const minutos = (Date.now() - new Date(p.actualizado).getTime()) / 60000;
    const icono = L.divIcon({
      className: '', iconSize: [30, 30], iconAnchor: [15, 15],
      html: `<div class="otro ${minutos > 10 ? 'antiguo' : ''}">${esc(p.nombre.charAt(0).toUpperCase())}${noLeidos() ? `<span class="insignia">${noLeidos()}</span>` : ''}</div>`
    });
    const texto = `${esc(p.nombre)} · ${haceCuanto(p.actualizado)}`;
    let m = marcasOtros.get(p.nombre);
    if (!m) {
      m = L.marker([p.lat, p.lng], { icon: icono, zIndexOffset: 1000, title: `Escribir a ${p.nombre}` }).addTo(mapa);
      m.on('click', () => abrirChat()); // tocar su punto abre el chat
      m.bindTooltip(texto, { permanent: true, direction: 'top', offset: [0, -14], className: 'etq-otro' });
      marcasOtros.set(p.nombre, m);
    } else {
      m.setLatLng([p.lat, p.lng]).setIcon(icono);
      m.setTooltipContent(texto);
    }
  }
  for (const [nombre, m] of marcasOtros) {
    if (!vistos.has(nombre)) { m.remove(); marcasOtros.delete(nombre); }
  }
  $('#btn-otro').hidden = marcasOtros.size === 0;
  if (guia && guia.persona) actualizarGuia();            // la otra persona se ha movido
  if (chatAbierto()) pintarGuiarChat();
}

function pintarPanel() {
  const est = estadoActual();
  const lugares = todosLosLugares(est);
  const calles = todasLasCalles(est);
  const ref = diaReferencia();
  const { fecha: hoy, minutos } = ahora();

  // --- Avisos (solo si el día que miras es hoy) ---
  const avisos = [];
  const parteRef = parteActual(ref);
  if (ref === hoy) {
    const atardecer = diaInfo(hoy).atardecer;
    for (const l of lugares) {
      if (l.dia !== hoy || l.visitado || !enParte(l, hoy)) continue;
      if (l.cierra) {
        const quedan = aMinutos(l.cierra) - minutos;
        if (quedan > 0 && quedan <= 60) {
          avisos.push(`<div class="aviso ${quedan <= 30 ? 'urgente' : ''}">⏰ ${esc(l.nombre)} cierra a las ${esc(l.cierra)} (quedan ${quedan} min)</div>`);
        }
      }
      if (l.salida && l.hora) {                       // tren o bus con hora de salida
        const quedan = aMinutos(l.hora) - minutos;
        if (quedan > 0 && quedan <= 45) {
          avisos.push(`<div class="aviso ${quedan <= 15 ? 'urgente' : ''}">${esc(l.nombre)}: sale a las ${esc(l.hora)} (quedan ${quedan} min)</div>`);
        }
      }
      if (l.antesAtardecer && atardecer) {
        const quedan = aMinutos(atardecer) - minutos;
        if (quedan > 0 && quedan <= 80) {
          avisos.push(`<div class="aviso">${l.avisoAtardecer ? esc(l.avisoAtardecer) : `🌅 El atardecer es hacia las ${esc(atardecer)}: no llegues tarde a ${esc(l.nombre)}.`}</div>`);
        }
      }
    }
  }
  if (miPos) {
    const cercaBus = DATOS.transporte.busCerca
      .map((id) => lugares.find((l) => l.id === id))
      .some((l) => l && distancia(miPos, l) < 350);
    if (cercaBus) avisos.push('<div class="aviso">🚌 Para bajar: buses 12 y 13. Billete 2 € (90 min), puedes pagar acercando la tarjeta.</div>');
  }
  // Consejos: plegados en una línea para no empujar la tarjeta "Siguiente" (los avisos siempre a la vista)
  const consejos = [...(DATOS.consejos[ref] || []), ...(parteRef ? DATOS.consejos[`${ref}:${parteRef}`] || [] : [])];
  $('#avisos').innerHTML = avisos.join('') + (consejos.length ? `
    <details class="consejos" ${consejosAbiertos ? 'open' : ''}>
      <summary>💡 Consejos (${consejos.length})</summary>
      ${consejos.map((c) => `<p class="consejo">• ${esc(c)}</p>`).join('')}
    </details>` : '');
  $('#avisos .consejos')?.addEventListener('toggle', (e) => { consejosAbiertos = e.target.open; });

  // --- Siguiente visita ---
  const pendientesDia = visitasDelDia(lugares, ref, parteRef).filter((l) => !l.visitado);
  let sig = pendientesDia[0];
  // ¿Terminada esta ciudad? Proponer la siguiente del día
  const partesRef = partesDe(ref);
  const siguienteParte = !sig && partesRef ? partesRef[partesRef.findIndex((pt) => pt.id === parteRef) + 1] : null;
  if (siguienteParte) {
    const destino = visitasPorHora(lugares, ref, siguienteParte.id)[0] || siguienteParte;
    const modo = siguienteParte.llegar?.modo || 'driving';
    const boton = { driving: '🚗 Ir en coche', transit: '🚆 Ir en tren / bus', walking: '🚶 Ir andando' }[modo] || '🗺️ Cómo ir';
    $('#siguiente').innerHTML = `
      <div class="siguiente">
        <div class="etq">✔ ${esc(parteInfo(ref, parteRef).nombre.toUpperCase())} TERMINADO · SIGUIENTE</div>
        <h2>${siguienteParte.icono} ${esc(siguienteParte.nombre)}</h2>
        <div class="meta">${esc(siguienteParte.llegar?.texto || '')}${destino.hora ? ' · primera visita ' + esc(destino.hora) : ''}</div>
        <div class="fila-botones">
          <a class="btn btn-principal" href="${urlComoLlegar(destino.lat, destino.lng, modo)}" target="_blank" rel="noopener">${boton}</a>
          <button class="btn" data-parte="${siguienteParte.id}">Ver ${esc(siguienteParte.nombre)}</button>
        </div>
      </div>`;
    $('#panel-resumen').innerHTML = `<b>▶ Siguiente:</b> ${siguienteParte.icono} ${esc(siguienteParte.nombre)}`;
  }
  if (!sig && !siguienteParte && miPos) {
    sig = lugares.filter((l) => l.dia === ref && !l.visitado && enParte(l, ref))
      .sort((a, b) => distancia(miPos, a) - distancia(miPos, b))[0];
  }
  if (siguienteParte) {
    // ya pintada arriba
  } else if (sig) {
    const d = miPos ? textoDistancia(distancia(miPos, sig)) : 'activa el GPS para ver la distancia';
    $('#siguiente').innerHTML = `
      <div class="siguiente">
        <div class="etq">▶ SIGUIENTE · ${esc(diaInfo(ref).nombre.toUpperCase())}${parteRef ? ' · ' + esc(parteInfo(ref, parteRef).nombre.toUpperCase()) : ''}</div>
        <h2 class="sig-nombre" data-ficha="${esc(sig.clave)}">${esc(sig.nombre)} <span class="ver">›</span></h2>
        <div class="meta">${sig.hora ? esc(sig.hora) + ' · ' : ''}${esc(d)}</div>
        <div class="fila-botones">
          <button class="btn btn-principal" data-guiar="${esc(sig.clave)}">🧭 Guiarme</button>
          <a class="btn" href="${urlComoLlegar(sig.lat, sig.lng)}" target="_blank" rel="noopener">🗺️ Maps</a>
          <button class="btn" data-visto="${esc(sig.clave)}">✔ Hecho</button>
        </div>
      </div>`;
  } else {
    $('#siguiente').innerHTML = `<div class="siguiente"><div class="etq">${esc(diaInfo(ref).nombre.toUpperCase())}${parteRef ? ' · ' + esc(parteInfo(ref, parteRef).nombre.toUpperCase()) : ''}</div><h2>¡Visitas ${parteRef ? 'de ' + esc(parteInfo(ref, parteRef).nombre) : 'del día'} completadas! 🎉</h2></div>`;
  }
  if (!siguienteParte) $('#panel-resumen').innerHTML = sig
    ? `<b>▶ Siguiente:</b> ${esc(sig.nombre)}${sig.hora ? ' · ' + esc(sig.hora) : ''}${miPos ? ' · ' + esc(textoDistancia(distancia(miPos, sig)).split(' · ')[0]) : ''}`
    : '<b>🎉</b> Visitas del día completadas';

  // --- Lista ---
  const dias = diaSel === 'todo' ? DATOS.dias.map((d) => d.fecha) : [diaSel];
  let html = '';
  // Bloques a listar: un día entero, o cada ciudad de un día con dos ciudades
  const bloques = [];
  for (const fecha of dias) {
    const partes = partesDe(fecha);
    if (!partes) bloques.push({ fecha, parte: null });
    else if (diaSel === 'todo') partes.forEach((pt) => bloques.push({ fecha, parte: pt.id }));
    else bloques.push({ fecha, parte: parteActual(fecha) });
  }
  let fechaAnterior = null;
  for (const { fecha, parte } of bloques) {
    const info = diaInfo(fecha);
    if (diaSel === 'todo' && fecha !== fechaAnterior) html += `<h3 style="color:${info.color}">${esc(info.nombre)} · ${esc(info.zona)}</h3>`;
    fechaAnterior = fecha;
    if (parte) {
      const pt = parteInfo(fecha, parte);
      html += `<div class="titulo-parte" style="--color-dia:${info.color}">${pt.icono} ${esc(pt.momento)} · ${esc(pt.nombre)}</div>`;
    }
    const primeraParte = partesDe(fecha)?.[0].id;
    const deAqui = (x) => x.dia === fecha && (!parte || x.parte === parte || (!x.parte && (diaSel !== 'todo' || parte === primeraParte)));
    const visitas = visitasDelDia(lugares, fecha, parte);
    const sinHora = lugares.filter((l) => deAqui(l) && l.clase === 'lugar' && !l.opcional && !l.hora);
    const opcionales = lugares.filter((l) => deAqui(l) && l.clase === 'lugar' && l.opcional && !l.parking);
    const aparcar = lugares.filter((l) => deAqui(l) && l.parking);
    const extras = lugares.filter((l) => deAqui(l) && l.clase === 'extra');
    const imp = calles.filter((c) => deAqui(c) && c.grupo === 'imprescindible');
    const fuera = calles.filter((c) => deAqui(c) && c.grupo === 'fuera');

    const sub = (titulo) => (diaSel === 'todo' ? `<h3 style="font-size:12px;margin-top:6px">${titulo}</h3>` : `<h3>${titulo}</h3>`);
    html += sub('Visitas');
    // Botón "Ordenar por cercanía": solo en el día y la ciudad que se ven, y estando cerca
    const activo = ordenActivo(fecha, parte);
    const k = claveOrden(fecha, parte);
    if (activo) {
      html += `<div class="orden-cerca">📍 Ordenado por cercanía (solo en tu móvil) <button class="btn" data-orden-original="${k}">↩ Orden original</button></div>`;
    } else if (diaSel !== 'todo' && miPos && visitas.filter((l) => !l.visitado && !l.salida).length >= 2
               && visitas.some((l) => distancia(miPos, l) < 5000)) {
      html += `<button class="btn btn-orden" data-ordenar="${k}">📍 Ordenar por cercanía</button>`;
    }
    const estim = activo ? estimarOrden(visitas) : new Map();
    html += visitas.map((l, i) => filaLugar(l, info.color, String(i + 1), false, estim.get(l.clave))).join('');
    html += sinHora.map((l) => filaLugar(l, info.color, '•', false)).join('');
    if (opcionales.length && ajustes.opcionales) {
      html += sub('Opcionales');
      html += opcionales.map((l) => filaLugar(l, info.color, '+', true)).join('');
    }
    if (extras.length) {
      html += sub('Añadidos por vosotros');
      html += extras.sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99')).map((l) => filaLugar(l, info.color, '★', false)).join('');
    }
    if (imp.length && ajustes.imprescindibles) {
      html += sub('Calles imprescindibles');
      html += imp.map((c) => filaCalle(c, info.color)).join('');
    }
    if (fuera.length && ajustes.fuera) {
      html += sub('Calles fuera de ruta');
      html += fuera.map((c) => filaCalle(c, info.color)).join('');
    }
    if (aparcar.length && ajustes.opcionales) {
      html += sub('Aparcar y repostar');
      html += aparcar.map((l) => filaLugar(l, '#1d4ed8', l.tipo === 'gasolinera' ? '⛽' : 'P', false)).join('');
    }
  }
  html += `<div class="pie-lista">
      <button class="btn" id="btn-anadir">＋ Añadir lugar</button>
      <button class="btn" id="btn-ver-dia">🔎 Ver el día</button>
    </div>
    <p class="consejo" style="text-align:center;margin-top:8px">También puedes mantener pulsado el mapa para añadir un lugar.</p>`;
  $('#lista').innerHTML = html;
  // En "Todo", el esquema del viaje va arriba del todo
  $('#esquema-panel').innerHTML = diaSel === 'todo' ? htmlEsquema() : '';
}

function filaLugar(l, color, num, hueco, estim) {
  const dist = miPos ? textoDistancia(distancia(miPos, l)).split(' · ')[0] : '';
  const hora = estim ? `≈${estim.llegada}` : l.hora;     // con el orden por cercanía, hora estimada
  const det = [hora, l.tipo, l.comentario ? '💬 ' + l.comentario : ''].filter(Boolean).join(' · ');
  return `<button class="item ${l.visitado ? 'visto' : ''}" data-ficha="${esc(l.clave)}">
      <span class="num ${hueco ? 'hueco' : ''}" style="${hueco ? `border-color:${color}` : `background:${color}`}">${l.visitado ? '✔' : esc(num)}</span>
      <span class="txt"><span class="nom">${esc(l.nombre)}</span><span class="det">${esc(det)}</span>${estim?.aviso ? `<span class="det aviso-orden">${esc(estim.aviso)}</span>` : ''}</span>
      <span class="dist">${esc(dist)}</span>
    </button>`;
}

function filaCalle(c, color) {
  const dist = miPos ? textoDistancia(puntoMasCercano(miPos, c.trazado).d).split(' · ')[0] : '';
  const det = [c.tipo, c.comentario ? '💬 ' + c.comentario : ''].filter(Boolean).join(' · ');
  return `<button class="item ${c.visitado ? 'visto' : ''}" data-ficha="${esc(c.clave)}">
      <span class="raya ${c.grupo === 'fuera' ? 'discontinua' : ''}" style="border-color:${c.visitado ? '#9ca3af' : color}"></span>
      <span class="txt"><span class="nom">${esc(c.nombre)}</span><span class="det">${esc(det)}</span></span>
      <span class="dist">${esc(dist)}</span>
    </button>`;
}

// ---------- Ventanas ----------

function abrirVentana(html) {
  $('#ventana-contenido').innerHTML = `<button class="cerrar" data-cerrar aria-label="Cerrar">✕</button>${html}`;
  const v = $('#ventana');
  if (!v.open) v.showModal();
}
function cerrarVentana() { const v = $('#ventana'); if (v.open) v.close(); }

function abrirFicha(clave) {
  const x = buscar(clave);
  if (!x) return;
  const info = diaInfo(x.dia);
  const esCalle = x.clase === 'calle';
  let destino = { lat: x.lat, lng: x.lng };
  let dist = null;
  if (esCalle) {
    const ref = miPos || mapa.getCenter();
    const pc = puntoMasCercano({ lat: ref.lat, lng: ref.lng }, x.trazado);
    destino = { lat: pc.lat, lng: pc.lng };
    if (miPos) dist = pc.d;
  } else if (miPos) dist = distancia(miPos, x);

  const opcionesDia = DATOS.dias.map((d) => `<option value="${d.fecha}" ${d.fecha === x.dia ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('');
  const tipo = esCalle ? `${x.tipo} · ${x.grupo === 'fuera' ? 'fuera de ruta' : 'imprescindible'}` : x.tipo + (x.opcional ? ' · opcional' : '');
  const bus = DATOS.transporte.busCerca.includes(x.id) ? `
      <div class="caja-bus">🚌 <b>Buses 12 y 13</b>: suben hasta el Piazzale y San Miniato. Te ahorran la cuesta y son la mejor forma de bajar de noche o con lluvia.
      Billete 2 € (90 min). Comprueba el recorrido en la app de Autolinee Toscane.</div>` : '';

  abrirVentana(`
    <h2>${esc(x.nombre)}</h2>
    <p class="tipo">${esc(tipo)} · <span class="chip" style="background:${info.color}">${esc(info.nombre)}</span></p>
    ${dist != null ? `<div class="dato"><span class="etq">Desde donde estás</span>${esc(textoDistancia(dist))} a pie</div>` : ''}
    ${x.horario ? `<div class="dato"><span class="etq">Horario</span>${esc(x.horario)}</div>` : ''}
    ${x.nota ? `<div class="dato"><span class="etq">Nota</span>${esc(x.nota)}</div>` : ''}
    ${bus}
    <div class="fila-botones">
      <button class="btn btn-principal" data-guiar="${esc(clave)}">🧭 Guiarme</button>
      <a class="btn" href="${urlComoLlegar(destino.lat, destino.lng, x.parking ? 'driving' : 'walking')}" target="_blank" rel="noopener">${x.parking ? '🚗 Ir en coche' : '🗺️ Google Maps'}</a>
      ${bus ? `<a class="btn" href="${urlComoLlegar(destino.lat, destino.lng, 'transit')}" target="_blank" rel="noopener">🚌 En bus</a>` : ''}
    </div>
    <div class="fila-botones">
      <button class="btn ${x.visitado ? '' : 'btn-ok'}" id="f-visto">${x.visitado ? '↩︎ Desmarcar' : (esCalle ? '✔ Recorrida' : '✔ Visitado')}</button>
    </div>
    <div class="dos">
      ${esCalle ? '' : `<label class="campo">Hora prevista<input type="time" id="f-hora" value="${esc(x.hora || '')}"></label>`}
      <label class="campo">Día<select id="f-dia">${opcionesDia}</select></label>
    </div>
    <label class="campo">Notas compartidas
      <textarea id="f-coment" maxlength="1000" placeholder="Ej.: cola de 40 min, comimos genial aquí…">${esc(x.comentario || '')}</textarea>
    </label>
    <button class="btn" id="f-guardar" style="width:100%">💾 Guardar nota</button>
    ${x.por ? `<p class="quien">Último cambio: ${esc(x.por)}</p>` : ''}
    ${x.clase === 'extra' ? '<button class="btn btn-peligro" id="f-borrar" style="width:100%;margin-top:10px">🗑 Borrar este lugar</button>' : ''}
  `);

  $('#f-visto').onclick = () => { cambiar(clave, { visitado: !x.visitado }); cerrarVentana(); };
  $('#f-dia').onchange = (e) => cambiar(clave, { dia: e.target.value });
  const hora = $('#f-hora');
  if (hora) hora.onchange = (e) => cambiar(clave, { hora: e.target.value || null });
  $('#f-guardar').onclick = () => {
    cambiar(clave, { comentario: $('#f-coment').value.trim() });
    cerrarVentana();
    mostrarToast('Nota guardada');
  };
  const borrar = $('#f-borrar');
  if (borrar) borrar.onclick = () => {
    if (confirm(`¿Borrar "${x.nombre}"? También desaparecerá del otro móvil.`)) { cambiar(clave, { borrado: true }); cerrarVentana(); }
  };
}

function abrirNuevo(latlng) {
  const fechaPorDefecto = diaReferencia();
  const opcionesDia = DATOS.dias.map((d) => `<option value="${d.fecha}" ${d.fecha === fechaPorDefecto ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('');
  abrirVentana(`
    <h2>Nuevo lugar</h2>
    <p class="tipo">Se colocará en el punto marcado del mapa.</p>
    <label class="campo">Nombre<input id="n-nombre" maxlength="60" placeholder="Ej.: Gelateria dei Neri" required></label>
    <div class="dos">
      <label class="campo">Día<select id="n-dia">${opcionesDia}</select></label>
      <label class="campo">Hora (opcional)<input type="time" id="n-hora"></label>
    </div>
    <label class="campo">Nota<textarea id="n-nota" maxlength="500"></textarea></label>
    <button class="btn btn-principal" id="n-guardar" style="width:100%">Añadir</button>
  `);
  const marca = L.circleMarker(latlng, { radius: 10, color: '#111827', weight: 3 }).addTo(mapa);
  $('#ventana').addEventListener('close', () => marca.remove(), { once: true });
  $('#n-guardar').onclick = () => {
    const nombre = $('#n-nombre').value.trim();
    if (!nombre) { $('#n-nombre').focus(); return; }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const dia = $('#n-dia').value;
    // En un día con dos ciudades, el lugar va a la ciudad más cercana al punto
    const partes = partesDe(dia);
    const parte = partes ? partes.map((pt) => ({ id: pt.id, d: distancia(latlng, pt) })).sort((a, b) => a.d - b.d)[0].id : null;
    cambiar(`extra:${id}`, {
      nombre, dia, parte, hora: $('#n-hora').value || null,
      nota: $('#n-nota').value.trim(), lat: +latlng.lat.toFixed(6), lng: +latlng.lng.toFixed(6)
    });
    cerrarVentana();
    mostrarToast(`"${nombre}" añadido`);
  };
  setTimeout(() => $('#n-nombre')?.focus(), 100);
}

function abrirTransporte() {
  // Primero el transporte del día que estás viendo; las demás zonas, plegadas debajo
  const zonas = DATOS.transporte.zonas;
  const primera = diaInfo(diaReferencia()).transporte || Object.keys(zonas)[0];
  const orden = [primera, ...Object.keys(zonas).filter((k) => k !== primera)];
  const bloque = (t) => `
    <p class="tipo">${esc(t.resumen)}</p>
    <div class="dato"><span class="etq">Cuándo sí te conviene</span><ul>${t.cuando.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
    <div class="dato"><span class="etq">Billetes y pago</span><ul>${t.billetes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
    <div class="caja-bus">⚠️ ${esc(t.aviso)}</div>
    ${t.enlace ? `<a class="btn" style="width:100%" href="${esc(t.enlace.url)}" target="_blank" rel="noopener">${esc(t.enlace.texto)}</a>` : ''}`;
  abrirVentana(`
    <h2>🚌 Transporte · ${esc(zonas[primera].titulo)}</h2>
    ${bloque(zonas[primera])}
    ${orden.slice(1).map((k) => `<details class="otra-zona"><summary>🚌 ${esc(zonas[k].titulo)}</summary>${bloque(zonas[k])}</details>`).join('')}
    <p class="consejo" style="margin-top:12px">${esc(DATOS.avisoGeneral)}</p>
  `);
}

function abrirAjustes() {
  const casilla = (id, texto) => `<label class="check"><input type="checkbox" data-ajuste="${id}" ${ajustes[id] ? 'checked' : ''}> ${texto}</label>`;
  abrirVentana(`
    <h2>Ajustes</h2>
    <p class="tipo">Has entrado como <b>${esc(sesion.nombre)}</b>.</p>
    <div class="dato"><span class="etq">Qué ver en el mapa</span>
      ${casilla('opcionales', 'Visitas opcionales')}
      ${casilla('imprescindibles', 'Calles imprescindibles')}
      ${casilla('fuera', 'Calles fuera de ruta')}
      ${casilla('ocultarVistos', 'Ocultar lo ya visitado')}
    </div>
    <div class="dato"><span class="etq">Avisos</span>
      ${casilla('avisoCalles', 'Avisarme al pasar cerca de una calle de la lista')}
    </div>
    <button class="btn" id="a-esquema" style="width:100%;margin-bottom:8px">🗺️ Esquema del viaje (hoteles y rutas)</button>
    <div class="fila-botones">
      <button class="btn" id="a-refrescar">🔄 Actualizar ahora</button>
      <button class="btn btn-peligro" id="a-salir">Salir</button>
    </div>
    <p class="consejo" style="margin-top:12px">Los cambios se guardan en internet: aunque borres los datos del navegador, al volver a entrar con el código seguirán ahí.</p>
  `);
  document.querySelectorAll('[data-ajuste]').forEach((c) => {
    c.onchange = () => { ajustes[c.dataset.ajuste] = c.checked; almacen.guardar('flo-ajustes', ajustes); pintar(); };
  });
 $('#a-esquema').onclick = () => {
    cerrarVentana(); diaSel = 'todo'; plegarPanel(false); pintar(); setTimeout(verDiaEnMapa, 60);
  };
  $('#a-refrescar').onclick = () => { refrescar(); cerrarVentana(); mostrarToast('Actualizando…'); };
  $('#a-salir').onclick = () => {
    if (pendientes.length && !confirm('Hay cambios sin enviar todavía. Si sales ahora se perderán. ¿Salir igualmente?')) return;
    almacen.borrar('flo-sesion'); almacen.borrar('flo-pendientes'); almacen.borrar('flo-cache');
    location.reload();
  };
}

let temporizadorToast = null;
function mostrarToast(html, clave) {
  const t = $('#toast');
  t.innerHTML = html;
  t.hidden = false;
  t.onclick = () => { t.hidden = true; if (clave) abrirFicha(clave); };
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { t.hidden = true; }, clave ? 9000 : 2500);
}

// ---------- GPS ----------

let ultimoEnvio = { t: 0, lat: 0, lng: 0 };

function iniciarGPS() {
  if (!('geolocation' in navigator)) { mostrarToast('Este móvil no permite usar el GPS en el navegador'); return; }
  navigator.geolocation.watchPosition(alMoverme, (err) => {
    if (err.code === err.PERMISSION_DENIED) {
      mostrarToast('<b>GPS desactivado</b>Permite la ubicación para este sitio en los ajustes del navegador.');
    }
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
}

function alMoverme(pos) {
  const primera = !miPos;
  miPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy };
  const ll = [miPos.lat, miPos.lng];
  if (!marcaYo) {
    circuloYo = L.circle(ll, { radius: miPos.precision, color: '#2563eb', weight: 1, fillOpacity: .1, interactive: false }).addTo(mapa);
    marcaYo = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="yo-cont"><div class="yo-cono" hidden></div><div class="yo"></div></div>', iconSize: [64, 64], iconAnchor: [32, 32] }), zIndexOffset: 2000, interactive: false }).addTo(mapa);
  } else {
    marcaYo.setLatLng(ll);
    circuloYo.setLatLng(ll).setRadius(miPos.precision);
  }
  if (seguir) mapa.panTo(ll);
  // Si estoy en Florencia la primera vez, centrar en mí
  if (primera && DATOS.lugares.some((l) => distancia(miPos, l) < 3000)) mapa.setView(ll, Math.max(mapa.getZoom(), 16));
  // En un día con dos ciudades, al saber dónde estoy puede cambiar la ciudad que se ve
  if (primera && diaSel !== 'todo' && partesDe(diaSel)) { pintar(); setTimeout(verDiaEnMapa, 50); }

  rumboPorGPS(pos.coords);
  actualizarLocalidad();
  pintarRumbo();
  actualizarGuia();
  comprobarCalles();
  pintarPanel();
  enviarPosicion();
}

// ---------- Localidad donde estoy (junto a Ocultar/Mostrar) ----------

// Sitios del viaje: se reconocen sin internet
function sitiosConocidos() {
  const sitios = [{ nombre: 'Florencia', lat: 43.7696, lng: 11.2558, radio: 7000 }];
  for (const d of DATOS.dias) for (const pt of d.partes || []) sitios.push({ nombre: pt.nombre, lat: pt.lat, lng: pt.lng, radio: 4000 });
  return sitios;
}

// Nombre del sitio del viaje donde estoy ahora (o null si no estoy en ninguno)
function sitioDondeEstoy() {
  if (!miPos || !DATOS) return null;
  const cerca = sitiosConocidos()
    .map((x) => Object.assign({ d: distancia(miPos, x) }, x))
    .filter((x) => x.d < x.radio)
    .sort((a, b) => a.d - b.d)[0];
  return cerca ? cerca.nombre : null;
}

let localidad = { nombre: null, lat: 0, lng: 0, t: 0, preguntando: false };
let sitioAnterior = null;
async function actualizarLocalidad() {
  if (!miPos) return;
  // 1) ¿Estoy en uno de los sitios del viaje?
  const aqui = sitioDondeEstoy();
  if (aqui !== sitioAnterior) {               // he cambiado de pueblo: resaltarlo en el mapa de "Todo"
    sitioAnterior = aqui;
    if (diaSel === 'todo') pintar();
  }
  if (aqui) { pintarLocalidad(aqui); return; }
  // 2) Si no, preguntar a OpenStreetMap (como mucho cada 2 min y si me he movido más de 1 km)
  const movido = localidad.t ? distancia(miPos, localidad) : Infinity;
  if (localidad.preguntando || !navigator.onLine || (Date.now() - localidad.t < 120000 && movido < 1000)) {
    if (localidad.nombre) pintarLocalidad(localidad.nombre);
    return;
  }
  localidad.preguntando = true;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=es&lat=${miPos.lat.toFixed(4)}&lon=${miPos.lng.toFixed(4)}`;
    const r = await (await fetch(url)).json();
    const a = r.address || {};
    const nombre = a.city || a.town || a.village || a.municipality || a.county || r.name;
    if (nombre) localidad = { nombre, lat: miPos.lat, lng: miPos.lng, t: Date.now(), preguntando: false };
  } catch { /* sin conexión: se reintenta más tarde */ }
  localidad.preguntando = false;
  if (localidad.nombre) pintarLocalidad(localidad.nombre);
}

function pintarLocalidad(nombre) {
  const el = $('#localidad');
  if (el && el.textContent !== '📍 ' + nombre) { el.textContent = '📍 ' + nombre; el.title = 'Estás en ' + nombre; }
}

// Envía mi posición como mucho cada 10 s, y solo si me he movido o ha pasado 1 min.
async function enviarPosicion() {
  if (!miPos || !sesion || !navigator.onLine) return;
  const t = Date.now();
  const movido = distancia(miPos, ultimoEnvio);
  if (t - ultimoEnvio.t < 10000 || (movido < 15 && t - ultimoEnvio.t < 60000)) return;
  ultimoEnvio = { t, lat: miPos.lat, lng: miPos.lng };
  try {
    const { data, error } = await sb.rpc('mi_posicion', {
      p_codigo: sesion.codigo, p_nombre: sesion.nombre,
      p_lat: miPos.lat, p_lng: miPos.lng, p_precision: Math.round(miPos.precision)
    });
    if (!error && data?.ok) avisarAlOtro();
  } catch { /* sin conexión */ }
}

// Aviso al pasar cerca (≈50 m) de una calle de la lista del día.
function comprobarCalles() {
  if (!ajustes.avisoCalles || !miPos) return;
  const ref = diaReferencia();
  for (const c of todasLasCalles(estadoActual())) {
    if (c.dia !== ref || c.visitado || avisadas.has(c.id)) continue;
    if (c.grupo === 'fuera' && !ajustes.fuera) continue;
    if (puntoMasCercano(miPos, c.trazado).d < 50) {
      avisadas.add(c.id);
      mostrarToast(`<b>📍 Estás junto a ${esc(c.nombre)}</b>${esc(c.nota)}`, c.clave);
      if (navigator.vibrate) navigator.vibrate(150);
      break;
    }
  }
}

// ---------- Arranque ----------

function verDiaEnMapa() {
  const est = estadoActual();
  const puntos = [];
  if (diaSel === 'todo' && DATOS.esquema) {
    for (const d of DATOS.esquema.dias) (d.ruta || []).forEach((p) => puntos.push(p));
    DATOS.esquema.hoteles.forEach((h) => puntos.push([h.lat, h.lng]));
  }
  const ver = (x) => !x.sinEncuadre && diaSel !== 'todo' && x.dia === diaSel && enParte(x);
  for (const l of todosLosLugares(est)) if (ver(l)) puntos.push([l.lat, l.lng]);
  for (const c of todasLasCalles(est)) if (ver(c)) c.trazado.forEach((lin) => lin.forEach((p) => puntos.push(p)));
  // Dejamos hueco abajo para que el panel no tape los puntos
  const altoPanel = $('#panel').offsetHeight;
  // En "Todo" hace falta más margen: a la derecha están los botones y los nombres de los pueblos
  const margen = diaSel === 'todo' ? { paddingTopLeft: [16, 24], paddingBottomRight: [72, altoPanel + 16] } : { paddingTopLeft: [30, 30], paddingBottomRight: [30, altoPanel + 20] };
  if (puntos.length) mapa.fitBounds(puntos, Object.assign(margen, { maxZoom: 16 }));
}

function crearMapa() {
  mapa = L.map('mapa', { zoomControl: false, attributionControl: true, zoomSnap: 0.5 }).setView([43.7696, 11.2558], 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, crossOrigin: '',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapa);
  capa = L.layerGroup().addTo(mapa);
  mapa.on('dragstart', () => { seguir = false; $('#btn-centrar').classList.remove('activo'); });
  mapa.on('contextmenu', (e) => abrirNuevo(e.latlng)); // mantener pulsado
}

function conectarEventos() {
  // Clics dentro de la app (un solo "escuchador" para todo)
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-dia],[data-parte],[data-ficha],[data-visto],[data-cerrar]');
    if (!el) return;
    if (el.dataset.parte) {
      if (diaSel === 'todo') diaSel = diaReferencia();   // desde "Todo", saltar a ese día
      parteElegida[diaSel] = el.dataset.parte;
      pintar();
      setTimeout(verDiaEnMapa, 50);
    } else if (el.dataset.dia) {
      diaSel = el.dataset.dia;
      delete parteElegida[diaSel];                    // al volver al día, la app vuelve a elegir la ciudad sola
      almacen.guardar('flo-dia', { dia: diaSel, fecha: ahora().fecha });
      pintar();
      setTimeout(verDiaEnMapa, 50);
    } else if (el.dataset.ficha) abrirFicha(el.dataset.ficha);
    else if (el.dataset.visto) { cambiar(el.dataset.visto, { visitado: true }); mostrarToast('Marcado como visitado ✔'); }
    else if ('cerrar' in el.dataset) cerrarVentana();
  });

  // Cerrar la ventana tocando fuera
  $('#ventana').addEventListener('click', (e) => { if (e.target.id === 'ventana') cerrarVentana(); });

  $('#btn-centrar').onclick = () => {
    iniciarBrujula();
    if (!miPos) { mostrarToast('Buscando tu posición…'); return; }
    seguir = true;
    $('#btn-centrar').classList.add('activo');
    mapa.setView([miPos.lat, miPos.lng], Math.max(mapa.getZoom(), 17));
  };
  $('#btn-otro').onclick = () => {
    const m = [...marcasOtros.values()][0];
    if (m) { seguir = false; $('#btn-centrar').classList.remove('activo'); mapa.setView(m.getLatLng(), 17); }
  };
  $('#btn-bus').onclick = abrirTransporte;
  $('#btn-ajustes').onclick = abrirAjustes;
  // Mostrar / ocultar la zona de datos: tocando el botón o deslizando el dedo
  let yInicio = null, deslizado = false;
  $('#panel-asa').onclick = () => { if (!deslizado) plegarPanel(!ajustes.plegado); deslizado = false; };
  $('#panel-resumen').onclick = () => plegarPanel(false);
  $('#panel-asa').addEventListener('touchstart', (e) => { yInicio = e.touches[0].clientY; deslizado = false; }, { passive: true });
  $('#panel-asa').addEventListener('touchend', (e) => {
    if (yInicio == null) return;
    const dy = e.changedTouches[0].clientY - yInicio;
    yInicio = null;
    if (Math.abs(dy) > 30) { deslizado = true; plegarPanel(dy > 0); } // abajo = ocultar, arriba = mostrar
  });
  $('#lista').addEventListener('click', (e) => {
    if (e.target.id === 'btn-anadir') abrirNuevo(miPos ? L.latLng(miPos.lat, miPos.lng) : mapa.getCenter());
    if (e.target.id === 'btn-ver-dia') verDiaEnMapa();
  });

  // Los botones flotantes suben y bajan con el panel
  window.addEventListener('resize', medirCabecera);
  new ResizeObserver(() => {
    $('#app').style.setProperty('--alto-panel', $('#panel').offsetHeight + 'px');
  }).observe($('#panel'));

  window.addEventListener('online', () => { refrescar(); pintarSync(); });
  window.addEventListener('offline', pintarSync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refrescar(); pintar(); } });
  setInterval(() => { if (!document.hidden) refrescar(); }, 10000); // por si falla el aviso instantáneo
  setInterval(pintar, 60000);                                       // avisos de horario y "hace X min"
}

function plegarPanel(plegado) {
  ajustes.plegado = plegado;
  almacen.guardar('flo-ajustes', ajustes);
  $('#panel').classList.toggle('plegado', plegado);
  $('#panel-txt').textContent = plegado ? '▲ Mostrar' : '▼ Ocultar';
  $('#panel').scrollTop = 0;
}

function elegirDiaInicial() {
  const hoy = ahora().fecha;
  if (DATOS.dias.some((d) => d.fecha === hoy)) return hoy;
  const guardado = almacen.leer('flo-dia', null);
  if (guardado && (guardado.dia === 'todo' || DATOS.dias.some((d) => d.fecha === guardado.dia))) return guardado.dia;
  return DATOS.dias[0].fecha;
}

function iniciarApp() {
  $('#entrada').hidden = true;
  $('#app').hidden = false;
  const cache = almacen.leer('flo-cache', null);
  if (cache) { servidor = cache.servidor || {}; posiciones = cache.posiciones || []; mensajes = cache.mensajes || []; }
  diaSel = elegirDiaInicial();
  crearMapa();
  conectarEventos();
  plegarPanel(!!ajustes.plegado);
  pintar();
  setTimeout(verDiaEnMapa, 50);
  iniciarChat();
  iniciarGuiaBotones();
  conectar();
  refrescar();
  iniciarGPS();
}

function pedirEntrada(mensaje) {
  $('#app').hidden = true;
  $('#entrada').hidden = false;
  $('#entrada-error').textContent = mensaje || '';
  if (sesion?.nombre) $('#in-nombre').value = sesion.nombre;
}

function codigoNoValido() {
  sesion = Object.assign({}, sesion, { codigo: null });
  almacen.guardar('flo-sesion', sesion);
  location.reload();
}

async function entrar(e) {
  e.preventDefault();
  const nombre = $('#in-nombre').value.trim();
  const codigo = $('#in-codigo').value.trim();
  const boton = $('#btn-entrar');
  if (!/^\d{4}$/.test(codigo)) { $('#entrada-error').textContent = 'El código son 4 números'; return; }
  boton.disabled = true;
  boton.textContent = 'Comprobando…';
  try {
    const cliente = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, { auth: { persistSession: false } });
    const { data, error } = await cliente.rpc('leer', { p_codigo: codigo });
    if (error) throw error;
    if (!data.ok) {
      $('#entrada-error').textContent = 'Código incorrecto (si fallas muchas veces se bloquea una hora)';
      return;
    }
    sesion = { nombre, codigo };
    almacen.guardar('flo-sesion', sesion);
    servidor = data.estado || {};
    posiciones = data.posiciones || [];
    mensajes = data.mensajes || [];
    almacen.guardar('flo-cache', { servidor, posiciones, mensajes });
    iniciarApp();
  } catch (err) {
    console.warn(err);
    $('#entrada-error').textContent = 'No hay conexión. Inténtalo cuando tengas internet.';
  } finally {
    boton.disabled = false;
    boton.textContent = 'Entrar';
  }
}

async function arrancar() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  $('#form-entrada').addEventListener('submit', entrar);
  try {
    DATOS = await (await fetch('datos/florencia.json')).json();
  } catch {
    document.body.innerHTML = '<p style="padding:20px">No se pudieron cargar los datos. Comprueba la conexión y recarga.</p>';
    return;
  }
  if (!window.L || !window.supabase) {
    document.body.innerHTML = '<p style="padding:20px">Falta conexión para cargar el mapa la primera vez. Recarga cuando tengas internet.</p>';
    return;
  }
  if (sesion?.codigo && sesion?.nombre) iniciarApp();
  else pedirEntrada(sesion ? 'Vuelve a escribir el código' : '');
}

arrancar();
