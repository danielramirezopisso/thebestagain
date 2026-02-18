// map.js — current version + robust icon resolution + login gating for add
// (uses sb + maybeUser from auth.js)

let MAP;
let ADD_MODE = false;
let CATEGORIES = [];
let LAST_CLICK = null;
let LAYER_GROUP;
let PREVIEW_MARKER = null;

let FILTER_CATEGORY = "";
let FILTER_MIN_RATING = "";

// Default icon (absolute URL)
const DEFAULT_ICON_URL = "https://danielramirezopisso.github.io/thebestagain/icons/default.svg";

// Nominatim reverse geocode
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/reverse";

// Build a lookup: category_id (string) -> icon_url (string)
let CAT_ICON = {};

function setMapStatus(msg) {
  document.getElementById("mapStatus").textContent = msg || "";
}
function setSaveStatus(msg) {
  document.getElementById("saveStatus").textContent = msg || "";
}
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function colorClassForRating(r) {
  const x = Number(r);
  if (x >= 9) return "rating-9-10";
  if (x >= 7) return "rating-7-8";
  if (x >= 5) return "rating-5-6";
  if (x >= 3) return "rating-3-4";
  return "rating-1-2";
}

// Convert icon_url from DB into a reliable absolute URL
function normalizeIconUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  // If already absolute http(s), keep it
  if (s.startsWith("http://") || s.startsWith("https://")) return s;

  // Otherwise, treat as a path relative to the site root
  // Examples:
  //  "icons/pizza.svg"  -> https://<host>/<repo>/icons/pizza.svg
  //  "/icons/pizza.svg" -> https://<host>/icons/pizza.svg  (usually NOT what you want on GitHub Pages)
  //
  // We will resolve relative to the current page URL so GitHub Pages repo paths work.
  try {
    return new URL(s, window.location.href).toString();
  } catch {
    return "";
  }
}

// Best-effort icon getter that works even if ids are numbers/strings
function getIconUrlForCategory(category_id) {
  const key = String(category_id ?? "").trim();
  const raw = CAT_ICON[key] || "";

  const normalized = normalizeIconUrl(raw);
  return normalized || DEFAULT_ICON_URL;
}

function makeMarkerIcon(iconUrl, rating) {
  const cls = colorClassForRating(rating);
  const url = iconUrl || DEFAULT_ICON_URL;

  return L.divIcon({
    className: `tba-marker ${cls}`,
    html: `<div class="tba-marker-inner"><img src="${escapeHtml(url)}" alt="" /></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],   // keep your centered anchor
    popupAnchor: [0, -34],
  });
}

async function toggleAddMode() {
  const user = await maybeUser();
  if (!user) {
    alert("Please login to add markers.");
    window.location.href = "login.html";
    return;
  }

  ADD_MODE = !ADD_MODE;
  document.getElementById("toggleAdd").textContent = ADD_MODE ? "ON" : "OFF";
  document.getElementById("addForm").style.display = ADD_MODE ? "block" : "none";
  setSaveStatus("");

  if (!ADD_MODE) {
    LAST_CLICK = null;
    if (PREVIEW_MARKER) {
      MAP.removeLayer(PREVIEW_MARKER);
      PREVIEW_MARKER = null;
    }
  }
}

function initRatingDropdown(selId, defaultValue) {
  const sel = document.getElementById(selId);
  sel.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    if (i === defaultValue) opt.selected = true;
    sel.appendChild(opt);
  }
}

function applyFilters() {
  FILTER_CATEGORY = document.getElementById("filter_category").value;
  FILTER_MIN_RATING = document.getElementById("filter_min_rating").value;
  reloadMarkers();
}

function clearFilters() {
  FILTER_CATEGORY = "";
  FILTER_MIN_RATING = "";
  document.getElementById("filter_category").value = "";
  document.getElementById("filter_min_rating").value = "";
  reloadMarkers();
}

// Reverse geocoding (address from lat/lon) using Nominatim
async function reverseGeocodeAddress(lat, lon) {
  const url = `${NOMINATIM_BASE}?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "Referer": window.location.origin
    }
  });

  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);

  const json = await res.json();
  return json.display_name || "";
}

