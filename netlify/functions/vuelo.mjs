// Intermediario para el estado de un vuelo en Aena (aeropuertos españoles).
// Aena no deja que otra web lea sus datos desde el navegador, así que la app
// pregunta aquí y esta función se lo pide a Aena y devuelve solo ese vuelo.
// Uso: /.netlify/functions/vuelo?aeropuerto=BCN&tipo=S&cia=VY&num=6070&fecha=17/11/2026
//   tipo S = salidas, L = llegadas. Aena solo publica los vuelos de hoy y mañana.
export default async (req) => {
  const q = new URL(req.url).searchParams;
  const aeropuerto = (q.get('aeropuerto') || '').toUpperCase();
  const tipo = q.get('tipo') === 'L' ? 'L' : 'S';
  const cia = (q.get('cia') || '').toUpperCase();
  const num = (q.get('num') || '').replace(/^0+/, '');
  const fecha = q.get('fecha') || '';
  if (!/^[A-Z]{3}$/.test(aeropuerto) || !/^[A-Z0-9]{2}$/.test(cia) || !/^\d{1,4}$/.test(num) || !/^(\d{2}\/\d{2}\/\d{4})?$/.test(fecha)) {
    return responder({ ok: false, error: 'datos' }, 400);
  }
  try {
    const url = `https://www.aena.es/sites/Satellite?pagename=AENA_ConsultarVuelos&airport=${aeropuerto}&flightType=${tipo}&dosDias=si`;
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return responder({ ok: false, error: 'aena' }, 502);
    const lista = await r.json();
    const v = lista.find((x) => String(x.numVuelo).replace(/^0+/, '') === num && x.iataCompania === cia && (!fecha || x.fecha === fecha));
    if (!v) return responder({ ok: true, vuelo: null });
    const limpio = (s) => (s && s !== 'null' ? s : null);
    return responder({
      ok: true,
      vuelo: {
        estado: v.estado,
        programada: (v.horaProgramada || '').slice(0, 5),
        estimada: (v.horaEstimada || '').slice(0, 5),
        fecha: v.fecha,
        fechaEstimada: v.fechaEstimada,
        terminal: limpio(v.terminal),
        puerta: limpio(v.puertaPrimera),
        mostradores: limpio(v.mostradorDesde) ? `${v.mostradorDesde}${limpio(v.mostradorHasta) ? '–' + v.mostradorHasta : ''}` : null,
        cinta: limpio(v.cintaPrimera),
        otro: v.ciudadIataOtro || v.iataOtro,
      },
      consultado: new Date().toISOString(),
    });
  } catch (e) {
    return responder({ ok: false, error: 'aena' }, 502);
  }
};

function responder(cuerpo, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
  });
}
