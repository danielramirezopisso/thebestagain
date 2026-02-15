const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_PUBLIC_KEY";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function setMapStatus(msg) {
  document.getElementById("mapStatus").textContent = msg || "";
}

async function initMap() {
  // Madrid default view
  const map = L.map("map").setView([40.4168, -3.7038], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

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

  if (!markers.length) {
    setMapStatus("No place markers with lat/lon yet. Add some in Add/List.");
    return;
  }

  markers.forEach(m => {
    L.marker([m.lat, m.lon])
      .addTo(map)
      .bindPopup(`<b>${escapeHtml(m.title)}</b><br/>Rating: ${m.rating_manual}/10`);
  });

  setMapStatus(`Loaded ${markers.length} marker(s).`);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
