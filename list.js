// list.js — Read-only list of all markers (places + products)

let CATEGORIES = [];
let BRANDS = [];
let CAT_NAME = {};
let BRAND_NAME = {};

let FILTER_TYPE = "";
let FILTER_CATEGORY = "";
let FILTER_MIN_RATING = "";

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setListStatus(msg) {
  const el = document.getElementById("listStatus");
  if (el) el.textContent = msg || "";
}

function applyListFilters() {
  FILTER_TYPE = document.getElementById("filter_type").value;
  FILTER_CATEGORY = document.getElementById("filter_category").value;
  FILTER_MIN_RATING = document.getElementById("filter_min_rating").value;
  reloadList();
}

function clearListFilters() {
  FILTER_TYPE = "";
  FILTER_CATEGORY = "";
  FILTER_MIN_RATING = "";
  document.getElementById("filter_type").value = "";
  document.getElementById("filter_category").value = "";
  document.getElementById("filter_min_rating").value = "";
  reloadList();
}

function overallText(avg, cnt) {
  const a = Number(avg ?? 0);
  const c = Number(cnt ?? 0);
  if (!c) return "—/10 (0 votes)";
  return `${a.toFixed(2)}/10 (${c} vote${c === 1 ? "" : "s"})`;
}

function renderRows(rows) {
  if (!rows.length) {
    document.getElementById("listWrap").innerHTML = `<p class="muted">No markers found.</p>`;
    return;
  }

  const html = `
    <table class="table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Type</th>
          <th>Category</th>
          <th>Overall</th>
          <th>Info</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(m => {
          const cat = CAT_NAME[String(m.category_id)] || m.category_id || "";
          const over = overallText(m.rating_avg, m.rating_count);

          let info = "";
          if (m.group_type === "place") {
            info = escapeHtml(m.address || "");
          } else if (m.group_type === "product") {
            const b = BRAND_NAME[String(m.brand_id)] || "";
            info = b ? `Brand: ${escapeHtml(b)}` : "";
          }

          return `
            <tr>
              <td><a href="marker.html?id=${encodeURIComponent(m.id)}">${escapeHtml(m.title)}</a></td>
              <td>${escapeHtml(m.group_type)}</td>
              <td>${escapeHtml(cat)}</td>
              <td>${escapeHtml(over)}</td>
              <td class="muted">${info}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  document.getElementById("listWrap").innerHTML = html;
}

async function initListPage() {
  // Build min-rating options
  const fr = document.getElementById("filter_min_rating");
  fr.innerHTML = `<option value="">All</option>`;
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    fr.appendChild(opt);
  }

  setListStatus("Loading categories/brands…");

  // Categories
  const { data: catData, error: catErr } = await sb
    .from("categories")
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (catErr) {
    setListStatus("Error categories: " + catErr.message);
    return;
  }

  CATEGORIES = catData || [];
  CAT_NAME = {};
  CATEGORIES.forEach(c => CAT_NAME[String(c.id)] = c.name);

  const catSel = document.getElementById("filter_category");
  catSel.innerHTML = `<option value="">All</option>` + CATEGORIES
    .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");

  // Brands
  const { data: brandData, error: brandErr } = await sb
    .from("brands")
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (brandErr) {
    setListStatus("Error brands: " + brandErr.message);
    return;
  }

  BRANDS = brandData || [];
  BRAND_NAME = {};
  BRANDS.forEach(b => BRAND_NAME[String(b.id)] = b.name);

  await reloadList();
}

async function reloadList() {
  setListStatus("Loading markers…");

  let q = sb
    .from("markers")
    .select("id,title,group_type,category_id,brand_id,address,rating_avg,rating_count,is_active")
    .eq("is_active", true);

  if (FILTER_TYPE) q = q.eq("group_type", FILTER_TYPE);
  if (FILTER_CATEGORY) q = q.eq("category_id", FILTER_CATEGORY);
  if (FILTER_MIN_RATING) q = q.gte("rating_avg", Number(FILTER_MIN_RATING));

  const { data, error } = await q;

  if (error) {
    setListStatus("Error markers: " + error.message);
    return;
  }

  const rows = (data || []).slice();

  // Client sort: rating desc, then title
  rows.sort((a, b) => {
    const av = Number(a.rating_avg ?? 0);
    const bv = Number(b.rating_avg ?? 0);
    if (bv !== av) return bv - av;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });

  renderRows(rows);
  setListStatus(`Loaded ${rows.length} marker(s).`);
}
