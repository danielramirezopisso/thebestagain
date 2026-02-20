// home.js — Playful Home: Spotlight Surprise + Recent + Category chips (desktop-first)
// uses sb from auth.js

let ALL_MARKERS = [];
let CAT = {};      // id -> {name, icon_url, for_places, for_products}
let BRAND = {};    // id -> name

let LAST_SPOT_ID = null;

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function colorClassForRating(r, count) {
  const cnt = Number(count ?? 0);
  if (!cnt) return "rating-none"; // no votes -> neutral
  const x = Number(r ?? 0);
  if (x >= 9) return "rating-9-10";
  if (x >= 7) return "rating-7-8";
  if (x >= 5) return "rating-5-6";
  if (x >= 3) return "rating-3-4";
  return "rating-1-2";
}

function normalizeIconUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  try { return new URL(s, window.location.href).toString(); } catch { return ""; }
}

const DEFAULT_ICON_URL = "https://danielramirezopisso.github.io/thebestagain/icons/default.svg";

function iconForCategory(category_id) {
  const c = CAT[String(category_id)];
  const raw = c?.icon_url || "";
  return normalizeIconUrl(raw) || DEFAULT_ICON_URL;
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
    const brandName = BRAND[String(m.brand_id)] || "";
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
  // Keyboard shortcuts
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
  renderChips();
  renderRecent();
  surpriseMe();
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
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (!bErr && brands) {
    BRAND = {};
    brands.forEach(b => { BRAND[String(b.id)] = b.name; });
  }
}

async function loadMarkers() {
  // Keep it simple: fetch active markers (small app, ok to fetch all)
  const { data, error } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,brand_id,address,rating_avg,rating_count,is_active,created_at,lat,lon")
    .eq("is_active", true);

  if (error) {
    document.getElementById("spotStatus").textContent = "Error loading markers: " + error.message;
    ALL_MARKERS = [];
    return;
  }

  ALL_MARKERS = (data || []).slice();
  // sort newest for recent
  ALL_MARKERS.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function renderChips() {
  const row = document.getElementById("chipRow");
  if (!row) return;

  const cats = Object.values(CAT);
  if (!cats.length) {
    row.innerHTML = `<span class="muted">No categories yet.</span>`;
    return;
  }

  row.innerHTML = cats.map(c => {
    const icon = iconForCategory(c.id);
    return `
      <a class="chip" href="list.html?category=${encodeURIComponent(c.id)}" title="View ${escapeHtml(c.name)} in list">
        <img class="chip-ic" src="${escapeHtml(icon)}" alt="" />
        <span>${escapeHtml(c.name)}</span>
      </a>
    `;
  }).join("");
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

  // Prefer items that have votes, but still allow no-vote items sometimes
  const withVotes = ALL_MARKERS.filter(m => Number(m.rating_count ?? 0) > 0);
  const pool = withVotes.length ? withVotes : ALL_MARKERS;

  let chosen = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && chosen.id === LAST_SPOT_ID) {
    chosen = pool[Math.floor(Math.random() * pool.length)];
  }
  LAST_SPOT_ID = chosen.id;
  return chosen;
}

function renderSpotlight(m) {
  const body = document.getElementById("spotBody");
  const sub = document.getElementById("spotSub");
  const status = document.getElementById("spotStatus");

  if (!body || !sub) return;

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
    : `🏷️ ${BRAND[String(m.brand_id)] || "Unknown brand"}`;

  sub.textContent = isPlace ? "A random place from your world." : "A random product from your stash.";

  // little playful messages
  const quips = ["Again? Respect.", "Ok ok, one more.", "This one slaps.", "Chef’s choice.", "Lucky find."];
  const quip = quips[Math.floor(Math.random() * quips.length)];

  body.classList.remove("fade-in");
  void body.offsetWidth; // restart animation
  body.classList.add("fade-in");

  body.innerHTML = `
    <div class="spot-main">
      <div class="spot-icon ${cls}">
        <img src="${escapeHtml(icon)}" alt="" />
      </div>

      <div class="spot-info">
        <div class="spot-name">${escapeHtml(markerLabel(m))}</div>
        <div class="spot-meta muted">${escapeHtml(line2)}</div>

        <div class="spot-badges">
          <span class="badge ${cls}">${escapeHtml(over)}</span>
          <span class="badge badge-ghost">${escapeHtml(quip)}</span>
        </div>

        <div class="spot-actions">
          <a class="tba-btn tba-btn-primary" href="${primaryLink}">Open</a>
          <a class="tba-btn" href="${secondaryLink}">${escapeHtml(secondaryLabel)}</a>
        </div>
      </div>
    </div>
  `;

  if (status) status.textContent = `Tip: press R for another surprise.`;
}

function surpriseMe() {
  const m = pickRandomMarker();
  renderSpotlight(m);
}
