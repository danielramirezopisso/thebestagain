// marker.js — supports places + products (brand for products), voting, edit/deactivate
// Uses sb + maybeUser/requireAuth from auth.js

let MARKER_ID = null;
let CURRENT_MARKER = null;

let CATEGORIES_ALL = [];
let BRANDS = [];

let CURRENT_VOTE_ROW = null;

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function setStatus(msg) {
  const el = document.getElementById("pageStatus");
  if (el) el.textContent = msg || "";
}

function setVoteStatus(msg) {
  const el = document.getElementById("voteStatus");
  if (el) el.textContent = msg || "";
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

function fillSelect1to10(selectId, defaultValue = 7) {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  sel.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    if (i === defaultValue) opt.selected = true;
    sel.appendChild(opt);
  }
}

function overallText(avg, cnt) {
  const a = Number(avg ?? 0);
  const c = Number(cnt ?? 0);
  if (!c) return "—/10 (0 votes)";
  return `${a.toFixed(2)}/10 (${c} vote${c === 1 ? "" : "s"})`;
}

function getCategoryById(id) {
  return CATEGORIES_ALL.find(c => String(c.id) === String(id)) || null;
}

function getBrandById(id) {
  return BRANDS.find(b => String(b.id) === String(id)) || null;
}

function categoriesForGroup(group_type) {
  if (group_type === "product") return CATEGORIES_ALL.filter(c => c.for_products);
  return CATEGORIES_ALL.filter(c => c.for_places);
}

function renderCategoryOptions(group_type, selectedId) {
  const list = categoriesForGroup(group_type);
  const sel = document.getElementById("e_category");
  if (!sel) return;

  sel.innerHTML = list
    .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");

  if (selectedId) sel.value = String(selectedId);
}

