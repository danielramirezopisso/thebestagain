// The Best Again — Release 1 frontend logic (Add/List)
// IMPORTANT: set your Apps Script Web App URL here (must end with /exec)
const API_BASE = "https://script.google.com/macros/s/AKfycbx8v-5H9lV3uVQkqMf_1ZRwgu8SAn4NlyTN-vuZnwavTyWCTV6VVvC5_lgHfCHLvOn8/exec";

let CATEGORIES = [];

async function apiGet(path) {
  const res = await fetch(`${API_BASE}?path=${encodeURIComponent(path)}`, { method: "GET" });
  return res.json();
}

// IMPORTANT: Apps Script often fails with JSON + CORS preflight.
// Using text/plain avoids OPTIONS preflight and works from GitHub Pages.
async function apiPost(path, data) {
  const res = await fetch(`${API_BASE}?path=${encodeURIComponent(path)}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(data || {})
  });
  return res.json();
}

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg || "";
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
  try {
    setStatus("Loading categories…");
    const c = await apiGet("categories");

    if (!c.ok) {
      setStatus(`Error loading categories: ${c.error}`);
      return;
    }

    CATEGORIES = c.categories || [];

    const sel = document.getElementById("category");
    sel.innerHTML = CATEGORIES.map(cat =>
      `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</option>`
    ).join("");

    setStatus("");
    await loadMarkers();
  } catch (err) {
    setStatus(`Network error (categories): ${err.message || err}`);
  }
}

async function loadMarkers() {
  const wrap = document.getElementById("markers");
  if (!wrap) return;

  try {
    wrap.textContent = "Loading…";

    const r = await apiGet("markers");
    if (!r.ok) {
      wrap.textContent = `Error: ${r.error}`;
      return;
    }

    const markers = r.markers || [];
    if (!markers.length) {
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
          ${markers.map(m => `
            <tr>
              <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(m.title)}</td>
              <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(catName(m.category_id))}</td>
              <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(m.rating_manual)}</td>
              <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${m.lat ?? ""}</td>
              <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${m.lon ?? ""}</td>
              <td style="padding:8px; border-bottom:1px solid #f0f0f0;">
                ${escapeHtml((m.created_at || "").replace("T"," ").slice(0,19))}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    wrap.textContent = `Network error (markers): ${err.message || err}`;
  }
}

async function createMarker() {
  setStatus("");

  try {
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

    // Clear inputs (keep dropdowns)
    document.getElementById("title").value = "";
    document.getElementById("lat").value = "";
    document.getElementById("lon").value = "";

    setStatus("Saved ✅");
    await loadMarkers();
  } catch (err) {
    setStatus(`Network error (save): ${err.message || err}`);
  }
}
