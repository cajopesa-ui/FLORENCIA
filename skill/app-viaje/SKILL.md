---
name: app-viaje
description: Crea una app web (PWA) de viaje compartida entre 2 personas para cualquier destino, copiando una app real que ya funciona (la del viaje a Florencia y Toscana) y cambiando solo los datos. Mapa con GPS, visitas de cada día con horas, calles recomendadas, varios pueblos por día, transporte, brújula y "Guiarme", chat con fotos/voz/ubicación, guiar hasta la otra persona, tiempo previsto, hoteles, parkings, esquema del viaje y sincronización en tiempo real con código de 4 dígitos (Supabase) publicada en Netlify. Úsala SIEMPRE que el usuario quiera una app, guía o mapa para un viaje o una escapada ("hazme la app de Roma", "quiero lo mismo que Florencia para Lisboa", "app con los sitios a visitar y el GPS", "guía compartida del viaje con mi pareja"), aunque no diga "app" ni "skill", y también para añadir días, ciudades, hoteles o cambios a una app de viaje hecha con esta plantilla.
---

# App de viaje compartida

Esta skill reproduce una app que ya está probada en el mundo real. La regla de oro es
**copiar la plantilla y cambiar los datos**, no reescribir el código: cada función de la
plantilla resuelve un problema que costó encontrar (pestañas que no caben en 320 px,
desplegables que se cierran al repintar, cámara en Android, etiquetas del mapa que se
pisan…). Si reescribes, vuelven los fallos.

El usuario suele ser principiante: háblale en español claro, sin jerga, y explica en
una frase lo que hace falta cuando tenga que actuar él (por ejemplo, pegar un SQL).

## Qué hay en la skill

| Ruta | Qué es | Cuándo leerlo |
|---|---|---|
| `assets/plantilla/` | El código completo de la app (HTML, CSS, JS, service worker, manifest, netlify.toml, iconos de ejemplo) y `datos/viaje.json` con el viaje real de Florencia como **ejemplo de formato** | Copiarlo siempre al empezar |
| `references/especificacion.md` | La especificación completa: cada función, el formato de los datos, la base de datos, cómo probar, lecciones aprendidas | Léelo entero antes de rellenar los datos; vuelve a él ante cualquier duda |
| `references/supabase.sql` | Tablas, funciones y permisos de la base de datos | Al crear el proyecto de Supabase |
| `scripts/clima.py` | Clima normal del mes en un sitio (10 años de Open-Meteo) | Para el campo `clima` de cada día/pueblo |
| `scripts/simplificar_ruta.py` | Reduce una ruta de TomTom a ≤150 puntos | Si dibujas rutas por carretera |
| `scripts/prueba_movil.mjs` | Prueba la app en un móvil simulado sin tocar la base de datos real | Después de cada cambio |
| `scripts/iconos.mjs` | Genera los PNG del icono desde `iconos/icono.svg` | Al hacer el icono del destino |

## Pasos

### 1. Reunir los datos del viaje
Pide (o saca de los archivos que te den): destino y fechas, días con sus visitas y horas,
calles imprescindibles y fuera de ruta, transporte, hoteles (mejor la captura de la
reserva: nombre, dirección, horas de entrada y salida), si hay coche y dónde se recoge,
quiénes usan la app y el código de 4 dígitos. Si hay un esquema o PDF del viaje, úsalo
para el `esquema`. Antes de construir, repasa que cuadra: dónde se duerme cada noche,
de dónde se sale cada mañana, y horarios según el día de la semana. Pregunta lo que no
esté claro en vez de suponerlo (el usuario agradece "entiendes? no hagas nada": cuando
lo diga, solo explica y espera).

### 2. Copiar la plantilla
Copia `assets/plantilla/` a la carpeta del proyecto. Sustituye los marcadores:
- `__TITULO__`, `__DESCRIPCION__`, `__FECHAS__` (p. ej. "12 – 13 de mayo") en `index.html` y `manifest.webmanifest`; `__LOGO__` en `index.html` (un emoji del destino, sale en la pantalla de entrada).
- Color principal (opcional): `#7c2d12` en `style.css` (`--principal` y el degradado de la entrada), `index.html` (theme-color), el manifest y el icono. Cámbialo solo si el destino tiene un color típico o el usuario lo pide.
- `__SUPABASE_URL__`, `__SUPABASE_ANON_KEY__` en `config.js` (paso 4).
- Deja `VERSION = 'viaje-v1'` en `sw.js` y súbelo en cada cambio publicado.
- Crea un `iconos/icono.svg` con un monumento típico del destino y ejecuta `node scripts/iconos.mjs <carpeta>`.

