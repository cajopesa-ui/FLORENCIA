# Florencia (17-19), Lucca-Pisa (20), Toscana sur (21-22) y Chianti (23 de noviembre)

App web compartida para el viaje: mapa con tu posición GPS, las visitas de cada día,
las calles recomendadas, el transporte público y lo que vais marcando los dos en tiempo real.

## Cómo se usa

1. Abre la dirección de la app en el móvil.
2. Escribe tu nombre y el **código de 4 dígitos** del viaje.
3. Acepta el permiso de **ubicación**.
4. Añádela a la pantalla de inicio:
   - **iPhone (Safari):** botón Compartir → «Añadir a pantalla de inicio».
   - **Android (Chrome):** menú ⋮ → «Añadir a pantalla de inicio» o «Instalar app».

### En la app

| Qué | Cómo |
|---|---|
| Cambiar de día | Pestañas de arriba (Mar 17 … Lun 23, y Todo) |
| Viernes: Lucca o Pisa | Debajo de las pestañas: **🌅 Lucca · mañana** / **🌇 Pisa · tarde** (en coche, recogido en el aeropuerto de Florencia; noche en Pisa). Se elige sola según dónde estés o la hora |
| Sábado: 3 pueblos | Botones **🗼 S. Gimignano · 🏰 Monteriggioni · 🐎 Siena** (con la hora de cada uno; de Pisa a Siena, noche en Siena). Al terminar uno, «Siguiente» propone el siguiente con **🚗 Ir en coche** |
| Domingo: 5 pueblos | **🏘️ Asciano · ⛪ Oliveto · 🌳 Quirico · ♨️ Vignoni · 🧀 Pienza** (noche en Siena) |
| Lunes: Chianti | **🏰 Castellina · 🥩 Panzano · 🍷 Greve** (ida y vuelta a Siena; el martes 24, vuelta al aeropuerto de Florencia a devolver el coche) |
| Esquema del viaje | Pestaña **Todo** (o ⚙️ → Esquema): tarjetas de los 8 días (toca una para ir a ese día), hoteles y, en el mapa, la ruta de cada día, los 🏨 y el **nombre de cada pueblo** (toca uno para ir a ese día y ese pueblo; el pueblo donde estás sale **resaltado en azul** con 📍) |
| Hoteles | Toca el **🏨** en el mapa (sale en Todo y en cada día: el de la noche anterior y el de esa noche): nombre, dirección, horas de entrada y salida, **🧭 Guiarme** y cómo llegar en coche o a pie |
| Aparcar y repostar | En cada pueblo, al final de la lista: **🅿️ parkings** fuera de la ZTL (cuadradito azul **P** en el mapa) y **⛽ gasolineras**. Su ficha tiene «🚗 Ir en coche» |
| Vuelos | En **Todo** (apartado ✈️ Vuelos) y arriba del martes 17: número, horas, «📡 Estado del vuelo» y cómo ir al aeropuerto. Los pasajeros, el equipaje y el localizador van en la parte **🔒 protegida por el código** (no en el archivo público) |
| Coche de alquiler | En **Todo → Vuelos y coche**: Centauro, recogida vie 20 11:00 y devolución mar 24 12:30, qué incluye, qué llevar y 🧭 a la oficina. Bono, conductor y precio en la parte **🔒** |
| Dónde estoy | Junto a ▼ Ocultar / ▲ Mostrar sale **📍 la localidad** según tu GPS |
| El tiempo | En cada día y ciudad, encima de «Siguiente»: previsión (cielo, máx./mín., lluvia, viento y las horas con lluvia probable). Fiable desde 7 días antes; de 8 a 15 días sale como «orientativa»; antes, el clima normal de noviembre. En **Todo**, cada tarjeta de día lleva solo el símbolo (en días con varios pueblos, el peor; más claro si es orientativo) |
| Consejos del día | Plegados en «💡 Consejos (n)»: tócalo para verlos |
| Reordenar por cercanía | **📍 Ordenar por cercanía** encima de las visitas (si estás en ese sitio): recorrido desde donde estás, con hora estimada y ⚠️ si algo cierra antes de llegar. Solo en tu móvil y solo ese día; **↩ Orden original** lo deshace |
| Ver un lugar | Toca su marcador, su calle o su fila en la lista |
| Ir a un sitio | **🧭 Guiarme**: flecha que apunta al destino (si apunta hacia arriba, vas bien) · **🗺️ Maps**: abre Google Maps |
| Hacia dónde miro | Abanico azul en tu punto (brújula del móvil; en iPhone se activa al pulsar 📍 o 🧭) |
| Marcar como visto | **✔ Hecho** o **✔ Visitado** (lo ve también la otra persona) |
| Notas, hora o día | Dentro de la ficha de cada lugar |
| Añadir un lugar nuevo | Mantén pulsado el mapa, o «＋ Añadir lugar» |
| Ver a la otra persona | Botón 👥 (sale cuando tiene la app abierta) |
| Chat (texto, fotos, voz, ubicación) | Toca el punto morado de la otra persona, o el botón 💬 |
| Ir hasta la otra persona | En el chat, **🧭 Guiarme hasta …** (debajo del título): la flecha la sigue aunque se mueva y avisa «¡Os habéis encontrado!» |
| Foto en el chat | 📷 hace la foto con la cámara · 🖼️ la elige de la galería |
| Mensaje de voz | En el chat, 🎤 → habla (máx. 1 min) → ➤ Enviar |
| Borrar un mensaje tuyo | 🗑 junto a la hora del mensaje |
| Centrar en ti | Botón 📍 |
| Transporte y billetes | Botón 🚌 |
| Qué se ve en el mapa | Botón ⚙️ |

