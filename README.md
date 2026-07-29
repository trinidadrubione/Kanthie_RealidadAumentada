# Kanthié · Realidad Aumentada

Widget web para **probar joyas con realidad aumentada**. El usuario elige el
modelo de anillo, el material y la forma/color de la piedra, y prueba cómo le
queda **en su propia mano** usando la cámara del dispositivo (frontal o
trasera). Pensado para escalar a 100+ productos y, más adelante, a otros
accesorios (pulseras, collares, aros, gorras, ropa).

## ✨ Cómo funciona

A diferencia del modo AR "sobre un plano" (que ofrece `model-viewer`/WebXR y no
sabe dónde está la mano), este widget hace **detección de mano en tiempo real**
y ancla la joya al dedo:

1. **Cámara** en vivo vía `getUserMedia`.
2. **MediaPipe HandLandmarker** detecta 21 puntos de la mano en cada frame.
3. **Three.js** renderiza el modelo `.glb` posicionado, escalado y orientado
   sobre el dedo elegido, superpuesto al video.

El usuario puede elegir **en qué dedo** (pulgar, índice, mayor, anular, meñique)
y **en qué posición** (anillo normal en la base del dedo, o *midi* en la falange
media).

## 🗂️ Estructura del proyecto

| Archivo        | Rol |
|----------------|-----|
| `index.html`   | Estructura de la UI y la vista de AR. |
| `style.css`    | Estética "de lujo" (negro + dorado), responsive para desktop/tablet/celular. |
| `catalog.js`   | **Catálogo data-driven.** Acá se agregan/editan productos y variantes. |
| `app.js`       | Arma la UI desde el catálogo, la vista previa 3D y abre la experiencia AR. |
| `ar-hand.js`   | Motor de AR: cámara + detección de mano + render 3D anclado al dedo. |
| `*.glb`        | Modelos 3D de las joyas. |

## ➕ Agregar productos (escala a 100+)

Todo el catálogo es data-driven: para sumar un producto sólo se edita
`catalog.js`. La lógica del widget y del AR **no se toca**.

```js
{
  id: "mi-anillo",
  name: "Mi Anillo",
  type: "ring",
  description: "Descripción corta.",
  // Calibración de AR por-modelo (se afina una vez con cámara real):
  ar: { scale: 1, rotation: [0, 0, 0], offset: [0, 0, 0], holeAxis: "y" },
  variants: {
    "oro__esmeralda":   { src: "mi_anillo_oro_esmeralda.glb" },
    "plata__ruby":      { src: "mi_anillo_plata_ruby.glb" },
    // ...clave: `${material}__${piedra}`
  },
}
```

Los `.glb` pueden ser locales (como ahora) o URLs de un CDN.

### Calibrar un modelo en AR

Cada `.glb` puede venir exportado con distinta escala/orientación. El bloque
`ar` permite ajustarlo sin editar el modelo:

- `holeAxis` — eje del modelo que atraviesa el agujero del anillo (`'x'|'y'|'z'`).
- `scale` — multiplicador de tamaño (1 = ajuste automático al ancho del dedo).
- `rotation` — `[x, y, z]` en grados, corrección de orientación.
- `offset` — `[x, y, z]` desplazamiento fino (en unidades de ancho de dedo).

## 📱 Requisitos y despliegue

- La cámara **requiere HTTPS** (o `localhost`). GitHub Pages sirve por HTTPS,
  así que funciona publicando el repo como Página.
- Compatible con **desktop, tablets y celulares** (iOS Safari y Android Chrome).
- Necesita conexión para cargar las librerías desde CDN (Three.js, MediaPipe,
  model-viewer). Los modelos `.glb` se sirven desde el propio repositorio.

## 🧪 Probar localmente

Al usar cámara, no alcanza con abrir el archivo: hay que servirlo por HTTP(S).

```bash
# desde la carpeta del proyecto
python3 -m http.server 8000
# luego abrir http://localhost:8000
```

## 🛣️ Roadmap

- [ ] Selección de mano (izquierda/derecha) y de anillos múltiples a la vez.
- [ ] Extender a otros accesorios con el mismo motor (pose de cuerpo/cara):
      pulseras, collares, aros, gorras y ropa.
- [ ] Captura de foto/registro para compartir el resultado.
- [ ] Panel de calibración visual por-modelo.
