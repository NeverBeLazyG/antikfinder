const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const GMAPS_KEY_STORAGE = "antikfinder_gmaps_api_key";

const DEFAULT_VIEW = { lat: 36.8969, lng: 30.7133, zoom: 9 };

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
  currentLayerKey: "osm",
  mapProvider: "leaflet", // "leaflet" | "google"
  mapEngine: null,
  gmapsLoadedKey: null,
  gmapsAuthError: ""
};

// DOM elements
const els = {
  mapContainer: document.getElementById("map"),
  gpsBtn: document.getElementById("gps-btn"),
  settingsBtn: document.getElementById("settings-btn"),
  gmapsDot: document.getElementById("gmaps-dot"),
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
  btnWiki: document.getElementById("btn-wiki"),
  settingsBackdrop: document.getElementById("settings-backdrop"),
  settingsModal: document.getElementById("settings-modal"),
  settingsClose: document.getElementById("settings-close"),
  settingsForm: document.getElementById("settings-form"),
  settingsError: document.getElementById("settings-error"),
  mapProviderBadge: document.getElementById("map-provider-badge"),
  gmapsKeyInput: document.getElementById("gmaps-key-input"),
  toggleKeyVisibility: document.getElementById("toggle-key-visibility"),
  removeKeyBtn: document.getElementById("remove-key-btn")
};

// Safe localStorage helpers (API key stays strictly local on this device)
function getStoredApiKey() {
  try {
    return (localStorage.getItem(GMAPS_KEY_STORAGE) || "").trim();
  } catch {
    return "";
  }
}

function setStoredApiKey(key) {
  try {
    if (key) {
      localStorage.setItem(GMAPS_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(GMAPS_KEY_STORAGE);
    }
  } catch {
    showToast("Hinweis: Browser erlaubt kein lokales Speichern (z. B. privater Modus).");
  }
}

// Toast & loading helpers
let toastTimer = null;
function showToast(msg, duration = 4200) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), duration);
}

function setLoading(isLoading, text = "Suche antike Ruinen…") {
  els.loadingText.textContent = text;
  els.loadingPill.classList.toggle("hidden", !isLoading);
}

// SVG icons for Google Maps markers (no Map ID needed, crisp on all displays)
function createRuinSvgDataUrl(color, size) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="15.5" fill="${color}" stroke="#ffffff" stroke-width="2.8"/>
      <path d="M10 14.5h16L18 9.5l-8 5zm1.5 1.5h13v1.6h-13V16zm1.4 2.5h2v5.8h-2v-5.8zm4.1 0h2v5.8h-2v-5.8zm4.1 0h2v5.8h-2v-5.8zM10.5 25.2h15V27h-15v-1.8z" fill="#ffffff"/>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createOriginSvgDataUrl() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="#2563eb" fill-opacity="0.22"/>
      <circle cx="16" cy="16" r="7.5" fill="#2563eb" stroke="#ffffff" stroke-width="3"/>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// Map Engine 1: Leaflet (OpenStreetMap / Esri Satellite / OpenTopoMap)
// ---------------------------------------------------------------------------
function createLeafletEngine(containerEl, initialView, initialLayerKey, onMapClick) {
  containerEl.innerHTML = "";

  const map = L.map(containerEl, {
    zoomControl: false
  }).setView([initialView.lat, initialView.lng], initialView.zoom);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  const tileLayers = {
    osm: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }),
    satellite: L.layerGroup([
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles &copy; Esri — Maxar, Earthstar Geographics",
        maxZoom: 18
      }),
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 18,
        opacity: 0.9
      })
    ]),
    topo: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://www.openstreetmap.org/copyright">OSM</a>)',
      maxZoom: 17
    })
  };

  let activeLayerKey = tileLayers[initialLayerKey] ? initialLayerKey : "osm";
  tileLayers[activeLayerKey].addTo(map);

  const markerLayer = L.layerGroup().addTo(map);
  let originMarker = null;
  let radiusCircle = null;

  map.on("click", (e) => {
    onMapClick(e.latlng.lat, e.latlng.lng);
  });

  return {
    provider: "leaflet",

    setLayer(key) {
      if (!tileLayers[key] || key === activeLayerKey) return;
      map.removeLayer(tileLayers[activeLayerKey]);
      tileLayers[key].addTo(map);
      activeLayerKey = key;
    },

    updateOrigin(lat, lng, radiusKm, shouldFit = true) {
      if (originMarker) map.removeLayer(originMarker);
      if (radiusCircle) map.removeLayer(radiusCircle);

      const originIcon = L.divIcon({
        className: "",
        html: '<div class="origin-marker"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });

      originMarker = L.marker([lat, lng], { icon: originIcon, interactive: false }).addTo(map);
      radiusCircle = L.circle([lat, lng], {
        radius: radiusKm * 1000,
        color: "#b45309",
        weight: 1.5,
        dashArray: "6 6",
        fillColor: "#f59e0b",
        fillOpacity: 0.06,
        interactive: false
      }).addTo(map);

      if (shouldFit) {
        map.fitBounds(radiusCircle.getBounds(), { padding: [24, 24], maxZoom: 13 });
      }
    },

    renderMarkers(places, selectedId, onSelect) {
      markerLayer.clearLayers();
      const reversed = [...places].reverse();

      for (const place of reversed) {
        const isTop = place.sitelinks >= 10 || Boolean(place.deArticle && place.image);
        const isSelected = place.id === selectedId;
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
          onSelect(place);
        });

        marker.addTo(markerLayer);
      }
    },

    panTo(lat, lng) {
      map.panTo([lat, lng], { animate: true });
    },

    getView() {
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
    },

    destroy() {
      map.remove();
      containerEl.innerHTML = "";
    }
  };
}

