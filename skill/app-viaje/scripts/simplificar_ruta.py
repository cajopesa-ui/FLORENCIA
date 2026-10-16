#!/usr/bin/env python3
"""Simplifica una ruta de TomTom (vértices [lon, lat]) para dibujarla en el esquema.

Uso:  python3 simplificar_ruta.py ruta.json [max_puntos=150]
      ruta.json: lista [[lon, lat], ...] o un GeoJSON (FeatureCollection/Feature/LineString)
Salida: lista [[lat, lng], ...] con 5 decimales (Douglas-Peucker; conserva el primero y el último).
"""
import json, sys

def vertices(g):
    if isinstance(g, list): return g
    t = g.get("type")
    if t == "FeatureCollection": return [v for f in g["features"] for v in vertices(f)]
    if t == "Feature": return vertices(g["geometry"])
    if t == "LineString": return g["coordinates"]
    if t == "MultiLineString": return [v for l in g["coordinates"] for v in l]
    return []

def rdp(p, tol):
    if len(p) < 3: return p
    (x1, y1), (x2, y2) = p[0], p[-1]
    dx, dy = x2 - x1, y2 - y1
    den = (dx * dx + dy * dy) ** .5 or 1e-12
    dist = [abs(dy * x - dx * y + x2 * y1 - y2 * x1) / den for x, y in p[1:-1]]
    i = max(range(len(dist)), key=dist.__getitem__)
    if dist[i] <= tol: return [p[0], p[-1]]
    return rdp(p[:i + 2], tol)[:-1] + rdp(p[i + 1:], tol)

pts = [tuple(v[:2]) for v in vertices(json.load(open(sys.argv[1])))]
maximo = int(sys.argv[2]) if len(sys.argv) > 2 else 150
tol = 0.0008
out = rdp(pts, tol)
while len(out) > maximo:
    tol *= 1.15
    out = rdp(pts, tol)
print(json.dumps([[round(lat, 5), round(lon, 5)] for lon, lat in out]))
