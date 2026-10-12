/* =========================================================
   CHAT entre los dos: texto, fotos, mensajes de voz y ubicación.
   Se abre tocando el punto de la otra persona en el mapa
   o con el botón 💬.
   Usa cosas de app.js: sb, sesion, $, esc, almacen, mapa...
   ========================================================= */

'use strict';

let mensajes = [];                                     // últimos mensajes (sin fotos/audios)
let ultimoIdConocido = null;                           // para detectar mensajes nuevos
let vistoHasta = almacen.leer('flo-chat-visto', 0);    // último mensaje que he visto
const archivos = new Map();                            // id -> URL de la foto o audio ya descargado
const DURACION_MAX_AUDIO = 60;                         // segundos

// ---------- Recibir y contar ----------

function recibirMensajes(lista) {
  const antes = ultimoIdConocido;
  mensajes = lista;
  const ultimo = lista.length ? lista[lista.length - 1].id : 0;
  ultimoIdConocido = ultimo;
  if (antes === null || ultimo <= antes) {
    if (chatAbierto()) pintarMensajes();
    pintarInsignias();
    return;
  }

  // Hay mensajes nuevos
  const nuevos = lista.filter((m) => m.id > antes && m.de !== sesion.nombre);
  if (chatAbierto()) {
    pintarMensajes();
    marcarVisto();
  } else if (nuevos.length) {
    const m = nuevos[nuevos.length - 1];
    mostrarToast(`<b>💬 ${esc(m.de)}</b>${esc(resumenMensaje(m))}`, 'chat'); // 'chat': que dure más
    $('#toast').onclick = () => { $('#toast').hidden = true; abrirChat(); };
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
  }
  pintarInsignias();
}

function noLeidos() {
  if (!sesion) return 0;
  return mensajes.filter((m) => m.id > vistoHasta && m.de !== sesion.nombre).length;
}

function marcarVisto() {
  if (!mensajes.length) return;
  vistoHasta = mensajes[mensajes.length - 1].id;
  almacen.guardar('flo-chat-visto', vistoHasta);
  pintarInsignias();
}

function pintarInsignias() {
  const n = noLeidos();
  const ins = $('#chat-insignia');
  if (ins) { ins.textContent = n; ins.hidden = n === 0; }
  if (typeof pintarOtros === 'function' && mapa) pintarOtros();
}

function resumenMensaje(m) {
  if (m.tipo === 'foto') return '📷 Foto' + (m.texto ? ': ' + m.texto : '');
  if (m.tipo === 'audio') return `🎤 Mensaje de voz (${Math.round(m.duracion || 0)} s)`;
  if (m.tipo === 'ubicacion') return '📍 Ubicación';
  return m.texto || '';
}

// ---------- Ventana del chat ----------

function chatAbierto() { return $('#chat').open; }

function abrirChat() {
  const otros = [...new Set(mensajes.map((m) => m.de).concat(posiciones.map((p) => p.nombre)))]
    .filter((n) => n !== sesion.nombre);
  $('#chat-titulo').textContent = otros.length ? `Chat con ${otros.join(', ')}` : 'Chat';
  if (!chatAbierto()) $('#chat').showModal();
  pintarMensajes();
  marcarVisto();
}

function cerrarChat() {
  cancelarGrabacion();
  if (chatAbierto()) $('#chat').close();
}

function formatoHora(iso) {
  const d = new Date(iso);
  const hoy = new Date().toDateString() === d.toDateString();
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return hoy ? hora : `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} ${hora}`;
}

function pintarMensajes() {
  const caja = $('#chat-mensajes');
  const abajo = caja.scrollHeight - caja.scrollTop - caja.clientHeight < 80;
  if (!mensajes.length) {
    caja.innerHTML = '<p class="chat-vacio">Aún no hay mensajes.<br>Escribe algo, manda una foto 📷 o un audio 🎤</p>';
    return;
  }
  caja.innerHTML = mensajes.map((m) => {
    const mio = m.de === sesion.nombre;
    let cuerpo = '';
    if (m.tipo === 'texto') cuerpo = `<div class="burbuja-texto">${esc(m.texto)}</div>`;
    if (m.tipo === 'foto') {
      cuerpo = `<div class="burbuja-foto" data-archivo="${m.id}">${archivos.has(m.id) ? `<img src="${archivos.get(m.id)}" alt="Foto">` : '<span class="cargando">📷 Cargando foto…</span>'}</div>`
        + (m.texto ? `<div class="burbuja-texto">${esc(m.texto)}</div>` : '');
    }
    if (m.tipo === 'audio') {
      cuerpo = `<div class="burbuja-audio" data-archivo="${m.id}">${archivos.has(m.id) ? `<audio controls preload="metadata" src="${archivos.get(m.id)}"></audio>` : '<span class="cargando">🎤 Cargando audio…</span>'}</div>`;
    }
    if (m.tipo === 'ubicacion') {
      cuerpo = `<button class="burbuja-ubic" data-ver-lat="${m.lat}" data-ver-lng="${m.lng}" data-ver-de="${esc(m.de)}">📍 ${mio ? 'Mi ubicación' : 'Ubicación de ' + esc(m.de)}<br><small>Toca para verla en el mapa</small></button>`;
    }
    return `<div class="msj ${mio ? 'mio' : 'suyo'}">
        ${mio ? '' : `<div class="msj-de">${esc(m.de)}</div>`}
        ${cuerpo}
        <div class="msj-hora">${mio ? `<button class="msj-borrar" data-borrar="${m.id}" aria-label="Borrar mensaje">🗑</button>` : ''}${esc(formatoHora(m.creado))}</div>
      </div>`;
  }).join('');
  cargarArchivos();
  if (abajo || !caja.dataset.pintado) caja.scrollTop = caja.scrollHeight;
  caja.dataset.pintado = '1';
}

