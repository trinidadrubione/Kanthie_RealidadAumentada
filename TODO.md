# TODO / Roadmap 🚧

## Hecho ✅
- [x] Detección de mano en tiempo real (MediaPipe HandLandmarker).
- [x] Anclaje del anillo al dedo (no más "plano genérico").
- [x] Selección de dedo (pulgar → meñique) y posición (anillo / midi).
- [x] Cámara frontal y trasera con cambio en vivo.
- [x] Catálogo data-driven para escalar a 100+ productos.
- [x] UI "de lujo" responsive (desktop / tablet / celular).

## Próximo 🎯
- [ ] Afinar la calibración `ar` de cada `.glb` con una cámara real
      (`scale`, `rotation`, `offset`, `holeAxis` en `catalog.js`).
- [ ] Elegir mano izquierda/derecha y permitir varios anillos simultáneos.
- [ ] Botón de captura de foto para compartir el resultado.
- [ ] Extender el motor a otros accesorios (pulseras, collares, aros, gorras,
      ropa) usando detección de pose de cuerpo/cara.
- [ ] Cargar el catálogo desde un backend/CMS en lugar de `catalog.js`.
