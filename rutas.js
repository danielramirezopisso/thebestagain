// rutas.js v1 — City → Category → 12-item ruta grid

let SELECTED_CITY = 'BCN';
let SELECTED_CAT_ID = null;
let ALL_RUTAS = [];        // rutas rows for selected city
let RUTA_ITEMS = [];       // ruta_items for selected ruta
let MY_VOTES = {};         // marker_id -> { vote, category_id }
let CATEGORIES_MAP = {};   // id -> category row

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
}

function setStatus(msg) {
  const el = document.getElementById('rutasStatus');
  if (el) el.textContent = msg || '';
}

function colorClassForScore(avg, count) {
  const cnt = Number(count ?? 0);
  if (!cnt || !avg) return 'ruta-score-none';
  const x = Number(avg);
  if (x >= 9) return 'ruta-score-9-10';
  if (x >= 7) return 'ruta-score-7-8';
  if (x >= 5) return 'ruta-score-5-6';
  if (x >= 3) return 'ruta-score-3-4';
  return 'ruta-score-1-2';
}

let CURRENT_USER = null; // track logged in user

/* ══════════════════════════════
   INIT
══════════════════════════════ */
async function initRutasPage() {
  setStatus('Loading…');

  const { data: catData } = await sb
    .from('categories')
    .select('id,name,icon_url,is_active')
    .eq('is_active', true);

  (catData || []).forEach(c => CATEGORIES_MAP[c.id] = c);

  CURRENT_USER = await maybeUser();
  if (CURRENT_USER) await loadMyVotes(CURRENT_USER.id);

  await selectCity('BCN');
  setStatus('');
}

async function loadMyVotes(userId) {
  const { data } = await sb
    .from('votes')
    .select('marker_id, vote, category_id, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);

  MY_VOTES = {};
  (data || []).forEach(v => {
    // key: marker_id + category_id for specificity
    const key = `${v.marker_id}__${v.category_id}`;
    MY_VOTES[key] = v;
  });
}

/* ══════════════════════════════
   CITY SELECTION
══════════════════════════════ */
async function selectCity(city) {
  SELECTED_CITY = city;
  SELECTED_CAT_ID = null;

  // Update city card UI
  document.querySelectorAll('.city-card').forEach(el => el.classList.remove('city-card-active'));
  const btn = document.getElementById(`city${city}`);
  if (btn) btn.classList.add('city-card-active');

  // Load rutas for this city
  const { data, error } = await sb
    .from('rutas')
    .select('id,name,city,category_id,tier,is_active')
    .eq('city', city)
    .eq('is_active', true)
    .order('tier', { ascending: true });

  if (error) { setStatus('Error loading rutas.'); return; }
  ALL_RUTAS = data || [];

  renderCatChips();

  // Show cat section, hide ruta section
  document.getElementById('catSection').style.display = 'block';
  document.getElementById('rutaSection').style.display = 'none';
}

/* ══════════════════════════════
   CATEGORY CHIPS
══════════════════════════════ */
function renderCatChips() {
  const host = document.getElementById('rutasCatChips');
  if (!host) return;

  host.innerHTML = '';

  ALL_RUTAS.forEach(ruta => {
    const cat = CATEGORIES_MAP[ruta.category_id];
    if (!cat) return;

    const btn = document.createElement('button');
    btn.className = 'rutas-cat-chip' + (SELECTED_CAT_ID === ruta.category_id ? ' active' : '');
    btn.onclick = () => selectCategory(ruta.category_id);

    const iconUrl = cat.icon_url || '';
    const absUrl = iconUrl.startsWith('http') ? iconUrl
      : window.location.href.replace(/\/[^/]*(\?.*)?$/, '/') + iconUrl;

    btn.innerHTML = `
      ${iconUrl ? `<img src="${escapeHtml(absUrl)}" alt="" />` : ''}
      <span>${escapeHtml(cat.name)}</span>
    `;
    host.appendChild(btn);
  });
}

/* ══════════════════════════════
   CATEGORY SELECTION → load ruta
══════════════════════════════ */
async function selectCategory(catId) {
  SELECTED_CAT_ID = catId;

  // Update chip UI
  document.querySelectorAll('.rutas-cat-chip').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.rutas-cat-chip').forEach(el => {
    if (el.onclick.toString().includes(catId)) el.classList.add('active');
  });
  renderCatChips(); // re-render chips with active state

  // Find the ruta for this city + category
  const ruta = ALL_RUTAS.find(r => r.category_id === catId);
  if (!ruta) { setStatus('No ruta found for this category.'); return; }

  setStatus('Loading ruta…');

  // Load ruta items with marker data
  const { data, error } = await sb
    .from('ruta_items')
    .select(`
      id, position, is_paid,
      markers (
        id, title, address, rating_avg, rating_count, is_active, category_id
      )
    `)
    .eq('ruta_id', ruta.id)
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (error) { setStatus('Error loading ruta items.'); return; }
  // Keep inactive markers too — we show them as "unavailable"
  RUTA_ITEMS = data || [];

  renderRuta(ruta);
  setStatus('');
}

