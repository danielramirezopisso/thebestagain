// marker.js v5 — redesigned marker detail page

let MARKER_ID = null;
let CURRENT_MARKER = null;
let CURRENT_VOTE = null;       // number | null (current user's vote value)
let CURRENT_VOTE_ID = null;    // uuid of vote row

let CATEGORIES_ALL = [];
let BRANDS = [];
let CATEGORY_BRANDS = [];

let miniMapInstance = null;

function qp(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function setStatus(msg) {
  const el = document.getElementById("pageStatus");
  if (el) el.textContent = msg || "";
}

function setVoteStatus(msg) {
  const el = document.getElementById("voteStatus");
  if (el) el.textContent = msg || "";
}

function setEditStatus(msg) {
  const el = document.getElementById("editStatus");
  if (el) el.textContent = msg || "";
}

function formatDate(iso) {
  return (iso || "").replace("T"," ").slice(0,16);
}

function colorClass(avg, cnt) {
  if (!Number(cnt)) return "rating-none";
  const x = Number(avg);
  if (x >= 9) return "rating-9-10";
  if (x >= 7) return "rating-7-8";
  if (x >= 5) return "rating-5-6";
  if (x >= 3) return "rating-3-4";
  return "rating-1-2";
}

function barClass(avg, cnt) {
  return colorClass(avg, cnt).replace("rating-","bar-");
}

function getCategoryById(id) {
  return CATEGORIES_ALL.find(c => c.id === id) || null;
}
function getBrandById(id) {
  return BRANDS.find(b => b.id === id) || null;
}
function brandsForCategory(category_id) {
  if (!category_id) return BRANDS.filter(b => b.is_active);
  const allowed = new Set(
    CATEGORY_BRANDS.filter(cb => cb.category_id === category_id && cb.is_active).map(cb => cb.brand_id)
  );
  return BRANDS.filter(b => b.is_active && allowed.has(b.id));
}

/* ══════════════════════════════
   RENDER HERO
══════════════════════════════ */
function renderHero(m, user) {
  document.title = `${m.title} — The Best Again`;

  // Category icon
  const cat = getCategoryById(m.category_id);
  const iconHtml = cat?.icon_url
    ? `<img src="${escapeHtml(cat.icon_url)}" alt="" />`
    : "📦";
  document.getElementById("heroCatIcon").innerHTML = iconHtml;

  // Type tag
  const isPlace = m.group_type === "place";
  document.getElementById("heroTypeTag").className = `hero-type-tag ${isPlace ? "type-tag-place" : "type-tag-product"}`;
  document.getElementById("heroTypeTag").textContent = isPlace ? "📍 Place" : "🛒 Product";

  // Title & subtitle
  document.getElementById("markerTitle").textContent = m.title;
  const sub = [];
  if (cat) sub.push(cat.name);
  if (!isPlace && m.brand_id) {
    const brand = getBrandById(m.brand_id);
    if (brand) sub.push(brand.name);
  }
  document.getElementById("markerSubtitle").textContent = sub.join(" · ");

  // Actions (only for logged-in users)
  const actionsEl = document.getElementById("heroActions");
  if (user) {
    actionsEl.innerHTML = `
      <button class="tba-btn" id="btnEdit" onclick="enterEditMode()">✏️ Edit</button>
      <button class="tba-btn" id="btnDeactivate"
        onclick="deactivateMarker()"
        style="border-color:#ef4444;color:#ef4444;"
        ${!m.is_active ? "disabled" : ""}>
        Deactivate
      </button>
    `;
  }

  if (!m.is_active) {
    setStatus("⚠️ This marker is inactive (deactivated).");
  }
}

/* ══════════════════════════════
   RENDER RATING CARD
══════════════════════════════ */
function renderRating(m) {
  const avg = Number(m.rating_avg ?? 0);
  const cnt = Number(m.rating_count ?? 0);
  const cls = colorClass(avg, cnt);
  const bCls = barClass(avg, cnt);
  const pct = cnt ? Math.round((avg / 10) * 100) : 0;
  const displayAvg = cnt ? avg.toFixed(1) : "—";

  let myVoteHtml = "";
  if (CURRENT_VOTE !== null) {
    const myCls = colorClass(CURRENT_VOTE, 1);
    myVoteHtml = `
      <div class="rating-my">
        <div class="rating-my-number ${myCls}">${Number(CURRENT_VOTE).toFixed(1)}</div>
        <div class="rating-label">Your vote</div>
      </div>
    `;
  }

  document.getElementById("ratingDisplay").innerHTML = `
    <div class="rating-big">
      <div class="rating-number ${cls}">${escapeHtml(displayAvg)}</div>
      <div class="rating-label">Overall</div>
    </div>
    <div class="rating-bar-wrap">
      <div class="rating-bar-track">
        <div class="rating-bar-fill ${bCls}" style="width:${pct}%"></div>
      </div>
      <div class="rating-votes-txt">${cnt} vote${cnt === 1 ? "" : "s"}</div>
    </div>
    ${myVoteHtml}
  `;
}

/* ══════════════════════════════
   RENDER VOTE BUTTONS
══════════════════════════════ */
function renderVoteButtons() {
  const wrap = document.getElementById("voteBtns");
  wrap.innerHTML = "";

  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement("button");
    btn.className = "vote-btn" + (CURRENT_VOTE === i ? " selected" : "");
    btn.textContent = String(i);
    btn.onclick = () => selectVote(i);
    wrap.appendChild(btn);
  }

  const removeBtn = document.getElementById("btnClearVote");
  if (removeBtn) removeBtn.style.display = CURRENT_VOTE !== null ? "inline-flex" : "none";
}