async function initMap() {
  const user = await maybeUser();
  const panel = document.getElementById("addPanel");
  if (!user && panel) panel.style.display = "none";

  initRatingDropdown("m_rating", 7);

  const fr = document.getElementById("filter_min_rating");
  fr.innerHTML = `<option value="">All</option>`;
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    fr.appendChild(opt);
  }

  MAP = L.map("map").setView([41.3889, 2.1618], 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(MAP);

  LAYER_GROUP = L.layerGroup().addTo(MAP);

  // ---- Load categories (including icon_url) ----
  setMapStatus("Loading categories…");

  const { data: catData, error: catErr } = await sb
    .from("categories")
    .select("id,name,icon_url")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (catErr) {
    setMapStatus("Error loading categories: " + catErr.message);
    return;
  }

  CATEGORIES = catData || [];

  // Build icon lookup with normalized string keys
  CAT_ICON = {};
  CATEGORIES.forEach(c => {
    CAT_ICON[String(c.id).trim()] = String(c.icon_url ?? "").trim();
  });

  // Fill dropdowns
  document.getElementById("m_category").innerHTML = CATEGORIES
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");

  document.getElementById("filter_category").innerHTML =
    `<option value="">All</option>` +
    CATEGORIES.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");

  // ---- Load markers ----
  await reloadMarkers();

  // ---- Click handler for adding ----
  MAP.on("click", async (e) => {
    const user = await maybeUser();
    if (!user) return;
    if (!ADD_MODE) return;

    LAST_CLICK = { lat: e.latlng.lat, lon: e.latlng.lng };
    document.getElementById("m_lat").value = LAST_CLICK.lat.toFixed(6);
    document.getElementById("m_lon").value = LAST_CLICK.lon.toFixed(6);

    if (PREVIEW_MARKER) {
      PREVIEW_MARKER.setLatLng([LAST_CLICK.lat, LAST_CLICK.lon]);
    } else {
      PREVIEW_MARKER = L.marker([LAST_CLICK.lat, LAST_CLICK.lon], { opacity: 0.7 })
        .addTo(MAP)
        .bindPopup("New marker location")
        .openPopup();
    }

    // Auto-fill address (best effort)
    const addrInput = document.getElementById("m_address");
    if (addrInput) {
      addrInput.value = "";
      setSaveStatus("Location selected ✅ Looking up address…");

      try {
        const addr = await reverseGeocodeAddress(LAST_CLICK.lat, LAST_CLICK.lon);
        addrInput.value = addr;
        setSaveStatus("Location selected ✅ Address filled. Now click Save.");
      } catch {
        setSaveStatus("Location selected ✅ Address lookup failed (you can type it manually).");
      }
    } else {
      setSaveStatus("Location selected ✅ Now fill title/category/rating and click Save.");
    }
  });
}

async function reloadMarkers() {
  setMapStatus("Loading markers…");

  let q = sb
    .from("markers")
    .select("id,title,rating_manual,lat,lon,group_type,is_active,category_id")
    .eq("is_active", true)
    .eq("group_type", "place");

  if (FILTER_CATEGORY) q = q.eq("category_id", FILTER_CATEGORY);
  if (FILTER_MIN_RATING) q = q.gte("rating_manual", Number(FILTER_MIN_RATING));

  const { data, error } = await q;

  if (error) {
    setMapStatus("Error: " + error.message);
    return;
  }

  const markers = (data || []).filter((m) => m.lat !== null && m.lon !== null);

  LAYER_GROUP.clearLayers();

  // DEBUG ONCE: show a sample mapping in console
  if (markers.length) {
    const sample = markers[0];
    console.log("[ICON DEBUG] sample marker.category_id =", sample.category_id);
    console.log("[ICON DEBUG] CAT_ICON keys (first 10) =", Object.keys(CAT_ICON).slice(0, 10));
    console.log("[ICON DEBUG] raw icon_url =", CAT_ICON[String(sample.category_id).trim()]);
    console.log("[ICON DEBUG] normalized icon_url =", getIconUrlForCategory(sample.category_id));
  }

  markers.forEach((m) => {
    const iconUrl = getIconUrlForCategory(m.category_id);
    const icon = makeMarkerIcon(iconUrl, m.rating_manual);

    const link = `marker.html?id=${encodeURIComponent(m.id)}`;
    const popupHtml = `
      <b><a href="${link}">${escapeHtml(m.title)}</a></b><br/>
      Rating: ${m.rating_manual}/10
    `;

    L.marker([m.lat, m.lon], { icon })
      .addTo(LAYER_GROUP)
      .bindPopup(popupHtml);
  });

  setMapStatus(`Loaded ${markers.length} marker(s).`);
}

async function saveMapMarker() {
  const user = await maybeUser();
  if (!user) { alert("Please login to add markers."); window.location.href="login.html"; return; }

  setSaveStatus("Saving…");

  const title = document.getElementById("m_title").value.trim();
  const category_id = document.getElementById("m_category").value;
  const rating_manual = Number(document.getElementById("m_rating").value);
  const address = (document.getElementById("m_address")?.value || "").trim();

  if (!ADD_MODE) { setSaveStatus("Turn Add mode ON first."); return; }
  if (!LAST_CLICK) { setSaveStatus("Click the map to choose a location first."); return; }
  if (!title) { setSaveStatus("Title required."); return; }

  // 1) Create marker
  const payload = {
    title,
    category_id,
    rating_manual,          // keep for now (legacy display)
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
    setSaveStatus("Error creating marker: " + mErr.message);
    return;
  }

  // 2) Create YOUR vote for this marker
  const votePayload = {
    marker_id: markerRow.id,
    vote: rating_manual,
    is_active: true
  };

  const { error: vErr } = await sb
    .from("votes")
    .insert([votePayload]);

  if (vErr) {
    setSaveStatus("Marker saved, but vote failed: " + vErr.message);
    // still redirect so you can manually vote if needed
    window.location.href = `marker.html?id=${encodeURIComponent(markerRow.id)}`;
    return;
  }

  // 3) Redirect
  window.location.href = `marker.html?id=${encodeURIComponent(markerRow.id)}`;
}

