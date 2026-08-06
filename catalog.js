/*
 * catalog.js
 * -----------------------------------------------------------------------------
 * Catálogo de productos 100% data-driven.
 *
 * La UI y el motor de AR se construyen a partir de estos datos: para sumar
 * productos (hasta 100+), sólo hay que agregar objetos a PRODUCTS. No hace falta
 * tocar la lógica del widget ni el código de realidad aumentada.
 *
 * Cada variante apunta a un archivo .glb. Los .glb pueden ser locales (como
 * ahora) o URLs absolutas de un CDN; el motor acepta ambos.
 *
 * Bloque `ar` (opcional por producto): permite calibrar cómo se ancla CADA
 * modelo sobre el dedo, porque cada .glb puede venir exportado con distinta
 * escala/orientación. Estos valores se afinan una sola vez por modelo mirando
 * el resultado en una cámara real.
 *   - scale       : multiplicador de tamaño relativo al ancho del dedo (1 = auto)
 *   - rotation    : [x, y, z] en grados, corrección de orientación del modelo
 *   - offset      : [x, y, z] desplazamiento fino en unidades de ancho de dedo
 *   - holeAxis    : eje del modelo que atraviesa el agujero del anillo ('x'|'y'|'z')
 * -----------------------------------------------------------------------------
 */

// Etiquetas y colores de referencia para materiales (usados en los swatches UI).
export const MATERIALS = {
  oro:    { label: "Oro",    color: "#c9a227" },
  plata:  { label: "Plata",  color: "#c0c4c9" },
  blanco: { label: "Blanco", color: "#f2f2f2" },
  bronce: { label: "Bronce", color: "#cd7f32" },
  alpaca: { label: "Alpaca", color: "#a9b2b9" },
};

// Etiquetas y colores de referencia para las piedras.
export const STONES = {
  esmeralda: { label: "Esmeralda", color: "#1f9d63" },
  ruby:      { label: "Rubí",      color: "#a01327" },
  blanca:    { label: "Blanca",    color: "#eef0f2" },
  celeste:   { label: "Celeste",   color: "#7ec8e3" },
  bordo:     { label: "Bordó",     color: "#5b1a2b" },
  ninguna:   { label: "Sin piedra", color: "transparent" },
};

/*
 * Ajustes de AR por defecto. Se aplican salvo que el producto defina los suyos.
 * Pensados como punto de partida razonable; se afinan por modelo con cámara real.
 */
export const DEFAULT_AR = {
  // scale 1.4: el aro se escala respecto del ancho del dedo, pero medimos su
  // diámetro EXTERIOR; con ~1.4 el agujero interno queda del ancho del dedo
  // (el dedo llena el aro) y el anillo se ve puesto.
  scale: 1.4,
  rotation: [0, 0, 0],
  offset: [0, 0, 0],
  // holeAxis 'z': verificado por render — estos .glb tienen el agujero del
  // anillo sobre el eje Z (la piedra apunta a +Y).
  holeAxis: "z",
};

/*
 * PRODUCTS
 * -----------------------------------------------------------------------------
 * Cada producto agrupa sus variantes por combinación material + piedra.
 * La clave de variante es `${material}__${stone}`.
 *
 * NOTA sobre el mapeo actual: los .glb del repositorio tienen nombres algo
 * heterogéneos (numa_*, roz_*, roa_eo, rosa_ruy). Los agrupamos de la forma
 * más coherente posible. Si alguna combinación material/piedra corresponde a
 * otro archivo, se corrige acá en una sola línea.
 */
export const PRODUCTS = [
  {
    id: "numa",
    name: "Numa",
    type: "ring",
    description: "Anillo Numa — línea clásica con engarce central.",
    ar: { scale: 1.4, rotation: [0, 0, 0], offset: [0, 0, 0], holeAxis: "z" },
    variants: {
      "oro__esmeralda":   { src: "numa_oro_esmeralda.glb" },
      "oro__ruby":        { src: "numa_oro_ruby.glb" },
      "plata__esmeralda": { src: "numa_plata_esmeralda.glb" },
      "plata__ruby":      { src: "numa_plata_ruby.glb" },
      "plata__blanca":    { src: "numa_blanco.glb" }, // plata con piedra blanca
    },
  },
  {
    id: "roz",
    name: "Roz",
    type: "ring",
    description: "Anillo Roz — silueta moderna con piedra destacada.",
    ar: { scale: 1.35, rotation: [0, 0, 0], offset: [0, 0, 0], holeAxis: "z" },
    variants: {
      "oro__esmeralda":   { src: "roz_oro_esmeralda.glb" },
      "plata__esmeralda": { src: "roz_plata_esmeralda.glb" },
      "plata__ruby":      { src: "roz_plata_ruy.glb" },
    },
  },
  {
    id: "rosa",
    name: "Rosa",
    type: "ring",
    description: "Anillo Rosa — diseño floral con acento de color.",
    ar: { scale: 1.35, rotation: [0, 0, 0], offset: [0, 0, 0], holeAxis: "z" },
    variants: {
      "oro__esmeralda": { src: "roa_eo.glb" },
      "oro__ruby":      { src: "rosa_ruy.glb" },
    },
  },
];

/* Devuelve el producto por id. */
export function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id) || null;
}

/* Lista de materiales disponibles para un producto (según sus variantes). */
export function materialsOf(product) {
  const set = new Set();
  Object.keys(product.variants).forEach((k) => set.add(k.split("__")[0]));
  return [...set];
}

/* Lista de piedras disponibles para un producto y material dados. */
export function stonesOf(product, material) {
  const set = new Set();
  Object.keys(product.variants).forEach((k) => {
    const [m, s] = k.split("__");
    if (m === material) set.add(s);
  });
  return [...set];
}

/* Resuelve la variante concreta (src del .glb) a partir de las selecciones. */
export function resolveVariant(product, material, stone) {
  return product.variants[`${material}__${stone}`] || null;
}