function selectVote(v) {
  CURRENT_VOTE = v;
  renderVoteButtons();
  renderRating(CURRENT_MARKER);
}

/* ══════════════════════════════
   RENDER DETAILS
══════════════════════════════ */
function renderDetails(m, creatorName) {
  const isPlace = m.group_type === "place";
  const cat = getCategoryById(m.category_id);
  const brand = getBrandById(m.brand_id);

  const rows = [];

  if (isPlace && m.address) {
    rows.push({ key: "Address", val: escapeHtml(m.address) });
  }
  if (!isPlace && brand) {
    rows.push({ key: "Brand", val: escapeHtml(brand.name) });
  }
  if (cat) {
    rows.push({ key: "Category", val: escapeHtml(cat.name) });
  }
  rows.push({ key: "Added", val: escapeHtml(formatDate(m.created_at)) });
  rows.push({ key: "By", val: `<span id="createdByName">${escapeHtml(creatorName || "…")}</span>` });
  if (!m.is_active) {
    rows.push({ key: "Status", val: `<span style="color:#ef4444;font-weight:900;">Inactive</span>` });
  }

  document.getElementById("detailsContent").innerHTML = rows.map(r => `
    <div class="detail-row">
      <div class="detail-key">${r.key}</div>
      <div class="detail-val">${r.val}</div>
    </div>
  `).join("");
}

/* ══════════════════════════════
   MINI MAP
══════════════════════════════ */
function renderMiniMap(m) {
  const lat = Number(m.lat);
  const lon = Number(m.lon);
  if (!m.lat || !m.lon || isNaN(lat) || isNaN(lon)) return;

  const card = document.getElementById("miniMapCard");
  card.style.display = "block";

  // Set address text
  const addrEl = document.getElementById("miniMapAddress");
  if (m.address) addrEl.textContent = "📍 " + m.address;

  // Init Leaflet map
  if (miniMapInstance) {
    miniMapInstance.remove();
    miniMapInstance = null;
  }
  setTimeout(() => {
    miniMapInstance = L.map("miniMap", { zoomControl: true, scrollWheelZoom: false })
      .setView([lat, lon], 15);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    }).addTo(miniMapInstance);

    L.marker([lat, lon])
      .addTo(miniMapInstance)
      .bindPopup(escapeHtml(m.title))
      .openPopup();
  }, 50);
}

