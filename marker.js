// marker.js v5 — redesigned marker detail page

let MARKER_ID = null;
let CURRENT_MARKER = null;
let CURRENT_VOTE = null;       // number | null (current user's vote value)
let CURRENT_VOTE_ID = null;    // uuid of vote row
let CURRENT_COMMENT = null;    // string | null (current user's saved comment)

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
function renderRating(m, isFirst) {
  const avg = Number(m.rating_avg ?? 0);
  const cnt = Number(m.rating_count ?? 0);
  const cls = colorClass(avg, cnt);
  const bCls = barClass(avg, cnt);
  const pct = cnt ? Math.round((avg / 10) * 100) : 0;
  const displayAvg = cnt ? avg.toFixed(1) : "—";
  const CROWN_SVG = `<svg class="rating-crown" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><path d="M94.52 21.81c2.44-1.18 4.13-3.67 4.13-6.56a7.28 7.28 0 0 0-14.56 0c0 2.93 1.73 5.44 4.22 6.6c-2.88 15.6-7.3 27.21-23.75 29.69c0 0 4.43 22.15 25.15 22.15s22.82-21.93 22.82-21.93c-16.81.86-18.23-20.27-18.01-29.95z" fill="#f19534"/><path d="M34.74 21.81c-2.44-1.18-4.13-3.67-4.13-6.56a7.28 7.28 0 0 1 14.56 0c0 2.93-1.73 5.44-4.22 6.6c2.88 15.6 7.3 27.21 23.75 29.69c0 0-4.43 22.15-25.15 22.15S16.74 51.77 16.74 51.77c16.8.85 18.22-20.28 18-29.96z" fill="#f19534"/><path d="M119.24 16.86c-3.33-.45-6.51 2.72-7.09 7.06c-.36 2.71.37 5.24 1.78 6.87l-2.4 9.95s-3.67 23.51-22.21 28.15C74.5 72.6 69.13 45.47 67.83 37.09c2.82-1.4 4.77-4.3 4.77-7.67c0-4.73-3.83-8.56-8.56-8.56s-8.56 3.83-8.56 8.56c0 3.39 1.98 6.32 4.85 7.7c-1.03 8.27-5.57 34.5-21.57 31.76c-16.24-2.79-23.33-30.14-24.97-37.58c1.95-1.6 3.04-4.42 2.64-7.45c-.58-4.35-4.02-7.47-7.68-6.98c-3.66.49-6.15 4.41-5.57 8.75c.42 3.16 2.36 5.67 4.79 6.62l12.72 79.03s11.1 8.77 43.35 8.77s43.35-8.77 43.35-8.77l12.75-79.24c2.06-1.08 3.68-3.51 4.08-6.49c.59-4.35-1.64-8.23-4.98-8.68z" fill="#ffca28"/><ellipse cx="64.44" cy="88.3" rx="9.74" ry="11.61" fill="#26a69a"/><path d="M64.44 79.56c.38.42.72 1.19 0 2.69s-4.6 3.53-5.31 3.94c-.71.42-1.18.23-1.4.06c-1.05-.84-.65-2.74.03-3.9c1.46-2.51 4.55-5.1 6.68-2.79z" fill="#69f0ae"/><path d="M109.15 98.21c-5.99 3-19.73 10.99-45.1 10.99s-39.11-7.99-45.1-10.99c0 0-2.15 1.15-2.15 2.35v9.21c0 1.23.65 2.36 1.71 2.99c4.68 2.76 18.94 9.28 45.55 9.28s40.87-6.52 45.55-9.28a3.475 3.475 0 0 0 1.71-2.99v-9.21c-.02-1.2-2.17-2.35-2.17-2.35z" fill="#ffca28"/></svg>`;

  const crownHtml = (isFirst && cnt > 0) ? CROWN_SVG : "";

  let myVoteHtml = "";
  if (CURRENT_VOTE !== null) {
    const myCls = colorClass(CURRENT_VOTE, 1);
    myVoteHtml = `
      <div class="rating-my">
        <span class="rating-label">Your vote</span>
        <span class="rating-my-number ${myCls}">${Number(CURRENT_VOTE).toFixed(1)}</span>
      </div>
    `;
  }

  document.getElementById("ratingDisplay").innerHTML = `
    <div class="rating-badge ${cls}" style="margin-top:${isFirst && cnt > 0 ? '40px' : '0'}">
      ${crownHtml}
      <div class="rating-badge-number">${escapeHtml(displayAvg)}</div>
      <div class="rating-badge-label">Overall</div>
    </div>
    <div class="rating-right">
      <div class="rating-bar-block">
        <div class="rating-bar-header">
          <span class="rating-bar-score">${escapeHtml(displayAvg)} <span class="rating-bar-max">/ 10</span></span>
        </div>
        <div class="rating-bar-track">
          <div class="rating-bar-fill ${bCls}" style="width:${pct}%"></div>
        </div>
        <div class="rating-votes-txt">${cnt} vote${cnt === 1 ? "" : "s"}</div>
      </div>
      ${myVoteHtml}
    </div>
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
  const isFirst = position === 1 && Number(m.rating_count ?? 0) > 0;
  // Re-render rating card now we know position
  renderRating(m, isFirst);

  // Update edit votes link
  const editLink = document.getElementById("editVotesCatLink");
  if (editLink) editLink.href = "my-votes.html";

  // Position display — use emoji crown here, simple and reliable
  const crownHtml = isFirst ? `<div style="font-size:24px;line-height:1;">👑</div>` : "";
  document.getElementById("rankingPosition").innerHTML = `
    <div class="ranking-pos-number">${crownHtml}#${position}</div>
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
    .select("id,vote,comment,is_active")
    .eq("marker_id", MARKER_ID)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) { setVoteStatus("Error loading vote."); return; }

  if (data?.is_active) {
    CURRENT_VOTE    = Number(data.vote);
    CURRENT_VOTE_ID = data.id;
    CURRENT_COMMENT = data.comment || null;
    setVoteStatus(`Your current vote: ${CURRENT_VOTE}`);
  } else {
    CURRENT_VOTE    = null;
    CURRENT_VOTE_ID = data?.id || null;
    CURRENT_COMMENT = null;
    setVoteStatus("No vote yet.");
  }

  // Populate comment textarea
  const ta = document.getElementById("myCommentInput");
  if (ta) {
    ta.value = CURRENT_COMMENT || "";
    updateCommentCharCount();
  }

  renderVoteButtons();
  renderRating(CURRENT_MARKER);
}