// ---------------------------------------------------------------------------
// Map Engine 2: Google Maps JavaScript API (loaded only with local API key)
// ---------------------------------------------------------------------------
function toGoogleMapTypeId(layerKey) {
  if (layerKey === "satellite") return google.maps.MapTypeId.HYBRID;
  if (layerKey === "topo") return google.maps.MapTypeId.TERRAIN;
  return google.maps.MapTypeId.ROADMAP;
}

function createGoogleMapEngine(containerEl, initialView, initialLayerKey, onMapClick) {
  containerEl.innerHTML = "";

  const gmap = new google.maps.Map(containerEl, {
    center: { lat: initialView.lat, lng: initialView.lng },
    zoom: initialView.zoom,
    mapTypeId: toGoogleMapTypeId(initialLayerKey),
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: true,
    zoomControl: true,
    zoomControlOptions: {
      position: google.maps.ControlPosition.RIGHT_BOTTOM
    },
    clickableIcons: false
  });

  const markers = [];
  let originMarker = null;
  let radiusCircle = null;

  const clickListener = gmap.addListener("click", (e) => {
    if (e.latLng) {
      onMapClick(e.latLng.lat(), e.latLng.lng());
    }
  });

  const iconTopUrl = createRuinSvgDataUrl("#b45309", 36);
  const iconNormalUrl = createRuinSvgDataUrl("#57534e", 28);
  const iconSelectedUrl = createRuinSvgDataUrl("#dc2626", 42);
  const iconOriginUrl = createOriginSvgDataUrl();

  function clearMarkers() {
    for (const m of markers) {
      m.setMap(null);
    }
    markers.length = 0;
  }

  return {
    provider: "google",

    setLayer(key) {
      gmap.setMapTypeId(toGoogleMapTypeId(key));
    },

    updateOrigin(lat, lng, radiusKm, shouldFit = true) {
      if (originMarker) originMarker.setMap(null);
      if (radiusCircle) radiusCircle.setMap(null);

      originMarker = new google.maps.Marker({
        position: { lat, lng },
        map: gmap,
        clickable: false,
        zIndex: 500,
        icon: {
          url: iconOriginUrl,
          scaledSize: new google.maps.Size(32, 32),
          anchor: new google.maps.Point(16, 16)
        }
      });

      radiusCircle = new google.maps.Circle({
        map: gmap,
        center: { lat, lng },
        radius: radiusKm * 1000,
        strokeColor: "#b45309",
        strokeOpacity: 0.85,
        strokeWeight: 1.8,
        fillColor: "#f59e0b",
        fillOpacity: 0.08,
        clickable: false
      });

      if (shouldFit) {
        const bounds = radiusCircle.getBounds();
        if (bounds) {
          gmap.fitBounds(bounds, 24);
          google.maps.event.addListenerOnce(gmap, "idle", () => {
            if (gmap.getZoom() > 13) {
              gmap.setZoom(13);
            }
          });
        }
      }
    },

    renderMarkers(places, selectedId, onSelect) {
      clearMarkers();
      const reversed = [...places].reverse();

      for (const place of reversed) {
        const isTop = place.sitelinks >= 10 || Boolean(place.deArticle && place.image);
        const isSelected = place.id === selectedId;
        const size = isSelected ? 40 : isTop ? 34 : 26;
        const url = isSelected ? iconSelectedUrl : isTop ? iconTopUrl : iconNormalUrl;

        const marker = new google.maps.Marker({
          position: { lat: place.lat, lng: place.lng },
          map: gmap,
          title: `${place.name} (${formatDistance(place.distanceKm)})`,
          zIndex: isSelected ? 1000 : isTop ? 300 : 100,
          icon: {
            url,
            scaledSize: new google.maps.Size(size, size),
            anchor: new google.maps.Point(size / 2, size / 2)
          }
        });

        marker.addListener("click", () => {
          onSelect(place);
        });

        markers.push(marker);
      }
    },

    panTo(lat, lng) {
      gmap.panTo({ lat, lng });
    },

    getView() {
      const c = gmap.getCenter();
      return {
        lat: c ? c.lat() : DEFAULT_VIEW.lat,
        lng: c ? c.lng() : DEFAULT_VIEW.lng,
        zoom: gmap.getZoom() || DEFAULT_VIEW.zoom
      };
    },

    destroy() {
      clearMarkers();
      if (originMarker) originMarker.setMap(null);
      if (radiusCircle) radiusCircle.setMap(null);
      google.maps.event.removeListener(clickListener);
      containerEl.innerHTML = "";
    }
  };
}

