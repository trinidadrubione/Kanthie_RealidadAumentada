/*
 * app.js
 * -----------------------------------------------------------------------------
 * Orquesta la interfaz: arma los selectores desde el catálogo, actualiza la
 * vista previa 3D (model-viewer) y abre la experiencia de "prueba en la mano"
 * (AR con detección de mano, ver ar-hand.js).
 * -----------------------------------------------------------------------------
 */

import {
  PRODUCTS,
  MATERIALS,
  STONES,
  DEFAULT_AR,
  getProduct,
  materialsOf,
  stonesOf,
  resolveVariant,
} from "./catalog.js";

// Estado de la selección del usuario.
const state = {
  productId: PRODUCTS[0].id,
  material: null,
  stone: null,
  finger: "ring",
  placement: "base",
};

// Referencias a nodos de la UI.
const el = {
  // Selector de modelo (dropdown con miniatura 3D)
  modelSelect: document.getElementById("model-select"),
  modelTrigger: document.getElementById("model-trigger"),
  modelTriggerThumb: document.getElementById("model-trigger-thumb"),
  modelTriggerName: document.getElementById("model-trigger-name"),
  modelTriggerDesc: document.getElementById("model-trigger-desc"),
  modelPanel: document.getElementById("model-panel"),
  guideToggle: document.getElementById("guide-toggle"),
  guide: document.getElementById("guide"),
  materialSwatches: document.getElementById("material-swatches"),
  stoneSwatches: document.getElementById("stone-swatches"),
  fingerButtons: document.getElementById("finger-buttons"),
  placementButtons: document.getElementById("placement-buttons"),
  preview: document.getElementById("preview"),
  variantLabel: document.getElementById("variant-label"),
  tryBtn: document.getElementById("try-btn"),
  // AR overlay
  ar: document.getElementById("ar-overlay"),
  arVideo: document.getElementById("ar-video"),
  arCanvas: document.getElementById("ar-canvas"),
  arClose: document.getElementById("ar-close"),
  arFlip: document.getElementById("ar-flip"),
  arStatus: document.getElementById("ar-status"),
  arHint: document.getElementById("ar-hint"),
};

/* ------------------------------------------------------------------------ */
/* Construcción de la UI a partir del catálogo                               */
/* ------------------------------------------------------------------------ */
// Src representativa de un producto para la miniatura (primera variante).
function repVariantSrc(product) {
  const first = Object.values(product.variants)[0];
  return first ? first.src : "";
}

/*
 * Menú desplegable de modelos, con miniatura 3D (vista superior) por opción.
 * Las miniaturas se cargan de forma diferida (IntersectionObserver) para
 * escalar a 100+ productos: sólo renderiza las que entran en pantalla.
 */
let _thumbObserver = null;
function buildModelDropdown() {
  el.modelPanel.innerHTML = "";

  _thumbObserver = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const mv = e.target;
          if (!mv.getAttribute("src") && mv.dataset.src) {
            mv.setAttribute("src", mv.dataset.src);
          }
          obs.unobserve(mv);
        }
      });
    },
    { root: el.modelPanel }
  );

  PRODUCTS.forEach((p) => {
    const li = document.createElement("li");
    li.className = "model-option";
    li.dataset.id = p.id;
    li.setAttribute("role", "option");

    const thumb = document.createElement("model-viewer");
    thumb.className = "model-thumb";
    thumb.setAttribute("camera-orbit", "0deg 12deg 105%");
    thumb.setAttribute("disable-zoom", "");
    thumb.setAttribute("disable-tap", "");
    thumb.setAttribute("interaction-prompt", "none");
    thumb.setAttribute("environment-image", "neutral");
    thumb.setAttribute("exposure", "1.05");
    thumb.setAttribute("alt", "");
    thumb.dataset.src = repVariantSrc(p);

    const text = document.createElement("span");
    text.className = "model-option-text";
    text.innerHTML = `<span class="model-option-name">${p.name}</span>
                      <span class="model-option-desc">${p.description}</span>`;

    li.appendChild(thumb);
    li.appendChild(text);
    li.addEventListener("click", () => {
      selectProduct(p.id);
      closeModelPanel();
    });
    el.modelPanel.appendChild(li);
    _thumbObserver.observe(thumb);
  });
}

