// ✅ Paste these from Supabase: Project Settings → API
const SUPABASE_URL = "https://pwlskdjmgqxikbamfshj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OIK8RJ8IZgHY0MW6FKqD6Q_yOm4YcmA";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let CATEGORIES = [];

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

  setStatus("");
  await loadMarkers();
}

async function loadMarkers() {
  const wrap = document.getElementById("markers");
  wrap.textContent = "Loading…";

  const { data, error } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,rating_manual,created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    wrap.textContent = "Error: " + error.message;
    return;
  }

  const markers = data || [];
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
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Group</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Category</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Rating</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Created</th>
        </tr>
      </thead>
      <tbody>
        ${markers.map(m => `
          <tr>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(m.title)}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(m.group_type)}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(catName(m.category_id))}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(m.rating_manual)}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml((m.created_at || "").replace("T"," ").slice(0,19))}</td>
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

  if (!title) {
    setStatus("Title required");
    return;
  }

  const { error } = await sb.from("markers").insert([
    { title, category_id, group_type, rating_manual, is_active: true }
  ]);

  if (error) {
    setStatus("Error: " + error.message);
    return;
  }

  document.getElementById("title").value = "";
  setStatus("Saved ✅");
  await loadMarkers();
}