// Dynamic Google Maps loader (only triggered if the user has saved a local API key)
let gmapsLoadPromise = null;

function loadGoogleMapsScript(apiKey) {
  if (window.google?.maps?.Map && state.gmapsLoadedKey === apiKey) {
    return Promise.resolve();
  }
  if (gmapsLoadPromise && state.gmapsLoadedKey === apiKey) {
    return gmapsLoadPromise;
  }

  state.gmapsLoadedKey = apiKey;

  gmapsLoadPromise = new Promise((resolve, reject) => {
    const callbackName = "__antikfinderGmapsInit";
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Zeitüberschreitung beim Laden von Google Maps."));
    }, 12000);

    function cleanup() {
      clearTimeout(timeoutId);
      delete window[callbackName];
    }

    window[callbackName] = () => {
      cleanup();
      resolve();
    };

    const script = document.createElement("script");
    script.id = "gmaps-sdk-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=de&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      cleanup();
      script.remove();
      state.gmapsLoadedKey = null;
      gmapsLoadPromise = null;
      reject(new Error("Google Maps Skript konnte nicht geladen werden."));
    };
    document.head.appendChild(script);
  });

  return gmapsLoadPromise;
}

// Handle Google Maps authentication failures (invalid key, blocked referrer, missing billing)
window.gm_authFailure = () => {
  state.gmapsAuthError =
    "Google Maps hat den API-Key abgelehnt (ungültiger Key, Domain/Referrer nicht freigegeben oder Abrechnung nicht aktiv). OpenStreetMap wird als Fallback genutzt.";
  showToast("Google Maps API-Key abgelehnt – wechsle auf OpenStreetMap.", 6000);
  if (state.mapProvider === "google") {
    initMapEngine("leaflet");
  }
  updateProviderUI();
};

function updateProviderUI() {
  const isGoogle = state.mapProvider === "google";
  const hasStoredKey = Boolean(getStoredApiKey());

  els.gmapsDot.classList.toggle("hidden", !isGoogle);
  els.settingsBtn.title = isGoogle
    ? "Google Maps aktiv (lokaler API-Key) – Einstellungen öffnen"
    : "Karten-Einstellungen & Google Maps API-Key";

  els.mapProviderBadge.textContent = isGoogle ? "Google Maps aktiv" : "OpenStreetMap (kostenlos)";
  els.mapProviderBadge.classList.toggle("badge-gmaps", isGoogle);
  els.removeKeyBtn.classList.toggle("hidden", !hasStoredKey);

  if (state.gmapsAuthError) {
    els.settingsError.textContent = state.gmapsAuthError;
    els.settingsError.classList.remove("hidden");
  } else {
    els.settingsError.classList.add("hidden");
  }
}

function handleMapClick(lat, lng) {
  searchAt(lat, lng, `${lat.toFixed(3)}, ${lng.toFixed(3)}`);
}

function initMapEngine(provider) {
  const previousView = state.mapEngine ? state.mapEngine.getView() : DEFAULT_VIEW;
  if (state.mapEngine) {
    state.mapEngine.destroy();
    state.mapEngine = null;
  }

  if (provider === "google" && window.google?.maps?.Map) {
    state.mapEngine = createGoogleMapEngine(
      els.mapContainer,
      previousView,
      state.currentLayerKey,
      handleMapClick
    );
    state.mapProvider = "google";
  } else {
    state.mapEngine = createLeafletEngine(
      els.mapContainer,
      previousView,
      state.currentLayerKey,
      handleMapClick
    );
    state.mapProvider = "leaflet";
  }

  // Restore origin circle & markers when switching providers
  if (state.center) {
    state.mapEngine.updateOrigin(state.center.lat, state.center.lng, state.radiusKm, false);
  }
  if (state.filtered.length > 0) {
    renderMarkers();
  }

  updateProviderUI();
}

