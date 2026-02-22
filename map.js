// map.js — Map UX v1.1 (desktop)
// Improvements:
// 1) Compact toolbar
// 2) Clear is a chip near filters
// 3) Add panel moved right
// 4) Hover animation for markers
// 5) Selected panel (no need for popup)

let MAP;
let ADD_MODE = false;
let LAST_CLICK = null;
let LAYER_GROUP;
let PREVIEW_MARKER = null;

const DEFAULT_ICON_URL = "https://danielramirezopisso.github.io/thebestagain/icons/default.svg";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/reverse";

// focus from Home
const FOCUS_ID = new URLSearchParams(window.location.search).get("focus");
let DID_FOCUS = false;
let LEAFLET_MARKERS_BY_ID = {}; // marker_id -> Leaflet marker instance
let MARKER_DATA_BY_ID = {};     // marker_id -> marker row

let CATEGORIES = [];
let CAT_ICON = {}; // id -> icon_url
let CAT_NAME = {}; // id -> name

// Filters
let FILTER_CATEGORY = "";
let FILTER_RATING_BUCKET = "";

// Selection
let SELECTED_ID = null;

function qs(id){ return document.getElementById(id); }

function setMapStatus(msg) { qs("mapStatus").textContent = msg || ""; }
function setSaveStatus(msg) { const el = qs("saveStatus"); if (el) el.textContent = msg || ""; }

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeIconUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  try { return new URL(s, window.location.href).toString(); } catch { return ""; }
}

function getIconUrlForCategory(category_id) {
  const raw = CAT_ICON[String(category_id)] || "";
  return normalizeIconUrl(raw) || DEFAULT_ICON_URL;
}

function colorClassForRating(avg, count) {
  const cnt = Number(count ?? 0);
  if (!cnt) return "rating-none";
  const x = Number(avg ?? 0);
  if (x >= 9) return "rating-9-10";
  if (x >= 7) return "rating-7-8";
  if (x >= 5) return "rating-5-6";
  if (x >= 3) return "rating-3-4";
  return "rating-1-2";
}

