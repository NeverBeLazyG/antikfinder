const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";

const ANCIENT_TYPES = [
  "wd:Q839954",   // Archäologische Stätte
  "wd:Q109607",   // Ruine
  "wd:Q15661340", // Antike Stadt
  "wd:Q515716",   // Polis
  "wd:Q22676",    // Römische Stadt
  "wd:Q14092",    // Amphitheater
  "wd:Q19757",    // Römisches Theater
  "wd:Q34826",    // Antikes griechisches Theater
  "wd:Q267596",   // Griechischer Tempel
  "wd:Q856584",   // Römischer Tempel
  "wd:Q44539",    // Tempel
  "wd:Q143912",   // Triumphbogen
  "wd:Q82117",    // Stadttor
  "wd:Q188669",   // Aquädukt
  "wd:Q200141",   // Nekropole
  "wd:Q1081138",  // Historische Stätte
  "wd:Q23413",    // Burg / Kastell
  "wd:Q17715832", // Burgruine
  "wd:Q57821",    // Festung
  "wd:Q88291",    // Zitadelle
  "wd:Q131668",   // Akropolis
  "wd:Q3395377",  // Antikes Bauwerk
  "wd:Q1120560",  // Therme
  "wd:Q1351282",  // Heiligtum
  "wd:Q4765653"   // Felsengrab
];

const state = {
  center: null,       // { lat, lng, label }
  radiusKm: 50,
  places: [],
  filtered: [],
  selectedId: null,
  filterMode: "highlights",
  sortMode: "popularity",
  activeAbort: null,
  searchCache: new Map(),
  wikiCache: new Map(),
  markers: new Map(),
  originMarker: null,
  radiusCircle: null,
  currentLayerKey: "voyager"
};

// DOM elements
const els = {
  gpsBtn: document.getElementById("gps-btn"),
  searchForm: document.getElementById("search-form"),
  searchInput: document.getElementById("search-input"),
  radiusBtns: document.querySelectorAll(".radius-btn"),
  layerBtns: document.querySelectorAll(".layer-btn"),
  quickCities: document.querySelectorAll(".chip"),
  mapHint: document.getElementById("map-hint"),
  loadingPill: document.getElementById("loading-pill"),
  loadingText: document.getElementById("loading-text"),
  toast: document.getElementById("toast"),
  panel: document.getElementById("panel"),
  panelHandle: document.getElementById("panel-handle"),
  resultsTitle: document.getElementById("results-title"),
  resultsSubtitle: document.getElementById("results-subtitle"),
  resultsList: document.getElementById("results-list"),
  filterSelect: document.getElementById("filter-select"),
  sortSelect: document.getElementById("sort-select"),
  detailBackdrop: document.getElementById("detail-backdrop"),
  detailSheet: document.getElementById("detail-sheet"),
  detailClose: document.getElementById("detail-close"),
  detailImageWrap: document.getElementById("detail-image-wrap"),
  detailImage: document.getElementById("detail-image"),
  detailType: document.getElementById("detail-type"),
  detailDistance: document.getElementById("detail-distance"),
  detailTitle: document.getElementById("detail-title"),
  detailDesc: document.getElementById("detail-desc"),
  btnRoute: document.getElementById("btn-route"),
  btnGmapsView: document.getElementById("btn-gmaps-view"),
  btnWiki: document.getElementById("btn-wiki")
};

// Initialize Leaflet Map (default view: Eastern Mediterranean / Antalya region)
const map = L.map("map", {
  zoomControl: false
}).setView([36.8969, 30.7133], 9);

L.control.zoom({ position: "bottomright" }).addTo(map);

const tileLayers = {
  voyager: L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19
  }),
  satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
    maxZoom: 18
  }),
  osm: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  })
};

tileLayers.voyager.addTo(map);
const markerLayer = L.layerGroup().addTo(map);

// Toast helper
let toastTimer = null;
function showToast(msg, duration = 4000) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), duration);
}

function setLoading(isLoading, text = "Suche antike Ruinen…") {
  els.loadingText.textContent = text;
  els.loadingPill.classList.toggle("hidden", !isLoading);
}

