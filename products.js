// products.js — Masonry lanes + drawer + filters (Products only) + Add Product panel
// Cards show BRAND (category is the lane header)
// Optional brand icon (brands.icon_url) reserved

let CATS = [];
let CAT_BY_ID = {};
let BRANDS = [];
let BRAND_BY_ID = {};

let MARKERS = [];

// filters
let FILTER_CATEGORY = "";
let FILTER_BUCKET = "";

// lane sort
let TOP_CATS = [];
let LANE_SORT = {};
let DRAWER_CAT = null;
let DRAWER_SORT = "desc";

const DEFAULT_ICON_URL = "https://danielramirezopisso.github.io/thebestagain/icons/default.svg";

function qs(id){ return document.getElementById(id); }

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function normalizeUrl(raw){
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  try { return new URL(s, window.location.href).toString(); } catch { return ""; }
}

function iconForCategory(id){
  const raw = CAT_BY_ID[String(id)]?.icon_url || "";
  return normalizeUrl(raw) || DEFAULT_ICON_URL;
}
function iconForBrand(id){
  const raw = BRAND_BY_ID[String(id)]?.icon_url || "";
  return normalizeUrl(raw);
}

function setStatus(msg){ qs("pageStatus").textContent = msg || ""; }
function setPStatus(msg){ const el = qs("p_status"); if (el) el.textContent = msg || ""; }

function fillVoteSelect(){
  const sel = qs("p_vote");
  sel.innerHTML = "";
  for (let i=1;i<=10;i++){
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    if (i===7) opt.selected = true;
    sel.appendChild(opt);
  }
}

function colorClassForRating(avg, cnt){
  const c = Number(cnt ?? 0);
  if (!c) return "rating-none";
  const x = Number(avg ?? 0);
  if (x >= 9) return "rating-9-10";
  if (x >= 7) return "rating-7-8";
  if (x >= 5) return "rating-5-6";
  if (x >= 3) return "rating-3-4";
  return "rating-1-2";
}

function bucketFor(avg){
  const x = Number(avg ?? 0);
  if (x >= 9) return "9-10";
  if (x >= 7) return "7-8";
  if (x >= 5) return "5-6";
  if (x >= 3) return "3-4";
  return "1-2";
}

function passesBucket(m){
  if (!FILTER_BUCKET) return true;
  const c = Number(m.rating_count ?? 0);
  if (!c) return false;
  return bucketFor(m.rating_avg) === FILTER_BUCKET;
}
function passesCategory(m){
  if (!FILTER_CATEGORY) return true;
  return String(m.category_id) === String(FILTER_CATEGORY);
}

function showClearIfNeeded(){
  const any = !!FILTER_CATEGORY || !!FILTER_BUCKET;
  qs("btnClearFilters").style.display = any ? "inline-flex" : "none";
}

function clearFilters(){
  FILTER_CATEGORY = "";
  FILTER_BUCKET = "";
  qs("catMore").value = "";
  renderCatQuick();
  setActiveRatingBtn("");
  showClearIfNeeded();
  renderAll();
}

function onCategoryMoreChanged(){
  const v = qs("catMore").value;
  if (!v) return;
  FILTER_CATEGORY = v;
  renderCatQuick();
  showClearIfNeeded();
  renderAll();
}

/* Rating buttons */
function renderRatingButtons(){
  const host = qs("ratingSeg");
  host.innerHTML = "";

  const buttons = [
    { key:"", label:"Any", cls:"" },
    { key:"9-10", label:"9–10", cls:"rating-9-10" },
    { key:"7-8",  label:"7–8",  cls:"rating-7-8" },
    { key:"5-6",  label:"5–6",  cls:"rating-5-6" },
    { key:"3-4",  label:"3–4",  cls:"rating-3-4" },
    { key:"1-2",  label:"1–2",  cls:"rating-1-2" },
  ];

  buttons.forEach(b => {
    const btn = document.createElement("button");
    btn.className = `seg-btn ${b.cls}`.trim();
    btn.dataset.key = b.key;
    btn.textContent = b.label;
    btn.onclick = () => {
      FILTER_BUCKET = b.key;
      setActiveRatingBtn(b.key);
      showClearIfNeeded();
      renderAll();
    };
    host.appendChild(btn);
  });

  setActiveRatingBtn("");
}

