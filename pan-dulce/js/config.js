/* ============================================================
   Configuración del sitio
   ============================================================ */

window.DS_CONFIG = {
  /* --- Mapa --------------------------------------------------- */
  map: {
    // Vista inicial: Argentina entera.
    center: [-38.0, -63.6],
    zoom: 4,
    minZoom: 3,
    maxZoom: 19,
    // Límites blandos para que no se pueda "perder" el mapa.
    maxBounds: [[-58.5, -76.0], [-19.0, -50.0]],
    // Capas raster. Si ninguna responde (offline / red bloqueada),
    // el mapa cae automáticamente al basemap vectorial local.
    tiles: [
      {
        id: 'satur',
        label: 'Mapa',
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        subdomains: 'abcd',
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      },
      {
        id: 'satelite',
        label: 'Satélite',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 19,
        attribution: 'Esri, Maxar, Earthstar Geographics',
      },
    ],
  },

  /* --- Geocodificación (buscar un local por nombre/dirección) -- */
  geocoder: {
    enabled: true,
    url: 'https://nominatim.openstreetmap.org/search',
    reverseUrl: 'https://nominatim.openstreetmap.org/reverse',
    countryCodes: 'ar',
    limit: 6,
  },

  /* --- Fotos -------------------------------------------------- */
  photos: {
    maxPerSighting: 4,
    maxEdgePx: 1600,     // se redimensiona antes de guardar
    quality: 0.82,       // JPEG
  },

  /* --- Almacenamiento ----------------------------------------- */
  // 'local'    → IndexedDB del navegador. Funciona sin backend, ideal
  //              para probar y para la demo. Cada persona ve lo suyo.
  // 'supabase' → base compartida real. Completar `supabase` y listo.
  storage: {
    mode: 'local',
    supabase: {
      url: '',              // https://xxxxx.supabase.co
      anonKey: '',
      table: 'sightings',
      bucket: 'sightings',
    },
  },

  /* --- Contenido ---------------------------------------------- */
  // Variantes de producto que puede elegir quien carga el avistamiento.
  variants: [
    { id: 'sin-frutas', label: 'Sin frutas' },
    { id: 'con-frutas', label: 'Con frutas' },
    { id: 'otro',       label: 'Otro / no sé' },
  ],

  // Si es true, se cargan avistamientos de ejemplo la primera vez
  // (sólo en modo 'local' y sólo si la base está vacía).
  seedDemoData: true,
};