// Parse WKT "Point(lon lat)" -> { lat, lng }
function parseWktPoint(wkt) {
  const match = /Point\(([-\d.]+)\s+([-\d.]+)\)/i.exec(wkt || "");
  if (!match) return null;
  return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
}

// Convert Wikimedia Commons URL to fast resized thumbnail URL
function toCommonsThumb(imageUrl, width = 480) {
  if (!imageUrl) return null;
  try {
    const clean = imageUrl.replace(/^http:\/\//i, "https://");
    const fileMatch = clean.match(/Special:FilePath\/(.+)$/i);
    if (fileMatch) {
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${fileMatch[1]}?width=${width}`;
    }
    return clean;
  } catch {
    return null;
  }
}

function extractWikiTitle(articleUrl) {
  if (!articleUrl) return null;
  try {
    const u = new URL(articleUrl);
    const parts = u.pathname.split("/wiki/");
    return parts[1] ? decodeURIComponent(parts[1]) : null;
  } catch {
    return null;
  }
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

function estimateDriveTime(km) {
  // Rough realistic road factor (1.35x straight line) at ~55 km/h average
  const mins = Math.max(3, Math.round(((km * 1.35) / 55) * 60));
  if (mins < 60) return `ca. ${mins} Min.`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `ca. ${h} Std. ${m} Min.` : `ca. ${h} Std.`;
}

function buildSparqlQuery(lat, lng, radiusKm) {
  return `
SELECT ?item ?itemLabel ?itemDescription ?coord ?dist ?image ?sitelinks ?deArticle ?enArticle ?typeLabel WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lng.toFixed(5)} ${lat.toFixed(5)})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
    bd:serviceParam wikibase:distance ?dist .
  }
  VALUES ?type { ${ANCIENT_TYPES.join(" ")} }
  ?item wdt:P31 ?type .
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?item wikibase:sitelinks ?sitelinks . }
  OPTIONAL {
    ?deArticle schema:about ?item ;
               schema:isPartOf <https://de.wikipedia.org/> .
  }
  OPTIONAL {
    ?enArticle schema:about ?item ;
               schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en,tr,el,it,fr" . }
}
LIMIT 300`;
}

async function fetchAncientSites(lat, lng, radiusKm, signal) {
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)},${radiusKm}`;
  if (state.searchCache.has(cacheKey)) {
    return state.searchCache.get(cacheKey);
  }

  const query = buildSparqlQuery(lat, lng, radiusKm);
  const url = `${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/sparql-results+json" }
  });

  if (!res.ok) {
    throw new Error(`Wikidata antwortete mit Status ${res.status}`);
  }

  const data = await res.json();
  const byId = new Map();

  for (const row of data.results?.bindings || []) {
    const uri = row.item?.value;
    if (!uri) continue;
    const id = uri.split("/").pop();
    const label = row.itemLabel?.value || "";
    // Skip raw Q-IDs without a human-readable label
    if (!label || /^Q\d+$/.test(label)) continue;

    const coords = parseWktPoint(row.coord?.value);
    if (!coords) continue;

    const existing = byId.get(id);
    const typeLabel = row.typeLabel?.value || "Historische Stätte";

    if (!existing) {
      byId.set(id, {
        id,
        name: label,
        desc: row.itemDescription?.value || "",
        lat: coords.lat,
        lng: coords.lng,
        distanceKm: parseFloat(row.dist?.value || "0"),
        image: toCommonsThumb(row.image?.value, 480),
        sitelinks: parseInt(row.sitelinks?.value || "0", 10),
        deArticle: row.deArticle?.value || null,
        enArticle: row.enArticle?.value || null,
        type: capitalize(typeLabel)
      });
    } else {
      if (!existing.image && row.image?.value) {
        existing.image = toCommonsThumb(row.image.value, 480);
      }
      if (!existing.deArticle && row.deArticle?.value) {
        existing.deArticle = row.deArticle.value;
      }
      if (!existing.enArticle && row.enArticle?.value) {
        existing.enArticle = row.enArticle.value;
      }
    }
  }

  const list = Array.from(byId.values());
  state.searchCache.set(cacheKey, list);
  return list;
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function fetchWikipediaSummary(place) {
  if (state.wikiCache.has(place.id)) {
    return state.wikiCache.get(place.id);
  }

  const attempts = [];
  if (place.deArticle) {
    const title = extractWikiTitle(place.deArticle);
    if (title) attempts.push({ lang: "de", title, url: place.deArticle });
  }
  if (place.enArticle) {
    const title = extractWikiTitle(place.enArticle);
    if (title) attempts.push({ lang: "en", title, url: place.enArticle });
  }

  for (const attempt of attempts) {
    try {
      const apiUrl = `https://${attempt.lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(attempt.title)}`;
      const res = await fetch(apiUrl);
      if (!res.ok) continue;
      const json = await res.json();
      if (json.extract) {
        const result = {
          extract: json.extract,
          thumbnail: json.thumbnail?.source || place.image,
          wikiUrl: json.content_urls?.mobile?.page || attempt.url,
          lang: attempt.lang
        };
        state.wikiCache.set(place.id, result);
        return result;
      }
    } catch {
      // Try next fallback
    }
  }

  const fallback = {
    extract: place.desc || "Antike bzw. historische Stätte in dieser Region. Über Google Maps findest du aktuelle Fotos, Öffnungszeiten und Bewertungen.",
    thumbnail: place.image,
    wikiUrl: place.deArticle || place.enArticle || null,
    lang: "de"
  };
  state.wikiCache.set(place.id, fallback);
  return fallback;
}

