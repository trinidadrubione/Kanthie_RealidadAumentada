/* ============================================================
   Mapa: capas, pines de pan dulce y clustering
   ============================================================ */

const MapView = (() => {
  let map = null;
  let cluster = null;
  let vectorLayer = null;
  let tileLayer = null;
  let ghostMarker = null;
  let onPinClick = null;
  const markers = new Map();   // groupKey -> L.Marker

  /* ── El dibujito del pan dulce ───────────────────────────────
     Reemplazar por el PNG del producto real cuando esté:
       PIN_HTML = '<img src="assets/pan-dulce.png">'                  */

  const PAN_DULCE_SVG = `
<svg viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pdRed" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"  stop-color="#E23744"/>
      <stop offset=".45" stop-color="#C8102E"/>
      <stop offset="1"  stop-color="#8C0E20"/>
    </linearGradient>
    <linearGradient id="pdCrust" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#D69A4B"/>
      <stop offset="1" stop-color="#A5652A"/>
    </linearGradient>
  </defs>
  <path d="M20 50.5S36.5 32 36.5 19.8C36.5 9.5 29.1 1.6 20 1.6S3.5 9.5 3.5 19.8C3.5 32 20 50.5 20 50.5Z"
        fill="url(#pdRed)" stroke="#FFFDF7" stroke-width="2.2"/>
  <circle cx="20" cy="19.4" r="12.4" fill="#FFFDF7"/>
  <!-- cúpula dorada -->
  <path d="M12.2 18.6c0-4.4 3.5-7.6 7.8-7.6s7.8 3.2 7.8 7.6c0 1.3-.5 2-1.4 2.2H13.6c-.9-.2-1.4-.9-1.4-2.2Z"
        fill="url(#pdCrust)"/>
  <path d="M15.6 13.4c1-1 2.6-1.6 4.4-1.6" fill="none" stroke="#EBBE83" stroke-width="1.1" stroke-linecap="round"/>
  <!-- pirotín / base de papel -->
  <path d="M13.3 20.6h13.4l-1.2 7.1c-.13.8-.83 1.4-1.64 1.4h-7.72c-.81 0-1.51-.6-1.64-1.4Z" fill="#F5DFA8"/>
  <g stroke="#DCC087" stroke-width=".9" stroke-linecap="round">
    <path d="M17 21.2v7.4M20 21.2v7.4M23 21.2v7.4"/>
  </g>
  <path d="M13.3 20.6h13.4" stroke="#C8102E" stroke-width="1.1" stroke-linecap="round"/>
</svg>`;

  function pinIcon({ count = 1, ghost = false, drop = false } = {}) {
    const cls = ['pdpin', ghost && 'pdpin--ghost', drop && 'pdpin--drop']
      .filter(Boolean).join(' ');
    const badge = count > 1 ? `<span class="pdpin__count">${count}</span>` : '';
    return L.divIcon({
      className: '',
      html: `<div class="${cls}" style="width:38px;height:49px;position:relative">${PAN_DULCE_SVG}${badge}</div>`,
      iconSize: [38, 49],
      iconAnchor: [19, 48],
      popupAnchor: [0, -44],
    });
  }

  /* ── Init ────────────────────────────────────────────────── */

  function init(handlers = {}) {
    onPinClick = handlers.onPinClick;
    const c = DS_CONFIG.map;

    map = L.map('map', {
      center: c.center,
      zoom: c.zoom,
      minZoom: c.minZoom,
      maxZoom: c.maxZoom,
      zoomControl: false,
      maxBounds: L.latLngBounds(c.maxBounds),
      maxBoundsViscosity: 0.55,
      worldCopyJump: false,
    });
    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    // Pane propio, por debajo del de tiles (200): el mapa vectorial queda
    // siempre dibujado como red de contención y los tiles lo tapan cuando
    // hay conexión.
    map.createPane('dsVector');
    map.getPane('dsVector').style.zIndex = 190;

    buildVectorBasemap();
    setTiles(c.tiles[0].id);

    cluster = L.markerClusterGroup({
      maxClusterRadius: 46,
      showCoverageOnHover: false,
      spiderfyDistanceMultiplier: 1.4,
    });
    map.addLayer(cluster);

    return map;
  }

  /* ── Capas raster ────────────────────────────────────────── */

  let tileFailed = false;

  function setTiles(id) {
    const def = DS_CONFIG.map.tiles.find((t) => t.id === id) || DS_CONFIG.map.tiles[0];
    if (tileLayer) map.removeLayer(tileLayer);

    tileLayer = L.tileLayer(def.url, {
      subdomains: def.subdomains || 'abc',
      maxZoom: def.maxZoom || 19,
      attribution: def.attribution,
      crossOrigin: true,
    });

    let ok = 0, bad = 0;
    tileLayer.on('tileload', () => { ok++; tileFailed = false; });
    tileLayer.on('tileerror', () => {
      bad++;
      // Sin conexión a los tiles: nos quedamos con el mapa vectorial.
      if (ok === 0 && bad >= 4 && !tileFailed) {
        tileFailed = true;
        map.removeLayer(tileLayer);
        document.body.classList.add('is-offline-map');
        console.info('[map] Tiles no disponibles — uso el basemap vectorial local.');
      }
    });

    tileLayer.addTo(map);
    return def;
  }

  /* ── Basemap vectorial local (funciona sin red) ──────────── */

  // [nombre, lat, lng, rango] — el rango 2 aparece recién a partir del
  // zoom 6 para que no se pisen las etiquetas en la vista país.
  const CITIES = [
    ['Buenos Aires', -34.61, -58.44, 1], ['La Plata', -34.92, -57.95, 2],
    ['Mar del Plata', -38.00, -57.56, 1], ['Bahía Blanca', -38.72, -62.27, 2],
    ['Rosario', -32.95, -60.65, 1], ['Santa Fe', -31.63, -60.70, 2],
    ['Córdoba', -31.42, -64.19, 1], ['Mendoza', -32.89, -68.84, 1],
    ['San Juan', -31.54, -68.53, 2], ['San Luis', -33.30, -66.34, 2],
    ['Tucumán', -26.82, -65.22, 1], ['Salta', -24.79, -65.41, 1],
    ['Jujuy', -24.19, -65.30, 2], ['Resistencia', -27.45, -58.99, 2],
    ['Corrientes', -27.47, -58.83, 1], ['Posadas', -27.37, -55.90, 1],
    ['Paraná', -31.73, -60.53, 2], ['Santiago del Estero', -27.79, -64.26, 2],
    ['Catamarca', -28.47, -65.79, 2], ['La Rioja', -29.41, -66.86, 2],
    ['Formosa', -26.18, -58.17, 2], ['Santa Rosa', -36.62, -64.29, 1],
    ['Neuquén', -38.95, -68.06, 1], ['Viedma', -40.81, -62.99, 2],
    ['Bariloche', -41.13, -71.31, 1], ['Rawson', -43.30, -65.10, 2],
    ['Comodoro Rivadavia', -45.86, -67.48, 1], ['Río Gallegos', -51.62, -69.22, 1],
    ['Ushuaia', -54.80, -68.30, 1],
  ];

  function buildVectorBasemap() {
    vectorLayer = L.layerGroup().addTo(map);
    const pane = { pane: 'dsVector', interactive: false };

    fetch('assets/basemap-ar.json')
      .then((r) => r.json())
      .then((data) => {
        L.geoJSON(data.land, {
          ...pane,
          style: { fillColor: '#FBF1DC', fillOpacity: 1, color: '#E4D5B7', weight: 1 },
        }).addTo(vectorLayer);

        L.geoJSON(data.countries, {
          ...pane,
          style: { fill: false, color: '#C9B48A', weight: 1.1, dashArray: '4 3' },
        }).addTo(vectorLayer);

        for (const [name, lat, lng, rank] of CITIES) {
          L.marker([lat, lng], {
            ...pane,
            icon: L.divIcon({
              className: '',
              html: `<div class="citylabel citylabel--r${rank}">${esc(name)}</div>`,
              iconSize: [0, 0],
              iconAnchor: [-4, 6],
            }),
          }).addTo(vectorLayer);
          L.circleMarker([lat, lng], {
            ...pane, radius: 2, color: '#B9762E', weight: 0, fillOpacity: .7,
          }).addTo(vectorLayer);
        }
        syncLabelDensity();
        map.on('zoomend', syncLabelDensity);
      })
      .catch(() => console.info('[map] Sin basemap vectorial local.'));
  }

  function syncLabelDensity() {
    document.body.dataset.mapZoom = map.getZoom() >= 6 ? 'near' : 'far';
  }

  /* ── Pines ───────────────────────────────────────────────── */

  /**
   * Agrupa avistamientos que caen prácticamente en el mismo punto
   * (mismo local) para que un pin abra la galería completa.
   */
  function groupSightings(sightings) {
    const groups = [];
    for (const s of sightings) {
      const hit = groups.find(
        (g) => distanceM([g.lat, g.lng], [s.lat, s.lng]) < 45 &&
               norm(g.place) === norm(s.place),
      );
      if (hit) { hit.items.push(s); }
      else { groups.push({ key: s.id, lat: s.lat, lng: s.lng, place: s.place, city: s.city, items: [s] }); }
    }
    return groups;
  }
  const norm = (s) => String(s || '').trim().toLowerCase();

  function render(sightings, { animateId = null } = {}) {
    cluster.clearLayers();
    markers.clear();

    for (const g of groupSightings(sightings)) {
      const photos = g.items.reduce((n, s) => n + (s.photos ? s.photos.length : 0), 0);
      const isNew = animateId && g.items.some((s) => s.id === animateId);

      const m = L.marker([g.lat, g.lng], {
        icon: pinIcon({ count: photos, drop: isNew }),
        title: g.place,
        riseOnHover: true,
      });
      m.on('click', () => onPinClick && onPinClick(g));
      m.bindTooltip(
        `<b>${esc(g.place)}</b>${g.city ? `<br>${esc(g.city)}` : ''}`,
        { direction: 'top', offset: [0, -44], opacity: .95 },
      );
      cluster.addLayer(m);
      markers.set(g.key, m);
      for (const s of g.items) markers.set(s.id, m);
    }
  }

  /* ── Navegación ──────────────────────────────────────────── */

  function flyTo(lat, lng, zoom = 16) {
    map.flyTo([lat, lng], Math.max(map.getZoom(), zoom), { duration: 1.1 });
  }

  function focusSighting(s) {
    flyTo(s.lat, s.lng);
    const m = markers.get(s.id);
    if (m) setTimeout(() => cluster.zoomToShowLayer(m, () => m.fire('click')), 1150);
  }

  function fitAll(sightings) {
    if (!sightings || sightings.length < 2) {
      map.flyTo(DS_CONFIG.map.center, DS_CONFIG.map.zoom, { duration: 1 });
      return;
    }
    map.flyToBounds(L.latLngBounds(sightings.map((s) => [s.lat, s.lng])), {
      padding: [70, 70], maxZoom: 13, duration: 1.1,
    });
  }

  /* ── Marcador provisorio (mientras se elige el lugar) ────── */

  function showGhost(lat, lng) {
    clearGhost();
    ghostMarker = L.marker([lat, lng], { icon: pinIcon({ ghost: true, drop: true }), zIndexOffset: 1000 })
      .addTo(map);
  }
  function clearGhost() {
    if (ghostMarker) { map.removeLayer(ghostMarker); ghostMarker = null; }
  }

  /* ── Modo "elegir en el mapa" ────────────────────────────── */

  let picking = false;
  function startPicking(cb) {
    picking = true;
    const el = map.getContainer();
    el.style.cursor = 'crosshair';
    const handler = (e) => {
      stopPicking();
      cb(e.latlng.lat, e.latlng.lng);
    };
    map.once('click', handler);
    map.__pickHandler = handler;
  }
  function stopPicking() {
    if (!picking) return;
    picking = false;
    map.getContainer().style.cursor = '';
    if (map.__pickHandler) { map.off('click', map.__pickHandler); map.__pickHandler = null; }
  }

  return {
    init, render, flyTo, focusSighting, fitAll,
    showGhost, clearGhost, startPicking, stopPicking, setTiles,
    get map() { return map; },
    PAN_DULCE_SVG,
  };
})();