/* ══════════════════════════════
   RANKING WIDGET
══════════════════════════════ */
async function renderRankingWidget(m) {
  const card = document.getElementById("rankingCard");
  const cat = getCategoryById(m.category_id);
  if (!cat) return;

  // Load all markers of same category, same group_type
  const { data, error } = await sb
    .from("markers")
    .select("id,title,rating_avg,rating_count,brand_id")
    .eq("is_active", true)
    .eq("category_id", m.category_id)
    .eq("group_type", m.group_type)
    .order("rating_avg", { ascending: false });

  if (error || !data?.length) return;

  // Sort: avg desc, count as tiebreaker
  const sorted = data.slice().sort((a, b) => {
    const diff = Number(b.rating_avg ?? 0) - Number(a.rating_avg ?? 0);
    if (diff !== 0) return diff;
    return Number(b.rating_count ?? 0) - Number(a.rating_count ?? 0);
  });

  const currentIdx = sorted.findIndex(r => r.id === m.id);
  if (currentIdx === -1) return;

  const position = currentIdx + 1;
  const total = sorted.length;

  // Update edit votes link to go straight to category
  const editLink = document.getElementById("editVotesCatLink");
  if (editLink) editLink.href = "my-votes.html"; // user opens edit mode and picks category

  // Position display
  document.getElementById("rankingPosition").innerHTML = `
    <div class="ranking-pos-number">#${position}</div>
    <div class="ranking-pos-sub">of ${total} ${escapeHtml(cat.name)}</div>
  `;

  // Build the 5-card window: 2 above, current, 2 below
  const windowItems = [];

  const aboveStart = Math.max(0, currentIdx - 2);
  const belowEnd   = Math.min(sorted.length - 1, currentIdx + 2);

  // Show "…" if there are items above the window
  if (aboveStart > 0) {
    windowItems.push({ type: "sep" });
  }

  for (let i = aboveStart; i <= belowEnd; i++) {
    windowItems.push({ type: "item", item: sorted[i], pos: i + 1, isCurrent: i === currentIdx });
  }

  // Show "…" if there are items below the window
  if (belowEnd < sorted.length - 1) {
    windowItems.push({ type: "sep" });
  }

  const listEl = document.getElementById("rankingList");
  listEl.innerHTML = windowItems.map(w => {
    if (w.type === "sep") return `<div class="rank-row rank-separator">⋯</div>`;

    const r = w.item;
    const avg = Number(r.rating_avg ?? 0);
    const cnt = Number(r.rating_count ?? 0);
    const cls = colorClass(avg, cnt);
    const scoreText = cnt ? avg.toFixed(1) : "—";

    // Name: for products show brand, for places show title
    let name = r.title;
    if (m.group_type === "product" && r.brand_id) {
      name = getBrandById(r.brand_id)?.name || r.title;
    }

    const href = `marker.html?id=${encodeURIComponent(r.id)}`;
    return `
      <a class="rank-row ${w.isCurrent ? "rank-current" : ""}" href="${href}">
        <div class="rank-pos">${w.pos}</div>
        <div class="rank-name">${escapeHtml(name)}</div>
        <div class="rank-score ${cls}">${escapeHtml(scoreText)}</div>
      </a>
    `;
  }).join("");

  card.style.display = "block";
}

/* ══════════════════════════════
   VOTE ACTIONS
══════════════════════════════ */
async function loadMyVote(user) {
  const { data, error } = await sb
    .from("votes")
    .select("id,vote,is_active")
    .eq("marker_id", MARKER_ID)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) { setVoteStatus("Error loading vote."); return; }

  if (data?.is_active) {
    CURRENT_VOTE = Number(data.vote);
    CURRENT_VOTE_ID = data.id;
    setVoteStatus(`Your current vote: ${CURRENT_VOTE}`);
  } else {
    CURRENT_VOTE = null;
    CURRENT_VOTE_ID = data?.id || null;
    setVoteStatus("No vote yet.");
  }

  renderVoteButtons();
  renderRating(CURRENT_MARKER);
}

async function saveMyVote() {
  if (CURRENT_VOTE === null) { setVoteStatus("Select a score first."); return; }

  setVoteStatus("Saving…");
  const user = await requireAuth();
  if (!user) return;

  const { error } = await sb
    .from("votes")
    .upsert(
      [{ marker_id: MARKER_ID, user_id: user.id, vote: CURRENT_VOTE, is_active: true }],
      { onConflict: "marker_id,user_id" }
    );

  if (error) { setVoteStatus("Error: " + error.message); return; }

  setVoteStatus("Saved ✅");
  await refreshMarker();
  renderVoteButtons();
  renderRating(CURRENT_MARKER);
}

async function clearMyVote() {
  if (!confirm("Remove your vote?")) return;
  setVoteStatus("Removing…");

  const user = await requireAuth();
  if (!user) return;

  const { error } = await sb
    .from("votes")
    .update({ is_active: false })
    .eq("marker_id", MARKER_ID)
    .eq("user_id", user.id);

  if (error) { setVoteStatus("Error: " + error.message); return; }

  CURRENT_VOTE = null;
  setVoteStatus("Removed ✅");
  await refreshMarker();
  renderVoteButtons();
  renderRating(CURRENT_MARKER);
}

async function refreshMarker() {
  const { data } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,brand_id,rating_manual,rating_avg,rating_count,address,lat,lon,is_active,created_at,created_by")
    .eq("id", MARKER_ID)
    .single();
  if (data) CURRENT_MARKER = data;
}