function updateOriginOnMap(lat, lng, radiusKm) {
  if (state.originMarker) map.removeLayer(state.originMarker);
  if (state.radiusCircle) map.removeLayer(state.radiusCircle);

  const originIcon = L.divIcon({
    className: "",
    html: '<div class="origin-marker"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });

  state.originMarker = L.marker([lat, lng], { icon: originIcon, interactive: false }).addTo(map);
  state.radiusCircle = L.circle([lat, lng], {
    radius: radiusKm * 1000,
    color: "#b45309",
    weight: 1.5,
    dashArray: "6 6",
    fillColor: "#f59e0b",
    fillOpacity: 0.06,
    interactive: false
  }).addTo(map);

  map.fitBounds(state.radiusCircle.getBounds(), { padding: [24, 24], maxZoom: 13 });
}

function applyFilterAndSort() {
  let items = [...state.places];

  if (state.filterMode === "highlights") {
    const highlights = items.filter((p) => p.sitelinks >= 4 || p.deArticle || p.image);
    // If very few highlights exist in a quiet region, fall back to all
    items = highlights.length >= 3 ? highlights : items;
  }

  if (state.sortMode === "distance") {
    items.sort((a, b) => a.distanceKm - b.distanceKm);
  } else {
    items.sort((a, b) => {
      const scoreA = a.sitelinks * 3 + (a.deArticle ? 10 : 0) + (a.image ? 5 : 0);
      const scoreB = b.sitelinks * 3 + (b.deArticle ? 10 : 0) + (b.image ? 5 : 0);
      return scoreB - scoreA || a.distanceKm - b.distanceKm;
    });
  }

  state.filtered = items;
  renderMarkers();
  renderList();
}

function renderMarkers() {
  markerLayer.clearLayers();
  state.markers.clear();

  // Render in reverse so top sites sit visually on top
  const reversed = [...state.filtered].reverse();

  for (const place of reversed) {
    const isTop = place.sitelinks >= 10 || Boolean(place.deArticle && place.image);
    const isSelected = place.id === state.selectedId;
    const size = isTop ? 34 : 26;

    const icon = L.divIcon({
      className: "",
      html: `<div class="ruin-marker ${isTop ? "top" : "normal"} ${isSelected ? "selected" : ""}" title="${escapeHtml(place.name)}">🏛️</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });

    const marker = L.marker([place.lat, place.lng], {
      icon,
      zIndexOffset: isSelected ? 1000 : isTop ? 300 : 100
    });

    marker.bindTooltip(`${place.name} (${formatDistance(place.distanceKm)})`, {
      direction: "top",
      offset: [0, -size / 2]
    });

    marker.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      openDetail(place);
    });

    marker.addTo(markerLayer);
    state.markers.set(place.id, marker);
  }
}

function renderList() {
  const count = state.filtered.length;
  const label = state.center?.label || "Gewählter Standort";

  els.resultsTitle.textContent = count > 0 ? `${count} antike Orte gefunden` : "Keine Orte gefunden";
  els.resultsSubtitle.textContent = `${label} · Umkreis ${state.radiusKm} km`;

  if (count === 0) {
    els.resultsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🗺️</div>
        <p><strong>Hier wurde nichts gefunden</strong></p>
        <p class="muted">Erhöhe den Suchradius (z. B. 50 oder 80 km) oder schalte auf „Alle Orte“ um.</p>
      </div>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const place of state.filtered) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `place-card${place.id === state.selectedId ? " selected" : ""}`;
    card.dataset.id = place.id;

    const thumbHtml = place.image
      ? `<img class="place-thumb" src="${escapeHtml(place.image)}" alt="" loading="lazy" />`
      : `<div class="place-thumb" aria-hidden="true">🏛️</div>`;

    card.innerHTML = `
      ${thumbHtml}
      <div class="place-info">
        <div class="place-top">
          <h3 class="place-name">${escapeHtml(place.name)}</h3>
          <span class="place-dist">${formatDistance(place.distanceKm)}</span>
        </div>
        <div class="place-type">${escapeHtml(place.type)}</div>
        <p class="place-snippet">${escapeHtml(place.desc || "Tippen für Beschreibung & Google-Maps-Route")}</p>
      </div>
    `;

    card.addEventListener("click", () => {
      map.panTo([place.lat, place.lng], { animate: true });
      openDetail(place);
    });

    fragment.appendChild(card);
  }

  els.resultsList.innerHTML = "";
  els.resultsList.appendChild(fragment);
}

async function openDetail(place) {
  state.selectedId = place.id;
  renderMarkers();

  // Highlight selected card in list
  els.resultsList.querySelectorAll(".place-card").forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === place.id);
  });

  els.detailTitle.textContent = place.name;
  els.detailType.textContent = place.type;
  els.detailDistance.textContent = `${formatDistance(place.distanceKm)} · ${estimateDriveTime(place.distanceKm)}`;
  els.detailDesc.textContent = place.desc ? `${place.desc} (Lade Details…)` : "Lade Beschreibung…";

  if (place.image) {
    els.detailImage.src = place.image;
    els.detailImage.alt = place.name;
    els.detailImageWrap.classList.remove("hidden");
  } else {
    els.detailImageWrap.classList.add("hidden");
  }

  // Direct Google Maps navigation & place view links (100% free!)
  els.btnRoute.href = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  els.btnGmapsView.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.lat},${place.lng}`)}`;
  els.btnWiki.classList.add("hidden");

  els.detailBackdrop.classList.remove("hidden");
  els.detailSheet.classList.remove("hidden");

  // Load richer German Wikipedia summary asynchronously
  const summary = await fetchWikipediaSummary(place);
  if (state.selectedId !== place.id) return;

  els.detailDesc.textContent = summary.extract;
  if (summary.thumbnail) {
    els.detailImage.src = summary.thumbnail;
    els.detailImage.alt = place.name;
    els.detailImageWrap.classList.remove("hidden");
  }
  if (summary.wikiUrl) {
    els.btnWiki.href = summary.wikiUrl;
    els.btnWiki.textContent = summary.lang === "de" ? "Wikipedia (DE)" : "Wikipedia (EN)";
    els.btnWiki.classList.remove("hidden");
  }
}

function closeDetail() {
  state.selectedId = null;
  els.detailBackdrop.classList.add("hidden");
  els.detailSheet.classList.add("hidden");
  renderMarkers();
  els.resultsList.querySelectorAll(".place-card.selected").forEach((el) => el.classList.remove("selected"));
}

async function searchAt(lat, lng, label = "Gewählter Punkt") {
  if (state.activeAbort) {
    state.activeAbort.abort();
  }
  state.activeAbort = new AbortController();

  state.center = { lat, lng, label };
  state.selectedId = null;
  closeDetail();

  els.mapHint.classList.add("compact");
  els.mapHint.querySelector("span").textContent = `Standort: ${label} · Tippe auf die Karte zum Wechseln`;

  updateOriginOnMap(lat, lng, state.radiusKm);
  setLoading(true, `Suche Ruinen im Umkreis von ${state.radiusKm} km…`);

  try {
    const places = await fetchAncientSites(lat, lng, state.radiusKm, state.activeAbort.signal);
    state.places = places;
    applyFilterAndSort();

    if (window.innerWidth <= 820 && places.length > 0) {
      els.panel.classList.add("expanded");
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    console.error(err);
    showToast("Abfrage fehlgeschlagen – bitte kurz warten und erneut tippen.");
  } finally {
    setLoading(false);
  }
}

async function geocodeAndSearch(query) {
  const trimmed = query.trim();
  if (!trimmed) return;

  setLoading(true, `Suche Ort „${trimmed}“…`);
  try {
    const url = `${NOMINATIM_ENDPOINT}?format=json&limit=1&accept-language=de&q=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url);
    const results = await res.json();
    if (!results.length) {
      setLoading(false);
      showToast(`Ort „${trimmed}“ wurde nicht gefunden.`);
      return;
    }
    const first = results[0];
    const shortName = (first.display_name || trimmed).split(",")[0];
    await searchAt(parseFloat(first.lat), parseFloat(first.lon), shortName);
  } catch (err) {
    console.error(err);
    setLoading(false);
    showToast("Ortssuche momentan nicht erreichbar.");
  }
}

function locateUser() {
  if (!navigator.geolocation) {
    showToast("Dein Browser unterstützt keine Standortermittlung.");
    return;
  }

  setLoading(true, "Ermittle deinen Standort…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      searchAt(pos.coords.latitude, pos.coords.longitude, "Mein Standort");
    },
    (err) => {
      setLoading(false);
      if (err.code === err.PERMISSION_DENIED) {
        showToast("Standortzugriff abgelehnt. Tippe einfach direkt auf die Karte!");
      } else {
        showToast("Standort konnte nicht ermittelt werden. Tippe auf die Karte oder suche eine Stadt.");
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Event Listeners
map.on("click", (e) => {
  const { lat, lng } = e.latlng;
  searchAt(lat, lng, `${lat.toFixed(3)}, ${lng.toFixed(3)}`);
});

els.gpsBtn.addEventListener("click", locateUser);

els.searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  geocodeAndSearch(els.searchInput.value);
});

els.radiusBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const r = parseInt(btn.dataset.radius, 10);
    if (r === state.radiusKm) return;
    state.radiusKm = r;
    els.radiusBtns.forEach((b) => b.classList.toggle("active", b === btn));
    if (state.center) {
      searchAt(state.center.lat, state.center.lng, state.center.label);
    }
  });
});

els.layerBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.layer;
    if (key === state.currentLayerKey || !tileLayers[key]) return;
    map.removeLayer(tileLayers[state.currentLayerKey]);
    tileLayers[key].addTo(map);
    state.currentLayerKey = key;
    els.layerBtns.forEach((b) => b.classList.toggle("active", b === btn));
  });
});

els.quickCities.forEach((chip) => {
  chip.addEventListener("click", () => {
    searchAt(parseFloat(chip.dataset.lat), parseFloat(chip.dataset.lng), chip.dataset.name);
  });
});

els.filterSelect.addEventListener("change", () => {
  state.filterMode = els.filterSelect.value;
  applyFilterAndSort();
});

els.sortSelect.addEventListener("change", () => {
  state.sortMode = els.sortSelect.value;
  applyFilterAndSort();
});

els.panelHandle.addEventListener("click", () => {
  els.panel.classList.toggle("expanded");
});

els.detailClose.addEventListener("click", closeDetail);
els.detailBackdrop.addEventListener("click", closeDetail);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetail();
});
