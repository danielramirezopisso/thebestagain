// home.js — Home: Spotlight Surprise + Recent + Cravings split (Places/Products)
// uses sb from auth.js

let ALL_MARKERS = [];
let CAT = {};      // id -> {name, icon_url, for_places, for_products}
let BRAND = {};    // id -> name
let LAST_SPOT_ID = null;

const DEFAULT_ICON_URL = "https://danielramirezopisso.github.io/thebestagain/icons/default.svg";

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeIconUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  try { return new URL(s, window.location.href).toString(); } catch { return ""; }
}

function iconForCategory(category_id) {
  const c = CAT[String(category_id)];
  const raw = c?.icon_url || "";
  return normalizeIconUrl(raw) || DEFAULT_ICON_URL;
}

function colorClassForRating(avg, count) {
  const cnt = Number(count ?? 0);
  if (!cnt) return "rating-none";
  const x = Number(avg ?? 0);
  if (x >= 9) return "rating-9-10";
  if (x >= 7) return "rating-7-8";
  if (x >= 5) return "rating-5-6";
  if (x >= 3) return "rating-3-4";
  return "rating-1-2";
}

function fmtOverall(avg, cnt) {
  const c = Number(cnt ?? 0);
  if (!c) return "No votes yet";
  const a = Number(avg ?? 0);
  return `${a.toFixed(2)} / 10 · ${c} vote${c === 1 ? "" : "s"}`;
}

function markerLabel(m) {
  const catName = CAT[String(m.category_id)]?.name || m.category_id || "";
  if (m.group_type === "product") {
    const brandName = BRAND[String(m.brand_id)]?.name || "";
    // product title is category + brand
    return `${catName} · ${brandName}`.trim();
  }
  return m.title || catName;
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

async function initHomePage() {
  // Keyboard shortcuts (desktop)
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingTarget(document.activeElement)) return;

    const k = (e.key || "").toLowerCase();
    if (k === "m") window.location.href = "map.html";
    if (k === "l") window.location.href = "list.html";
    if (k === "p") window.location.href = "products.html";
    if (k === "r") surpriseMe();
  });

  await loadLookups();
  await loadMarkers();

  renderCravingsSplit();
  surpriseMe();
  startHeroRotation();

  // Non-blocking
  loadHeroStat();
  initHomeMap();
  loadRutasPreview();
  loadRankingsPreview();
}

async function loadLookups() {
  // Categories
  const { data: cats, error: catErr } = await sb
    .from("categories")
    .select("id,name,icon_url,is_active,for_places,for_products")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (!catErr && cats) {
    CAT = {};
    cats.forEach(c => { CAT[String(c.id)] = c; });
  }

  // Brands
  const { data: brands, error: bErr } = await sb
    .from("brands")
    .select("id,name,icon_url,is_active")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (!bErr && brands) {
    BRAND = {};
    brands.forEach(b => { BRAND[String(b.id)] = { name: b.name, icon_url: b.icon_url || '' }; });
  }
}