/* ══════════════════════════════
   EDIT MODE
══════════════════════════════ */
function categoriesForGroup(group_type) {
  return group_type === "product"
    ? CATEGORIES_ALL.filter(c => c.for_products)
    : CATEGORIES_ALL.filter(c => c.for_places);
}

function renderCategoryOptions(group_type, selectedId) {
  const sel = document.getElementById("e_category");
  if (!sel) return;
  sel.innerHTML = categoriesForGroup(group_type)
    .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  if (selectedId != null) sel.value = String(selectedId);
}

function renderBrandOptions(selectedId, category_id) {
  const sel = document.getElementById("e_brand");
  if (!sel) return;
  const filtered = brandsForCategory(category_id || null);
  sel.innerHTML = filtered.length
    ? filtered.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("")
    : `<option value="">No brands for this category</option>`;
  if (selectedId != null) sel.value = String(selectedId);
}

function showBrandRow(show) {
  const row = document.getElementById("brandRow");
  if (row) row.style.display = show ? "flex" : "none";
}

function computeProductTitle(category_id, brand_id) {
  const c = CATEGORIES_ALL.find(x => x.id === parseInt(category_id));
  const b = BRANDS.find(x => x.id === parseInt(brand_id));
  return `${c?.name || ""} · ${b?.name || ""}`.trim();
}

function setTitleReadonly(isProduct) {
  const el = document.getElementById("e_title");
  if (!el) return;
  el.disabled = isProduct;
  el.style.opacity = isProduct ? "0.7" : "1";
}

function onEditGroupChanged() {
  const g = document.getElementById("e_group_type").value;
  showBrandRow(g === "product");
  renderCategoryOptions(g, null);
  setTitleReadonly(g === "product");
  if (g === "product") {
    const cat_id = parseInt(document.getElementById("e_category").value) || null;
    renderBrandOptions(null, cat_id);
    document.getElementById("e_title").value = computeProductTitle(
      document.getElementById("e_category").value,
      document.getElementById("e_brand").value
    );
  }
}

function onEditCategoryChanged() {
  const g = document.getElementById("e_group_type").value;
  if (g !== "product") return;
  const cat_id = parseInt(document.getElementById("e_category").value) || null;
  renderBrandOptions(null, cat_id);
  document.getElementById("e_title").value = computeProductTitle(
    document.getElementById("e_category").value,
    document.getElementById("e_brand").value
  );
}

function onEditBrandChanged() {
  if (document.getElementById("e_group_type").value !== "product") return;
  document.getElementById("e_title").value = computeProductTitle(
    document.getElementById("e_category").value,
    document.getElementById("e_brand").value
  );
}

function fillSelect1to10(id, def = 7) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = String(i);
    if (i === def) o.selected = true;
    sel.appendChild(o);
  }
}

function fillEditForm() {
  const m = CURRENT_MARKER;
  document.getElementById("e_title").value = m.title || "";
  document.getElementById("e_group_type").value = m.group_type || "place";
  renderCategoryOptions(m.group_type || "place", m.category_id);
  renderBrandOptions(m.brand_id, m.category_id);
  fillSelect1to10("e_rating", Number(m.rating_manual) || 7);
  showBrandRow(m.group_type === "product");
  setTitleReadonly(m.group_type === "product");
  document.getElementById("e_address").value = m.address || "";
  document.getElementById("e_lat").value = m.lat ?? "";
  document.getElementById("e_lon").value = m.lon ?? "";

  const catSel = document.getElementById("e_category");
  if (catSel && !catSel.dataset.bound) {
    catSel.addEventListener("change", onEditCategoryChanged);
    catSel.dataset.bound = "1";
  }
  const brandSel = document.getElementById("e_brand");
  if (brandSel && !brandSel.dataset.bound) {
    brandSel.addEventListener("change", onEditBrandChanged);
    brandSel.dataset.bound = "1";
  }
  if (m.group_type === "product") {
    document.getElementById("e_title").value = computeProductTitle(m.category_id, m.brand_id);
  }
}

function enterEditMode() {
  document.getElementById("editCard").style.display = "block";
  document.getElementById("editCard").scrollIntoView({ behavior: "smooth", block: "start" });
  fillEditForm();
  setEditStatus("");
}

function cancelEdits() {
  document.getElementById("editCard").style.display = "none";
  setEditStatus("");
}

