const API_BASE = "https://script.google.com/macros/s/AKfycbx8v-5H9lV3uVQkqMf_1ZRwgu8SAn4NlyTN-vuZnwavTyWCTV6VVvC5_lgHfCHLvOn8/exec";

let CATEGORIES = [];

async function apiGet(path) {
  const res = await fetch(`${API_BASE}?path=${encodeURIComponent(path)}`, { method: "GET" });
  return res.json();
}

async function apiPost(path, data) {
  const res = await fetch(`${API_BASE}?path=${encodeURIComponent(path)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {})
  });
  return res.json();
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg || "";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function initApp() {
  setStatus("Loading categories…");
  const c = await apiGet("categories");
  if (!c.ok) {
    setStatus(`Error loading categories: ${c.error}`);
    return;
  }
  CATEGORIES = c.categories;

  const sel = document.getElementById("category");
  sel.innerHTML = CATEGORIES.map(cat =>
    `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</option>`
  ).join("");

  setStatus("");
  await loadMarkers();
}

async function loadMarkers() {
  const wrap = document.getElementById("markers");
  wrap.textContent = "Loading…";

  const r = await apiGet("markers");
  if (!r.ok) {
    wrap.textContent = `Error: ${r.error}`;
    return;
  }

  if (!r.markers.length) {
    wrap.textContent = "No markers yet.";
    return;
  }

  const catName = (id) => (CATEGORIES.find(c => c.id === id)?.name || id);

  wrap.innerHTML = `
    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Title</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Category</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Rating</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Lat</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Lon</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Created</th>
        </tr>
      </thead>
      <tbody>
        ${r.markers.map(m => `
          <tr>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(m.title)}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(catName(m.category_id))}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(m.rating_manual)}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${m.lat ?? ""}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${m.lon ?? ""}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml((m.created_at || "").replace("T"," ").slice(0,19))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function createMarker() {
  setStatus("");

  const title = document.getElementById("title").value.trim();
  const category_id = document.getElementById("category").value;
  const rating_manual = Number(document.getElementById("rating").value);

  const latRaw = document.getElementById("lat").value.trim();
  const lonRaw = document.getElementById("lon").value.trim();

  const payload = {
    title,
    category_id,
    rating_manual,
    lat: latRaw === "" ? "" : Number(latRaw),
    lon: lonRaw === "" ? "" : Number(lonRaw),
  };

  setStatus("Saving…");
  const r = await apiPost("markers/create", payload);

  if (!r.ok) {
    setStatus(`Error: ${r.error}`);
    return;
  }

  document.getElementById("title").value = "";
  document.getElementById("lat").value = "";
  document.getElementById("lon").value = "";

  setStatus("Saved ✅");
  await loadMarkers();
}