function setActiveRatingBtn(key){
  [...document.querySelectorAll(".seg-btn")].forEach(el => {
    el.classList.toggle("active", el.dataset.key === key);
  });
}

/* Category quick chips (top 4 by product count) */
function renderCatQuick(){
  const host = qs("catQuick");
  host.innerHTML = "";

  const top4 = TOP_CATS.slice(0,4).map(id => CAT_BY_ID[String(id)]).filter(Boolean);

  top4.forEach(c => {
    const a = document.createElement("a");
    a.href="#";
    a.className="chip";
    a.onclick = (e) => {
      e.preventDefault();
      FILTER_CATEGORY = (FILTER_CATEGORY === String(c.id)) ? "" : String(c.id);
      qs("catMore").value = FILTER_CATEGORY ? FILTER_CATEGORY : "";
      renderCatQuick();
      showClearIfNeeded();
      renderAll();
    };
    if (FILTER_CATEGORY === String(c.id)) a.classList.add("active");
    a.innerHTML = `<img class="chip-ic" src="${escapeHtml(iconForCategory(c.id))}" alt=""/><span>${escapeHtml(c.name)}</span>`;
    host.appendChild(a);
  });

  const all = document.createElement("a");
  all.href="#";
  all.className="chip chip-more";
  all.textContent="All";
  all.onclick=(e)=>{
    e.preventDefault();
    FILTER_CATEGORY="";
    qs("catMore").value="";
    renderCatQuick();
    showClearIfNeeded();
    renderAll();
  };
  if (!FILTER_CATEGORY) all.classList.add("active");
  host.appendChild(all);
}

/* Lanes + Drawer */
function laneSortLabel(dir){ return dir === "asc" ? "Bottom ↑" : "Top ↓"; }

function toggleLaneSort(catId){
  const cur = LANE_SORT[catId] || "desc";
  LANE_SORT[catId] = (cur === "desc") ? "asc" : "desc";
  renderAll();
}

function openDrawer(catId){
  DRAWER_CAT = String(catId);
  DRAWER_SORT = LANE_SORT[DRAWER_CAT] || "desc";

  qs("drawer").style.display = "flex";
  qs("drawerCatName").textContent = CAT_BY_ID[DRAWER_CAT]?.name || DRAWER_CAT;
  qs("drawerSortBtn").textContent = laneSortLabel(DRAWER_SORT);

  renderDrawer();
}

function closeDrawer(){
  qs("drawer").style.display = "none";
  DRAWER_CAT = null;
}

function toggleDrawerSort(){
  DRAWER_SORT = (DRAWER_SORT === "desc") ? "asc" : "desc";
  qs("drawerSortBtn").textContent = laneSortLabel(DRAWER_SORT);
  renderDrawer();
}

document.addEventListener("keydown", (e)=>{
  if (e.key === "Escape") closeDrawer();
});

function sortMarkers(arr, dir){
  const d = (dir === "asc") ? 1 : -1;
  return arr.sort((a,b)=>{
    const av = Number(a.rating_avg ?? 0);
    const bv = Number(b.rating_avg ?? 0);
    if (bv !== av) return d * (bv - av);
    const ac = Number(a.rating_count ?? 0);
    const bc = Number(b.rating_count ?? 0);
    if (bc !== ac) return d * (bc - ac);
    const an = BRAND_BY_ID[String(a.brand_id)]?.name || "";
    const bn = BRAND_BY_ID[String(b.brand_id)]?.name || "";
    return an.localeCompare(bn);
  });
}

function ratingBadgeHtml(m){
  const avg = Number(m.rating_avg ?? 0);
  const cnt = Number(m.rating_count ?? 0);
  const cls = colorClassForRating(avg, cnt);
  const n = cnt ? String(Math.round(avg)) : "—";
  const tip = cnt ? `${avg.toFixed(2)}/10 (${cnt} votes)` : "No votes yet";
  return `<div class="rate-badge ${cls}" title="${escapeHtml(tip)}">${escapeHtml(n)}</div>`;
}

function brandIconSlotHtml(brandId){
  const url = iconForBrand(brandId);
  if (!url) return `<div class="brand-ic-slot" title="(no icon yet)"></div>`;
  return `<div class="brand-ic-slot"><img src="${escapeHtml(url)}" alt=""/></div>`;
}

