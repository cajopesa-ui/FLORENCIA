# Florencia · 17-19 de noviembre

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
| Cambiar de día | Pestañas de arriba (Mar 17, Mié 18, Jue 19, Todo) |
| Ver un lugar | Toca su marcador, su calle o su fila en la lista |
| Ir a un sitio | Botón **🧭 Cómo llegar** (abre Google Maps a pie) |
| Marcar como visto | **✔ Hecho** o **✔ Visitado** (lo ve también la otra persona) |
| Notas, hora o día | Dentro de la ficha de cada lugar |
| Añadir un lugar nuevo | Mantén pulsado el mapa, o «＋ Añadir lugar» |
| Ver a la otra persona | Botón 👥 (sale cuando tiene la app abierta) |
| Chat (texto, fotos, voz, ubicación) | Toca el punto morado de la otra persona, o el botón 💬 |
| Foto en el chat | 📷 hace la foto con la cámara · 🖼️ la elige de la galería |
| Mensaje de voz | En el chat, 🎤 → habla (máx. 1 min) → ➤ Enviar |
| Borrar un mensaje tuyo | 🗑 junto a la hora del mensaje |
| Centrar en ti | Botón 📍 |
| Transporte y billetes | Botón 🚌 |
| Qué se ve en el mapa | Botón ⚙️ |

El puntito junto a 🚌 indica la conexión: **verde** = sincronizado, **naranja** = enviando cambios,
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