function renderBrandOptions(selectedId) {
  const sel = document.getElementById("e_brand");
  if (!sel) return;

  sel.innerHTML = BRANDS
    .filter(b => b.is_active)
    .map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`)
    .join("");

  if (selectedId) sel.value = String(selectedId);
}

function showBrandRow(shouldShow) {
  const row = document.getElementById("brandRow");
  if (row) row.style.display = shouldShow ? "block" : "none";
}

function onEditGroupChanged() {
  const g = document.getElementById("e_group_type").value;
  showBrandRow(g === "product");
  renderCategoryOptions(g, null);
}

async function initMarkerPage() {
  const user = await maybeUser();
  if (!user) {
    const v = document.getElementById("voteSection");
    if (v) v.style.display = "none";

    const b1 = document.getElementById("btnEdit");
    const b2 = document.getElementById("btnDeactivate");
    if (b1) b1.style.display = "none";
    if (b2) b2.style.display = "none";
  }

  MARKER_ID = qs("id");
  if (!MARKER_ID) {
    document.getElementById("markerTitle").textContent = "Missing marker id";
    document.getElementById("markerDetails").innerHTML =
      `<p>Open this page like: <code>marker.html?id=YOUR_MARKER_ID</code></p>`;
    return;
  }

  setStatus("Loading…");
  setVoteStatus("");

  fillSelect1to10("my_vote", 7);
  fillSelect1to10("e_rating", 7);

  // Load categories (with scope flags)
  const cats = await sb
    .from("categories")
    .select("id,name,icon_url,is_active,for_places,for_products")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (cats.error) {
    setStatus("Error loading categories: " + cats.error.message);
    return;
  }
  CATEGORIES_ALL = cats.data || [];

  // Load brands
  const brands = await sb
    .from("brands")
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (brands.error) {
    setStatus("Error loading brands: " + brands.error.message);
    return;
  }
  BRANDS = brands.data || [];

  // Load marker (includes averages + brand_id)
  const { data: marker, error } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,brand_id,rating_manual,rating_avg,rating_count,address,lat,lon,is_active,created_at")
    .eq("id", MARKER_ID)
    .single();

  if (error || !marker) {
    document.getElementById("markerTitle").textContent = "Marker not found";
    document.getElementById("markerDetails").textContent = error ? error.message : "";
    setStatus("");
    return;
  }

  CURRENT_MARKER = marker;

  renderView();
  fillEditForm();

  // load vote only if logged in
  if (user) await loadMyVote();

  setStatus("");
}

function renderView() {
  const m = CURRENT_MARKER;

  const cat = getCategoryById(m.category_id);
  const categoryName = cat ? cat.name : (m.category_id || "");
  const iconUrl = cat ? (cat.icon_url || "") : "";

  const b = m.group_type === "product" ? getBrandById(m.brand_id) : null;
  const brandName = b ? b.name : (m.brand_id || "");

  const over = overallText(m.rating_avg, m.rating_count);

  document.getElementById("markerTitle").textContent = m.title;

  const subtitleBits = [
    m.group_type,
    categoryName,
    over
  ];
  if (m.group_type === "product" && brandName) subtitleBits.splice(2, 0, `Brand: ${brandName}`);

  document.getElementById("markerSubtitle").textContent = subtitleBits.join(" · ");

  const latLon = (m.lat !== null && m.lon !== null) ? `${m.lat}, ${m.lon}` : "";

  const iconHtml = iconUrl
    ? `<img src="${escapeHtml(iconUrl)}" alt="" style="width:22px;height:22px;vertical-align:middle;margin-right:6px;" />`
    : "";

  const brandLine = (m.group_type === "product")
    ? `<p><b>Brand:</b> ${escapeHtml(brandName)}</p>`
    : "";

  document.getElementById("markerDetails").innerHTML = `
    <p><b>Category:</b> ${iconHtml}${escapeHtml(categoryName)}</p>
    <p><b>Group:</b> ${escapeHtml(m.group_type)}</p>
    ${brandLine}
    <p><b>Overall rating:</b> ${escapeHtml(over)}</p>
    <p class="muted"><b>Manual rating (legacy):</b> ${escapeHtml(String(m.rating_manual ?? ""))}/10</p>
    <p><b>Address:</b> ${escapeHtml(m.address || "")}</p>
    <p><b>Lat/Lon:</b> ${escapeHtml(latLon)}</p>
    <p><b>Active:</b> ${escapeHtml(String(m.is_active))}</p>
    <p><b>Created:</b> ${escapeHtml(formatDate(m.created_at))}</p>
    <p><b>ID:</b> <span class="muted">${escapeHtml(m.id)}</span></p>
  `;

  const isInactive = !m.is_active;
  document.getElementById("btnEdit").disabled = isInactive;
  document.getElementById("btnDeactivate").disabled = isInactive;
  if (isInactive) setStatus("This marker is inactive (deactivated).");
}

function fillEditForm() {
  const m = CURRENT_MARKER;

  document.getElementById("e_title").value = m.title || "";
  document.getElementById("e_group_type").value = m.group_type || "place";

  // categories filtered by group
  renderCategoryOptions(m.group_type || "place", m.category_id || "");

  fillSelect1to10("e_rating", Number(m.rating_manual) || 7);

  // brand handling
  renderBrandOptions(m.brand_id || "");
  showBrandRow((m.group_type || "place") === "product");
  if (m.group_type === "product") {
    const sel = document.getElementById("e_brand");
    if (sel) sel.value = String(m.brand_id || "");
  }

  document.getElementById("e_address").value = m.address || "";
  document.getElementById("e_lat").value = (m.lat ?? "");
  document.getElementById("e_lon").value = (m.lon ?? "");
}

function enterEditMode() {
  document.getElementById("viewCard").style.display = "none";
  document.getElementById("editCard").style.display = "block";

  document.getElementById("btnEdit").style.display = "none";
  document.getElementById("btnDeactivate").style.display = "none";
  document.getElementById("btnSave").style.display = "inline-block";
  document.getElementById("btnCancel").style.display = "inline-block";

  setStatus("");
}

function cancelEdits() {
  fillEditForm();

  document.getElementById("viewCard").style.display = "block";
  document.getElementById("editCard").style.display = "none";

  document.getElementById("btnEdit").style.display = "inline-block";
  document.getElementById("btnDeactivate").style.display = "inline-block";
  document.getElementById("btnSave").style.display = "none";
  document.getElementById("btnCancel").style.display = "none";

  setStatus("");
}

async function saveEdits() {
  setStatus("Saving changes…");

  const title = document.getElementById("e_title").value.trim();
  const group_type = document.getElementById("e_group_type").value;
  const category_id = document.getElementById("e_category").value;
  const rating_manual = Number(document.getElementById("e_rating").value);
  const address = document.getElementById("e_address").value.trim();

  const latRaw = document.getElementById("e_lat").value.trim();
  const lonRaw = document.getElementById("e_lon").value.trim();
  const lat = latRaw === "" ? null : Number(latRaw);
  const lon = lonRaw === "" ? null : Number(lonRaw);

  const brand_id = (group_type === "product") ? document.getElementById("e_brand").value : null;

  if (!title) { setStatus("Title required."); return; }
  if (!(rating_manual >= 1 && rating_manual <= 10)) { setStatus("Rating must be 1–10."); return; }
  if ((latRaw !== "" && Number.isNaN(lat)) || (lonRaw !== "" && Number.isNaN(lon))) {
    setStatus("Lat/Lon must be numbers (or empty).");
    return;
  }
  if (group_type === "product" && !brand_id) {
    setStatus("Brand is required for products.");
    return;
  }

  // Optional: enforce product has no lat/lon
  // if (group_type === "product" && (lat !== null || lon !== null)) { setStatus("Products should not have lat/lon."); return; }

  const patch = { title, group_type, category_id, rating_manual, address, lat, lon, brand_id };

  const { data, error } = await sb
    .from("markers")
    .update(patch)
    .eq("id", MARKER_ID)
    .select("id,title,group_type,category_id,brand_id,rating_manual,rating_avg,rating_count,address,lat,lon,is_active,created_at")
    .single();

  if (error) {
    setStatus("Error: " + error.message);
    return;
  }

  CURRENT_MARKER = data;
  renderView();
  cancelEdits();
  setStatus("Saved ✅");
}

async function deactivateMarker() {
  const ok = confirm("Deactivate this marker? It will disappear from list/map.");
  if (!ok) return;

  setStatus("Deactivating…");

  const { data, error } = await sb
    .from("markers")
    .update({ is_active: false })
    .eq("id", MARKER_ID)
    .select("id,title,group_type,category_id,brand_id,rating_manual,rating_avg,rating_count,address,lat,lon,is_active,created_at")
    .single();

  if (error) {
    setStatus("Error: " + error.message);
    return;
  }

  CURRENT_MARKER = data;
  renderView();
  cancelEdits();
  setStatus("Deactivated ✅");
}

// --------------------
// My vote (soft delete)
// --------------------
async function loadMyVote() {
  setVoteStatus("Loading your vote…");

  const user = await requireAuth();
  if (!user) return;

  const { data, error } = await sb
    .from("votes")
    .select("id,vote,is_active")
    .eq("marker_id", MARKER_ID)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    setVoteStatus("Error loading vote: " + error.message);
    return;
  }

  CURRENT_VOTE_ROW = data || null;

  if (CURRENT_VOTE_ROW && CURRENT_VOTE_ROW.is_active) {
    document.getElementById("my_vote").value = String(Math.round(Number(CURRENT_VOTE_ROW.vote)));
    setVoteStatus(`Saved vote: ${CURRENT_VOTE_ROW.vote}`);
  } else {
    setVoteStatus("No active vote yet.");
  }
}

async function saveMyVote() {
  const v = Number(document.getElementById("my_vote").value);
  if (!(v >= 1 && v <= 10)) {
    setVoteStatus("Vote must be 1–10.");
    return;
  }

  setVoteStatus("Saving…");

  const user = await requireAuth();
  if (!user) return;

  const { error } = await sb
    .from("votes")
    .upsert(
      [{ marker_id: MARKER_ID, user_id: user.id, vote: v, is_active: true }],
      { onConflict: "marker_id,user_id" }
    );

  if (error) {
    setVoteStatus("Error: " + error.message);
    return;
  }

  await loadMyVote();
  setVoteStatus("Saved ✅");

  // Refresh marker to show updated avg/count
  const { data: marker, error: mErr } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,brand_id,rating_manual,rating_avg,rating_count,address,lat,lon,is_active,created_at")
    .eq("id", MARKER_ID)
    .single();

  if (!mErr && marker) {
    CURRENT_MARKER = marker;
    renderView();
    fillEditForm();
  }
}

async function clearMyVote() {
  if (!confirm("Remove your vote for this marker?")) return;

  setVoteStatus("Removing…");

  const user = await requireAuth();
  if (!user) return;

  const { error } = await sb
    .from("votes")
    .update({ is_active: false })
    .eq("marker_id", MARKER_ID)
    .eq("user_id", user.id);

  if (error) {
    setVoteStatus("Error: " + error.message);
    return;
  }

  await loadMyVote();
  setVoteStatus("Removed ✅ (soft delete)");

  // Refresh marker to show updated avg/count
  const { data: marker, error: mErr } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,brand_id,rating_manual,rating_avg,rating_count,address,lat,lon,is_active,created_at")
    .eq("id", MARKER_ID)
    .single();

  if (!mErr && marker) {
    CURRENT_MARKER = marker;
    renderView();
    fillEditForm();
  }
}
