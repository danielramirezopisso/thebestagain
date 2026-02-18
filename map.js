// map.js — Release 6.1: auto-fill address from map click (reverse geocode)
// plus Release 5: marker links + redirect after create
// plus Release 4B: icon_url + rating colors
// plus Release 4A: filters
// plus Release 3: add from map

// const SUPABASE_URL = "https://pwlskdjmgqxikbamfshj.supabase.co";
// const SUPABASE_ANON_KEY = "sb_publishable_OIK8RJ8IZgHY0MW6FKqD6Q_yOm4YcmA";
// const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let MAP;
let ADD_MODE = false;
let CATEGORIES = [];
let LAST_CLICK = null;
let LAYER_GROUP;
let PREVIEW_MARKER = null;

let FILTER_CATEGORY = "";
let FILTER_MIN_RATING = "";

// If you created icons/default.svg, keep this.
const DEFAULT_ICON_URL = "https://danielramirezopisso.github.io/thebestagain/icons/default.svg";

// IMPORTANT: identify your app to Nominatim politely (recommended)
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/reverse";

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

function makeMarkerIcon(iconUrl, rating) {
  const cls = colorClassForRating(rating);
  const url = iconUrl || DEFAULT_ICON_URL;

  return L.divIcon({
    className: `tba-marker ${cls}`,
    html: `<div class="tba-marker-inner"><img src="${escapeHtml(url)}" alt="" /></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
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
  // Nominatim requires you don’t spam; we call only on click, once.
  const url = `${NOMINATIM_BASE}?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;

  const res = await fetch(url, {
    headers: {
      // Some browsers ignore this, but it’s good practice:
      "Accept": "application/json",
      // Optional: Identify app. (User-Agent header is blocked in browsers)
      "Referer": window.location.origin
    }
  });

  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);

  const json = await res.json();
  // Best human-readable field:
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
  const CAT_ICON = {};
  CATEGORIES.forEach(c => { CAT_ICON[c.id] = c.icon_url || ""; });
  window.CAT_ICON = CAT_ICON;

  document.getElementById("m_category").innerHTML = CATEGORIES
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");

  document.getElementById("filter_category").innerHTML =
    `<option value="">All</option>` +
    CATEGORIES.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");

  await reloadMarkers();

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
      } catch (err) {
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

  markers.forEach((m) => {
    const iconUrl = (window.CAT_ICON?.[m.category_id] || "") || DEFAULT_ICON_URL;
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

  const { data, error } = await sb
    .from("markers")
    .insert([payload])
    .select("id")
    .single();

  if (error) {
    setSaveStatus("Error: " + error.message);
    return;
  }

  // Redirect to marker page
  window.location.href = `marker.html?id=${encodeURIComponent(data.id)}`;
}
