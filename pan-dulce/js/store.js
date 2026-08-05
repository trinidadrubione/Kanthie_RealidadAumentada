/* ============================================================
   Almacenamiento de avistamientos
   ------------------------------------------------------------
   Dos adaptadores con la misma interfaz:

     Store.list()           → Promise<Sighting[]>
     Store.add(sighting)    → Promise<Sighting>
     Store.remove(id)       → Promise<void>

   Un "sighting" (avistamiento) es:
   {
     id, lat, lng, place, city, province, variant,
     note, author, createdAt,
     photos: [{ url, w, h }]
   }

   - 'local'    → IndexedDB. Anda sin servidor; cada navegador ve
                  sólo sus propias cargas. Perfecto para probar.
   - 'supabase' → tabla + storage bucket compartidos. Para producción,
                  completar `DS_CONFIG.storage.supabase`.
   ============================================================ */

/* ──────────────────── Adaptador local (IndexedDB) ──────────────────── */

const LocalStore = (() => {
  const DB = 'donsatur-pandulce';
  const STORE = 'sightings';
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function tx(mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
    }));
  }

  return {
    mode: 'local',
    async list() {
      const rows = await tx('readonly', (s) => s.getAll());
      return (rows || []).sort((a, b) => b.createdAt - a.createdAt);
    },
    async add(sighting) {
      await tx('readwrite', (s) => s.put(sighting));
      return sighting;
    },
    async remove(id) {
      await tx('readwrite', (s) => s.delete(id));
    },
    /** Las fotos ya vienen como data URL; no hay que subir nada. */
    async uploadPhoto(photo) {
      return { url: photo.dataUrl, w: photo.w, h: photo.h };
    },
  };
})();

/* ──────────────────── Adaptador Supabase ──────────────────── */

const SupabaseStore = (() => {
  const cfg = () => DS_CONFIG.storage.supabase;

  const headers = (extra = {}) => ({
    apikey: cfg().anonKey,
    Authorization: `Bearer ${cfg().anonKey}`,
    ...extra,
  });

  async function jsonFetch(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }

  return {
    mode: 'supabase',

    async list() {
      const { url, table } = cfg();
      const rows = await jsonFetch(
        `${url}/rest/v1/${table}?select=*&order=created_at.desc&limit=1000`,
        { headers: headers() },
      );
      return rows.map(fromRow);
    },

    async add(sighting) {
      const { url, table } = cfg();
      const rows = await jsonFetch(`${url}/rest/v1/${table}`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(toRow(sighting)),
      });
      return fromRow(rows[0]);
    },

    async remove(id) {
      const { url, table } = cfg();
      await fetch(`${url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: headers(),
      });
    },

    /** Sube el JPEG al bucket y devuelve la URL pública. */
    async uploadPhoto(photo) {
      const { url, bucket } = cfg();
      const path = `${new Date().toISOString().slice(0, 7)}/${uid()}.jpg`;
      const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }),
        body: photo.blob,
      });
      if (!res.ok) throw new Error(`Storage ${res.status}: ${await res.text()}`);
      return {
        url: `${cfg().url}/storage/v1/object/public/${bucket}/${path}`,
        w: photo.w, h: photo.h,
      };
    },
  };

  function toRow(s) {
    return {
      id: s.id, lat: s.lat, lng: s.lng,
      place: s.place, city: s.city, province: s.province,
      variant: s.variant, note: s.note, author: s.author,
      photos: s.photos,
      created_at: new Date(s.createdAt).toISOString(),
    };
  }
  function fromRow(r) {
    return {
      id: r.id, lat: Number(r.lat), lng: Number(r.lng),
      place: r.place, city: r.city, province: r.province,
      variant: r.variant, note: r.note, author: r.author,
      photos: r.photos || [],
      createdAt: new Date(r.created_at).getTime(),
    };
  }
})();

/* ──────────────────── Selección del adaptador ──────────────────── */

const Store = (() => {
  const s = DS_CONFIG.storage;
  const useSupabase = s.mode === 'supabase' && s.supabase.url && s.supabase.anonKey;
  if (s.mode === 'supabase' && !useSupabase) {
    console.warn('[store] Modo supabase pedido pero falta url/anonKey. Uso IndexedDB local.');
  }
  return useSupabase ? SupabaseStore : LocalStore;
})();