### 3. Escribir `datos/viaje.json`
Sustitúyelo entero, con la misma estructura que el ejemplo (sección 4 de la
especificación). Además de lo que describe la especificación, la plantilla lee:
- `zonaHoraria` (p. ej. `"Europe/Lisbon"`): la app calcula "hoy" y las horas en el destino.
- `mesViaje` (p. ej. `"mayo"`): para el texto "Normal en mayo en …" del tiempo.
- `ciudadesBase`: `[{nombre, lat, lng, radio}]` de las ciudades grandes (la píldora 📍 y el resaltado del esquema).
- En un día del esquema sin pestaña (la vuelta): `irTexto` (texto del botón) y `nota`.
- Días SIN varias ciudades: `ciudad`, `lat`, `lng` (el centro de sus visitas) y `clima`; sus calles van sin `parte`.
- Partes (ciudades de un día): `clima` cada una, y `etiqueta` si el nombre es largo para el mapa del esquema ("Monte Oliveto").
- Vuelos en `esquema.vuelos` (ver especificación). Los datos personales de la reserva (nombres, equipaje, localizador) NUNCA en `viaje.json`, que es público: van en la base de datos con la clave `privado:vuelos`.
- `transporte.busCerca` (ids de lugares con un bus útil cerca) con `busAviso` (aviso cuando estás allí) y `busFicha` (texto en la ficha del lugar). Opcional: sin ellos no sale nada.
- Salidas en tren/bus/coche: lugar con `salida: true` y su hora. Si la salida está en otra ciudad que la parte (el tren desde Lisboa al empezar el día de Sintra), ponla en esa parte con `sinEncuadre: true`; "Siguiente" avanza al marcarla como hecha.
- Esquema: `tren: true` dibuja la ruta de puntos; `carretera: true` solo indica que la ruta viene de TomTom. Sin TomTom, línea recta entre los puntos clave, empezando y acabando en el hotel.

Coordenadas: si tienes el conector de **TomTom**, úsalo (geocode encuentra el número del
portal; verifica cada sitio a < 60 m de su POI); si no, Nominatim (máximo 1 petición por
segundo, con User-Agent propio). Para muchas consultas, repártelas en subagentes que
devuelvan JSON compacto. Clima: `python3 scripts/clima.py LAT LNG MES DIA_INI DIA_FIN`
(unos 10 días antes y después del viaje dentro del mismo mes; si falla, deja `clima` sin poner).

Revisa lo que diga el usuario contra la realidad antes de copiarlo: hora del atardecer
de esas fechas, horarios de apertura según el día de la semana, tiempos entre pueblos.
Si algo no cuadra (p. ej. "atardecer a las 17:30" en mayo, cuando es a las 20:40),
pregúntalo. Si te falta un dato y no puedes preguntar (o el usuario dice que sigas),
pon una suposición razonable y apúntala para decírsela al final; nunca la presentes como
un dato confirmado.

### 4. Base de datos (Supabase)
Proyecto **nuevo** (el plan gratis permite 2 activos; si no hay hueco, avisa). Ejecuta
`references/supabase.sql` cambiando `'0000'` por el código del usuario. Copia la URL y la
clave pública (anon) a `config.js`. Nunca metas datos de prueba en la base real.

### 5. Probar
`CODIGO=<código> node scripts/prueba_movil.mjs <carpeta_app> "iPhone SE" <fecha del viaje> <lat,lng>`
y repite con "iPhone 13" y "Pixel 7". Mira las capturas que deja en `<carpeta_app>/../capturas/`
(fuera de la app, para no publicarlas): nada debe salirse de la pantalla ni taparse.
El script simula todas las llamadas a Supabase, así que funciona antes de crear la base
de datos y nunca escribe en la real. El fondo del mapa puede salir gris si el entorno no
deja cargar las teselas: no es un fallo. La especificación (sección 8) explica las pruebas de
chat, brújula, sin conexión y tiempo (simulando fechas).

### 6. README y publicar
Escribe un `README.md` en español para el usuario (cómo se usa cada cosa, como el de la
especificación) y apunta en él las suposiciones que hayas hecho.
Repositorio de GitHub (rama main) y Netlify (sitio nuevo "<destino>-viaje"; el permiso de
despliegue caduca, pide uno nuevo cada vez). Comprueba que la web sirve la `VERSION` nueva.
Al terminar, dile al usuario: la URL, el código, cómo instalarla en iPhone (Compartir →
Añadir a pantalla de inicio) y Android (⋮ → Instalar app), y que Supabase gratis se pausa
tras 7 días sin uso (se reactiva con "Restore project").

## Cambios posteriores
Cuando el usuario pida cambios (otro día, cambiar el orden de los días, un hotel nuevo…),
cambia todo lo relacionado a la vez: lugares y calles (`dia`, `parte`), partes (orden,
`desde`, `llegar`), horas, consejos del día **y los de cada pueblo** (`"<fecha>:<parte>"`),
transporte, esquema (rutas, noches, hoteles) y README. Prueba, haz commit, súbelo y publica.
Mantén también actualizada esta skill si añades funciones nuevas a la app.