/* ══════════════════════════════
   RENDER RUTA
══════════════════════════════ */
let ACTIVE_RUTA_CAT_ID = null; // track current ruta's category for vote actions

function renderRuta(ruta) {
  ACTIVE_RUTA_CAT_ID = ruta.category_id;
  const cat = CATEGORIES_MAP[ruta.category_id];
  const section = document.getElementById('rutaSection');
  section.style.display = 'block';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Header
  document.getElementById('rutaHeader').innerHTML = `
    <div class="ruta-header-title">La Selección · ${escapeHtml(cat?.name || '')}</div>
    <div class="ruta-header-sub">${escapeHtml(ruta.city)} · ${RUTA_ITEMS.filter(ri => ri.markers?.is_active).length} curated places</div>
  `;

  // Count voted (active markers only)
  const activeItems = RUTA_ITEMS.filter(ri => ri.markers?.is_active);
  const votedCount = activeItems.filter(ri => {
    const key = `${ri.markers.id}__${ruta.category_id}`;
    return !!MY_VOTES[key];
  }).length;

  const total = activeItems.length;
  const pct = total ? Math.round((votedCount / total) * 100) : 0;

  document.getElementById('rutaProgressFill').style.width = `${pct}%`;
  document.getElementById('rutaProgressLabel').textContent =
    votedCount === total && total > 0
      ? `✅ Ruta complete! You've tried all ${total} places.`
      : `${votedCount} of ${total} tried`;

  // Login prompt if not logged in
  let loginHtml = '';
  if (!CURRENT_USER) {
    loginHtml = `<div class="rutas-login-prompt">
      <a href="login.html">Log in</a> to track your progress and vote directly here.
    </div>`;
  }

  const gridHtml = RUTA_ITEMS.map(ri => renderRutaItem(ri, ruta.category_id)).join('');
  document.getElementById('rutaGrid').innerHTML = loginHtml + gridHtml;
}