function renderLane(catId, markersForCat){
  const cat = CAT_BY_ID[String(catId)];
  const name = cat?.name || String(catId);
  const icon = iconForCategory(catId);

  const dir = LANE_SORT[String(catId)] || "desc";
  const sorted = sortMarkers(markersForCat.slice(), dir);

  const visible = sorted.slice(0, 6);

  const itemsHtml = visible.map(m=>{
    const brand = BRAND_BY_ID[String(m.brand_id)]?.name || "(unknown brand)";
    return `
      <a class="item" href="marker.html?id=${encodeURIComponent(m.id)}">
        <div class="item-left">
          ${brandIconSlotHtml(m.brand_id)}
          <div class="item-name">${escapeHtml(brand)}</div>
        </div>
        ${ratingBadgeHtml(m)}
      </a>
    `;
  }).join("");

  const moreHtml = (sorted.length > 6)
    ? `<div class="see-more" onclick="openDrawer('${escapeHtml(catId)}')">See more →</div>`
    : `<div class="see-more" style="opacity:0.55; cursor:default;">No more</div>`;

  return `
    <div class="lane">
      <div class="lane-head">
        <div class="lane-title">
          <span class="lane-pill">🛒 Product</span>
          <img class="lane-ic" src="${escapeHtml(icon)}" alt=""/>
          <div style="min-width:0;">
            <div class="lane-name">${escapeHtml(name)}</div>
            <div class="lane-count">${markersForCat.length} brand${markersForCat.length === 1 ? "" : "s"}</div>
          </div>
        </div>

        <button class="tba-btn lane-sort" onclick="toggleLaneSort('${escapeHtml(catId)}')">${escapeHtml(laneSortLabel(dir))}</button>
      </div>

      ${itemsHtml || `<div class="muted">No products in this category yet.</div>`}
      ${moreHtml}
    </div>
  `;
}

function renderEmptyLane(){
  return `
    <div class="lane empty">
      <div style="font-weight:1000;">Empty slot</div>
      <div class="muted" style="margin-top:6px;">Create more products to fill this space.</div>
    </div>
  `;
}

function renderDrawer(){
  if (!DRAWER_CAT) return;
  const catId = DRAWER_CAT;

  let rows = MARKERS
    .filter(m => String(m.category_id) === String(catId))
    .filter(passesBucket);

  rows = sortMarkers(rows.slice(), DRAWER_SORT);

  qs("drawerList").innerHTML = rows.map(m=>{
    const brand = BRAND_BY_ID[String(m.brand_id)]?.name || "(unknown brand)";
    return `
      <a class="drawer-item" href="marker.html?id=${encodeURIComponent(m.id)}">
        <div class="item-left">
          ${brandIconSlotHtml(m.brand_id)}
          <div class="item-name">${escapeHtml(brand)}</div>
        </div>
        ${ratingBadgeHtml(m)}
      </a>
    `;
  }).join("") || `<div class="muted">No products match the filters.</div>`;
}

function computeTopCategories(){
  const counts = {};
  MARKERS.forEach(m=>{
    const cid = String(m.category_id ?? "");
    if (!cid) return;
    counts[cid] = (counts[cid] || 0) + 1;
  });

  const ids = Object.keys(counts);
  ids.sort((a,b)=> (counts[b]||0) - (counts[a]||0));
  return ids;
}

function renderAll(){
  const filtered = MARKERS.filter(passesCategory).filter(passesBucket);

  TOP_CATS = computeTopCategories();

  // More dropdown list
  const more = qs("catMore");
  more.innerHTML = `<option value="">More…</option>` + CATS
    .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");
  more.value = FILTER_CATEGORY ? FILTER_CATEGORY : "";

  renderCatQuick();

  const N = 6;
  let laneIds = TOP_CATS.slice(0, N);

  if (FILTER_CATEGORY) {
    laneIds = [String(FILTER_CATEGORY), ...laneIds.filter(x => x !== String(FILTER_CATEGORY))];
  }

  const byCat = {};
  filtered.forEach(m=>{
    const cid = String(m.category_id);
    (byCat[cid] ||= []).push(m);
  });

  const html = [];
  laneIds.forEach(cid=>{
    html.push(renderLane(cid, byCat[cid] || []));
  });
  while (html.length < N) html.push(renderEmptyLane());

  qs("lanes").innerHTML = html.join("");
  setStatus(`Loaded ${filtered.length} product(s).`);

  if (DRAWER_CAT) renderDrawer();
}

