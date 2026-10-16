#!/usr/bin/env python3
"""Clima normal de un sitio para unas fechas (10 años del archivo de Open-Meteo).

Uso:  python3 clima.py LAT LNG MES DIA_INI DIA_FIN
      python3 clima.py 43.77 11.25 11 10 30
Fechas: usa unos 10 días antes y después del viaje dentro del mismo mes (viaje del
17 al 24 de noviembre -> 10 30), para tener ~200 días de muestra y no solo 20.
Si Open-Meteo responde 429 (límite diario), reintenta solo; si sigue fallando,
deja el campo "clima" sin poner: la app muestra entonces "Previsión no disponible".
Salida (JSON para el campo "clima" de un día o una parte):
      {"max": 15, "min": 6, "lluvia": 0.4}
lluvia = proporción de días con 1 mm o más.
"""
import json, statistics, sys, urllib.request

lat, lng, mes, d1, d2 = float(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
ultimo = 2024
url = (f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lng}"
       f"&start_date={ultimo - 9}-01-01&end_date={ultimo}-12-31"
       "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto")
import time, urllib.error
for intento in range(4):
    try:
        j = json.load(urllib.request.urlopen(url, timeout=120))["daily"]
        break
    except urllib.error.HTTPError as e:
        if e.code != 429 or intento == 3:
            sys.exit(f"Open-Meteo no responde ({e.code}): deja 'clima' sin poner y avisa.")
        time.sleep(20 * (intento + 1))
mx, mn, ll = [], [], []
for t, a, b, p in zip(j["time"], j["temperature_2m_max"], j["temperature_2m_min"], j["precipitation_sum"]):
    if int(t[5:7]) == mes and d1 <= int(t[8:10]) <= d2 and a is not None and b is not None:
        mx.append(a); mn.append(b); ll.append(1 if (p or 0) >= 1 else 0)
print(json.dumps({"max": round(statistics.mean(mx)), "min": round(statistics.mean(mn)),
                  "lluvia": round(sum(ll) / len(ll), 2)}))
