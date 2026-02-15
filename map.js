// map.js — Release 3 (add markers from map) + preview marker + Barcelona Eixample default
const SUPABASE_URL = "https://pwlskdjmgqxikbamfshj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OIK8RJ8IZgHY0MW6FKqD6Q_yOm4YcmA";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let MAP;
let ADD_MODE = false;
let CATEGORIES = [];
let LAST_CLICK = null; // {lat, lon}
let LAYER_GROUP;
let PREVIEW_MARKER = null;

function setMapStatus(msg) {
  document.getElementById("mapStatus").textContent = msg || "";
}
function setSaveStatus(msg) {
  document.getElementById("saveStatus").textContent = msg || "";
}
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toggleAddMode() {
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

function initRatingDropdown() {
  const sel = document.getElementById("m_rating");
  sel.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    if (i === 7) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function initMap() {
  initRatingDropdown();

  // Barcelona — Eixample
  MAP = L.map("map").setView([41.3889, 2.1618], 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(MAP);

  LAYER_GROUP = L.layerGroup().addTo(MAP);

  // Load categories for the add form
  setMapStatus("Loading categories…");
  const cats = await sb
    .from("categories")
    .select("id,name")
    .eq("is_active", true)
    .order("id");

  if (cats.error) {
    setMapStatus("Error loading categories: " + cats.error.message);
    return;
  }

  CATEGORIES = cats.data || [];
  document.getElementById("m_category").innerHTML = CATEGORIES
    .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");

  // Load markers
  await reloadMarkers();

  // Click handler for adding
  MAP.on("click", (e) => {
  if (!ADD_MODE) return;

  LAST_CLICK = { lat: e.latlng.lat, lon: e.latlng.lng };
  document.getElementById("m_lat").value = LAST_CLICK.lat.toFixed(6);
  document.getElementById("m_lon").value = LAST_CLICK.lon.toFixed(6);

  // Show/Move a preview marker so you see exactly where you clicked
  if (PREVIEW_MARKER) {
    PREVIEW_MARKER.setLatLng([LAST_CLICK.lat, LAST_CLICK.lon]);
  } else {
    PREVIEW_MARKER = L.marker([LAST_CLICK.lat, LAST_CLICK.lon], { opacity: 0.7 })
      .addTo(MAP)
      .bindPopup("New marker location")
      .openPopup();
  }

  setSaveStatus("Location selected ✅ Now fill title/category/rating and click Save.");
});
}

async function reloadMarkers() {
  setMapStatus("Loading markers…");

  const { data, error } = await sb
    .from("markers")
    .select("id,title,rating_manual,lat,lon,group_type,is_active")
    .eq("is_active", true)
    .eq("group_type", "place");

  if (error) {
    setMapStatus("Error: " + error.message);
    return;
  }

  const markers = (data || []).filter(m => m.lat !== null && m.lon !== null);

  LAYER_GROUP.clearLayers();

  markers.forEach(m => {
    L.marker([m.lat, m.lon])
      .addTo(LAYER_GROUP)
      .bindPopup(`<b>${escapeHtml(m.title)}</b><br/>Rating: ${m.rating_manual}/10`);
  });

  setMapStatus(`Loaded ${markers.length} marker(s).`);
}

async function saveMapMarker() {
  setSaveStatus("Saving…");

  const title = document.getElementById("m_title").value.trim();
  const category_id = document.getElementById("m_category").value;
  const rating_manual = Number(document.getElementById("m_rating").value);

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
    lon: LAST_CLICK.lon
  };

  const { error } = await sb.from("markers").insert([payload]);

  if (error) {
    setSaveStatus("Error: " + error.message);
    return;
  }

  // Clear input + preview marker after save
  document.getElementById("m_title").value = "";
  document.getElementById("m_lat").value = "";
  document.getElementById("m_lon").value = "";
  LAST_CLICK = null;

  if (PREVIEW_MARKER) {
    MAP.removeLayer(PREVIEW_MARKER);
    PREVIEW_MARKER = null;
  }

  setSaveStatus("Saved ✅");

  // Reload markers so it appears
  await reloadMarkers();
}



const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let MAP;
let ADD_MODE = false;
let CATEGORIES = [];
let LAST_CLICK = null; // {lat, lon}
let LAYER_GROUP;

function setMapStatus(msg) {
  document.getElementById("mapStatus").textContent = msg || "";
}
function setSaveStatus(msg) {
  document.getElementById("saveStatus").textContent = msg || "";
}
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toggleAddMode() {
  ADD_MODE = !ADD_MODE;
  document.getElementById("toggleAdd").textContent = ADD_MODE ? "ON" : "OFF";
  document.getElementById("addForm").style.display = ADD_MODE ? "block" : "none";
  setSaveStatus("");
  if (!ADD_MODE) LAST_CLICK = null;
}

function initRatingDropdown() {
  const sel = document.getElementById("m_rating");
  sel.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    if (i === 7) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function initMap() {
  initRatingDropdown();

  MAP = L.map("map").setView([41.3889, 2.1618], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(MAP);

  LAYER_GROUP = L.layerGroup().addTo(MAP);

  // Load categories for the add form
  setMapStatus("Loading categories…");
  const cats = await sb.from("categories").select("id,name").eq("is_active", true).order("id");
  if (cats.error) {
    setMapStatus("Error loading categories: " + cats.error.message);
    return;
  }
  CATEGORIES = cats.data || [];
  document.getElementById("m_category").innerHTML = CATEGORIES
    .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");

  // Load markers
  await reloadMarkers();

  // Click handler for adding
  MAP.on("click", (e) => {
    if (!ADD_MODE) return;

    LAST_CLICK = { lat: e.latlng.lat, lon: e.latlng.lng };
    document.getElementById("m_lat").value = LAST_CLICK.lat.toFixed(6);
    document.getElementById("m_lon").value = LAST_CLICK.lon.toFixed(6);

    setSaveStatus("Location selected ✅ Now fill title/category/rating and click Save.");
  });
}

async function reloadMarkers() {
  setMapStatus("Loading markers…");

  const { data, error } = await sb
    .from("markers")
    .select("id,title,rating_manual,lat,lon,group_type,is_active")
    .eq("is_active", true)
    .eq("group_type", "place");

  if (error) {
    setMapStatus("Error: " + error.message);
    return;
  }

  const markers = (data || []).filter(m => m.lat !== null && m.lon !== null);

  LAYER_GROUP.clearLayers();

  markers.forEach(m => {
    L.marker([m.lat, m.lon])
      .addTo(LAYER_GROUP)
      .bindPopup(`<b>${escapeHtml(m.title)}</b><br/>Rating: ${m.rating_manual}/10`);
  });

  setMapStatus(`Loaded ${markers.length} marker(s).`);
}

async function saveMapMarker() {
  setSaveStatus("Saving…");

  const title = document.getElementById("m_title").value.trim();
  const category_id = document.getElementById("m_category").value;
  const rating_manual = Number(document.getElementById("m_rating").value);

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
    lon: LAST_CLICK.lon
  };

  const { data, error } = await sb.from("markers").insert([payload]).select("id").single();

  if (error) {
    setSaveStatus("Error: " + error.message);
    return;
  }

  // Clear fields but keep add mode on
  document.getElementById("m_title").value = "";
  setSaveStatus("Saved ✅");

  // Reload markers so it appears
  await reloadMarkers();

  // Optional: turn off add mode automatically
  // toggleAddMode();
}
