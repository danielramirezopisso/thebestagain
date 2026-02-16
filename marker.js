// marker.js — Release 5: dedicated marker detail page

const SUPABASE_URL = "https://XXX.supabase.co";
const SUPABASE_ANON_KEY = "XXX";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(iso) {
  if (!iso) return "";
  return iso.replace("T", " ").slice(0, 19);
}

async function initMarkerPage() {
  const id = qs("id");

  if (!id) {
    document.getElementById("markerTitle").textContent = "Missing marker id";
    document.getElementById("markerDetails").innerHTML =
      `<p>Open this page like: <code>marker.html?id=YOUR_MARKER_ID</code></p>`;
    return;
  }

  // Load marker
  const { data: marker, error } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,rating_manual,address,lat,lon,is_active,created_at")
    .eq("id", id)
    .single();

  if (error || !marker) {
    document.getElementById("markerTitle").textContent = "Marker not found";
    document.getElementById("markerSubtitle").textContent = "";
    document.getElementById("markerDetails").textContent = error ? error.message : "";
    return;
  }

  // Load category name + icon_url
  let categoryName = marker.category_id;
  let iconUrl = "";
  const catRes = await sb
    .from("categories")
    .select("id,name,icon_url")
    .eq("id", marker.category_id)
    .single();

  if (!catRes.error && catRes.data) {
    categoryName = catRes.data.name;
    iconUrl = catRes.data.icon_url || "";
  }

  document.getElementById("markerTitle").textContent = marker.title;
  document.getElementById("markerSubtitle").textContent =
    `${marker.group_type} · ${categoryName} · ${marker.rating_manual}/10`;

  const latLon =
    (marker.lat !== null && marker.lon !== null) ? `${marker.lat}, ${marker.lon}` : "";

  const iconHtml = iconUrl
    ? `<img src="${escapeHtml(iconUrl)}" alt="" style="width:22px;height:22px;vertical-align:middle;margin-right:6px;" />`
    : "";

  document.getElementById("markerDetails").innerHTML = `
    <p><b>Category:</b> ${iconHtml}${escapeHtml(categoryName)}</p>
    <p><b>Group:</b> ${escapeHtml(marker.group_type)}</p>
    <p><b>Rating:</b> ${escapeHtml(String(marker.rating_manual))}/10</p>
    <p><b>Address:</b> ${escapeHtml(marker.address || "")}</p>
    <p><b>Lat/Lon:</b> ${escapeHtml(latLon)}</p>
    <p><b>Active:</b> ${escapeHtml(String(marker.is_active))}</p>
    <p><b>Created:</b> ${escapeHtml(formatDate(marker.created_at))}</p>
    <p><b>ID:</b> <span class="muted">${escapeHtml(marker.id)}</span></p>
  `;
}
