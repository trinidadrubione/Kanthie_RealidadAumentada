/* ============================================================
   Ubicación: GPS, búsqueda de direcciones y provincias
   ============================================================ */

const Geo = (() => {

  /* ── GPS del dispositivo ─────────────────────────────────── */

  function current() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error('Este navegador no soporta geolocalización'));
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
        (err) => {
          const msgs = {
            1: 'No nos diste permiso para usar tu ubicación',
            2: 'No pudimos determinar dónde estás',
            3: 'La ubicación tardó demasiado',
          };
          reject(new Error(msgs[err.code] || 'No pudimos obtener tu ubicación'));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
      );
    });
  }

  /* ── Geocodificación (Nominatim) ─────────────────────────── */

  async function search(query) {
    const g = DS_CONFIG.geocoder;
    if (!g.enabled || !query || query.trim().length < 3) return [];
    const url = new URL(g.url);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', g.countryCodes);
    url.searchParams.set('limit', String(g.limit));

    const res = await fetch(url, { headers: { 'Accept-Language': 'es-AR' } });
    if (!res.ok) throw new Error('geocoder');
    const rows = await res.json();
    return rows.map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      title: r.name || (r.display_name || '').split(',')[0],
      subtitle: r.display_name,
      city: pickCity(r.address),
      province: r.address ? r.address.state : '',
    }));
  }

  async function reverse(lat, lng) {
    const g = DS_CONFIG.geocoder;
    if (!g.enabled) return null;
    const url = new URL(g.reverseUrl);
    url.searchParams.set('lat', lat);
    url.searchParams.set('lon', lng);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    const res = await fetch(url, { headers: { 'Accept-Language': 'es-AR' } });
    if (!res.ok) throw new Error('geocoder');
    const r = await res.json();
    return {
      title: (r.display_name || '').split(',').slice(0, 2).join(', '),
      city: pickCity(r.address),
      province: r.address ? r.address.state : '',
    };
  }

  function pickCity(a) {
    if (!a) return '';
    return a.suburb || a.neighbourhood || a.city || a.town || a.village || a.county || '';
  }

  /* ── Provincia por proximidad ────────────────────────────────
     Fallback offline: si no hay geocoder, asignamos la provincia
     por el centro más cercano. Alcanza para las estadísticas.    */

  const PROVINCES = [
    ['Ciudad Autónoma de Buenos Aires', -34.61, -58.44],
    ['Buenos Aires',        -36.20, -59.60],
    ['Catamarca',           -27.30, -66.90],
    ['Chaco',               -26.50, -60.60],
    ['Chubut',              -43.80, -68.50],
    ['Córdoba',             -32.10, -63.80],
    ['Corrientes',          -28.70, -57.80],
    ['Entre Ríos',          -32.00, -59.20],
    ['Formosa',             -24.90, -60.00],
    ['Jujuy',               -23.30, -65.80],
    ['La Pampa',            -37.10, -65.60],
    ['La Rioja',            -29.70, -67.20],
    ['Mendoza',             -34.60, -68.60],
    ['Misiones',            -26.90, -54.60],
    ['Neuquén',             -38.60, -70.10],
    ['Río Negro',           -40.30, -67.20],
    ['Salta',               -24.80, -64.80],
    ['San Juan',            -30.90, -68.90],
    ['San Luis',            -33.70, -66.10],
    ['Santa Cruz',          -48.80, -70.10],
    ['Santa Fe',            -30.70, -60.80],
    ['Santiago del Estero', -27.80, -63.30],
    ['Tierra del Fuego',    -54.10, -67.60],
    ['Tucumán',             -26.90, -65.30],
  ];

  function provinceAt(lat, lng) {
    let best = null, bestD = Infinity;
    for (const [name, plat, plng] of PROVINCES) {
      const d = (lat - plat) ** 2 + ((lng - plng) * Math.cos(lat * Math.PI / 180)) ** 2;
      if (d < bestD) { bestD = d; best = name; }
    }
    return best;
  }

  return { current, search, reverse, provinceAt, PROVINCES };
})();
