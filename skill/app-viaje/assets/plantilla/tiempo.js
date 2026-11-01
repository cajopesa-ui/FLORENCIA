/* =========================================================
   TIEMPO: previsión del día y la ciudad que se están viendo
   - Hasta 7 días antes: previsión (Open-Meteo, gratis y sin clave).
   - De 8 a 15 días: la misma previsión, marcada como "orientativa".
   - Antes: el clima normal del mes (datos.mesViaje, calculado con 10 años de datos).
   - Se guarda en el móvil para verla sin cobertura.
   Usa cosas de app.js: DATOS, diaSel, diaInfo, parteActual, almacen...
   ========================================================= */

'use strict';

const TIEMPO_FRESCO = 60 * 60000;          // volver a preguntar pasada 1 hora
const TIEMPO_REINTENTO = 2 * 60000;        // si falla, no insistir hasta 2 min después
let tiempoGuardado = almacen.leer('viaje-tiempo', {});   // { "lat,lng": { cuando, daily, hourly } }
const tiempoPidiendo = new Set();
const tiempoFallo = {};

const CIELO = {
  0: ['☀️', 'Despejado'], 1: ['🌤️', 'Casi despejado'], 2: ['⛅', 'Nubes y claros'], 3: ['☁️', 'Nublado'],
  45: ['🌫️', 'Niebla'], 48: ['🌫️', 'Niebla'],
  51: ['🌦️', 'Llovizna'], 53: ['🌦️', 'Llovizna'], 55: ['🌧️', 'Llovizna'], 56: ['🌧️', 'Llovizna helada'], 57: ['🌧️', 'Llovizna helada'],
  61: ['🌦️', 'Lluvia débil'], 63: ['🌧️', 'Lluvia'], 65: ['🌧️', 'Lluvia fuerte'], 66: ['🌧️', 'Lluvia helada'], 67: ['🌧️', 'Lluvia helada'],
  71: ['🌨️', 'Nieve'], 73: ['🌨️', 'Nieve'], 75: ['🌨️', 'Nieve'], 77: ['🌨️', 'Nieve'],
  80: ['🌦️', 'Chubascos'], 81: ['🌧️', 'Chubascos'], 82: ['🌧️', 'Chubascos fuertes'], 85: ['🌨️', 'Chubascos de nieve'], 86: ['🌨️', 'Chubascos de nieve'],
  95: ['⛈️', 'Tormenta'], 96: ['⛈️', 'Tormenta con granizo'], 99: ['⛈️', 'Tormenta con granizo']
};

// Qué sitio y qué fecha se están viendo (en un día con varias ciudades, la elegida)
function sitioTiempo() {
  if (!DATOS || !diaSel || diaSel === 'todo') return null;
  const d = diaInfo(diaSel);
  const pt = d.partes ? (d.partes.find((x) => x.id === parteActual(d.fecha)) || d.partes[0]) : null;
  const s = pt || d;
  if (s.lat == null) return null;
  return {
    nombre: pt ? pt.nombre : (d.ciudad || d.zona),
    lat: s.lat, lng: s.lng, clima: s.clima,
    fecha: d.fecha === 'prueba' ? ahora().fecha : d.fecha     // el día de prueba: hoy
  };
}

function diasHasta(fecha) {
  const a = (f) => Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10));
  return Math.round((a(fecha) - a(ahora().fecha)) / 86400000);
}

async function pedirTiempo(clave, lat, lng) {
  if (tiempoPidiendo.has(clave) || Date.now() - (tiempoFallo[clave] || 0) < TIEMPO_REINTENTO) return;
  tiempoPidiendo.add(clave);
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max' +
      '&hourly=precipitation_probability,weather_code&current=weather_code,temperature_2m,is_day' +
      '&timezone=auto&forecast_days=16';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const j = await resp.json();
    tiempoGuardado[clave] = { cuando: Date.now(), daily: j.daily, hourly: j.hourly, current: j.current };
    almacen.guardar('viaje-tiempo', tiempoGuardado);
  } catch (e) {
    tiempoFallo[clave] = Date.now();
  } finally {
    tiempoPidiendo.delete(clave);
    pintarTiempo();
  }
}