async function saveEdits() {
  setEditStatus("Saving…");

  const group_type  = document.getElementById("e_group_type").value;
  const category_id = parseInt(document.getElementById("e_category").value) || null;
  const address     = document.getElementById("e_address").value.trim();
  const latRaw      = document.getElementById("e_lat").value.trim();
  const lonRaw      = document.getElementById("e_lon").value.trim();
  const lat = latRaw === "" ? null : Number(latRaw);
  const lon = lonRaw === "" ? null : Number(lonRaw);
  const brand_id = group_type === "product"
    ? (parseInt(document.getElementById("e_brand").value) || null)
    : null;
  const rating_manual = Number(document.getElementById("e_rating").value);

  let title = document.getElementById("e_title").value.trim();
  if (group_type === "product") {
    if (!brand_id) { setEditStatus("Brand is required for products."); return; }
    title = computeProductTitle(category_id, brand_id);
  }
  if (!title) { setEditStatus("Title is required."); return; }

  const { data, error } = await sb
    .from("markers")
    .update({ title, group_type, category_id, brand_id, rating_manual, address, lat, lon })
    .eq("id", MARKER_ID)
    .select("id,title,group_type,category_id,brand_id,rating_manual,rating_avg,rating_count,address,lat,lon,is_active,created_at,created_by")
    .single();

  if (error) { setEditStatus("Error: " + error.message); return; }

  CURRENT_MARKER = data;
  const user = await maybeUser();
  const creatorName = await resolveCreatorName(data, user);
  renderHero(data, user);
  renderDetails(data, creatorName);
  renderRating(data);
  if (data.group_type === "place") renderMiniMap(data);
  await renderRankingWidget(data);
  cancelEdits();
  setStatus("Saved ✅");
}

async function deactivateMarker() {
  if (!confirm("Deactivate this marker? It will be hidden from list and map.")) return;
  setStatus("Deactivating…");

  const { data, error } = await sb
    .from("markers")
    .update({ is_active: false })
    .eq("id", MARKER_ID)
    .select("id,title,group_type,category_id,brand_id,rating_manual,rating_avg,rating_count,address,lat,lon,is_active,created_at,created_by")
    .single();

  if (error) { setStatus("Error: " + error.message); return; }
  CURRENT_MARKER = data;
  const user = await maybeUser();
  renderHero(data, user);
  setStatus("Deactivated ✅");
}

/* ══════════════════════════════
   CREATOR NAME
══════════════════════════════ */
async function resolveCreatorName(m, user) {
  if (!m?.created_by) return "Unknown";
  if (user && user.id === m.created_by) {
    return user.user_metadata?.display_name || user.email || "You";
  }
  const { data } = await sb
    .from("profiles")
    .select("display_name")
    .eq("id", m.created_by)
    .maybeSingle();
  return data?.display_name || "A member";
}

/* ══════════════════════════════
   INIT
══════════════════════════════ */
async function initMarkerPage() {
  MARKER_ID = qp("id");
  if (!MARKER_ID) {
    setStatus("Missing marker id. Open like: marker.html?id=YOUR_ID");
    return;
  }

  setStatus("Loading…");

  const user = await maybeUser();

  // Show vote card only if logged in
  if (user) {
    document.getElementById("voteCard").style.display = "block";
  }

  // Load reference data in parallel
  const [cbRes, catRes, brandRes, markerRes] = await Promise.all([
    sb.from("category_brands").select("category_id,brand_id,is_active").eq("is_active", true),
    sb.from("categories").select("id,name,icon_url,is_active,for_places,for_products").eq("is_active", true).order("name"),
    sb.from("brands").select("id,name,icon_url,is_active").eq("is_active", true).order("name"),
    sb.from("markers")
      .select("id,title,group_type,category_id,brand_id,rating_manual,rating_avg,rating_count,address,lat,lon,is_active,created_at,created_by")
      .eq("id", MARKER_ID)
      .single(),
  ]);

  if (markerRes.error || !markerRes.data) {
    setStatus("Marker not found.");
    document.getElementById("markerTitle").textContent = "Not found";
    return;
  }

  CATEGORY_BRANDS = cbRes.data || [];
  CATEGORIES_ALL  = catRes.data || [];
  BRANDS          = brandRes.data || [];
  CURRENT_MARKER  = markerRes.data;

  const m = CURRENT_MARKER;

  // Resolve creator name
  const creatorName = await resolveCreatorName(m, user);

  // Load my vote if logged in
  if (user) await loadMyVote(user);

  // Render all sections
  renderHero(m, user);
  renderRating(m);
  renderDetails(m, creatorName);

  if (m.group_type === "place") renderMiniMap(m);

  await renderRankingWidget(m);

  setStatus("");
}