El puntito en la esquina de ⚙️ indica la conexión: **verde** = sincronizado, **naranja** = enviando cambios,
**gris** = sin conexión (los cambios se guardan en el móvil y se envían solos al volver la cobertura).

### Leyenda del mapa

- **1, 2, 3…** visitas del día por orden de hora · **+** visitas opcionales · **★** lugares añadidos por vosotros
- **Línea continua:** calle imprescindible · **Línea de puntos:** calle fuera de ruta
- **Gris con ✔:** ya visitado · **Punto azul:** tú · **Círculo morado con inicial:** la otra persona

## Archivos

```
index.html            la página
style.css             el aspecto
app.js                la lógica (mapa, GPS, sincronización)
config.js             la dirección de la base de datos (clave pública)
datos/florencia.json  lugares, calles y transporte (sale de tus 4 ficheros)
chat.js               el chat (texto, fotos, voz y ubicación)
brujula.js            brújula y modo «Guiarme»
esquema.js            esquema del viaje (pestaña Todo)
tiempo.js             previsión del tiempo (Open-Meteo)
sw.js                 copia la app y el mapa para que funcione con mala cobertura
manifest.webmanifest  para instalarla como app
iconos/               iconos
```

Para cambiar un horario o una nota fija, edita `datos/florencia.json`.
Si cambias cualquier archivo, sube también el número de `VERSION` en `sw.js`
(por ejemplo, de `florencia-v1` a `florencia-v2`) para que los móviles cojan la versión nueva.

## Base de datos (Supabase)

Proyecto `florencia` en Supabase. Los datos solo se pueden leer o cambiar con el código.
Tras 100 intentos fallidos en una hora, el acceso se bloquea una hora.

**Importante:** los proyectos gratuitos de Supabase se **pausan tras 7 días sin uso**.
Abre la app de vez en cuando antes del viaje. Si se pausa, entra en
[supabase.com/dashboard](https://supabase.com/dashboard), abre el proyecto `florencia`
y pulsa **Restore project** (tarda unos minutos).

## Dónde está publicada

En Netlify: **https://florencia-viaje.netlify.app** (proyecto `florencia-viaje`).

## Alternativa: GitHub Pages

1. En GitHub, abre el repositorio → **Settings** → **Pages**.
2. En «Build and deployment», **Source**: *Deploy from a branch*.
3. **Branch**: `main` y carpeta `/ (root)` → **Save**.
4. En 1-2 minutos estará en `https://cajopesa-ui.github.io/FLORENCIA/`.