// Cielo del día: el de las horas de visita (9 a 20), no el peor de las 24 h.
// Open-Meteo da como código del día el más grave de todo el día (p. ej. nubes a las 2
// de la madrugada); aquí se usa el más repetido de día, y lluvia solo si llueve 2 h o más.
function codigoDeDia(hourly, fecha) {
  if (!hourly?.weather_code) return null;
  const cods = hourly.time.map((t, i) => [t, hourly.weather_code[i]])
    .filter(([t, c]) => t.startsWith(fecha) && +t.slice(11, 13) >= 9 && +t.slice(11, 13) < 20 && c != null)
    .map(([, c]) => c);
  if (!cods.length) return null;
  const lluvia = cods.filter((c) => c >= 51);
  if (lluvia.length >= 2) return Math.max(...lluvia);
  const veces = {};
  for (const c of cods) veces[c] = (veces[c] || 0) + 1;
  return +Object.keys(veces).sort((a, b) => veces[b] - veces[a] || a - b)[0];
}

// "☔ Lluvia probable de 15 a 18 h" (horas de visita, de 9 a 20)
function horasDeLluvia(hourly, fecha) {
  if (!hourly) return '';
  const horas = [];
  hourly.time.forEach((t, i) => {
    const h = +t.slice(11, 13);
    if (t.startsWith(fecha) && h >= 9 && h < 20 && hourly.precipitation_probability[i] >= 50) horas.push(h);
  });
  if (!horas.length) return '';
  return `☔ Lluvia probable de ${horas[0]} a ${horas[horas.length - 1] + 1} h`;
}

function textoClima(s) {
  if (!s.clima) return '';
  return `📅 Normal en ${esc(DATOS.mesViaje || 'estas fechas')} en ${esc(s.nombre)}: <b>${s.clima.max}° / ${s.clima.min}°</b> · llueve ${Math.round(s.clima.lluvia * 10)} de cada 10 días`;
}

function pintarTiempo() {
  const caja = $('#tiempo');
  if (!caja) return;
  const s = sitioTiempo();
  const faltan = s ? diasHasta(s.fecha) : -1;
  if (!s || faltan < 0) { caja.innerHTML = ''; return; }

  // Lejos todavía: el clima normal de la zona
  if (faltan > 15) {
    caja.innerHTML = `<div class="tiempo">${textoClima(s)}<div class="tiempo-nota">La previsión saldrá unos 15 días antes.</div></div>`;
    return;
  }

  const clave = `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`;
  const g = tiempoGuardado[clave];
  if (!g || !g.hourly?.weather_code || Date.now() - g.cuando > TIEMPO_FRESCO) pedirTiempo(clave, s.lat, s.lng);
  const i = g ? g.daily.time.indexOf(s.fecha) : -1;
  if (i < 0) {
    caja.innerHTML = `<div class="tiempo">${tiempoPidiendo.has(clave) ? '⏳ Buscando la previsión…' : (textoClima(s) || '🌡️ Previsión no disponible ahora.')}</div>`;
    return;
  }

  const dd = g.daily;
  const [icono, cielo] = CIELO[codigoDeDia(g.hourly, s.fecha) ?? dd.weather_code[i]] || ['🌡️', ''];
  // Hoy: además, el tiempo de ahora mismo
  const c = faltan === 0 && g.current && Date.now() - g.cuando < 3 * 60 * 60000 ? g.current : null;
  const ahoraTxt = c ? `<div class="tiempo-nota">Ahora: ${(c.is_day ? (CIELO[c.weather_code] || [''])[0] : '🌙')} ${Math.round(c.temperature_2m)}° · ${esc((CIELO[c.weather_code] || ['', ''])[1])}</div>` : '';
  const lluvia = horasDeLluvia(g.hourly, s.fecha);
  const antiguedad = Date.now() - g.cuando > 3 * 60 * 60000 ? ` · actualizada ${haceCuanto(new Date(g.cuando).toISOString())}` : '';
  caja.innerHTML = `<div class="tiempo">
      <div class="tiempo-linea"><span class="tiempo-icono">${icono}</span>
        <span><b>${esc(s.nombre)}</b> · ${esc(cielo)}<br>
        <b>${Math.round(dd.temperature_2m_max[i])}° / ${Math.round(dd.temperature_2m_min[i])}°</b> · 💧 ${dd.precipitation_probability_max[i] ?? '–'} % · 🌬️ ${Math.round(dd.wind_speed_10m_max[i])} km/h</span>
        ${faltan > 7 ? '<span class="tiempo-orient">orientativa</span>' : ''}</div>
      ${lluvia ? `<div class="tiempo-lluvia">${lluvia}</div>` : ''}
      ${ahoraTxt}
      <div class="tiempo-nota">Previsión de Open-Meteo (cielo de 9 a 20 h)${antiguedad}</div>
    </div>`;
}

