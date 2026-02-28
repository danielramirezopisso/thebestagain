// votes.js v2 — per-category tables + drag-to-rank edit mode

let MY_VOTES = [];       // raw vote rows from DB
let CAT_BY_ID = {};      // category lookup
let BRAND_BY_ID = {};    // brand lookup

// Edit mode state
let EDIT_CAT_ID = null;  // currently selected category in edit mode
let EDIT_CARDS = [];     // [{vote_id, marker_id, title, pinned: null|number}] ordered top→bottom

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function colorClassForScore(v) {
  const x = Number(v ?? 0);
  if (!x) return "rating-none";
  if (x >= 9) return "rating-9-10";
  if (x >= 7) return "rating-7-8";
  if (x >= 5) return "rating-5-6";
  if (x >= 3) return "rating-3-4";
  return "rating-1-2";
}

function setStatus(msg) {
  document.getElementById("votesStatus").textContent = msg || "";
}

/* ══════════════════════════════
   INIT
══════════════════════════════ */
async function initVotesPage() {
  const user = await requireAuth();
  if (!user) return;

  setStatus("Loading…");

  // Load categories
  const { data: cats } = await sb
    .from("categories")
    .select("id,name,icon_url,for_places,for_products,is_active");
  if (cats) cats.forEach(c => CAT_BY_ID[c.id] = c);

  // Load brands
  const { data: brands } = await sb
    .from("brands")
    .select("id,name");
  if (brands) brands.forEach(b => BRAND_BY_ID[b.id] = b);

  // Load my votes joined to markers
  const { data, error } = await sb
    .from("votes")
    .select(`
      id, vote, updated_at, marker_id, is_active,
      markers (
        id, title, group_type, category_id, brand_id, is_active
      )
    `)
    .eq("is_active", true)
    .order("vote", { ascending: false });

  if (error) { setStatus("Error: " + error.message); return; }

  MY_VOTES = (data || []).filter(v => v.markers && v.markers.is_active);
  setStatus("");
  renderNormalView();
  renderEditCatChips();
}