/* ══════════════════════════════
   RENDER RUTA ITEM CARD
══════════════════════════════ */
function renderRutaItem(ri, catId) {
  const m = ri.markers;
  if (!m) return '';

  const isInactive = !m.is_active;
  const key = `${m.id}__${catId}`;
  const myVote = MY_VOTES[key];
  const hasVoted = !!myVote;

  const cat = CATEGORIES_MAP[catId];
  const iconUrl = cat?.icon_url || '';
  const absUrl = iconUrl.startsWith('http') ? iconUrl
    : window.location.href.replace(/\/[^/]*(\?.*)?$/, '/') + iconUrl;

  const avg = Number(m.rating_avg ?? 0);
  const cnt = Number(m.rating_count ?? 0);

  const href = `marker.html?id=${encodeURIComponent(m.id)}&cat=${catId}`;

  // ── Inactive marker ──
  if (isInactive) {
    return `
      <div class="ruta-item ruta-item-inactive">
        <div class="ruta-item-num">${ri.position}</div>
        <div class="ruta-item-icon">
          ${iconUrl ? `<img src="${escapeHtml(absUrl)}" alt="" />` : '🍽️'}
        </div>
        <div class="ruta-item-name">${escapeHtml(m.title)}</div>
        <span class="ruta-item-closed">Temporarily closed</span>
      </div>
    `;
  }

  // ── Active marker ──
  const votedClass = hasVoted ? 'ruta-item-voted' : '';
  const checkHtml = hasVoted ? `<div class="ruta-item-check">✓</div>` : '';

  const myScoreHtml = hasVoted
    ? `<span class="ruta-item-score ${colorClassForScore(myVote.vote, 1)}">${Number(myVote.vote).toFixed(0)}</span>`
    : '';

  // Vote chip — only for logged in users who haven't voted yet
  const voteChipHtml = CURRENT_USER && !hasVoted
    ? `<button class="ruta-vote-chip" onclick="toggleRutaVote(event,'${m.id}',${catId})">★ Vote</button>
       <div class="ruta-vote-btns" id="rvb-${m.id}" style="display:none;">
         ${Array.from({length:10},(_,i)=>i+1).map(i =>
           `<button class="ruta-vote-btn" onclick="castRutaVote(event,${i},'${m.id}',${catId})">${i}</button>`
         ).join('')}
       </div>`
    : '';

  return `
    <a class="ruta-item ${votedClass}" href="${href}" id="ri-${m.id}">
      ${checkHtml}
      <div class="ruta-item-num">${ri.position}</div>
      <div class="ruta-item-icon">
        ${iconUrl ? `<img src="${escapeHtml(absUrl)}" alt="" />` : '🍽️'}
      </div>
      <div class="ruta-item-name">${escapeHtml(m.title)}</div>
      ${myScoreHtml}
      ${voteChipHtml}
    </a>
  `;
}

/* ══════════════════════════════
   INLINE VOTE ON RUTA CARD
══════════════════════════════ */
function toggleRutaVote(e, markerId, catId) {
  e.preventDefault();
  e.stopPropagation();

  // Close all other open vote panels first
  document.querySelectorAll('.ruta-vote-btns').forEach(el => {
    if (el.id !== `rvb-${markerId}`) el.style.display = 'none';
  });

  const btns = document.getElementById(`rvb-${markerId}`);
  if (!btns) return;
  btns.style.display = btns.style.display === 'none' ? 'grid' : 'none';
}

async function castRutaVote(e, value, markerId, catId) {
  e.preventDefault();
  e.stopPropagation();

  const user = await maybeUser();
  if (!user) { window.location.href = 'login.html'; return; }

  // Optimistic UI — collapse buttons, show saving state
  const btns = document.getElementById(`rvb-${markerId}`);
  if (btns) btns.style.display = 'none';

  const chip = document.querySelector(`#ri-${markerId} .ruta-vote-chip`);
  if (chip) chip.textContent = 'Saving…';

  const { error } = await sb.from('votes').upsert(
    [{ marker_id: markerId, user_id: user.id, vote: value, category_id: catId, is_active: true }],
    { onConflict: 'marker_id,category_id,user_id' }
  );

  if (error) {
    if (chip) chip.textContent = '★ Vote';
    return;
  }

  // Update local MY_VOTES and re-render just this card
  const key = `${markerId}__${catId}`;
  MY_VOTES[key] = { marker_id: markerId, vote: value, category_id: catId, is_active: true };

  // Find the ruta item and re-render
  const ri = RUTA_ITEMS.find(r => r.markers?.id === markerId);
  if (ri) {
    const card = document.getElementById(`ri-${markerId}`);
    if (card) card.outerHTML = renderRutaItem(ri, catId);
  }

  // Update progress bar
  const ruta = ALL_RUTAS.find(r => r.category_id === catId);
  if (ruta) renderProgress(ruta);
}

function renderProgress(ruta) {
  const activeItems = RUTA_ITEMS.filter(ri => ri.markers?.is_active);
  const votedCount = activeItems.filter(ri => {
    const key = `${ri.markers.id}__${ruta.category_id}`;
    return !!MY_VOTES[key];
  }).length;
  const total = activeItems.length;
  const pct = total ? Math.round((votedCount / total) * 100) : 0;
  const fill = document.getElementById('rutaProgressFill');
  const label = document.getElementById('rutaProgressLabel');
  if (fill) fill.style.width = `${pct}%`;
  if (label) label.textContent = votedCount === total && total > 0
    ? `✅ Ruta complete! You've tried all ${total} places.`
    : `${votedCount} of ${total} tried`;
}

