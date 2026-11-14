// Intermediario para el cartel 🎬: edificio o monumento importante más cercano
// (iglesia, museo, palacio, torre, fuente, plaza…) según OpenStreetMap (Overpass).
// Uso: /.netlify/functions/edificio?lat=43.09271&lng=11.78098&precision=10
const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

// Cuanto más importante, menos "penalización" (en metros) al comparar distancias
function importancia(t) {
  const b = t.building, h = t.historic, tu = t.tourism, a = t.amenity;
  if (a === 'place_of_worship' || ['church', 'cathedral', 'chapel', 'basilica', 'monastery'].includes(b)) return 0;
  if (tu === 'museum' || tu === 'gallery') return 0;
  if (['castle', 'palace', 'monument', 'tower', 'city_gate', 'church', 'monastery', 'fort', 'citywalls', 'archaeological_site', 'cathedral'].includes(h)) return 0;
  if (['palace', 'tower', 'castle'].includes(b) || t.man_made === 'tower') return 5;
  if (tu === 'attraction' || a === 'fountain' || a === 'theatre' || t.place === 'square' || tu === 'viewpoint' || h === 'memorial' || tu === 'artwork') return 15;
  if (t.leisure === 'park' || t.leisure === 'garden') return 20;
  if (h) return 20;
  return null;                                   // tiendas, bares, hoteles… no cuentan
}

function distancia(lat1, lng1, lat2, lng2) {
  const kx = Math.cos(lat1 * Math.PI / 180) * 111320;
  return Math.hypot((lng2 - lng1) * kx, (lat2 - lat1) * 110540);
}
// Distancia al rectángulo del edificio (0 si estoy dentro)
function distanciaCaja(lat, lng, bb) {
  const la = Math.min(Math.max(lat, bb.minlat), bb.maxlat), ln = Math.min(Math.max(lng, bb.minlon), bb.maxlon);
  return distancia(lat, lng, la, ln);
}

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get('lat')), lng = Number(q.get('lng'));
  const precision = Math.min(Math.max(Number(q.get('precision')) || 0, 0), 25);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return responder({ ok: false, error: 'datos' }, 400);
  const radio = 45 + precision;
  const consulta = `[out:json][timeout:8];(nwr(around:${radio + 60},${lat},${lng})[name][~"^(historic|tourism|amenity|building|man_made|leisure|place)$"~"."];);out tags center bb 60;`;
  for (const url of SERVIDORES) {
    try {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(consulta),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'viaje-app/1.0' }, signal: AbortSignal.timeout(9000) });
      if (!r.ok) continue;
      const j = await r.json();
      const cand = [];
      for (const e of j.elements || []) {
        const t = e.tags || {};
        const pen = importancia(t);
        if (pen === null) continue;
        const d = e.bounds ? distanciaCaja(lat, lng, e.bounds) : distancia(lat, lng, e.lat ?? e.center?.lat, e.lon ?? e.center?.lon);
        if (!(d <= radio)) continue;
        cand.push({ nombre: t['name:es'] || t.name, d: Math.round(d), puntos: d + pen });
      }
      cand.sort((a, b) => a.puntos - b.puntos);
      return responder({ ok: true, edificio: cand[0] ? { nombre: cand[0].nombre, d: cand[0].d } : null, otros: cand.slice(1, 4).map((c) => c.nombre) });
    } catch { /* probar el siguiente servidor */ }
  }
  return responder({ ok: false, error: 'mapa' }, 502);
};

function responder(cuerpo, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}