/* ══════════════════════════════
   NORMAL VIEW — per-category tables
══════════════════════════════ */
function renderNormalView() {
  const wrap = document.getElementById("votesByCategory");

  if (!MY_VOTES.length) {
    wrap.innerHTML = `
      <div style="text-align:center;padding:48px 20px;">
        <div style="font-size:36px;margin-bottom:10px;">🗳️</div>
        <h3 style="margin:0 0 6px;">No votes yet</h3>
        <p class="muted">Open any marker and cast your first vote.</p>
      </div>
    `;
    return;
  }

  // Group by category
  const byCat = {};
  MY_VOTES.forEach(v => {
    const cid = v.markers.category_id;
    if (!byCat[cid]) byCat[cid] = [];
    byCat[cid].push(v);
  });

  // Sort each group high→low
  Object.values(byCat).forEach(arr => arr.sort((a, b) => b.vote - a.vote));

  // Sort categories by their highest vote desc
  const catIds = Object.keys(byCat).map(Number)
    .sort((a, b) => (byCat[b][0]?.vote ?? 0) - (byCat[a][0]?.vote ?? 0));

  wrap.innerHTML = catIds.map(cid => {
    const cat = CAT_BY_ID[cid];
    const votes = byCat[cid];
    const iconHtml = cat?.icon_url
      ? `<div class="cat-block-icon"><img src="${escapeHtml(cat.icon_url)}" alt=""/></div>`
      : `<div class="cat-block-icon">📦</div>`;

    const rows = votes.map((v, i) => {
      const m = v.markers;
      const score = Number(v.vote);
      const cls = colorClassForScore(score);

      let info = "";
      if (m.group_type === "product" && m.brand_id) {
        info = `<span class="muted" style="font-size:12px;"> · ${escapeHtml(BRAND_BY_ID[m.brand_id]?.name || "")}</span>`;
      }

      return `
        <tr onclick="window.location.href='marker.html?id=${encodeURIComponent(m.id)}'">
          <td><span class="rank-badge">${i + 1}</span></td>
          <td><b>${escapeHtml(m.title)}</b>${info}</td>
          <td>
            <span class="score-pill ${cls}">${score.toFixed(1)}</span>
          </td>
        </tr>
      `;
    }).join("");

    return `
      <div class="cat-block">
        <div class="cat-block-head">
          ${iconHtml}
          <span class="cat-block-name">${escapeHtml(cat?.name || "Unknown")}</span>
          <span class="cat-block-count">${votes.length} vote${votes.length === 1 ? "" : "s"}</span>
        </div>
        <table class="votes-table">
          <colgroup>
            <col class="col-rank" />
            <col class="col-title" />
            <col class="col-score" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join("");
}

/* ══════════════════════════════
   EDIT MODE
══════════════════════════════ */
function enterEditMode() {
  document.getElementById("normalView").style.display = "none";
  document.getElementById("editView").style.display = "block";
  EDIT_CAT_ID = null;
  EDIT_CARDS = [];
  document.getElementById("editPanel").style.display = "none";
  updateSaveBtn();
}

function exitEditMode() {
  document.getElementById("normalView").style.display = "block";
  document.getElementById("editView").style.display = "none";
}

/* ── Category chips for edit mode ── */
function renderEditCatChips() {
  const host = document.getElementById("editCatChips");
  host.innerHTML = "";

  // Only categories that have my votes
  const cidsWithVotes = [...new Set(MY_VOTES.map(v => v.markers.category_id))];

  if (!cidsWithVotes.length) {
    host.innerHTML = `<span class="muted">No votes to edit yet.</span>`;
    return;
  }

  cidsWithVotes.forEach(cid => {
    const cat = CAT_BY_ID[cid];
    const btn = document.createElement("button");
    btn.className = "chip" + (EDIT_CAT_ID === cid ? " active" : "");
    btn.onclick = () => selectEditCategory(cid);

    const iconHtml = cat?.icon_url
      ? `<img class="chip-ic" src="${escapeHtml(cat.icon_url)}" alt=""/>`
      : "";
    btn.innerHTML = `${iconHtml}<span>${escapeHtml(cat?.name || String(cid))}</span>`;
    host.appendChild(btn);
  });
}

function selectEditCategory(cid) {
  EDIT_CAT_ID = cid;

  // Rebuild chips to show active state
  renderEditCatChips();

  // Build EDIT_CARDS from votes of this category, sorted high→low
  // Pre-populate pinned values from existing votes
  const votesForCat = MY_VOTES
    .filter(v => v.markers.category_id === cid)
    .sort((a, b) => b.vote - a.vote);

  EDIT_CARDS = votesForCat.map(v => ({
    vote_id:   v.id,
    marker_id: v.markers.id,
    title:     v.markers.title,
    pinned:    v.vote !== null && v.vote !== undefined ? +parseFloat(v.vote).toFixed(1) : null,
  }));

  const cat = CAT_BY_ID[cid];
  document.getElementById("editCatName").textContent = cat?.name || "";
  document.getElementById("editPanel").style.display = "block";

  renderDragList();
  updateSaveBtn();
}

/* ── Distribution logic ── */
function computeScores() {
  // Returns array of computed scores (numbers) same length as EDIT_CARDS
  // Pinned cards are fixed. Unpinned cards between two anchors interpolate linearly.
  const n = EDIT_CARDS.length;
  if (!n) return [];

  const scores = new Array(n).fill(null);

  // Place pinned values
  EDIT_CARDS.forEach((c, i) => {
    if (c.pinned !== null) scores[i] = c.pinned;
  });

  // Find segments between consecutive anchors and interpolate
  // First find all anchor indices
  const anchors = [];
  scores.forEach((s, i) => { if (s !== null) anchors.push(i); });

  if (!anchors.length) return scores.map(() => null);

  // Interpolate between consecutive anchors
  for (let a = 0; a < anchors.length - 1; a++) {
    const i0 = anchors[a];
    const i1 = anchors[a + 1];
    const v0 = scores[i0];
    const v1 = scores[i1];
    const steps = i1 - i0;
    for (let k = 1; k < steps; k++) {
      scores[i0 + k] = +(v0 + (v1 - v0) * (k / steps)).toFixed(1);
    }
  }

  // Extrapolate before first anchor and after last anchor
  // (just fill with the boundary value — user must pin top & bottom anyway)
  const first = anchors[0];
  const last  = anchors[anchors.length - 1];
  for (let i = 0; i < first; i++)  scores[i] = scores[first];
  for (let i = last + 1; i < n; i++) scores[i] = scores[last];

  return scores;
}

function hasValidAnchors() {
  if (!EDIT_CARDS.length) return false;
  const first = EDIT_CARDS[0].pinned;
  const last  = EDIT_CARDS[EDIT_CARDS.length - 1].pinned;
  return first !== null && last !== null;
}

function updateSaveBtn() {
  const btn = document.getElementById("btnSaveVotes");
  const warn = document.getElementById("editWarning");
  const valid = EDIT_CAT_ID !== null && hasValidAnchors();
  btn.disabled = !valid;

  if (EDIT_CAT_ID && EDIT_CARDS.length && !hasValidAnchors()) {
    warn.style.display = "block";
  } else {
    warn.style.display = "none";
  }
}

/* ── Quick helpers ── */
function quickSet10to1() {
  if (!EDIT_CARDS.length) return;
  EDIT_CARDS[0].pinned = 10;
  EDIT_CARDS[EDIT_CARDS.length - 1].pinned = 1;
  renderDragList();
  updateSaveBtn();
}

function resetPins() {
  EDIT_CARDS.forEach(c => c.pinned = null);
  renderDragList();
  updateSaveBtn();
}

/* ── Render drag list ── */
function renderDragList() {
  const scores = computeScores();
  const host = document.getElementById("dragList");
  host.innerHTML = "";

  // Preview bar
  const preview = document.getElementById("editPreview");
  if (hasValidAnchors()) {
    const parts = EDIT_CARDS.map((c, i) => {
      const s = scores[i];
      return `<span style="opacity:${c.pinned !== null ? 1 : 0.65}">${s !== null ? s.toFixed(1) : "?"}</span>`;
    }).join(" → ");
    preview.innerHTML = `Scores preview: ${parts}`;
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }

  EDIT_CARDS.forEach((card, idx) => {
    const score = scores[idx];
    const isPinned = card.pinned !== null;

    const div = document.createElement("div");
    div.className = "drag-card";
    div.draggable = true;
    div.dataset.idx = idx;

    div.innerHTML = `
      <span class="drag-handle">⠿</span>
      <span class="drag-rank">${idx + 1}</span>
      <span class="drag-title">${escapeHtml(card.title)}</span>
      <div class="drag-score-wrap">
        <span class="drag-computed ${isPinned ? "is-pinned" : ""}">
          ${score !== null ? score.toFixed(1) : "—"}
        </span>
        <div>
          <input
            class="pin-input ${isPinned ? "pinned" : ""}"
            type="number"
            min="1" max="10" step="0.1"
            placeholder="pin"
            value="${isPinned ? card.pinned : ""}"
            title="Pin a fixed score for this card"
            oninput="onPinInput(${idx}, this)"
            onclick="event.stopPropagation()"
          />
          <div class="pin-label">${isPinned ? "📌 pinned" : "optional"}</div>
        </div>
      </div>
    `;

    // Drag events
    div.addEventListener("dragstart", onDragStart);
    div.addEventListener("dragover",  onDragOver);
    div.addEventListener("dragleave", onDragLeave);
    div.addEventListener("drop",      onDrop);
    div.addEventListener("dragend",   onDragEnd);

    host.appendChild(div);
  });
}

/* ── Pin input handler ── */
function onPinInput(idx, input) {
  const val = input.value.trim();
  if (val === "") {
    EDIT_CARDS[idx].pinned = null;
  } else {
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 1 && n <= 10) {
      EDIT_CARDS[idx].pinned = +n.toFixed(1);
    } else {
      EDIT_CARDS[idx].pinned = null;
    }
  }
  // Auto-reorder: sort cards by pinned value desc (unpinned cards keep position relative to pinned neighbours)
  autoReorderByPins();
  updateSaveBtn();
}

/* ── Auto-reorder cards by pinned scores (desc) ── */
function autoReorderByPins() {
  // Separate pinned and unpinned
  const pinned   = EDIT_CARDS.filter(c => c.pinned !== null).sort((a, b) => b.pinned - a.pinned);
  const unpinned = EDIT_CARDS.filter(c => c.pinned === null);

  if (!pinned.length) {
    // Nothing pinned — keep current order, just re-render
    renderDragList();
    return;
  }

  // Merge: slot unpinned cards into gaps proportionally
  // Strategy: interleave unpinned evenly between pinned ones
  const total = EDIT_CARDS.length;
  const result = [];
  let unpinnedIdx = 0;
  let pinnedIdx = 0;

  // Simple stable merge: place pinned in sorted order, scatter unpinned in between
  // Ratio: how many unpinned per pinned slot
  const gaps = pinned.length + 1; // slots: before first, between each, after last
  const perGap = Math.floor(unpinned.length / gaps);
  const extra   = unpinned.length % gaps;

  for (let g = 0; g < gaps; g++) {
    // How many unpinned go in this gap
    const count = perGap + (g < extra ? 1 : 0);
    for (let k = 0; k < count; k++) {
      if (unpinnedIdx < unpinned.length) result.push(unpinned[unpinnedIdx++]);
    }
    if (pinnedIdx < pinned.length) result.push(pinned[pinnedIdx++]);
  }

  EDIT_CARDS = result;
  renderDragList();
}

function updateScoreDisplay() {
  const scores = computeScores();
  const cards = document.querySelectorAll(".drag-card");
  const preview = document.getElementById("editPreview");

  cards.forEach((div, idx) => {
    const score = scores[idx];
    const isPinned = EDIT_CARDS[idx].pinned !== null;
    const computed = div.querySelector(".drag-computed");
    if (computed) {
      computed.textContent = score !== null ? score.toFixed(1) : "—";
      computed.className = `drag-computed ${isPinned ? "is-pinned" : ""}`;
    }
    const inp = div.querySelector(".pin-input");
    if (inp) {
      inp.className = `pin-input ${isPinned ? "pinned" : ""}`;
      const lbl = inp.nextElementSibling;
      if (lbl) lbl.textContent = isPinned ? "📌 pinned" : "optional";
    }
  });

  if (hasValidAnchors()) {
    const parts = EDIT_CARDS.map((c, i) => {
      const s = scores[i];
      return `<span style="opacity:${c.pinned !== null ? 1 : 0.65}">${s !== null ? s.toFixed(1) : "?"}</span>`;
    }).join(" → ");
    preview.innerHTML = `Scores preview: ${parts}`;
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }
}

/* ── Drag & drop ── */
let dragSrcIdx = null;

function onDragStart(e) {
  dragSrcIdx = parseInt(e.currentTarget.dataset.idx);
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}

function onDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

function onDrop(e) {
  e.preventDefault();
  const targetIdx = parseInt(e.currentTarget.dataset.idx);
  e.currentTarget.classList.remove("drag-over");

  if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;

  // Move card and UNPIN it (dragging unpins)
  const moved = EDIT_CARDS.splice(dragSrcIdx, 1)[0];
  moved.pinned = null;  // dragging unpins the card
  EDIT_CARDS.splice(targetIdx, 0, moved);

  dragSrcIdx = null;
  renderDragList();
  updateSaveBtn();
}

function onDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".drag-card").forEach(c => c.classList.remove("drag-over"));
  dragSrcIdx = null;
}

/* ══════════════════════════════
   SAVE
══════════════════════════════ */
async function saveVotes() {
  if (!hasValidAnchors()) return;

  const btn = document.getElementById("btnSaveVotes");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const scores = computeScores();

  // Safety check: all scores must be valid numbers
  const hasNulls = scores.some(s => s === null || s === undefined || isNaN(s));
  if (hasNulls) {
    alert("Some scores could not be computed. Make sure top and bottom are pinned.");
    btn.disabled = false;
    btn.textContent = "Save";
    return;
  }

  // Update all votes one by one
  const errors = [];
  for (let i = 0; i < EDIT_CARDS.length; i++) {
    const score = +parseFloat(scores[i]).toFixed(1);
    const { error } = await sb
      .from("votes")
      .update({ vote: score, is_active: true })
      .eq("id", EDIT_CARDS[i].vote_id);
    if (error) errors.push(`${EDIT_CARDS[i].title}: ${error.message}`);
  }

  if (errors.length) {
    alert("Some votes failed to save:\n" + errors.join("\n"));
  } else {
    btn.textContent = "Saved ✅";
  }

  // Reload data and go back to normal view
  await reloadVotes();
  exitEditMode();
}

async function reloadVotes() {
  const { data: cats } = await sb.from("categories").select("id,name,icon_url,for_places,for_products,is_active");
  if (cats) cats.forEach(c => CAT_BY_ID[c.id] = c);

  const { data: brands } = await sb.from("brands").select("id,name");
  if (brands) brands.forEach(b => BRAND_BY_ID[b.id] = b);

  const { data, error } = await sb
    .from("votes")
    .select(`id, vote, updated_at, marker_id, is_active, markers (id, title, group_type, category_id, brand_id, is_active)`)
    .eq("is_active", true)
    .order("vote", { ascending: false });

  if (!error) {
    MY_VOTES = (data || []).filter(v => v.markers && v.markers.is_active);
    renderNormalView();
    renderEditCatChips();
    updateSaveBtn();
  }
}