function makeMarkerIcon(iconUrl, avg, count) {
  const cls = colorClassForRating(avg, count);
  const url = iconUrl || DEFAULT_ICON_URL;

  return L.divIcon({
    className: `tba-marker ${cls}`,
    html: `<div class="tba-marker-inner"><img src="${escapeHtml(url)}" alt="" /></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -34],
  });
}

function initRatingDropdown(selId, defaultValue) {
  const sel = qs(selId);
  sel.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    if (i === defaultValue) opt.selected = true;
    sel.appendChild(opt);
  }
}

function showClearIfNeeded() {
  const any = !!FILTER_CATEGORY || !!FILTER_RATING_BUCKET;
  qs("btnClearFilters").style.display = any ? "inline-flex" : "none";
}

function clearFilters() {
  FILTER_CATEGORY = "";
  FILTER_RATING_BUCKET = "";

  qs("catMore").value = "";
  renderCategoryQuickChips();
  setActiveRatingBtn("");

  showClearIfNeeded();
  reloadMarkers();
}

function onCategoryMoreChanged() {
  const v = qs("catMore").value;
  if (!v) return;
  FILTER_CATEGORY = v;
  renderCategoryQuickChips();
  showClearIfNeeded();
  reloadMarkers();
}

// Rating bucket buttons
function renderRatingButtons() {
  const host = qs("ratingSeg");
  host.innerHTML = "";

  const buttons = [
    { key:"", label:"Any", cls:"" },
    { key:"9-10", label:"9–10", cls:"rating-9-10" },
    { key:"7-8",  label:"7–8",  cls:"rating-7-8" },
    { key:"5-6",  label:"5–6",  cls:"rating-5-6" },
    { key:"3-4",  label:"3–4",  cls:"rating-3-4" },
    { key:"1-2",  label:"1–2",  cls:"rating-1-2" },
  ];

  buttons.forEach(b => {
    const btn = document.createElement("button");
    btn.className = `seg-btn ${b.cls}`.trim();
    btn.dataset.key = b.key;
    btn.textContent = b.label;
    btn.onclick = () => {
      FILTER_RATING_BUCKET = b.key;
      setActiveRatingBtn(b.key);
      showClearIfNeeded();
      reloadMarkers();
    };
    host.appendChild(btn);
  });

  setActiveRatingBtn("");
}

function setActiveRatingBtn(key) {
  [...document.querySelectorAll(".seg-btn")].forEach(el => {
    el.classList.toggle("active", el.dataset.key === key);
  });
}

function renderCategoryQuickChips() {
  const host = qs("catQuick");
  host.innerHTML = "";

  const top4 = CATEGORIES.slice(0, 4);

  top4.forEach(c => {
    const a = document.createElement("a");
    a.href = "#";
    a.className = "chip";
    a.onclick = (e) => {
      e.preventDefault();
      FILTER_CATEGORY = (FILTER_CATEGORY === String(c.id)) ? "" : String(c.id);
      qs("catMore").value = FILTER_CATEGORY ? FILTER_CATEGORY : "";
      renderCategoryQuickChips();
      showClearIfNeeded();
      reloadMarkers();
    };
    if (FILTER_CATEGORY === String(c.id)) a.classList.add("active");

    const icon = getIconUrlForCategory(c.id);
    a.innerHTML = `<img class="chip-ic" src="${escapeHtml(icon)}" alt=""/> <span>${escapeHtml(c.name)}</span>`;
    host.appendChild(a);
  });

  // All chip
  const all = document.createElement("a");
  all.href = "#";
  all.className = "chip chip-more";
  all.textContent = "All";
  all.onclick = (e) => {
    e.preventDefault();
    FILTER_CATEGORY = "";
    qs("catMore").value = "";
    renderCategoryQuickChips();
    showClearIfNeeded();
    reloadMarkers();
  };
  if (!FILTER_CATEGORY) all.classList.add("active");
  host.appendChild(all);
}

async function reverseGeocodeAddress(lat, lon) {
  const url = `${NOMINATIM_BASE}?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;
  const res = await fetch(url, { headers: { "Accept": "application/json", "Referer": window.location.origin } });
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  const json = await res.json();
  return json.display_name || "";
}

async function toggleAddMode() {
  const user = await maybeUser();
  if (!user) {
    alert("Please login to add places.");
    window.location.href = "login.html";
    return;
  }

  ADD_MODE = !ADD_MODE;
  qs("toggleAdd").textContent = ADD_MODE ? "ON" : "OFF";
  qs("addForm").style.display = ADD_MODE ? "block" : "none";
  setSaveStatus("");

  if (!ADD_MODE) {
    LAST_CLICK = null;
    if (PREVIEW_MARKER) {
      MAP.removeLayer(PREVIEW_MARKER);
      PREVIEW_MARKER = null;
    }
  }
}

function tryFocusMarker() {
  if (!FOCUS_ID || DID_FOCUS) return;
  const mk = LEAFLET_MARKERS_BY_ID[FOCUS_ID];
  if (!mk) return;

  DID_FOCUS = true;
  selectMarkerById(FOCUS_ID, true);
}

function applyRatingBucket(q) {
  if (!FILTER_RATING_BUCKET) return q;
  const [a, b] = FILTER_RATING_BUCKET.split("-").map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return q;
  return q.gte("rating_avg", a).lte("rating_avg", b);
}

function fmtOverall(avg, cnt) {
  const c = Number(cnt ?? 0);
  if (!c) return "—/10 (0 votes)";
  return `${Number(avg ?? 0).toFixed(2)}/10 (${c} vote${c === 1 ? "" : "s"})`;
}

/* -------------------------
   SELECTED PANEL
------------------------- */
function clearSelection() {
  SELECTED_ID = null;
  qs("selPanel").style.display = "none";
}

function selectMarkerById(id, fly = false) {
  const mk = LEAFLET_MARKERS_BY_ID[id];
  const m = MARKER_DATA_BY_ID[id];
  if (!mk || !m) return;

  SELECTED_ID = id;

  const avg = Number(m.rating_avg ?? 0);
  const cnt = Number(m.rating_count ?? 0);
  const cls = colorClassForRating(avg, cnt);

  // icon
  const iconUrl = getIconUrlForCategory(m.category_id);
  qs("selIcon").className = `mini-marker ${cls}`;
  qs("selIcon").innerHTML = `<img src="${escapeHtml(iconUrl)}" alt="" />`;

  // text
  qs("selTitle").textContent = m.title || "—";
  qs("selMeta").textContent = `Overall: ${fmtOverall(avg, cnt)}`;
  qs("selSub").textContent = CAT_NAME[String(m.category_id)] || "";

  // link
  qs("selOpen").href = `marker.html?id=${encodeURIComponent(m.id)}`;

  // show
  qs("selPanel").style.display = "block";

  if (fly) {
    MAP.flyTo(mk.getLatLng(), Math.max(MAP.getZoom(), 17), { duration: 0.8 });
  }
}

function attachMarkerHoverAndClick(mk, id) {
  mk.on("mouseover", () => {
    const el = mk.getElement();
    if (el) el.classList.add("tba-hover");
  });
  mk.on("mouseout", () => {
    const el = mk.getElement();
    if (el) el.classList.remove("tba-hover");
  });

  mk.on("click", () => {
    selectMarkerById(id, false);
  });
}

async function initMap() {
  // Hide add panel if logged out
  const user = await maybeUser();
  if (!user) qs("addPanel").style.display = "none";

  initRatingDropdown("m_rating", 7);
  renderRatingButtons();

  MAP = L.map("map").setView([41.3889, 2.1618], 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(MAP);

  LAYER_GROUP = L.layerGroup().addTo(MAP);

  setMapStatus("Loading categories…");

  const { data: catData, error: catErr } = await sb
    .from("categories")
    .select("id,name,icon_url,is_active,for_places")
    .eq("is_active", true)
    .eq("for_places", true)
    .order("id", { ascending: true });

  if (catErr) {
    setMapStatus("Error loading categories: " + catErr.message);
    return;
  }

  CATEGORIES = catData || [];
  CAT_ICON = {};
  CAT_NAME = {};
  CATEGORIES.forEach(c => {
    CAT_ICON[String(c.id)] = String(c.icon_url ?? "").trim();
    CAT_NAME[String(c.id)] = c.name;
  });

  // Add form categories
  qs("m_category").innerHTML = CATEGORIES.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");

  // More dropdown
  qs("catMore").innerHTML = `<option value="">More…</option>` + CATEGORIES.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");

  // top4 by usage
  const { data: placeCats, error: cntErr } = await sb
    .from("markers")
    .select("category_id")
    .eq("is_active", true)
    .eq("group_type", "place");

  if (!cntErr && placeCats) {
    const counts = {};
    placeCats.forEach(r => {
      const k = String(r.category_id ?? "");
      if (!k) return;
      counts[k] = (counts[k] || 0) + 1;
    });
    CATEGORIES.sort((a, b) => (counts[String(b.id)] || 0) - (counts[String(a.id)] || 0));
  }

  renderCategoryQuickChips();
  showClearIfNeeded();

  await reloadMarkers();

  // Add marker via click
  MAP.on("click", async (e) => {
    const user = await maybeUser();
    if (!user) return;
    if (!ADD_MODE) return;

    LAST_CLICK = { lat: e.latlng.lat, lon: e.latlng.lng };
    qs("m_lat").value = LAST_CLICK.lat.toFixed(6);
    qs("m_lon").value = LAST_CLICK.lon.toFixed(6);

    if (PREVIEW_MARKER) {
      PREVIEW_MARKER.setLatLng([LAST_CLICK.lat, LAST_CLICK.lon]);
    } else {
      PREVIEW_MARKER = L.marker([LAST_CLICK.lat, LAST_CLICK.lon], { opacity: 0.7 })
        .addTo(MAP)
        .bindPopup("New place location")
        .openPopup();
    }

    qs("m_address").value = "";
    setSaveStatus("Location selected ✅ Looking up address…");
    try {
      const addr = await reverseGeocodeAddress(LAST_CLICK.lat, LAST_CLICK.lon);
      qs("m_address").value = addr;
      setSaveStatus("Address filled ✅ Now click Save.");
    } catch {
      setSaveStatus("Address lookup failed (you can type it manually).");
    }
  });
}

async function reloadMarkers() {
  setMapStatus("Loading places…");

  let q = sb
    .from("markers")
    .select("id,title,rating_avg,rating_count,lat,lon,group_type,is_active,category_id")
    .eq("is_active", true)
    .eq("group_type", "place");

  if (FILTER_CATEGORY) q = q.eq("category_id", FILTER_CATEGORY);
  q = applyRatingBucket(q);

  const { data, error } = await q;

  if (error) {
    setMapStatus("Error: " + error.message);
    return;
  }

  const markers = (data || []).filter(m => m.lat !== null && m.lon !== null);

  LAYER_GROUP.clearLayers();
  LEAFLET_MARKERS_BY_ID = {};
  MARKER_DATA_BY_ID = {};

  markers.forEach(m => {
    const iconUrl = getIconUrlForCategory(m.category_id);
    const avg = Number(m.rating_avg ?? 0);
    const cnt = Number(m.rating_count ?? 0);
    const icon = makeMarkerIcon(iconUrl, avg, cnt);

    const mk = L.marker([m.lat, m.lon], { icon }).addTo(LAYER_GROUP);

    LEAFLET_MARKERS_BY_ID[m.id] = mk;
    MARKER_DATA_BY_ID[m.id] = m;

    attachMarkerHoverAndClick(mk, m.id);
  });

  setMapStatus(`Loaded ${markers.length} place(s).`);

  // focus support (select + fly)
  tryFocusMarker();
}

async function saveMapMarker() {
  const user = await maybeUser();
  if (!user) { alert("Please login to add places."); window.location.href="login.html"; return; }

  setSaveStatus("Saving…");

  const title = qs("m_title").value.trim();
  const category_id = qs("m_category").value;
  const rating_manual = Number(qs("m_rating").value);
  const address = (qs("m_address")?.value || "").trim();

  if (!ADD_MODE) { setSaveStatus("Turn Add ON first."); return; }
  if (!LAST_CLICK) { setSaveStatus("Click the map first to pick a location."); return; }
  if (!title) { setSaveStatus("Title required."); return; }

  const payload = {
    title,
    category_id,
    rating_manual,
    group_type: "place",
    is_active: true,
    lat: LAST_CLICK.lat,
    lon: LAST_CLICK.lon,
    address
  };

  const { data: markerRow, error: mErr } = await sb
    .from("markers")
    .insert([payload])
    .select("id")
    .single();

  if (mErr) {
    setSaveStatus("Error creating place: " + mErr.message);
    return;
  }

  const { error: vErr } = await sb
    .from("votes")
    .insert([{
      marker_id: markerRow.id,
      user_id: user.id,
      vote: rating_manual,
      is_active: true
    }]);

  if (vErr) {
    setSaveStatus("Place saved ✅ but vote failed: " + vErr.message);
    window.location.href = `marker.html?id=${encodeURIComponent(markerRow.id)}`;
    return;
  }

  window.location.href = `marker.html?id=${encodeURIComponent(markerRow.id)}`;
}