async function activateGoogleMaps(apiKey, silent = false) {
  state.gmapsAuthError = "";
  if (!silent) {
    setLoading(true, "Lade Google Maps…");
  }

  try {
    await loadGoogleMapsScript(apiKey);
    initMapEngine("google");
    if (!silent) {
      showToast("Google Maps aktiviert (API-Key nur lokal gespeichert).", 3500);
    }
    return true;
  } catch (err) {
    console.error(err);
    state.gmapsAuthError =
      "Google Maps konnte nicht geladen werden. Prüfe deinen API-Key und deine Internetverbindung.";
    initMapEngine("leaflet");
    if (!silent) {
      showToast("Google Maps konnte nicht geladen werden – nutze OpenStreetMap.");
    }
    return false;
  } finally {
    if (!silent) {
      setLoading(false);
    }
  }
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
  if (!state.mapEngine) return;
  state.mapEngine.renderMarkers(state.filtered, state.selectedId, openDetail);
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
      if (state.mapEngine) {
        state.mapEngine.panTo(place.lat, place.lng);
      }
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

function openSettingsModal() {
  els.gmapsKeyInput.value = getStoredApiKey();
  els.gmapsKeyInput.type = "password";
  updateProviderUI();
  els.settingsBackdrop.classList.remove("hidden");
  els.settingsModal.classList.remove("hidden");
  els.gmapsKeyInput.focus();
}

function closeSettingsModal() {
  els.settingsBackdrop.classList.add("hidden");
  els.settingsModal.classList.add("hidden");
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

  if (state.mapEngine) {
    state.mapEngine.updateOrigin(lat, lng, state.radiusKm, true);
  }
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

function geocodeWithGoogle(query) {
  return new Promise((resolve) => {
    if (state.mapProvider !== "google" || !window.google?.maps?.Geocoder) {
      resolve(null);
      return;
    }
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: query }, (results, status) => {
      if (status === "OK" && results && results.length > 0) {
        const first = results[0];
        const loc = first.geometry.location;
        const shortName =
          first.address_components?.[0]?.long_name ||
          (first.formatted_address || query).split(",")[0];
        resolve({ lat: loc.lat(), lng: loc.lng(), label: shortName });
      } else {
        resolve(null);
      }
    });
  });
}

async function geocodeAndSearch(query) {
  const trimmed = query.trim();
  if (!trimmed) return;

  setLoading(true, `Suche Ort „${trimmed}“…`);
  try {
    // Prefer Google Geocoder when Google Maps is active, fall back gracefully to Nominatim
    const googleHit = await geocodeWithGoogle(trimmed);
    if (googleHit) {
      await searchAt(googleHit.lat, googleHit.lng, googleHit.label);
      return;
    }

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
els.gpsBtn.addEventListener("click", locateUser);
els.settingsBtn.addEventListener("click", openSettingsModal);
els.settingsClose.addEventListener("click", closeSettingsModal);
els.settingsBackdrop.addEventListener("click", closeSettingsModal);

els.toggleKeyVisibility.addEventListener("click", () => {
  const isPassword = els.gmapsKeyInput.type === "password";
  els.gmapsKeyInput.type = isPassword ? "text" : "password";
});

els.settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = els.gmapsKeyInput.value.trim();
  if (!key) {
    state.gmapsAuthError = "Bitte gib einen gültigen Google Maps API-Key ein.";
    updateProviderUI();
    return;
  }

  const prevLoadedKey = state.gmapsLoadedKey;
  setStoredApiKey(key);
  state.gmapsAuthError = "";

  // Google Maps JS API cannot be loaded twice with a different key in the same page session
  if (prevLoadedKey && prevLoadedKey !== key) {
    window.location.reload();
    return;
  }

  closeSettingsModal();
  await activateGoogleMaps(key, false);
});

els.removeKeyBtn.addEventListener("click", () => {
  setStoredApiKey("");
  state.gmapsAuthError = "";
  initMapEngine("leaflet");
  closeSettingsModal();
  showToast("API-Key entfernt – OpenStreetMap ist wieder aktiv.", 3500);
});

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
    if (key === state.currentLayerKey) return;
    state.currentLayerKey = key;
    if (state.mapEngine) {
      state.mapEngine.setLayer(key);
    }
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
  if (e.key === "Escape") {
    closeDetail();
    closeSettingsModal();
  }
});

// Bootstrap: use Google Maps if a local API key is stored, otherwise free Leaflet/OSM
async function bootstrap() {
  const savedKey = getStoredApiKey();
  if (savedKey) {
    await activateGoogleMaps(savedKey, true);
  } else {
    initMapEngine("leaflet");
  }
}

bootstrap();
