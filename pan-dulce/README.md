# 🍞 Don Satur · El Mapa del Pan Dulce

Sitio interactivo donde cualquiera puede **registrar dónde encontró el Pan Dulce
Don Satur**: saca una foto (o sube una del celular), marca el local en el mapa de
Argentina y el avistamiento queda pineado con un dibujo de pan dulce. Al tocar
un pin se abre la **galería de fotos** que subió la gente en ese lugar.

Inspirado en la mecánica de *heartspotting*: la gracia es la acumulación
colectiva de hallazgos sobre un mapa.

---

## ✨ Qué hace hoy

| | |
|---|---|
| 📷 **Foto** | Cámara en vivo (`getUserMedia`, trasera por defecto, botón para girar) **o** subir hasta 4 imágenes del dispositivo. Se redimensionan y comprimen en el navegador antes de guardarse. |
| 📍 **Ubicación** | Cuatro formas: GPS del celular, buscador de direcciones, tocar el punto en el mapa, o pegar coordenadas a mano. |
| 🏪 **Datos** | Nombre del local, ciudad/barrio, variante (sin frutas / con frutas), comentario y autor. |
| 🗺️ **Mapa** | Leaflet con pines de pan dulce dibujados en SVG, agrupamiento automático (clustering) y capa satelital opcional. |
| 🖼️ **Galería** | Cada pin abre la galería de todas las fotos de ese local, con visor a pantalla completa y navegación por teclado. |
| 📰 **Feed** | Listado lateral de últimos avistamientos con filtro por local o ciudad. |
| 🔢 **Métricas** | Sellos octagonales en el header (guiño al packaging) con avistamientos, locales y provincias. |

Funciona en desktop, tablet y celular. Sin dependencias externas: Leaflet y el
mapa base van versionados en el repo.

---

## 🚀 Probarlo

La cámara y el GPS **requieren HTTPS o `localhost`**:

```bash
cd pan-dulce
python3 -m http.server 8000
# abrir http://localhost:8000
```

Para publicarlo, GitHub Pages alcanza (sirve por HTTPS).

---

## 🗂️ Estructura

```
pan-dulce/
├── index.html            Estructura de la UI
├── css/
│   ├── tokens.css        ← BRANDING. El único archivo a tocar para el manual de marca
│   └── style.css         Layout y componentes
├── js/
│   ├── config.js         ← CONFIGURACIÓN. Mapa, storage, variantes de producto
│   ├── utils.js          Helpers, toasts, compresión de imágenes
│   ├── store.js          Persistencia (IndexedDB local · Supabase)
│   ├── geo.js            GPS, geocodificación, provincias
│   ├── camera.js         Cámara en vivo
│   ├── mapview.js        Mapa, pines y clustering
│   ├── demo.js           Datos de ejemplo (se pueden apagar)
│   └── app.js            Orquestación de la UI
├── assets/
│   └── basemap-ar.json   Mapa vectorial de Argentina (respaldo sin conexión)
└── vendor/               Leaflet + MarkerCluster versionados
```

---

## 🎨 Branding

Todo el color y la tipografía salen de **`css/tokens.css`**. La paleta actual se
sacó del packaging del pan dulce sin frutas de 400 g:

| Token | Valor | Uso |
|---|---|---|
| `--ds-red` | `#C8102E` | Rojo principal de la bolsa |
| `--ds-red-dark` | `#8C0E20` | Sombra del degradé |
| `--ds-crust` | `#B9762E` | Corteza del pan |
| `--ds-crumb` | `#F5DFA8` | Miga |
| `--ds-cream` | `#FBF1DC` | Fondo cálido |
| `--ds-seal` | `#101010` | Sellos octagonales |

Las tipografías son stacks del sistema hasta tener las oficiales: cambiando
`--ds-font-display` y `--ds-font-ui` se actualiza todo el sitio.

**Pendiente de marca** (cuando llegue el manual):

- Logotipo oficial en SVG → reemplaza el sello del header en `index.html`.
- Fuentes oficiales → `--ds-font-display` / `--ds-font-ui`.
- Foto del pan dulce real como pin → en `js/mapview.js`, reemplazar la constante
  `PAN_DULCE_SVG` por `'<img src="assets/pan-dulce.png" alt="">'`.

---

## 💾 Dónde se guardan los avistamientos

`js/config.js` → `storage.mode`:

### `'local'` (actual)

IndexedDB del navegador. **Anda sin servidor**, ideal para probar y mostrar,
pero cada persona ve sólo sus propias cargas. Las fotos quedan como data URL.

### `'supabase'` (para producción)

Base compartida real. Se completa así:

```js
storage: {
  mode: 'supabase',
  supabase: {
    url:     'https://xxxxx.supabase.co',
    anonKey: 'eyJhbGci...',   // clave pública anon
    table:   'sightings',
    bucket:  'sightings',
  },
},
```

En Supabase hay que crear la tabla y el bucket:

```sql
create table sightings (
  id         text primary key,
  lat        double precision not null,
  lng        double precision not null,
  place      text,
  city       text,
  province   text,
  variant    text,
  note       text,
  author     text,
  photos     jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table sightings enable row level security;
create policy "lectura pública"  on sightings for select using (true);
create policy "alta pública"     on sightings for insert with check (true);
```

Y un bucket **público** llamado `sightings` con política de `insert` abierta.

> ⚠️ Con esas políticas cualquiera puede publicar. Antes de salir a producción
> conviene sumar moderación: un campo `approved boolean default false` y filtrar
> por él en la lectura, o rate limiting vía Edge Function.

---

## 🔌 Servicios externos

| Servicio | Para qué | Alternativa si falla |
|---|---|---|
| CARTO / OSM | Tiles del mapa | Cae automáticamente al mapa vectorial local |
| Esri World Imagery | Capa satélite | — |
| Nominatim (OSM) | Buscar direcciones | Marcar en el mapa o coordenadas a mano |

Nominatim es gratuito pero pide **máximo 1 consulta por segundo** (el buscador
ya viene con *debounce*). Para volumen alto conviene migrar a Google Places o
Mapbox Geocoding: sólo se toca `js/geo.js`.

---

## 🛣️ Próximos pasos

- [ ] Reemplazar el pin SVG por el PNG del producto real.
- [ ] Aplicar el manual de marca oficial en `tokens.css`.
- [ ] Backend compartido (Supabase) + moderación.
- [ ] Compartir un avistamiento por link directo (`?s=<id>`).
- [ ] Ranking de provincias / "más avistado de la semana".
- [ ] PWA para que se pueda instalar en el celular.