function openModelPanel() {
  el.modelPanel.hidden = false;
  el.modelTrigger.setAttribute("aria-expanded", "true");
  el.modelSelect.classList.add("open");
}
function closeModelPanel() {
  el.modelPanel.hidden = true;
  el.modelTrigger.setAttribute("aria-expanded", "false");
  el.modelSelect.classList.remove("open");
}
function toggleModelPanel() {
  if (el.modelPanel.hidden) openModelPanel();
  else closeModelPanel();
}

function buildFingerAndPlacement() {
  const fingers = [
    ["thumb", "Pulgar"],
    ["index", "Índice"],
    ["middle", "Mayor"],
    ["ring", "Anular"],
    ["pinky", "Meñique"],
  ];
  el.fingerButtons.innerHTML = "";
  fingers.forEach(([id, label]) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.dataset.finger = id;
    b.textContent = label;
    b.addEventListener("click", () => {
      state.finger = id;
      markActive(el.fingerButtons, "finger", id);
      if (window._handAR) window._handAR.setFinger(id);
    });
    el.fingerButtons.appendChild(b);
  });

  const placements = [
    ["base", "Anillo"],
    ["midi", "Midi"],
  ];
  el.placementButtons.innerHTML = "";
  placements.forEach(([id, label]) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.dataset.placement = id;
    b.textContent = label;
    b.addEventListener("click", () => {
      state.placement = id;
      markActive(el.placementButtons, "placement", id);
      if (window._handAR) window._handAR.setPlacement(id);
    });
    el.placementButtons.appendChild(b);
  });

  markActive(el.fingerButtons, "finger", state.finger);
  markActive(el.placementButtons, "placement", state.placement);
}

function markActive(container, key, value) {
  [...container.children].forEach((c) =>
    c.classList.toggle("active", c.dataset[key] === value)
  );
}

/* ------------------------------------------------------------------------ */
/* Selección de producto / material / piedra                                 */
/* ------------------------------------------------------------------------ */
function selectProduct(id) {
  state.productId = id;
  const product = getProduct(id);

  // Actualiza el trigger del dropdown (miniatura + nombre + descripción).
  el.modelTriggerName.textContent = product.name;
  el.modelTriggerDesc.textContent = product.description;
  el.modelTriggerThumb.setAttribute("src", repVariantSrc(product));
  [...el.modelPanel.children].forEach((c) =>
    c.setAttribute("aria-selected", c.dataset.id === id ? "true" : "false")
  );

  // Materiales disponibles para este producto.
  const materials = materialsOf(product);
  state.material = materials.includes(state.material) ? state.material : materials[0];
  renderMaterials(product, materials);

  // Piedras disponibles para el material elegido.
  syncStones(product);
  updatePreview();
}

function renderMaterials(product, materials) {
  el.materialSwatches.innerHTML = "";
  materials.forEach((m) => {
    const info = MATERIALS[m] || { label: m, color: "#ccc" };
    const b = document.createElement("button");
    b.className = "swatch";
    b.dataset.material = m;
    b.title = info.label;
    b.innerHTML = `<span class="dot" style="background:${info.color}"></span>
                   <span class="swatch-label">${info.label}</span>`;
    b.addEventListener("click", () => {
      state.material = m;
      syncStones(product);
      renderMaterials(product, materials);
      updatePreview();
    });
    b.classList.toggle("active", m === state.material);
    el.materialSwatches.appendChild(b);
  });
}

function syncStones(product) {
  const stones = stonesOf(product, state.material);
  state.stone = stones.includes(state.stone) ? state.stone : stones[0];

  el.stoneSwatches.innerHTML = "";
  stones.forEach((s) => {
    const info = STONES[s] || { label: s, color: "#ccc" };
    const b = document.createElement("button");
    b.className = "swatch";
    b.dataset.stone = s;
    b.title = info.label;
    const dotStyle =
      info.color === "transparent"
        ? "background:transparent;border:2px dashed #b9a05a"
        : `background:${info.color}`;
    b.innerHTML = `<span class="dot" style="${dotStyle}"></span>
                   <span class="swatch-label">${info.label}</span>`;
    b.addEventListener("click", () => {
      state.stone = s;
      [...el.stoneSwatches.children].forEach((c) =>
        c.classList.toggle("active", c.dataset.stone === s)
      );
      updatePreview();
    });
    b.classList.toggle("active", s === state.stone);
    el.stoneSwatches.appendChild(b);
  });
}

