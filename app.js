// app.js — Release 5: Add/List markers + filters + redirect to detail page on create
const SUPABASE_URL = "https://pwlskdjmgqxikbamfshj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OIK8RJ8IZgHY0MW6FKqD6Q_yOm4YcmA";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let CATEGORIES = [];

function setStatus(msg) {
  document.getElementById("status").textContent = msg || "";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initRatingDropdown() {
  const ratingSel = document.getElementById("rating");
  ratingSel.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    if (i === 7) opt.selected = true;
    ratingSel.appendChild(opt);
  }
}

async function initApp() {
  initRatingDropdown();
  setStatus("Loading categories…");

  const { data, error } = await sb
    .from("categories")
    .select("id,name")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (error) {
    setStatus("Error loading categories: " + error.message);
    return;
  }

  CATEGORIES = data || [];

  document.getElementById("category").innerHTML = CATEGORIES
    .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");

  document.getElementById("filter_category").innerHTML =
    `<option value="">All</option>` +
    CATEGORIES.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");

  setStatus("");
  await loadMarkers();
}

async function loadMarkers() {
  const wrap = document.getElementById("markers");
  wrap.textContent = "Loading…";

  const filterGroup = document.getElementById("filter_group").value;
  const filterCategory = document.getElementById("filter_category").value;

  let q = sb
    .from("markers")
    .select("id,title,group_type,category_id,rating_manual,lat,lon,address,created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (filterGroup) q = q.eq("group_type", filterGroup);
  if (filterCategory) q = q.eq("category_id", filterCategory);

  const { data, error } = await q;

  if (error) {
    wrap.textContent = "Error: " + error.message;
    return;
  }

  const markers = data || [];
  if (!markers.length) {
    wrap.textContent = "No markers yet (with current filters).";
    return;
  }

  const catName = (id) => (CATEGORIES.find(c => c.id === id)?.name || id);
  const fmt = (iso) => (iso || "").replace("T"," ").slice(0,19);

  wrap.innerHTML = `
    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Title</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Group</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Category</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Rating</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Lat</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Lon</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Created</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Open</th>
        </tr>
      </thead>
      <tbody>
        ${markers.map(m => `
          <tr>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(m.title)}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(m.group_type)}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(catName(m.category_id))}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(m.rating_manual)}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${m.lat ?? ""}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${m.lon ?? ""}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(fmt(m.created_at))}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">
              <a href="marker.html?id=${encodeURIComponent(m.id)}">View</a>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function createMarker() {
  setStatus("Saving…");

  const title = document.getElementById("title").value.trim();
  const category_id = document.getElementById("category").value;
  const group_type = document.getElementById("group_type").value;
  const rating_manual = Number(document.getElementById("rating").value);
  const address = document.getElementById("address").value.trim();

  const latRaw = document.getElementById("lat").value.trim();
  const lonRaw = document.getElementById("lon").value.trim();

  const lat = latRaw === "" ? null : Number(latRaw);
  const lon = lonRaw === "" ? null : Number(lonRaw);

  if (!title) { setStatus("Title required"); return; }
  if (!(rating_manual >= 1 && rating_manual <= 10)) { setStatus("Rating must be 1–10"); return; }
  if ((latRaw !== "" && Number.isNaN(lat)) || (lonRaw !== "" && Number.isNaN(lon))) {
    setStatus("Lat/Lon must be numbers");
    return;
  }

  const payload = { title, category_id, group_type, rating_manual, is_active: true, address, lat, lon };

  const { data, error } = await sb
    .from("markers")
    .insert([payload])
    .select("id")
    .single();

  if (error) {
    setStatus("Error: " + error.message);
    return;
  }

  // Redirect to the marker page
  window.location.href = `marker.html?id=${encodeURIComponent(data.id)}`;
}