// ---------- Pestaña "Todo": un símbolo del tiempo en la tarjeta de cada día ----------
// Una sola petición con todos los pueblos del viaje. En un día con varios pueblos
// sale el peor tiempo de ellos (el código WMO más alto: la lluvia pesa más que las nubes).
let tiempoTodo = almacen.leer('viaje-tiempo-todo', null);   // { cuando, sitios: { "lat,lng": { time, weather_code } } }
let tiempoTodoPidiendo = false, tiempoTodoFallo = 0;

function sitiosDelDia(fecha) {
  const d = DATOS.dias.find((x) => x.fecha === fecha);
  if (!d || fecha === 'prueba') return [];
  return (d.partes || [d]).filter((s) => s.lat != null).map((s) => `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`);
}

function iconoTiempoDia(fecha) {
  const faltan = diasHasta(fecha);
  if (faltan < 0 || faltan > 15) return '';               // sin previsión todavía (o día pasado)
  if (!tiempoTodo || !tiempoTodo.conHoras || Date.now() - tiempoTodo.cuando > TIEMPO_FRESCO) pedirTiempoTodo();
  if (!tiempoTodo) return '';
  const codigos = sitiosDelDia(fecha).map((c) => {
    const s = tiempoTodo.sitios[c];
    if (s?.hourly) return codigoDeDia(s.hourly, fecha);
    const i = s ? s.time.indexOf(fecha) : -1;
    return i < 0 ? null : s.weather_code[i];
  }).filter((c) => c != null);
  if (!codigos.length) return '';
  const [icono, cielo] = CIELO[Math.max(...codigos)] || ['', ''];
  return icono ? `<span class="esq-tiempo ${faltan > 7 ? 'orientativa' : ''}" title="${esc(cielo)}${faltan > 7 ? ' (orientativa)' : ''}">${icono}</span>` : '';
}

async function pedirTiempoTodo() {
  if (tiempoTodoPidiendo || Date.now() - tiempoTodoFallo < TIEMPO_REINTENTO) return;
  const claves = [...new Set(DATOS.dias.flatMap((d) => sitiosDelDia(d.fecha)))];
  if (!claves.length) return;
  tiempoTodoPidiendo = true;
  try {
    const lat = claves.map((c) => c.split(',')[0]).join(','), lng = claves.map((c) => c.split(',')[1]).join(',');
    const resp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code&timezone=auto&forecast_days=16`);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    let j = await resp.json();
    if (!Array.isArray(j)) j = [j];
    const sitios = {};
    claves.forEach((c, i) => { if (j[i]?.daily) sitios[c] = j[i].daily; });
    tiempoTodo = { cuando: Date.now(), sitios };
    almacen.guardar('viaje-tiempo-todo', tiempoTodo);
    if (diaSel === 'todo') pintar();
  } catch (e) {
    tiempoTodoFallo = Date.now();
  } finally {
    tiempoTodoPidiendo = false;
  }
}
