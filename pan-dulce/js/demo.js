/* ============================================================
   Datos de demostración
   ------------------------------------------------------------
   Se cargan UNA sola vez, sólo en modo 'local' y sólo si la base
   está vacía. Las "fotos" se dibujan en canvas (no hay archivos
   pesados en el repo). Para desactivar: DS_CONFIG.seedDemoData = false
   ============================================================ */

const Demo = (() => {

  const SIGHTINGS = [
    { place: 'Kiosco La Esquina',      city: 'Villa Crespo, CABA',    lat: -34.5989, lng: -58.4402, variant: 'sin-frutas', author: '@lu.vc',      note: 'Quedaban tres en la góndola de arriba. $3.200.', days: 0.2, photos: 2 },
    { place: 'Almacén Doña Rosa',      city: 'La Plata',              lat: -34.9214, lng: -57.9544, variant: 'con-frutas', author: 'Maru',        note: 'Recién repuesto, la caja entera.',              days: 1,   photos: 1 },
    { place: 'Autoservicio El Trébol', city: 'Rosario',               lat: -32.9468, lng: -60.6393, variant: 'sin-frutas', author: '@rosariofoodie', note: 'Al lado de la caja, difícil de ver.',        days: 2,   photos: 2 },
    { place: 'Supermercado Nuevo Sol', city: 'Córdoba Capital',       lat: -31.4173, lng: -64.1833, variant: 'sin-frutas', author: 'Nico',        note: 'Pila enorme en la punta de góndola.',            days: 3,   photos: 1 },
    { place: 'Panadería San Martín',   city: 'Mendoza',               lat: -32.8908, lng: -68.8272, variant: 'con-frutas', author: '@mendo.eats', note: 'Lo tenían atrás del mostrador, hay que pedirlo.', days: 4,  photos: 1 },
    { place: 'Mercadito del Puerto',   city: 'Mar del Plata',         lat: -38.0023, lng: -57.5575, variant: 'sin-frutas', author: 'Flor',        note: 'Último que quedaba 😅',                          days: 5,   photos: 1 },
    { place: 'Despensa Los Nogales',   city: 'San Miguel de Tucumán', lat: -26.8241, lng: -65.2226, variant: 'otro',       author: '',            note: '',                                               days: 7,   photos: 1 },
    { place: 'Autoservicio Patagonia', city: 'Bariloche',             lat: -41.1335, lng: -71.3103, variant: 'sin-frutas', author: '@surandino',  note: 'Sorpresa total encontrarlo acá.',                days: 9,   photos: 2 },
    { place: 'Kiosco 24hs Belgrano',   city: 'Belgrano, CABA',        lat: -34.5620, lng: -58.4560, variant: 'con-frutas', author: 'Juli',        note: 'Abierto toda la noche, siempre tienen.',         days: 11,  photos: 1 },
    { place: 'Almacén del Norte',      city: 'Salta',                 lat: -24.7883, lng: -65.4106, variant: 'sin-frutas', author: '@saltagram',  note: '',                                               days: 14,  photos: 1 },
  ];

  async function seed(store) {
    const out = [];
    for (const [i, d] of SIGHTINGS.entries()) {
      const photos = [];
      for (let p = 0; p < d.photos; p++) {
        const img = await fakePhoto(i * 7 + p, d.variant);
        photos.push(await store.uploadPhoto(img));
      }
      const s = {
        id: uid(),
        lat: d.lat, lng: d.lng,
        place: d.place, city: d.city,
        province: Geo.provinceAt(d.lat, d.lng),
        variant: d.variant,
        note: d.note, author: d.author,
        createdAt: Date.now() - Math.round(d.days * 86400000),
        photos,
      };
      await store.add(s);
      out.push(s);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  /* ── "Foto" dibujada en canvas ──────────────────────────── */

  function rng(seed) {
    let x = seed * 9301 + 49297;
    return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  }

  async function fakePhoto(seed, variant) {
    const r = rng(seed + 3);
    const W = 900, H = 900;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    /* Fondo: góndola / mostrador */
    const hue = 24 + r() * 18;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `hsl(${hue} 26% ${58 + r() * 12}%)`);
    bg.addColorStop(1, `hsl(${hue} 30% ${30 + r() * 10}%)`);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    g.globalAlpha = .18;
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i % 2 ? '#000' : '#fff';
      g.fillRect(0, 90 + i * 165 + r() * 30, W, 12);
    }
    g.globalAlpha = 1;

    /* Viñeta */
    const vg = g.createRadialGradient(W / 2, H / 2, H * .25, W / 2, H / 2, H * .72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.42)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    /* El paquete */
    const tilt = (r() - .5) * .12;
    g.save();
    g.translate(W / 2 + (r() - .5) * 60, H / 2 + 30);
    g.rotate(tilt);

    const pw = 420, ph = 560;
    g.shadowColor = 'rgba(0,0,0,.45)';
    g.shadowBlur = 40;
    g.shadowOffsetY = 18;

    const pg = g.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
    pg.addColorStop(0, '#E23744');
    pg.addColorStop(.45, '#C8102E');
    pg.addColorStop(1, '#8C0E20');
    g.fillStyle = pg;
    roundRect(g, -pw / 2, -ph / 2, pw, ph, 26);
    g.fill();
    g.shadowColor = 'transparent';

    /* Sellos octagonales */
    for (let i = 0; i < 4; i++) {
      octagon(g, -pw / 2 + 56 + i * 78, -ph / 2 + 72, 30);
      g.fillStyle = '#101010'; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = '#fff';
      g.font = 'bold 9px Helvetica, Arial, sans-serif';
      g.textAlign = 'center';
      g.fillText('EXCESO', -pw / 2 + 56 + i * 78, -ph / 2 + 70);
      g.fillText('EN', -pw / 2 + 56 + i * 78, -ph / 2 + 81);
    }

    /* Wordmark */
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = 'bold 54px Georgia, "Times New Roman", serif';
    g.fillText('DON SATUR', 0, -ph / 2 + 168);

    /* Etiqueta de variante */
    const label = variant === 'con-frutas' ? 'con frutas' : 'sin frutas';
    g.fillStyle = '#FFFDF7';
    roundRect(g, pw / 2 - 190, -ph / 2 + 196, 160, 46, 10);
    g.fill();
    g.fillStyle = '#C8102E';
    g.font = 'italic 26px Georgia, serif';
    g.fillText(label, pw / 2 - 110, -ph / 2 + 228);

    /* El pan dulce */
    g.save();
    g.translate(-30, 110);
    // pirotín
    g.fillStyle = '#EBD7A6';
    g.beginPath();
    g.moveTo(-96, 0); g.lineTo(96, 0); g.lineTo(80, 150); g.lineTo(-80, 150);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(160,130,80,.55)'; g.lineWidth = 3;
    for (let x = -80; x <= 80; x += 24) {
      g.beginPath(); g.moveTo(x, 4); g.lineTo(x * .84, 148); g.stroke();
    }
    // cúpula
    const dg = g.createLinearGradient(0, -140, 0, 10);
    dg.addColorStop(0, '#D9A25C');
    dg.addColorStop(1, '#9C5E22');
    g.fillStyle = dg;
    g.beginPath();
    g.ellipse(0, -6, 100, 118, 0, Math.PI, 0);
    g.closePath(); g.fill();
    g.globalAlpha = .35;
    g.fillStyle = '#FFE9C2';
    g.beginPath(); g.ellipse(-34, -74, 30, 20, -.5, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    g.restore();

    /* Gramaje */
    g.fillStyle = '#fff';
    g.font = 'bold 22px Helvetica, Arial, sans-serif';
    g.fillText('400 g', 0, ph / 2 - 34);

    g.restore();

    /* Grano fotográfico */
    g.globalAlpha = .05;
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() > .5 ? '#fff' : '#000';
      g.fillRect(r() * W, r() * H, 2, 2);
    }
    g.globalAlpha = 1;

    return shrinkImage(c, 900, 0.72);
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function octagon(g, cx, cy, r) {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i + Math.PI / 8;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
  }

  return { seed };
})();