/* ------------------------------------------------------------------------ */
/* Vista previa 3D (model-viewer)                                            */
/* ------------------------------------------------------------------------ */
function currentVariant() {
  const product = getProduct(state.productId);
  const variant = resolveVariant(product, state.material, state.stone);
  return { product, variant };
}

function updatePreview() {
  const { product, variant } = currentVariant();
  if (!variant) {
    el.variantLabel.textContent = "Combinación no disponible";
    el.tryBtn.disabled = true;
    return;
  }
  el.tryBtn.disabled = false;
  el.preview.setAttribute("src", variant.src);

  const mLabel = (MATERIALS[state.material] || {}).label || state.material;
  const sLabel = (STONES[state.stone] || {}).label || state.stone;
  el.variantLabel.textContent =
    state.stone === "ninguna"
      ? `${product.name} · ${mLabel}`
      : `${product.name} · ${mLabel} · ${sLabel}`;
}

/* ------------------------------------------------------------------------ */
/* Experiencia AR: prueba en la mano                                         */
/* ------------------------------------------------------------------------ */
let handAR = null;

async function openAR() {
  const { product, variant } = currentVariant();
  if (!variant) return;

  el.ar.classList.add("open");
  document.body.classList.add("ar-active");
  setStatus("Iniciando cámara…");

  try {
    if (!handAR) {
      const { HandAR } = await import("./ar-hand.js");
      handAR = new HandAR({ video: el.arVideo, canvas: el.arCanvas });
      window._handAR = handAR;
      handAR.onHand = (found) => {
        el.arHint.classList.toggle("hidden", found);
      };
    }

    handAR.setFinger(state.finger);
    handAR.setPlacement(state.placement);

    setStatus("Cargando modelo 3D…");
    const arCfg = { ...DEFAULT_AR, ...(product.ar || {}) };
    await handAR.loadRing(variant.src, arCfg);

    setStatus("Cargando detección de mano…");
    await handAR.loadDetector();

    await handAR.startCamera(handAR.facingMode);
    handAR.start();
    setStatus("");
    el.arHint.classList.remove("hidden");
  } catch (err) {
    console.error(err);
    handleARError(err);
  }
}

function closeAR() {
  el.ar.classList.remove("open");
  document.body.classList.remove("ar-active");
  if (handAR) handAR.stop();
}

async function flipAR() {
  if (!handAR) return;
  setStatus("Cambiando cámara…");
  try {
    await handAR.flipCamera();
    setStatus("");
  } catch (err) {
    handleARError(err);
  }
}

function setStatus(msg) {
  el.arStatus.textContent = msg || "";
  el.arStatus.classList.toggle("hidden", !msg);
}

function handleARError(err) {
  const name = err && err.name ? err.name : "";
  let msg = "No se pudo iniciar la prueba en la mano.";
  if (name === "NotAllowedError" || name === "SecurityError") {
    msg =
      "Necesitamos permiso para usar la cámara. Habilitalo y volvé a intentar. " +
      "En móviles, la cámara sólo funciona sobre HTTPS.";
  } else if (name === "NotFoundError") {
    msg = "No se detectó ninguna cámara en este dispositivo.";
  } else if (!window.isSecureContext) {
    msg =
      "La cámara requiere una conexión segura (HTTPS). Abrí el sitio con https:// " +
      "o desde localhost.";
  }
  setStatus(msg);
}

/* ------------------------------------------------------------------------ */
/* Init                                                                      */
/* ------------------------------------------------------------------------ */
function init() {
  buildModelDropdown();
  buildFingerAndPlacement();
  selectProduct(state.productId);

  // Dropdown de modelo
  el.modelTrigger.addEventListener("click", toggleModelPanel);
  document.addEventListener("click", (e) => {
    if (!el.modelSelect.contains(e.target)) closeModelPanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModelPanel();
  });

  // Guía de dedos / posición
  el.guideToggle.addEventListener("click", () => {
    const open = el.guide.classList.toggle("hidden") === false;
    el.guideToggle.textContent = open
      ? "Ocultar guía"
      : "¿Cuál es cada dedo? Ver guía";
  });

  el.tryBtn.addEventListener("click", openAR);
  el.arClose.addEventListener("click", closeAR);
  el.arFlip.addEventListener("click", flipAR);
}

document.addEventListener("DOMContentLoaded", init);