/* ---------- Add Product ---------- */
async function saveProduct(){
  const user = await requireAuth();
  if (!user) return;

  setPStatus("Saving…");

  const category_id = qs("p_category").value;
  const brand_id = qs("p_brand").value;
  const v = Number(qs("p_vote").value);

  if (!category_id) { setPStatus("Category required."); return; }
  if (!brand_id) { setPStatus("Brand required."); return; }
  if (!(v >= 1 && v <= 10)) { setPStatus("Vote must be 1–10."); return; }

  // 1) Exists? (category+brand unique for products)
  const { data: existing, error: eErr } = await sb
    .from("markers")
    .select("id")
    .eq("is_active", true)
    .eq("group_type", "product")
    .eq("category_id", category_id)
    .eq("brand_id", brand_id)
    .maybeSingle();

  if (eErr) { setPStatus("Error: " + eErr.message); return; }
  if (existing?.id) {
    setPStatus("Already exists ✅ Opening…");
    window.location.href = `marker.html?id=${encodeURIComponent(existing.id)}`;
    return;
  }

  // 2) Create marker title = Category · Brand
  const catName = CAT_BY_ID[String(category_id)]?.name || category_id;
  const brandName = BRAND_BY_ID[String(brand_id)]?.name || brand_id;
  const title = `${catName} · ${brandName}`;

  const payload = {
    title,
    category_id,
    brand_id,
    group_type: "product",
    is_active: true,
    rating_manual: v,
    lat: null,
    lon: null,
    address: null
  };

  const { data: markerRow, error: mErr } = await sb
    .from("markers")
    .insert([payload])
    .select("id")
    .single();

  if (mErr) {
    // if uniqueness triggers by race
    if (String(mErr.code) === "23505") {
      setPStatus("Already exists ✅ Opening…");
      const { data: again } = await sb
        .from("markers").select("id")
        .eq("is_active", true)
        .eq("group_type", "product")
        .eq("category_id", category_id)
        .eq("brand_id", brand_id)
        .maybeSingle();
      if (again?.id) window.location.href = `marker.html?id=${encodeURIComponent(again.id)}`;
      return;
    }
    setPStatus("Error creating: " + mErr.message);
    return;
  }

  // 3) Create vote for user
  const { error: vErr } = await sb
    .from("votes")
    .insert([{ marker_id: markerRow.id, user_id: user.id, vote: v, is_active: true }]);

  if (vErr) {
    setPStatus("Saved marker ✅ but vote failed: " + vErr.message);
    window.location.href = `marker.html?id=${encodeURIComponent(markerRow.id)}`;
    return;
  }

  setPStatus("Saved ✅ Redirecting…");
  window.location.href = `marker.html?id=${encodeURIComponent(markerRow.id)}`;
}

/* Init */
async function initProductsMasonryPage(){
  setStatus("Loading…");
  renderRatingButtons();
  fillVoteSelect();

  // login gating for add panel
  const user = await maybeUser();
  if (!user) {
    qs("addPanelForm").style.display = "none";
    qs("addPanelLoggedOut").style.display = "block";
  }

  // Brands
  const { data: brands, error: bErr } = await sb
    .from("brands")
    .select("id,name,is_active,icon_url")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (bErr) { setStatus("Error loading brands: " + bErr.message); return; }
  BRANDS = brands || [];
  BRAND_BY_ID = {};
  BRANDS.forEach(b => BRAND_BY_ID[String(b.id)] = b);

  // Categories (products only)
  const { data: cats, error: cErr } = await sb
    .from("categories")
    .select("id,name,icon_url,is_active,for_products")
    .eq("is_active", true)
    .eq("for_products", true)
    .order("name", { ascending: true });

  if (cErr) { setStatus("Error loading categories: " + cErr.message); return; }
  CATS = cats || [];
  CAT_BY_ID = {};
  CATS.forEach(c => CAT_BY_ID[String(c.id)] = c);

  // Fill add panel selects
  qs("p_category").innerHTML = CATS.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
  qs("p_brand").innerHTML = BRANDS.map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join("");

  // Product markers
  const { data: markers, error: mErr } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,brand_id,rating_avg,rating_count,is_active,created_at")
    .eq("is_active", true)
    .eq("group_type", "product");

  if (mErr) { setStatus("Error loading products: " + mErr.message); return; }
  MARKERS = markers || [];

  TOP_CATS = computeTopCategories();

  showClearIfNeeded();
  renderAll();
}