async function loadMarkers() {
  const { data, error } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,brand_id,address,rating_avg,rating_count,is_active,created_at,lat,lon")
    .eq("is_active", true);

  if (error) {
    const st = document.getElementById("spotStatus");
    if (st) st.textContent = "Error loading markers: " + error.message;
    ALL_MARKERS = [];
    return;
  }

  ALL_MARKERS = (data || []).slice();
  // newest for recent
  ALL_MARKERS.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function renderCravingsSplit() {
  const allCats = Object.values(CAT);

  const placeCats = allCats
    .filter(c => c.for_places)
    .sort((a,b) => String(a.name).localeCompare(String(b.name)))
    .slice(0, 5);

  const productCats = allCats
    .filter(c => c.for_products)
    .sort((a,b) => String(a.name).localeCompare(String(b.name)))
    .slice(0, 5);

  renderChipRow("chipRowPlaces", placeCats, "map.html");        // "..." -> map (no filters)
  renderChipRow("chipRowProducts", productCats, "products.html"); // "..." -> products (no filters)
}

function renderChipRow(containerId, cats, moreHref) {
  const row = document.getElementById(containerId);
  if (!row) return;

  if (!cats.length) {
    row.innerHTML = `<span class="muted">No categories yet.</span>`;
    return;
  }

  const chips = cats.map(cat => {
    const iconUrl = normalizeIconUrl(cat.icon_url || "");
    const iconHtml = iconUrl
      ? `<img class="chip-ic" src="${escapeHtml(iconUrl)}" alt="" />`
      : "";
    return `<a class="chip" href="list.html?category=${encodeURIComponent(cat.id)}">${iconHtml}${escapeHtml(cat.name)}</a>`;
  });

  chips.push(`
    <a class="chip chip-more" href="${escapeHtml(moreHref)}" title="Open without filters">
      <span>…</span>
    </a>
  `);

  row.innerHTML = chips.join("");
}

function renderRecent() {
  const wrap = document.getElementById("recentList");
  const status = document.getElementById("recentStatus");
  if (!wrap) return;

  const items = ALL_MARKERS.slice(0, 10);

  if (!items.length) {
    wrap.innerHTML = `
      <div class="empty">
        <div class="empty-emoji">👀</div>
        <div><b>No markers yet.</b></div>
        <div class="muted">Add your first place on the map or your first product in Products.</div>
        <div style="margin-top:10px; display:flex; gap:10px;">
          <a class="tba-btn tba-btn-primary" href="map.html">Open Map</a>
          <a class="tba-btn" href="products.html">Add a Product</a>
        </div>
      </div>
    `;
    if (status) status.textContent = "";
    return;
  }

  if (status) status.textContent = `${items.length} shown`;

  wrap.innerHTML = items.map(m => {
    const cls = colorClassForRating(m.rating_avg, m.rating_count);
    const icon = iconForCategory(m.category_id);
    const over = fmtOverall(m.rating_avg, m.rating_count);
    const tag = m.group_type === "product" ? "product" : "place";

    return `
      <a class="recent-item" href="marker.html?id=${encodeURIComponent(m.id)}">
        <div class="recent-left">
          <div class="mini-marker ${cls}">
            <img src="${escapeHtml(icon)}" alt="" />
          </div>
          <div class="recent-text">
            <div class="recent-title">${escapeHtml(markerLabel(m))}</div>
            <div class="recent-sub muted">${escapeHtml(over)}</div>
          </div>
        </div>
        <div class="recent-tag">${escapeHtml(tag)}</div>
      </a>
    `;
  }).join("");
}

function pickRandomMarker() {
  if (!ALL_MARKERS.length) return null;

  // Prefer items with votes, but allow no-vote items if none have votes
  const withVotes = ALL_MARKERS.filter(m => Number(m.rating_count ?? 0) > 0);
  const pool = withVotes.length ? withVotes : ALL_MARKERS;

  let chosen = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && chosen.id === LAST_SPOT_ID) {
    chosen = pool[Math.floor(Math.random() * pool.length)];
  }
  LAST_SPOT_ID = chosen.id;
  return chosen;
}

