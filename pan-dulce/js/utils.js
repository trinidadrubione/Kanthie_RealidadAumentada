/* ============================================================
   Utilidades generales
   ============================================================ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const uid = () =>
  'sg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Escapa texto para insertarlo en HTML. */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** "hace 3 días" */
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)     return 'recién';
  if (s < 3600)   return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400)  return `hace ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d === 1)    return 'ayer';
  if (d < 30)     return `hace ${d} días`;
  const m = Math.floor(d / 30);
  return m < 12 ? `hace ${m} ${m === 1 ? 'mes' : 'meses'}` : `hace ${Math.floor(m / 12)} a`;
}

function fmtCoords(lat, lng) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function debounce(fn, ms = 320) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Distancia en metros entre dos puntos (haversine). */
function distanceM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ── Toasts ─────────────────────────────────────────────────── */

function toast(msg, kind = '', ms = 3200) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ` toast--${kind}` : '');
  el.textContent = msg;
  $('#toaster').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 320);
  }, ms);
}

/* ── Imágenes ───────────────────────────────────────────────── */

/**
 * Redimensiona y comprime una imagen (File o Blob) a JPEG.
 * Devuelve { dataUrl, blob, w, h }.
 */
async function shrinkImage(source, maxEdge, quality) {
  maxEdge = maxEdge || DS_CONFIG.photos.maxEdgePx;
  quality = quality || DS_CONFIG.photos.quality;

  const bitmap = await loadBitmap(source);
  let { width: w, height: h } = bitmap;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  return { dataUrl, blob, w, h };
}

function loadBitmap(source) {
  if (typeof createImageBitmap === 'function' && !(source instanceof HTMLElement)) {
    // `imageOrientation` respeta el EXIF de las fotos del celular.
    return createImageBitmap(source, { imageOrientation: 'from-image' })
      .catch(() => loadViaImg(source));
  }
  if (source instanceof HTMLElement) return Promise.resolve(source);
  return loadViaImg(source);
}

function loadViaImg(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}