// Descarga las fotos y audios que aún no tenemos (solo de los mensajes visibles)
const descargando = new Set();
async function cargarArchivos() {
  for (const el of document.querySelectorAll('#chat-mensajes [data-archivo]')) {
    const id = Number(el.dataset.archivo);
    if (archivos.has(id) || descargando.has(id)) continue;
    descargando.add(id);
    try {
      const { data, error } = await sb.rpc('mensaje_archivo', { p_codigo: sesion.codigo, p_id: id });
      if (error || !data?.ok || !data.dato) throw error || new Error('sin dato');
      const blob = await (await fetch(data.dato)).blob(); // data URL -> archivo
      archivos.set(id, URL.createObjectURL(blob));
      const caja = $('#chat-mensajes');
      const abajo = caja.scrollHeight - caja.scrollTop - caja.clientHeight < 80;
      if (el.classList.contains('burbuja-foto')) {
        el.innerHTML = `<img src="${archivos.get(id)}" alt="Foto">`;
        el.querySelector('img').onload = () => { if (abajo) caja.scrollTop = caja.scrollHeight; };
      } else {
        el.innerHTML = `<audio controls preload="metadata" src="${archivos.get(id)}"></audio>`;
      }
    } catch (e) {
      console.warn('No se pudo cargar el archivo', id, e);
      el.innerHTML = '<span class="cargando">⚠️ No se pudo cargar (sin conexión)</span>';
    } finally {
      descargando.delete(id);
    }
  }
}

// ---------- Enviar ----------

async function enviarMensaje(datos) {
  if (!navigator.onLine) { mostrarToast('Sin conexión: no se ha enviado'); return false; }
  $('#chat-estado').textContent = 'Enviando…';
  try {
    const { data, error } = await sb.rpc('enviar_mensaje', {
      p_codigo: sesion.codigo, p_de: sesion.nombre, p_tipo: datos.tipo,
      p_texto: datos.texto || null, p_dato: datos.dato || null,
      p_lat: datos.lat ?? null, p_lng: datos.lng ?? null, p_duracion: datos.duracion ?? null
    });
    if (error) throw error;
    if (!data.ok) {
      mostrarToast(data.error === 'datos' ? 'No se pudo enviar (demasiado grande)' : 'Código no válido');
      return false;
    }
    avisarAlOtro();
    await refrescar();
    marcarVisto();
    return true;
  } catch (e) {
    console.warn(e);
    mostrarToast('No se pudo enviar. Comprueba la conexión.');
    return false;
  } finally {
    $('#chat-estado').textContent = '';
  }
}

async function enviarTexto() {
  const caja = $('#chat-texto');
  const texto = caja.value.trim();
  if (!texto) return;
  caja.disabled = true;
  const ok = await enviarMensaje({ tipo: 'texto', texto });
  caja.disabled = false;
  if (ok) { caja.value = ''; actualizarBotonEnviar(); }
  caja.focus();
}

// Reduce la foto (máx. 1280 px) para que ocupe poco y se envíe rápido
function comprimirFoto(archivo) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      const escala = Math.min(1, 1280 / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      URL.revokeObjectURL(url);
      resolver(lienzo.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error('No es una imagen')); };
    img.src = url;
  });
}

async function enviarFoto(archivo) {
  if (!archivo) return;
  try {
    $('#chat-estado').textContent = 'Preparando foto…';
    const dato = await comprimirFoto(archivo);
    const texto = $('#chat-texto').value.trim(); // si hay texto escrito, va como pie de foto
    const ok = await enviarMensaje({ tipo: 'foto', dato, texto });
    if (ok && texto) { $('#chat-texto').value = ''; actualizarBotonEnviar(); }
  } catch (e) {
    mostrarToast('No se pudo leer la foto');
    $('#chat-estado').textContent = '';
  }
}