async function renderSpotlight(m) {
  const body = document.getElementById("spotBody");
  const sub = document.getElementById("spotSub"); // may not exist in new layout
  const status = document.getElementById("spotStatus");
  if (!body) return;

  if (!m) {
    sub.textContent = "Nothing to surprise you with yet.";
    body.innerHTML = `
      <div class="empty" style="margin-top:10px;">
        <div class="empty-emoji">🎲</div>
        <div><b>Your spotlight is empty.</b></div>
        <div class="muted">Add a place or product and come back for surprises.</div>
      </div>
    `;
    if (status) status.textContent = "";
    return;
  }

  const cls = colorClassForRating(m.rating_avg, m.rating_count);
  const icon = iconForCategory(m.category_id);
  const over = fmtOverall(m.rating_avg, m.rating_count);

  const isPlace = m.group_type === "place";
  const primaryLink = `marker.html?id=${encodeURIComponent(m.id)}`;
  const secondaryLink = isPlace
    ? `map.html?focus=${encodeURIComponent(m.id)}`
    : `products.html`;
  const secondaryLabel = isPlace ? "Open on Map" : "Open Products";

  const line2 = isPlace
    ? (m.address ? `📍 ${m.address}` : "📍 No address yet")
    : `${BRAND[String(m.brand_id)]?.name || "Unknown brand"}`;

  sub.textContent = isPlace ? "Random place from your world." : "Random product from your stash.";

  const quips = ["Again? Respect.", "Ok. One more.", "Chef’s pick.", "Lucky find.", "This one slaps."];
  const quip = quips[Math.floor(Math.random() * quips.length)];

  body.classList.remove("fade-in");
  void body.offsetWidth;
  body.classList.add("fade-in");

  // Category SVG always goes in the coloured circle
  // Brand PNG shown separately below the name for products
  let brandImgHtml = '';
  if (!isPlace && m.brand_id) {
    const bRaw = BRAND[String(m.brand_id)]?.icon_url || '';
    const bUrl = bRaw ? normalizeIconUrl(bRaw) : '';
    if (bUrl) {
      brandImgHtml = `<img class="spot-brand-img" src="${escapeHtml(bUrl)}" alt="${escapeHtml(BRAND[String(m.brand_id)]?.name || '')}" />`;
    }
  }

  // Fetch user's existing vote for this marker
  let myVoteLabel = '★ Vote';
  const user = await maybeUser();
  if (user) {
    const { data: vd } = await sb
      .from('votes')
      .select('vote, is_active')
      .eq('marker_id', m.id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (vd?.is_active && vd?.vote != null) {
      myVoteLabel = `★ My vote: ${vd.vote}`;
    }
  }

  body.innerHTML = `
    <div class="spot-main">
      <div class="spot-icon ${cls}">
        <img src="${escapeHtml(icon)}" alt="" />
      </div>

      <div class="spot-info">
        <div class="spot-name">${escapeHtml(markerLabel(m))}</div>
        ${brandImgHtml}
        <div class="spot-meta muted">${escapeHtml(line2)}</div>

        <div class="spot-badges">
          <span class="badge ${cls}">${escapeHtml(over)}</span>
          <button class="spot-vote-btn tba-btn" id="spotVoteBtn" onclick="openVoteModal('${escapeHtml(m.id)}', '${escapeHtml(markerLabel(m))}')">
            ${escapeHtml(myVoteLabel)}
          </button>
        </div>

        <div class="spot-actions">
          <a class="tba-btn tba-btn-primary" href="${primaryLink}">Open</a>
          <a class="tba-btn" href="${secondaryLink}">${escapeHtml(secondaryLabel)}</a>
        </div>
      </div>
    </div>
  `;

  if (status) status.textContent = "Tip: press R for another surprise.";
}

function surpriseMe() {
  const m = pickRandomMarker();
  renderSpotlight(m);
}

/* ══════════════════════════════
   QUICK VOTE MODAL
══════════════════════════════ */
let VOTE_MODAL_MARKER_ID = null;

async function openVoteModal(markerId, markerName) {
  const user = await maybeUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  VOTE_MODAL_MARKER_ID = markerId;

  // Set title
  document.getElementById('voteModalTitle').textContent = markerName;

  // Load existing vote if any
  const { data } = await sb
    .from('votes')
    .select('vote, is_active')
    .eq('marker_id', markerId)
    .eq('user_id', user.id)
    .maybeSingle();

  const current = (data?.is_active && data?.vote) ? Number(data.vote) : null;

  // Render buttons 1–10
  const wrap = document.getElementById('voteModalBtns');
  wrap.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = 'vote-modal-btn' + (i === current ? ' selected' : '');
    btn.dataset.val = i;
    btn.onclick = () => selectVoteBtn(btn, i);
    wrap.appendChild(btn);
  }

  document.getElementById('voteModalStatus').textContent = current
    ? `Your current vote: ${current}`
    : 'No vote yet — pick a score.';

  document.getElementById('voteModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function selectVoteBtn(btn, val) {
  document.querySelectorAll('.vote-modal-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('voteModalStatus').textContent = `Score: ${val}`;
}

function closeVoteModal() {
  document.getElementById('voteModal').classList.remove('open');
  document.body.style.overflow = '';
  VOTE_MODAL_MARKER_ID = null;
}

async function submitVoteModal() {
  const selected = document.querySelector('.vote-modal-btn.selected');
  if (!selected) {
    document.getElementById('voteModalStatus').textContent = 'Pick a score first.';
    return;
  }

  const score = parseInt(selected.dataset.val);
  const user = await maybeUser();
  if (!user) { window.location.href = 'login.html'; return; }

  document.getElementById('voteModalStatus').textContent = 'Saving…';
  document.getElementById('voteModalSubmit').disabled = true;

  const { error } = await sb
    .from('votes')
    .upsert(
      [{ marker_id: VOTE_MODAL_MARKER_ID, user_id: user.id, vote: score, is_active: true }],
      { onConflict: 'marker_id,user_id' }
    );

  if (error) {
    document.getElementById('voteModalStatus').textContent = 'Error: ' + error.message;
    document.getElementById('voteModalSubmit').disabled = false;
    return;
  }

  document.getElementById('voteModalStatus').textContent = '✅ Vote saved!';
  // Update the vote button label in the spotlight
  const spotBtn = document.getElementById('spotVoteBtn');
  if (spotBtn) spotBtn.textContent = `★ My vote: ${score}`;
  setTimeout(closeVoteModal, 900);
}

/* ══════════════════════════════
   HERO STAT
══════════════════════════════ */
async function loadHeroStat() {
  const { count } = await sb.from("markers").select("id", { count: "exact", head: true })
    .eq("is_active", true).eq("group_type", "place");
  const el = document.getElementById("heroStat");
  if (el && count) el.textContent = `${count}+ places rated in Barcelona & Madrid`;
}

/* ══════════════════════════════
   MAP PREVIEW PINS
══════════════════════════════ */
async function loadMapPreviewPins() {
  const host = document.getElementById("mapPreviewPins");
  if (!host) return;
  // Show top-rated places as floating pins
  const { data } = await sb.from("markers")
    .select("id,category_id,rating_avg,rating_count")
    .eq("is_active", true).eq("group_type", "place")
    .not("rating_avg", "is", null)
    .order("rating_avg", { ascending: false }).limit(6);
  if (!data?.length) return;
  host.innerHTML = data.map(m => {
    const cls = colorClassForRating(m.rating_avg, m.rating_count);
    const icon = iconForCategory(m.category_id);
    return `<div class="map-pin-preview ${cls}"><img src="${escapeHtml(icon)}" alt="" /></div>`;
  }).join("");
}

/* ══════════════════════════════
   RUTAS PREVIEW
══════════════════════════════ */
async function loadRutasPreview() {
  const host = document.getElementById("homeRutasGrid");
  if (!host) return;

  const { data: rutas } = await sb.from("rutas")
    .select("id,name,city,category_id,tier")
    .eq("is_active", true).order("category_id").limit(3);

  if (!rutas?.length) { host.innerHTML = ""; return; }

  // Load user votes for progress
  let myVotes = {};
  const user = await maybeUser();
  if (user) {
    const { data: vd } = await sb.from("votes")
      .select("marker_id,category_id").eq("user_id", user.id).eq("is_active", true);
    (vd || []).forEach(v => { myVotes[`${v.marker_id}__${v.category_id}`] = true; });
  }

  // Load ruta items to know total per ruta
  const rutaIds = rutas.map(r => r.id);
  const { data: allItems } = await sb.from("ruta_items")
    .select("ruta_id,marker_id,markers(is_active)").in("ruta_id", rutaIds).eq("is_active", true);

  const itemsByRuta = {};
  (allItems || []).forEach(ri => {
    if (!itemsByRuta[ri.ruta_id]) itemsByRuta[ri.ruta_id] = [];
    if (ri.markers?.is_active) itemsByRuta[ri.ruta_id].push(ri.marker_id);
  });

  host.innerHTML = rutas.map(ruta => {
    const cat = CAT[String(ruta.category_id)];
    const icon = iconForCategory(ruta.category_id);
    const items = itemsByRuta[ruta.id] || [];
    const total = items.length || 12;
    const voted = user ? items.filter(mid => myVotes[`${mid}__${ruta.category_id}`]).length : 0;
    const pct = total ? Math.round((voted / total) * 100) : 0;
    const cityLabel = ruta.city === "BCN" ? "Barcelona" : "Madrid";
    return `
      <a class="home-ruta-card" href="rutas.html">
        <img class="home-ruta-card-icon" src="${escapeHtml(icon)}" alt="" />
        <div class="home-ruta-card-name">${escapeHtml(cat?.name || ruta.name)}</div>
        <div class="home-ruta-card-city">${escapeHtml(cityLabel)}</div>
        ${user ? `<div class="home-ruta-card-count">${voted}/${total} tried</div>` : ""}
        <div class="home-ruta-card-progress">
          <div class="home-ruta-card-fill" style="width:${pct}%"></div>
        </div>
      </a>`;
  }).join("");
}

/* ══════════════════════════════
   RANKINGS PREVIEW
══════════════════════════════ */
async function loadRankingsPreview() {
  const host = document.getElementById("homeRankingPreview");
  if (!host) return;

  // Get top 3 from any available ranking (pick first category that has data)
  // Get top 3 from the first category that has data
  const { data: allRankings } = await sb.from("rankings")
    .select("position,category_id,markers(id,title,rating_avg,rating_count)")
    .eq("year", 2025).eq("is_active", true)
    .lte("position", 3).order("category_id").order("position");

  if (!allRankings?.length) { host.innerHTML = ""; return; }

  // Pick the category with most entries (most complete)
  const countByCat = {};
  allRankings.forEach(r => { countByCat[r.category_id] = (countByCat[r.category_id] || 0) + 1; });
  const bestCat = Object.entries(countByCat).sort((a,b) => b[1]-a[1])[0][0];
  const rankings = allRankings.filter(r => String(r.category_id) === String(bestCat));

  const crownSrc = pos => {
    if (pos === 1) return "icons/ranking/gold_crown.svg";
    if (pos === 2) return "icons/ranking/silver_crown.svg";
    return "icons/ranking/bronze_crown.svg";
  };

  host.innerHTML = rankings.map(r => {
    const m = r.markers;
    const avg = Number(m?.rating_avg ?? 0);
    const cnt = Number(m?.rating_count ?? 0);
    const cls = colorClassForRating(avg, cnt);
    const score = cnt ? avg.toFixed(1) : "—";
    const cat = CAT[String(r.category_id)];
    const href = `marker.html?id=${encodeURIComponent(m?.id)}&cat=${r.category_id}`;
    const posClass = r.position <= 3 ? `pos-${r.position}` : "";
    return `
      <a class="home-ranking-row" href="${href}">
        <img class="home-ranking-crown" src="${crownSrc(r.position)}" alt="#${r.position}" />
        <div class="home-ranking-info">
          <div class="home-ranking-name">${escapeHtml(m?.title || "")}</div>
          <div class="home-ranking-cat">${escapeHtml(cat?.name || "")}</div>
        </div>
        <span class="home-ranking-score ${cls}">${escapeHtml(score)}</span>
      </a>`;
  }).join("");
}

/* ══════════════════════════════
   ROTATING HERO CATEGORY
══════════════════════════════ */
const ROTATING_CATEGORIES = [
  "Pizza Margherita",
  "Tortilla de Patatas",
  "Patatas Bravas",
  "Cheesecake",
  "Croqueta de Pollo",
  "Tiramisu",
  "Ensaladilla Rusa",
  "Flan",
  "Vermouth",
  "Croissant de Chocolate",
];

let rotatingIdx = 0;

function startHeroRotation() {
  const el = document.getElementById("heroRotating");
  if (!el) return;

  // Optionally enrich with real categories from DB
  const dbCats = Object.values(CAT).filter(c => c.for_places).map(c => c.name);
  const cats = dbCats.length >= 4 ? dbCats : ROTATING_CATEGORIES;

  el.textContent = cats[0];
  el.classList.add("fade-in");

  setInterval(() => {
    el.classList.add("fade-out");
    el.classList.remove("fade-in");
    setTimeout(() => {
      rotatingIdx = (rotatingIdx + 1) % cats.length;
      el.textContent = cats[rotatingIdx];
      el.classList.remove("fade-out");
      el.classList.add("fade-in");
    }, 350);
  }, 2500);
}

/* ══════════════════════════════
   HERO STAT
══════════════════════════════ */
async function loadHeroStat() {
  const el = document.getElementById("heroStat");
  if (!el) return;
  const { count } = await sb.from("markers")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true).eq("group_type", "place");
  if (count) el.textContent = `${count}+ places · Barcelona & Madrid`;
}

/* ══════════════════════════════
   HOME MAP (real Leaflet)
══════════════════════════════ */
let HOME_MAP = null;

async function initHomeMap() {
  const container = document.getElementById("homeMap");
  if (!container) return;

  // Leaflet requires explicit pixel height — set it from the parent's rendered height
  const parent = container.closest(".home-hero-map");
  if (parent) {
    const h = parent.getBoundingClientRect().height;
    if (h > 0) container.style.height = h + "px";
    else container.style.height = window.innerWidth <= 768 ? "220px" : "380px";
  } else {
    container.style.height = window.innerWidth <= 768 ? "220px" : "380px";
  }

  // Init map centred on Barcelona
  HOME_MAP = L.map("homeMap", {
    zoomControl: false,
    scrollWheelZoom: false,
    dragging: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
    attributionControl: false,
  }).setView([41.3888, 2.1589], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
  }).addTo(HOME_MAP);

  // Show top-rated places as markers
  const places = ALL_MARKERS
    .filter(m => m.group_type === "place" && m.lat && m.lon)
    .sort((a, b) => Number(b.rating_avg) - Number(a.rating_avg))
    .slice(0, 80);

  places.forEach(m => {
    const avg = Number(m.rating_avg ?? 0);
    const cnt = Number(m.rating_count ?? 0);
    const cls = colorClassForRating(avg, cnt);
    const icon = iconForCategory(m.category_id);
    const leafIcon = L.divIcon({
      className: `tba-marker ${cls}`,
      html: `<div class="tba-marker-inner"><img src="${escapeHtml(icon)}" alt="" /></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    L.marker([m.lat, m.lon], { icon: leafIcon })
      .addTo(HOME_MAP)
      .on("click", () => { window.location.href = `marker.html?id=${encodeURIComponent(m.id)}`; });
  });

  // Fix map rendering after it becomes visible
  setTimeout(() => HOME_MAP.invalidateSize(), 100);
  setTimeout(() => HOME_MAP.invalidateSize(), 500);
}

/* ══════════════════════════════
   RUTAS PREVIEW
══════════════════════════════ */
async function loadRutasPreview() {
  const host = document.getElementById("homeRutasGrid");
  if (!host) return;

  const { data: rutas } = await sb.from("rutas")
    .select("id,name,city,category_id,tier")
    .eq("is_active", true).order("category_id").limit(3);

  if (!rutas?.length) { host.innerHTML = ""; return; }

  let myVotes = {};
  const user = await maybeUser();
  if (user) {
    const { data: vd } = await sb.from("votes")
      .select("marker_id,category_id").eq("user_id", user.id).eq("is_active", true);
    (vd || []).forEach(v => { myVotes[`${v.marker_id}__${v.category_id}`] = true; });
  }

  const rutaIds = rutas.map(r => r.id);
  const { data: allItems } = await sb.from("ruta_items")
    .select("ruta_id,marker_id,markers(is_active)").in("ruta_id", rutaIds).eq("is_active", true);

  const itemsByRuta = {};
  (allItems || []).forEach(ri => {
    if (!itemsByRuta[ri.ruta_id]) itemsByRuta[ri.ruta_id] = [];
    if (ri.markers?.is_active) itemsByRuta[ri.ruta_id].push(ri.marker_id);
  });

  host.innerHTML = rutas.map(ruta => {
    const cat = CAT[String(ruta.category_id)];
    const icon = normalizeIconUrl(cat?.icon_url || "") || DEFAULT_ICON_URL;
    const items = itemsByRuta[ruta.id] || [];
    const total = items.length || 12;
    const voted = user ? items.filter(mid => myVotes[`${mid}__${ruta.category_id}`]).length : 0;
    const pct = total ? Math.round((voted / total) * 100) : 0;
    const cityLabel = ruta.city === "BCN" ? "Barcelona" : "Madrid";
    return `
      <a class="home-ruta-card" href="rutas.html">
        <img class="home-ruta-icon" src="${escapeHtml(icon)}" alt="" />
        <div class="home-ruta-name">${escapeHtml(cat?.name || ruta.name)}</div>
        <div class="home-ruta-city">${escapeHtml(cityLabel)}</div>
        ${user ? `<div class="home-ruta-count">${voted}/${total} tried</div>` : ""}
        <div class="home-ruta-bar"><div class="home-ruta-fill" style="width:${pct}%"></div></div>
      </a>`;
  }).join("");
}

/* ══════════════════════════════
   RANKINGS PREVIEW
══════════════════════════════ */
async function loadRankingsPreview() {
  const host = document.getElementById("homeRankingPreview");
  if (!host) return;

  // Get all #1 positions across all categories — one winner per category
  // Falls back to top 3 from any category if only one exists
  const { data: allRankings } = await sb.from("rankings")
    .select("position,category_id,markers(id,title,rating_avg,rating_count)")
    .eq("year", 2025).eq("is_active", true)
    .order("position");

  if (!allRankings?.length) { host.innerHTML = ""; return; }

  // Show: one #1 per category, up to 3 categories
  const seenCats = new Set();
  const rankings = [];
  for (const r of allRankings) {
    if (r.position === 1 && !seenCats.has(r.category_id)) {
      seenCats.add(r.category_id);
      rankings.push(r);
      if (rankings.length >= 3) break;
    }
  }
  // If fewer than 3 categories, fill with top-ranked from any category
  if (rankings.length < 3) {
    for (const r of allRankings) {
      if (rankings.length >= 3) break;
      if (!rankings.find(x => x.markers?.id === r.markers?.id)) rankings.push(r);
    }
  }

  const crownSrc = pos => {
    if (pos === 1) return "icons/ranking/gold_crown.svg";
    if (pos === 2) return "icons/ranking/silver_crown.svg";
    return "icons/ranking/bronze_crown.svg";
  };

  host.innerHTML = rankings.map(r => {
    const m = r.markers;
    const avg = Number(m?.rating_avg ?? 0);
    const cnt = Number(m?.rating_count ?? 0);
    const cls = colorClassForRating(avg, cnt);
    const score = cnt ? avg.toFixed(1) : "—";
    const cat = CAT[String(r.category_id)];
    const href = `marker.html?id=${encodeURIComponent(m?.id)}&cat=${r.category_id}`;
    return `
      <a class="home-rank-row" href="${href}">
        <img class="home-rank-crown" src="${escapeHtml(crownSrc(r.position))}" alt="#${r.position}" />
        <div class="home-rank-info">
          <div class="home-rank-name">${escapeHtml(m?.title || "")}</div>
          <div class="home-rank-cat">${escapeHtml(cat?.name || "")}</div>
        </div>
        <span class="home-rank-score ${cls}">${escapeHtml(score)}</span>
      </a>`;
  }).join("");
}