async function saveMyVote() {
  if (CURRENT_VOTE === null) { setVoteStatus("Select a score first."); return; }

  setVoteStatus("Saving…");
  const user = await requireAuth();
  if (!user) return;

  const ta      = document.getElementById("myCommentInput");
  const comment = ta ? (ta.value.trim() || null) : null;

  const { error } = await sb
    .from("votes")
    .upsert(
      [{ marker_id: MARKER_ID, user_id: user.id, vote: CURRENT_VOTE, comment, is_active: true }],
      { onConflict: "marker_id,user_id" }
    );

  if (error) { setVoteStatus("Error: " + error.message); return; }

  CURRENT_COMMENT = comment;
  setVoteStatus("Saved ✅");
  await refreshMarker();
  renderVoteButtons();
  renderRating(CURRENT_MARKER);
  await loadComments();
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

  CURRENT_VOTE    = null;
  CURRENT_COMMENT = null;
  const ta = document.getElementById("myCommentInput");
  if (ta) { ta.value = ""; updateCommentCharCount(); }
  setVoteStatus("Removed ✅");
  await refreshMarker();
  renderVoteButtons();
  renderRating(CURRENT_MARKER);
  await loadComments();
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
   COMMENTS
══════════════════════════════ */
function updateCommentCharCount() {
  const ta = document.getElementById("myCommentInput");
  const el = document.getElementById("commentCharCount");
  if (!ta || !el) return;
  const len = ta.value.length;
  el.textContent = `${len} / 500`;
  el.style.color = len > 450 ? "#ef4444" : "";
  // Hook oninput once
  if (!ta.dataset.bound) {
    ta.addEventListener("input", updateCommentCharCount);
    ta.dataset.bound = "1";
  }
}

function formatTimeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day:"numeric", month:"short", year:"numeric" });
}

async function loadComments() {
  const list = document.getElementById("commentsList");
  if (!list) return;

  // Step 1: fetch votes with comments
  const { data, error } = await sb
    .from("votes")
    .select("id,vote,comment,updated_at,user_id")
    .eq("marker_id", MARKER_ID)
    .eq("is_active", true)
    .not("comment", "is", null)
    .neq("comment", "")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("loadComments error:", error.message);
    list.innerHTML = `<p class="muted" style="font-size:13px;padding:4px 0;">Could not load comments.</p>`;
    return;
  }

  if (!data?.length) {
    list.innerHTML = `<p class="muted" style="font-size:13px;padding:4px 0;">No comments yet.</p>`;
    return;
  }

  // Step 2: fetch display names for those user_ids
  const userIds = [...new Set(data.map(r => r.user_id))];
  const { data: profiles } = await sb
    .from("profiles")
    .select("id,display_name")
    .in("id", userIds);

  const nameById = {};
  (profiles || []).forEach(p => nameById[p.id] = p.display_name);

  const user = await maybeUser();

  list.innerHTML = data.map(row => {
    const name    = nameById[row.user_id] || "A member";
    const initial = (name[0] || "?").toUpperCase();
    const score   = Number(row.vote);
    const cls     = colorClassMarker(score, 1);
    const isOwn   = user && user.id === row.user_id;
    const timeAgo = formatTimeAgo(row.updated_at);

    return `
      <div class="comment-row ${isOwn ? "comment-own" : ""}">
        <div class="comment-avatar">${escapeHtml(initial)}</div>
        <div class="comment-body">
          <div class="comment-meta">
            <span class="comment-author">${escapeHtml(name)}</span>
            <span class="comment-score-pill ${cls}">${score.toFixed(1)}</span>
            <span class="comment-time">${timeAgo}</span>
            ${isOwn ? `<button class="comment-edit-btn" onclick="focusCommentInput()">Edit</button>` : ""}
          </div>
          <div class="comment-text">${escapeHtml(row.comment)}</div>
        </div>
      </div>`;
  }).join("");
}

function colorClassMarker(v, cnt) {
  if (!cnt || !v) return "rating-none";
  if (v >= 9) return "rating-9-10";
  if (v >= 7) return "rating-7-8";
  if (v >= 5) return "rating-5-6";
  if (v >= 3) return "rating-3-4";
  return "rating-1-2";
}

function focusCommentInput() {
  const ta = document.getElementById("myCommentInput");
  if (!ta) return;
  ta.scrollIntoView({ behavior: "smooth", block: "center" });
  ta.focus();
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
  await loadComments();
  updateCommentCharCount();

  setStatus("");
}