async function borrarMensaje(id) {
  if (!confirm('¿Borrar este mensaje? También desaparecerá del otro móvil.')) return;
  try {
    const { data, error } = await sb.rpc('borrar_mensaje', { p_codigo: sesion.codigo, p_id: id, p_de: sesion.nombre });
    if (error || !data.ok) throw error || new Error('no');
    avisarAlOtro();
    await refrescar();
    pintarMensajes();
  } catch {
    mostrarToast('No se pudo borrar. Comprueba la conexión.');
  }
}

function enviarUbicacion() {
  if (!miPos) { mostrarToast('Aún no tengo tu posición GPS'); return; }
  enviarMensaje({ tipo: 'ubicacion', lat: miPos.lat, lng: miPos.lng });
}

// ---------- Mensajes de voz ----------

let grabadora = null, trozos = [], inicioGrabacion = 0, relojGrabacion = null, cancelada = false;

function formatoAudio() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  // mp4 primero: se oye bien tanto en iPhone como en Android
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

async function empezarGrabacion() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    mostrarToast('Este móvil no permite grabar audio desde el navegador');
    return;
  }
  let micro;
  try {
    micro = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    mostrarToast('<b>Micrófono bloqueado</b>Permite el micrófono para este sitio en los ajustes del navegador.');
    return;
  }
  const tipo = formatoAudio();
  grabadora = new MediaRecorder(micro, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : undefined);
  trozos = [];
  cancelada = false;
  grabadora.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data); };
  grabadora.onstop = async () => {
    micro.getTracks().forEach((t) => t.stop()); // apaga el micrófono
    clearInterval(relojGrabacion);
    $('#chat-grabando').hidden = true;
    $('#chat-barra').hidden = false;
    const duracion = (Date.now() - inicioGrabacion) / 1000;
    if (cancelada || duracion < 0.8 || !trozos.length) return;
    const blob = new Blob(trozos, { type: grabadora.mimeType || tipo || 'audio/webm' });
    const dato = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    enviarMensaje({ tipo: 'audio', dato: dato.replace(/^data:[^;,]*/, 'data:' + blob.type.split(';')[0]), duracion: Math.round(duracion * 10) / 10 });
  };
  grabadora.start(1000);
  inicioGrabacion = Date.now();
  $('#chat-barra').hidden = true;
  $('#chat-grabando').hidden = false;
  const pintarReloj = () => {
    const s = Math.floor((Date.now() - inicioGrabacion) / 1000);
    $('#chat-reloj').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (s >= DURACION_MAX_AUDIO) terminarGrabacion();
  };
  pintarReloj();
  relojGrabacion = setInterval(pintarReloj, 250);
}

function terminarGrabacion() {
  if (grabadora && grabadora.state !== 'inactive') grabadora.stop();
}

function cancelarGrabacion() {
  cancelada = true;
  terminarGrabacion();
}

// ---------- Botones ----------

function actualizarBotonEnviar() {
  const hayTexto = $('#chat-texto').value.trim().length > 0;
  $('#chat-enviar').hidden = !hayTexto;
  $('#chat-micro').hidden = hayTexto;
}

function iniciarChat() {
  if (mensajes.length) ultimoIdConocido = mensajes[mensajes.length - 1].id;
  $('#btn-chat').onclick = abrirChat;
  $('#chat-cerrar').onclick = cerrarChat;
  $('#chat').addEventListener('close', cancelarGrabacion);
  $('#chat-enviar').onclick = enviarTexto;
  $('#chat-texto').addEventListener('input', () => {
    actualizarBotonEnviar();
    const t = $('#chat-texto');
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 110) + 'px';
  });
  $('#chat-texto').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); enviarTexto(); }
  });
  $('#chat-foto').onclick = () => $('#chat-archivo').click();
  $('#chat-archivo').onchange = (e) => { enviarFoto(e.target.files[0]); e.target.value = ''; };
  $('#chat-ubic').onclick = enviarUbicacion;
  $('#chat-micro').onclick = empezarGrabacion;
  $('#chat-grab-cancelar').onclick = cancelarGrabacion;
  $('#chat-grab-enviar').onclick = terminarGrabacion;

  // Tocar una foto la abre en grande; tocar una ubicación la enseña en el mapa
  $('#chat-mensajes').addEventListener('click', (e) => {
    const borrar = e.target.closest('[data-borrar]');
    if (borrar) { borrarMensaje(Number(borrar.dataset.borrar)); return; }
    const img = e.target.closest('.burbuja-foto img');
    if (img) { $('#foto-grande img').src = img.src; $('#foto-grande').showModal(); return; }
    const u = e.target.closest('[data-ver-lat]');
    if (u) {
      cerrarChat();
      const ll = [Number(u.dataset.verLat), Number(u.dataset.verLng)];
      seguir = false;
      mapa.setView(ll, 18);
      L.popup().setLatLng(ll).setContent(`📍 ${esc(u.dataset.verDe)}`).openOn(mapa);
    }
  });
  $('#foto-grande').onclick = () => $('#foto-grande').close();
  actualizarBotonEnviar();
  pintarInsignias();
}
