/* ============================================================
   Don Satur · El Mapa del Pan Dulce
   Orquestación de la UI
   ============================================================ */

const App = (() => {

  const state = {
    sightings: [],
    filter: '',
    step: 1,
    draft: emptyDraft(),
    gallery: { items: [], index: 0 },
  };

  function emptyDraft() {
    return {
      photos: [],            // { dataUrl, blob, w, h }
      lat: null, lng: null,
      locLabel: '',
      place: '', city: '', province: '',
      variant: DS_CONFIG.variants[0].id,
      note: '', author: '',
    };
  }

  /* ══════════════════════ Arranque ══════════════════════ */

  async function boot() {
    MapView.init({ onPinClick: openGallery });
    buildLayerSwitch();
    buildVariantChips();
    wireEvents();

    state.sightings = await Store.list();

    if (!state.sightings.length && DS_CONFIG.seedDemoData && Store.mode === 'local'
        && typeof Demo !== 'undefined') {
      state.sightings = await Demo.seed(Store);
    }

    refresh();
    restoreAuthor();
  }

  function refresh({ animateId = null } = {}) {
    MapView.render(state.sightings, { animateId });
    renderFeed();
    renderStats();
  }

  /* ══════════════════════ Header · métricas ══════════════════════ */

  function renderStats() {
    const s = state.sightings;
    const places = new Set(s.map((x) => `${(x.place || '').toLowerCase()}|${x.lat.toFixed(3)}`));
    const provs = new Set(s.map((x) => x.province).filter(Boolean));
    setStat('sightings', s.length);
    setStat('places', places.size);
    setStat('provinces', provs.size);
  }

  function setStat(name, value) {
    const el = $(`[data-stat="${name}"]`);
    if (el) el.textContent = value;
  }

  /* ══════════════════════ Feed lateral ══════════════════════ */

  function renderFeed() {
    const list = $('#feedList');
    const q = state.filter.trim().toLowerCase();
    const rows = state.sightings.filter((s) =>
      !q || `${s.place} ${s.city} ${s.province} ${s.note}`.toLowerCase().includes(q));

    list.innerHTML = rows.map(feedCard).join('');
    $('#feedEmpty').hidden = rows.length > 0;
    $('#feedEmpty').innerHTML = state.sightings.length
      ? 'Ningún avistamiento coincide con ese filtro.'
      : 'Todavía no hay avistamientos.<br>Sé la primera persona en pinear uno 🍞';

    $$('.fcard', list).forEach((el) => {
      el.onclick = () => {
        const s = state.sightings.find((x) => x.id === el.dataset.id);
        if (!s) return;
        if (window.matchMedia('(max-width: 900px)').matches) closeFeed();
        MapView.focusSighting(s);
      };
    });
  }

  function feedCard(s) {
    const variant = DS_CONFIG.variants.find((v) => v.id === s.variant);
    const img = s.photos && s.photos[0] ? s.photos[0].url : '';
    return `
      <li class="fcard" data-id="${esc(s.id)}">
        ${img ? `<img class="fcard__img" src="${esc(img)}" alt="" loading="lazy">`
              : '<div class="fcard__img"></div>'}
        <div class="fcard__txt">
          <span class="fcard__name">${esc(s.place || 'Sin nombre')}</span>
          <span class="fcard__city">${esc(s.city || s.province || '')}</span>
          ${variant ? `<span class="fcard__tag">${esc(variant.label)}</span>` : ''}
          <span class="fcard__when">${timeAgo(s.createdAt)}${s.author ? ` · ${esc(s.author)}` : ''}</span>
        </div>
      </li>`;
  }

  const openFeed  = () => $('#feed').classList.add('is-open');
  const closeFeed = () => $('#feed').classList.remove('is-open');

  /* ══════════════════════ Alta · wizard ══════════════════════ */

  function openAdd() {
    state.draft = emptyDraft();
    state.step = 1;
    renderThumbs();
    renderPicked();
    $('#placeInput').value = '';
    $('#cityInput').value = '';
    $('#noteInput').value = '';
    $('#searchInput').value = '';
    $('#searchResults').hidden = true;
    $('#latInput').value = '';
    $('#lngInput').value = '';
    selectVariant(DS_CONFIG.variants[0].id);
    restoreAuthor();
    showSheet('#addSheet');
    goStep(1);
  }

  function closeAdd() {
    Camera.stop();
    MapView.clearGhost();
    MapView.stopPicking();
    $('#pickHint').hidden = true;
    hideSheet('#addSheet');
  }

  function goStep(n) {
    state.step = n;
    $$('.step').forEach((el) => { el.hidden = Number(el.dataset.panel) !== n; });
    $$('#steps li').forEach((li) => {
      const i = Number(li.dataset.step);
      li.classList.toggle('is-active', i === n);
      li.classList.toggle('is-done', i < n);
    });
    $('#btnBack').hidden = n === 1;
    $('#btnNext').textContent = n === 3 ? 'Publicar en el mapa' : 'Siguiente';
    if (n !== 1) Camera.stop(), showPickers();
    syncNext();
  }

  function syncNext() {
    const d = state.draft;
    const ok = state.step === 1 ? d.photos.length > 0
             : state.step === 2 ? d.lat !== null && d.lng !== null
             : $('#placeInput').value.trim().length > 0;
    $('#btnNext').disabled = !ok;
  }

  async function nextStep() {
    if (state.step < 3) {
      // Al pasar al paso 3, precargamos lo que sepamos del lugar.
      if (state.step === 2) {
        if (!$('#placeInput').value && state.draft.place) $('#placeInput').value = state.draft.place;
        if (!$('#cityInput').value && state.draft.city)   $('#cityInput').value = state.draft.city;
      }
      goStep(state.step + 1);
      return;
    }
    await publish();
  }

  /* ── Paso 1 · fotos ─────────────────────────────────────── */

  function showPickers() {
    $('#camStage').hidden = true;
    $('#photoPickers').hidden = false;
  }

  async function openCamera() {
    if (!Camera.supported()) {
      toast('Tu navegador no permite usar la cámara. Probá subiendo una foto.', 'err');
      return $('#fileInput').click();
    }
    $('#photoPickers').hidden = true;
    $('#camStage').hidden = false;
    try {
      await Camera.start();
    } catch (err) {
      showPickers();
      toast(err.message || 'No pudimos abrir la cámara', 'err');
    }
  }

  async function shoot() {
    try {
      const photo = await Camera.snap();
      addPhoto(photo);
      toast('¡Foto lista!', 'ok', 1600);
      if (state.draft.photos.length >= DS_CONFIG.photos.maxPerSighting) {
        Camera.stop(); showPickers();
      }
    } catch (err) {
      toast(err.message || 'No pudimos sacar la foto', 'err');
    }
  }

  async function onFiles(ev) {
    const files = Array.from(ev.target.files || []);
    ev.target.value = '';
    for (const f of files) {
      if (state.draft.photos.length >= DS_CONFIG.photos.maxPerSighting) {
        toast(`Máximo ${DS_CONFIG.photos.maxPerSighting} fotos`, 'err');
        break;
      }
      if (!f.type.startsWith('image/')) continue;
      try {
        addPhoto(await shrinkImage(f));
      } catch {
        toast(`No pudimos leer ${f.name}`, 'err');
      }
    }
  }

  function addPhoto(photo) {
    if (state.draft.photos.length >= DS_CONFIG.photos.maxPerSighting) return;
    state.draft.photos.push(photo);
    renderThumbs();
    syncNext();
  }

  function renderThumbs() {
    const wrap = $('#thumbs');
    wrap.innerHTML = state.draft.photos.map((p, i) => `
      <div class="thumb">
        <img src="${p.dataUrl}" alt="Foto ${i + 1}">
        <button data-i="${i}" aria-label="Quitar foto">&times;</button>
      </div>`).join('');
    $$('button', wrap).forEach((b) => {
      b.onclick = () => {
        state.draft.photos.splice(Number(b.dataset.i), 1);
        renderThumbs();
        syncNext();
      };
    });
    const left = DS_CONFIG.photos.maxPerSighting - state.draft.photos.length;
    $('#photoHint').textContent = state.draft.photos.length
      ? `${state.draft.photos.length} foto(s) cargada(s) · podés sumar ${left} más`
      : `Hasta ${DS_CONFIG.photos.maxPerSighting} fotos. Se comprimen antes de guardarse.`;
  }

  /* ── Paso 2 · lugar ─────────────────────────────────────── */

  async function useGps() {
    const btn = $('#btnGps');
    btn.classList.add('is-on');
    btn.disabled = true;
    try {
      const pos = await Geo.current();
      await setLocation(pos.lat, pos.lng, { lookup: true });
      toast(`Te ubicamos con ±${Math.round(pos.accuracy)} m de precisión`, 'ok');
    } catch (err) {
      toast(err.message, 'err', 4200);
    } finally {
      btn.classList.remove('is-on');
      btn.disabled = false;
    }
  }

  function pickOnMap() {
    hideSheet('#addSheet', { keepDraft: true });
    Camera.stop();
    $('#pickHint').hidden = false;
    MapView.startPicking(async (lat, lng) => {
      $('#pickHint').hidden = true;
      showSheet('#addSheet');
      goStep(2);
      await setLocation(lat, lng, { lookup: true });
    });
  }

  function cancelPick() {
    MapView.stopPicking();
    $('#pickHint').hidden = true;
    showSheet('#addSheet');
    goStep(2);
  }

  /** Fija la ubicación del borrador y opcionalmente busca el nombre. */
  async function setLocation(lat, lng, { lookup = false, label = '', city = '', province = '' } = {}) {
    const d = state.draft;
    d.lat = lat; d.lng = lng;
    d.locLabel = label || d.locLabel || '';
    d.city = city || d.city;
    d.province = province || Geo.provinceAt(lat, lng);

    MapView.showGhost(lat, lng);
    MapView.flyTo(lat, lng, 15);
    renderPicked();
    syncNext();

    if (lookup && DS_CONFIG.geocoder.enabled) {
      try {
        const r = await Geo.reverse(lat, lng);
        if (r) {
          d.locLabel = d.locLabel || r.title;
          d.city = d.city || r.city;
          if (r.province) d.province = r.province;
          renderPicked();
        }
      } catch {
        /* sin conexión al geocoder: seguimos con las coordenadas */
      }
    }
  }

  function renderPicked() {
    const d = state.draft;
    const box = $('#picked');
    if (d.lat === null) { box.hidden = true; return; }
    box.hidden = false;
    $('#pickedLabel').textContent = d.locLabel || d.city || d.province || 'Punto marcado';
    $('#pickedCoords').textContent = fmtCoords(d.lat, d.lng)
      + (d.province ? ` · ${d.province}` : '');
  }

  const runSearch = debounce(async () => {
    const q = $('#searchInput').value;
    const ul = $('#searchResults');
    const hint = $('#searchHint');
    if (q.trim().length < 3) { ul.hidden = true; hint.hidden = true; return; }
    try {
      const rows = await Geo.search(q);
      if (!rows.length) {
        ul.hidden = true;
        hint.hidden = false;
        hint.className = 'hint';
        hint.textContent = 'Sin resultados. Probá marcando el punto en el mapa.';
        return;
      }
      hint.hidden = true;
      ul.hidden = false;
      ul.innerHTML = rows.map((r, i) => `
        <li data-i="${i}"><b>${esc(r.title)}</b><span>${esc(r.subtitle)}</span></li>`).join('');
      $$('li', ul).forEach((li) => {
        li.onclick = async () => {
          const r = rows[Number(li.dataset.i)];
          ul.hidden = true;
          $('#searchInput').value = r.title;
          state.draft.place = state.draft.place || r.title;
          await setLocation(r.lat, r.lng, { label: r.title, city: r.city, province: r.province });
        };
      });
    } catch {
      ul.hidden = true;
      hint.hidden = false;
      hint.className = 'hint hint--warn';
      hint.textContent = 'No pudimos conectarnos al buscador. Usá "Marcar en el mapa" o cargá las coordenadas a mano.';
    }
  }, 420);

  function manualCoords() {
    const lat = parseFloat($('#latInput').value.replace(',', '.'));
    const lng = parseFloat($('#lngInput').value.replace(',', '.'));
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return toast('Revisá las coordenadas', 'err');
    }
    setLocation(lat, lng, { lookup: true });
  }

  /* ── Paso 3 · detalle ───────────────────────────────────── */

  function buildVariantChips() {
    $('#variantChips').innerHTML = DS_CONFIG.variants
      .map((v) => `<button type="button" class="chip" data-v="${esc(v.id)}">${esc(v.label)}</button>`)
      .join('');
    $$('#variantChips .chip').forEach((c) => {
      c.onclick = () => selectVariant(c.dataset.v);
    });
  }

  function selectVariant(id) {
    state.draft.variant = id;
    $$('#variantChips .chip').forEach((c) => c.classList.toggle('is-on', c.dataset.v === id));
  }

  function restoreAuthor() {
    const saved = localStorage.getItem('ds_author') || '';
    if (saved) $('#authorInput').value = saved;
  }

  /* ── Publicar ───────────────────────────────────────────── */

  async function publish() {
    const d = state.draft;
    const btn = $('#btnNext');
    btn.disabled = true;
    btn.textContent = 'Publicando…';

    try {
      const photos = [];
      for (const p of d.photos) photos.push(await Store.uploadPhoto(p));

      const sighting = {
        id: uid(),
        lat: d.lat, lng: d.lng,
        place: $('#placeInput').value.trim(),
        city: $('#cityInput').value.trim() || d.city || '',
        province: d.province || Geo.provinceAt(d.lat, d.lng),
        variant: d.variant,
        note: $('#noteInput').value.trim(),
        author: $('#authorInput').value.trim(),
        createdAt: Date.now(),
        photos,
      };

      const saved = await Store.add(sighting);
      if (saved.author) localStorage.setItem('ds_author', saved.author);

      state.sightings.unshift(saved);
      closeAdd();
      refresh({ animateId: saved.id });
      MapView.flyTo(saved.lat, saved.lng, 15);
      toast('¡Avistamiento sumado al mapa! 🍞', 'ok');
    } catch (err) {
      console.error(err);
      toast('No pudimos guardar el avistamiento. Probá de nuevo.', 'err', 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Publicar en el mapa';
      syncNext();
    }
  }

  /* ══════════════════════ Galería del pin ══════════════════════ */

  function openGallery(group) {
    const items = [];
    for (const s of group.items) {
      for (const p of (s.photos || [])) items.push({ photo: p, sighting: s });
    }
    state.gallery.items = items;

    $('#galTitle').textContent = group.place || 'Avistamiento';
    const provinces = [...new Set(group.items.map((s) => s.province).filter(Boolean))];
    $('#galMeta').textContent = [
      group.city || provinces[0] || '',
      `${items.length} foto${items.length === 1 ? '' : 's'}`,
      `${group.items.length} avistamiento${group.items.length === 1 ? '' : 's'}`,
    ].filter(Boolean).join(' · ');

    $('#gal').innerHTML = items.map((it, i) => {
      const s = it.sighting;
      const variant = DS_CONFIG.variants.find((v) => v.id === s.variant);
      return `
        <figure class="galitem">
          <img src="${esc(it.photo.url)}" alt="${esc(s.place)}" data-i="${i}" loading="lazy">
          <figcaption class="galitem__foot">
            <b>${esc(s.author || 'Anónimo')}</b>
            ${s.note ? `<p>${esc(s.note)}</p>` : ''}
            <small>${variant ? esc(variant.label) + ' · ' : ''}${timeAgo(s.createdAt)}</small>
          </figcaption>
        </figure>`;
    }).join('');

    $$('#gal img').forEach((img) => {
      img.onclick = () => openLightbox(Number(img.dataset.i));
    });

    showSheet('#gallerySheet');
  }

  /* ══════════════════════ Lightbox ══════════════════════ */

  function openLightbox(i) {
    state.gallery.index = i;
    paintLightbox();
    $('#lightbox').hidden = false;
  }

  function paintLightbox() {
    const { items, index } = state.gallery;
    const it = items[index];
    if (!it) return;
    $('#lbImg').src = it.photo.url;
    $('#lbImg').alt = it.sighting.place || '';
    $('#lbCap').textContent = [
      it.sighting.place,
      it.sighting.city,
      it.sighting.author ? `por ${it.sighting.author}` : '',
      `${index + 1}/${items.length}`,
    ].filter(Boolean).join(' · ');
    const many = items.length > 1;
    $('#lbPrev').hidden = !many;
    $('#lbNext').hidden = !many;
  }

  function stepLightbox(dir) {
    const n = state.gallery.items.length;
    if (!n) return;
    state.gallery.index = (state.gallery.index + dir + n) % n;
    paintLightbox();
  }

  const closeLightbox = () => { $('#lightbox').hidden = true; };

  /* ══════════════════════ Sheets ══════════════════════ */

  function showSheet(sel) { $(sel).hidden = false; document.body.style.overflow = 'hidden'; }
  function hideSheet(sel) { $(sel).hidden = true; document.body.style.overflow = ''; }

  /* ══════════════════════ Capas ══════════════════════ */

  function buildLayerSwitch() {
    const wrap = $('#layerSwitch');
    wrap.innerHTML = DS_CONFIG.map.tiles
      .map((t, i) => `<button data-id="${esc(t.id)}" class="${i === 0 ? 'is-on' : ''}">${esc(t.label)}</button>`)
      .join('');
    $$('button', wrap).forEach((b) => {
      b.onclick = () => {
        $$('button', wrap).forEach((x) => x.classList.toggle('is-on', x === b));
        MapView.setTiles(b.dataset.id);
      };
    });
  }

  /* ══════════════════════ Eventos ══════════════════════ */

  function wireEvents() {
    $('#btnAdd').onclick = openAdd;
    $('#btnNext').onclick = nextStep;
    $('#btnBack').onclick = () => goStep(Math.max(1, state.step - 1));

    $$('[data-close]').forEach((el) => {
      el.onclick = () => {
        const sheet = el.closest('.sheet');
        if (sheet) return sheet.id === 'addSheet' ? closeAdd() : hideSheet('#' + sheet.id);
        closeLightbox();
      };
    });

    $('#btnOpenCam').onclick   = openCamera;
    $('#btnOpenFiles').onclick = () => $('#fileInput').click();
    $('#fileInput').onchange   = onFiles;
    $('#btnShutter').onclick   = shoot;
    $('#btnCamFlip').onclick   = () => Camera.flip().catch((e) => toast(e.message, 'err'));
    $('#btnCamCancel').onclick = () => { Camera.stop(); showPickers(); };

    $('#btnGps').onclick        = useGps;
    $('#btnPickOnMap').onclick  = pickOnMap;
    $('#btnCancelPick').onclick = cancelPick;
    $('#searchInput').oninput   = runSearch;
    $('#btnManualCoords').onclick = manualCoords;

    $('#placeInput').oninput = syncNext;

    $('#btnLocateMe').onclick = async () => {
      const b = $('#btnLocateMe');
      b.classList.add('is-busy');
      try {
        const p = await Geo.current();
        MapView.flyTo(p.lat, p.lng, 14);
      } catch (err) {
        toast(err.message, 'err');
      } finally {
        b.classList.remove('is-busy');
      }
    };
    $('#btnFitAll').onclick = () => MapView.fitAll(state.sightings);

    $('#btnToggleFeed').onclick = () => $('#feed').classList.toggle('is-open');
    $('#btnCloseFeed').onclick  = closeFeed;
    $('#feedFilter').oninput = (e) => { state.filter = e.target.value; renderFeed(); };

    $('#lbPrev').onclick = () => stepLightbox(-1);
    $('#lbNext').onclick = () => stepLightbox(1);

    document.addEventListener('keydown', (e) => {
      if (!$('#lightbox').hidden) {
        if (e.key === 'Escape')     closeLightbox();
        if (e.key === 'ArrowLeft')  stepLightbox(-1);
        if (e.key === 'ArrowRight') stepLightbox(1);
        return;
      }
      if (e.key === 'Escape') {
        if (!$('#gallerySheet').hidden) hideSheet('#gallerySheet');
        else if (!$('#addSheet').hidden) closeAdd();
      }
    });

    window.addEventListener('pagehide', () => Camera.stop());
  }

  return { boot, state };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.boot().catch((err) => {
    console.error(err);
    toast('Algo falló al iniciar el mapa', 'err', 6000);
  });
});
