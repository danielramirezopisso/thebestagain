// battles.js — Tinder-style card stack v2
// Tap LEFT half = vote A (card flies LEFT)
// Tap RIGHT half = vote B (card flies RIGHT)
// Swipe LEFT = vote A, Swipe RIGHT = vote B
// No opinion = valid, stored, never returns
// Change vote = click other option in voted grid

/* ── Visitor ID ── */
function getVisitorId() {
  let vid = localStorage.getItem('tba_visitor_id');
  if (!vid) {
    vid = crypto.randomUUID ? crypto.randomUUID() : 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    localStorage.setItem('tba_visitor_id', vid);
  }
  return vid;
}

/* ── Local vote cache ── */
const VOTED_KEY = 'tba_battle_votes';
function getLocalVotes() {
  try { return JSON.parse(localStorage.getItem(VOTED_KEY) || '{}'); } catch { return {}; }
}
function saveLocalVote(battleId, choice) {
  const v = getLocalVotes(); v[battleId] = choice;
  localStorage.setItem(VOTED_KEY, JSON.stringify(v));
}

/* ── Global state ── */
let ALL_BATTLES  = [];
let TALLY        = {};
let MY_VOTES     = {};
let STACK_IDS    = [];
let IS_ANIMATING = false;
let ACTIVE_SWIPE_CLEANUP = null; // cleanup fn for current swipe listeners

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
async function initBattles() {
  const [battlesRes, votesRes] = await Promise.all([
    sb.from('battles').select('*').eq('is_active', true).order('category_order', { ascending: true }).order('position', { ascending: true }),
    sb.from('battle_votes').select('battle_id, choice')
  ]);

  ALL_BATTLES = battlesRes.data || [];
  const allVotes = votesRes.data || [];

  if (!ALL_BATTLES.length) {
    qsStyle('battlesSkeletonWrap','display','none');
  if (!qs('stackWrap') && !qs('battlesGrid')) return; // incompatible HTML version
    qsStyle('battlesEmpty','display','block');
    return;
  }

  // Global tally
  allVotes.forEach(v => {
    if (!TALLY[v.battle_id]) TALLY[v.battle_id] = { a: 0, b: 0 };
    if (v.choice === 'a' || v.choice === 'b')
      TALLY[v.battle_id][v.choice] = (TALLY[v.battle_id][v.choice] || 0) + 1;
  });

  // This visitor's votes
  const visitorId = getVisitorId();
  const { data: dbVotes } = await sb.from('battle_votes')
    .select('battle_id, choice').eq('visitor_id', visitorId);
  const dbVoteMap = {};
  (dbVotes || []).forEach(v => { dbVoteMap[v.battle_id] = v.choice; });
  MY_VOTES = { ...getLocalVotes(), ...dbVoteMap };

  STACK_IDS = ALL_BATTLES.filter(b => !MY_VOTES[b.id]).map(b => b.id);
  const votedBattles = ALL_BATTLES.filter(b => !!MY_VOTES[b.id]);

  qsStyle('battlesSkeletonWrap','display','none');
  if (!qs('stackWrap') && !qs('battlesGrid')) return; // incompatible HTML version
  updateStats();
  renderStack();

  if (votedBattles.length) {
    qsStyle('battlesDivider','display','flex');
    renderVotedGrid(votedBattles);
  }
}

function updateStats() {
  const pending = STACK_IDS.length;
  const done    = ALL_BATTLES.length - pending;
  const statsEl = qs('battlesStats');
  if (statsEl) {
    statsEl.textContent = `${done} of ${ALL_BATTLES.length} battles voted`;
    statsEl.style.display = done > 0 ? 'block' : 'none';
  }
}


/* ═══════════════════════════════════════
   CARD STACK
═══════════════════════════════════════ */
function renderStack() {
  const wrap = qs('stackWrap');
  if (!wrap) return; // old HTML deployed - skip stack rendering
  wrap.innerHTML = '';
  if (ACTIVE_SWIPE_CLEANUP) { ACTIVE_SWIPE_CLEANUP(); ACTIVE_SWIPE_CLEANUP = null; }

  if (!STACK_IDS.length) {
    qsStyle('stackSection','display','none');
    // battles-all-done hidden via CSS - progress bar is enough
    return;
  }

  qsStyle('stackSection','display','flex');
  qsStyle('battlesAllDone','display','none');

  // Render ALL remaining cards — CSS shows only top 3 visually
  // Cards are ordered: first in DOM = furthest back, last = front
  [...STACK_IDS].reverse().forEach(battleId => {
    const battle = ALL_BATTLES.find(b => b.id === battleId);
    if (battle) wrap.appendChild(buildStackCard(battle));
  });

  attachSwipe(wrap.lastElementChild);
}

function buildStackCard(battle) {
  const card = document.createElement('div');
  card.className = 'stack-card';
  card.dataset.battleId = battle.id;
  const eA = pickEmoji(battle.option_a);
  const eB = pickEmoji(battle.option_b);
  // Image modes:
  // hasBothImages → two half images side by side
  // hasSingleImage → one image spanning full card background
  // no images     → emoji mode
  const hasBothImages   = !!(battle.image_a_url && battle.image_b_url);
  const hasSingleImage  = !!(battle.image_a_url && !battle.image_b_url);
  const hasAnyImage     = hasBothImages || hasSingleImage;

  if (hasSingleImage) {
    // Single shared image — full bleed background, options overlaid at bottom
    card.innerHTML = `
      <div class="vote-indicator vote-indicator-a">A</div>
      <div class="vote-indicator vote-indicator-b">B</div>
      <div class="stack-card-single-img" style="background-image:url('${escapeHtml(battle.image_a_url)}')">
        <div class="stack-single-gradient"></div>
        <div class="stack-single-question">${escapeHtml(battle.question)}</div>
        <div class="stack-single-options">
          <div class="stack-single-opt" onclick="handleTapVote(event,'${battle.id}','a')">
            <div class="stack-single-opt-label">${escapeHtml(battle.option_a)}</div>
            <div class="stack-single-opt-hint">← tap</div>
          </div>
          <div class="stack-single-vs">VS</div>
          <div class="stack-single-opt" onclick="handleTapVote(event,'${battle.id}','b')">
            <div class="stack-single-opt-label">${escapeHtml(battle.option_b)}</div>
            <div class="stack-single-opt-hint">tap →</div>
          </div>
        </div>
      </div>`;
    return card;
  }

  const optA = hasBothImages
    ? `<div class="stack-card-opt stack-card-opt-img" onclick="handleTapVote(event,'${battle.id}','a')"
           style="background-image:url('${escapeHtml(battle.image_a_url)}')">
         <div class="stack-opt-img-overlay"></div>
         <div class="stack-opt-label stack-opt-label-img">${escapeHtml(battle.option_a)}</div>
         <div class="stack-opt-hint stack-opt-hint-img">← tap</div>
       </div>`
    : `<div class="stack-card-opt" onclick="handleTapVote(event,'${battle.id}','a')">
         <div class="stack-opt-label">${escapeHtml(battle.option_a)}</div>
         <div class="stack-opt-hint">← tap</div>
       </div>`;

  const optB = hasBothImages
    ? `<div class="stack-card-opt stack-card-opt-img" onclick="handleTapVote(event,'${battle.id}','b')"
           style="background-image:url('${escapeHtml(battle.image_b_url)}')">
         <div class="stack-opt-img-overlay"></div>
         <div class="stack-opt-label stack-opt-label-img">${escapeHtml(battle.option_b)}</div>
         <div class="stack-opt-hint stack-opt-hint-img">tap →</div>
       </div>`
    : `<div class="stack-card-opt" onclick="handleTapVote(event,'${battle.id}','b')">
         <div class="stack-opt-label">${escapeHtml(battle.option_b)}</div>
         <div class="stack-opt-hint">tap →</div>
       </div>`;

  card.innerHTML = `
    <div class="vote-indicator vote-indicator-a">A</div>
    <div class="vote-indicator vote-indicator-b">B</div>
    ${hasBothImages ? '' : `<div class="stack-card-question">${escapeHtml(battle.question)}</div>`}
    <div class="stack-card-options${hasBothImages ? ' stack-card-options-img' : ''}">
      ${optA}
      <div class="stack-vs-overlay${hasBothImages ? ' stack-vs-overlay-img' : ''}">
        ${hasBothImages ? `<div class="stack-vs-question">${escapeHtml(battle.question)}</div><span>VS</span>` : 'VS'}
      </div>
      ${optB}
    </div>`;
  return card;
}

function handleTapVote(e, battleId, choice) {
  if (IS_ANIMATING) return;
  e.stopPropagation();
  // A is left side → flies left; B is right side → flies right
  voteAndAdvance(battleId, choice, choice === 'a' ? 'fly-left' : 'fly-right');
}

function castNoOpinion() {
  if (IS_ANIMATING || !STACK_IDS.length) return;
  voteAndAdvance(STACK_IDS[0], 'no_opinion', 'fly-up');
}

async function voteAndAdvance(battleId, choice, flyClass) {
  IS_ANIMATING = true;

  // Clean up existing swipe listeners before animating
  if (ACTIVE_SWIPE_CLEANUP) { ACTIVE_SWIPE_CLEANUP(); ACTIVE_SWIPE_CLEANUP = null; }

  const wrap  = qs('stackWrap');
  const front = wrap.lastElementChild;
  if (!front) { IS_ANIMATING = false; return; }

  // Flash indicator
  const indKey = flyClass === 'fly-left' ? '.vote-indicator-a' : flyClass === 'fly-right' ? '.vote-indicator-b' : null;
  if (indKey) { const ind = front.querySelector(indKey); if (ind) ind.style.opacity = '1'; }

  front.classList.add(flyClass);
  setTimeout(() => wrap.classList.add('promoting'), 40);

  setTimeout(async () => {
    front.remove();
    wrap.classList.remove('promoting');

    STACK_IDS.shift();
    MY_VOTES[battleId] = choice;
    saveLocalVote(battleId, choice);

    // Update tally
    if (choice !== 'no_opinion') {
      if (!TALLY[battleId]) TALLY[battleId] = { a: 0, b: 0 };
      TALLY[battleId][choice] = (TALLY[battleId][choice] || 0) + 1;
    }

    updateStats();

    // If more cards remain, attach swipe to new front
    const newFront = wrap.lastElementChild;
    if (newFront) {
      // Re-apply stacking classes since we removed a card
      rebuildStackClasses(wrap);
      attachSwipe(newFront);
    } else {
      qsStyle('stackSection','display','none');
      // battles-all-done hidden via CSS - progress bar is enough
    }

    // Prepend voted card
    const battle = ALL_BATTLES.find(b => b.id === battleId);
    if (battle) {
      const votedCard = buildVotedCard(battle, TALLY[battleId] || { a: 0, b: 0 }, choice);
      const grid = qs('battlesVotedGrid');
      grid.insertBefore(votedCard, grid.firstChild);
      qsStyle('battlesDivider','display','flex');
    }

    IS_ANIMATING = false;

    persistVote(battleId, choice);
    if (typeof gtag !== 'undefined') gtag('event', 'battle_voted', { battle_id: battleId, choice });
  }, 420);
}

function rebuildStackClasses(wrap) {
  // Cards are ordered back→front in DOM, last child = front
  const cards = Array.from(wrap.children);
  const total = cards.length;
  cards.forEach((card, i) => {
    const fromFront = total - 1 - i; // 0 = front, 1 = second, 2 = third...
    card.style.transform = fromFront === 0 ? '' :
                           fromFront === 1 ? 'scale(0.95) translateY(10px)' :
                                             'scale(0.90) translateY(20px)';
    card.style.zIndex = total - fromFront;
    card.style.pointerEvents = fromFront === 0 ? 'auto' : 'none';
    if (fromFront === 0) card.style.boxShadow = '0 12px 40px rgba(26,23,20,0.14)';
    else card.style.boxShadow = 'none';
  });
}

async function persistVote(battleId, choice) {
  const visitorId = getVisitorId();
  const user = await maybeUser();
  const payload = { battle_id: battleId, visitor_id: visitorId, choice };
  if (user) payload.user_id = user.id;
  await sb.from('battle_votes').upsert(payload, {
    onConflict: user ? 'battle_id,user_id' : 'battle_id,visitor_id',
    ignoreDuplicates: false
  });
}

/* ═══════════════════════════════════════
   VOTED CARDS
═══════════════════════════════════════ */
function renderVotedGrid(battles) {
  const grid = qs('battlesVotedGrid');
  if (!grid) return;
  grid.innerHTML = '';
  // Group by category_order then category name
  const groups = {};
  const groupOrder = [];
  battles.forEach(b => {
    const cat = b.category || 'Otros';
    const ord = b.category_order || 99;
    const key = `${String(ord).padStart(3,'0')}_${cat}`;
    if (!groups[key]) { groups[key] = { label: cat, battles: [] }; groupOrder.push(key); }
    groups[key].battles.push(b);
  });
  groupOrder.sort();
  groupOrder.forEach(key => {
    const { label, battles: gBattles } = groups[key];
    // Section divider
    const div = document.createElement('div');
    div.className = 'battles-category-divider';
    div.innerHTML = `<span>${escapeHtml(label)}</span>`;
    grid.appendChild(div);
    // Cards for this group
    const wrap = document.createElement('div');
    wrap.className = 'battles-category-group';
    gBattles.forEach(b => {
      wrap.appendChild(buildVotedCard(b, TALLY[b.id] || { a: 0, b: 0 }, MY_VOTES[b.id]));
    });
    grid.appendChild(wrap);
  });
}

function buildVotedCard(battle, counts, myChoice) {
  const card = document.createElement('div');
  card.className = 'voted-card';
  card.id = 'voted-' + battle.id;

  const total  = (counts.a || 0) + (counts.b || 0);
  const pctA   = total ? Math.round((counts.a / total) * 100) : 50;
  const pctB   = 100 - pctA;
  const leader = pctA > pctB ? 'a' : pctB > pctA ? 'b' : null;

  const hasBoth   = !!(battle.image_a_url && battle.image_b_url);
  const hasSingle = !!(battle.image_a_url && !battle.image_b_url);
  const imgA = hasBoth ? battle.image_a_url : hasSingle ? battle.image_a_url : null;
  const imgB = hasBoth ? battle.image_b_url : hasSingle ? battle.image_a_url : null;

  // Build voted card or no-opinion card
  if (myChoice === 'no_opinion') {
    card.innerHTML = buildNoOpinionCard(battle, imgA, imgB);
  } else {
    card.innerHTML = buildResultCard(battle, pctA, pctB, leader, myChoice, imgA, imgB);
  }
  return card;
}

function buildNoOpinionCard(battle, imgA, imgB) {
  const sideA = imgA
    ? `<div class="vcard-side vcard-side-a" style="background-image:url('${escapeHtml(imgA)}')" onclick="changeVote('${battle.id}','a')">
         <div class="vcard-label">${escapeHtml(battle.option_a)}</div>
       </div>`
    : `<div class="vcard-side vcard-side-a vcard-no-img" onclick="changeVote('${battle.id}','a')">
         <div class="vcard-label">${escapeHtml(battle.option_a)}</div>
       </div>`;
  const sideB = imgB
    ? `<div class="vcard-side vcard-side-b" style="background-image:url('${escapeHtml(imgB)}')" onclick="changeVote('${battle.id}','b')">
         <div class="vcard-label">${escapeHtml(battle.option_b)}</div>
       </div>`
    : `<div class="vcard-side vcard-side-b vcard-no-img" onclick="changeVote('${battle.id}','b')">
         <div class="vcard-label">${escapeHtml(battle.option_b)}</div>
       </div>`;
  return `
    <div class="vcard-question">${escapeHtml(battle.question)}</div>
    <div class="vcard-images">${sideA}${sideB}</div>
    <div class="vcard-nop-hint">Sin opinión — tap to vote</div>
    <div class="vcard-footer">
      <span class="vcard-count">${voteTotalLabel(counts={a:0,b:0}, 'no_opinion')}</span>
      <button class="battle-share-btn" onclick="shareBattle(event,'${battle.id}')">Share ↗</button>
    </div>`;
}

function buildResultCard(battle, pctA, pctB, leader, myChoice, imgA, imgB) {
  const chosenSide = myChoice === 'a' ? 'a' : 'b';
  const dimmedSide = myChoice === 'a' ? 'b' : 'a';

  const sideHtml = (side, img, label, pct) => {
    const isChosen  = side === chosenSide;
    const isLeader  = side === leader;
    const cls = ['vcard-side', `vcard-side-${side}`, isChosen ? 'vcard-chosen' : 'vcard-dimmed'].join(' ');
    const imgHtml = img
      ? `<div class="${cls}" style="background-image:url('${escapeHtml(img)}')" onclick="handleVotedSideClick('${battle.id}','${side}')">
           <div class="vcard-label">${escapeHtml(label)}</div>
         </div>`
      : `<div class="${cls} vcard-no-img" onclick="handleVotedSideClick('${battle.id}','${side}')">
           <div class="vcard-label">${escapeHtml(label)}</div>
         </div>`;
    return imgHtml;
  };

  const htmlA = sideHtml('a', imgA, battle.option_a, pctA);
  const htmlB = sideHtml('b', imgB, battle.option_b, pctB);

  // Result bar: grows from center outward
  // A bar: in left half, width = pctA% of total bar (a-wrap = 50%, bar inside = pctA*2% clamped)
  // But simpler: just use flex where a-wrap width = pctA%, b-wrap = pctB%
  const aLeader = leader === 'a';
  const bLeader = leader === 'b';
  const counts = {a: 0, b: 0}; // dummy for label
  const total = 0;

  return `
    <div class="vcard-question">${escapeHtml(battle.question)}</div>
    <div class="vcard-images">${htmlA}${htmlB}</div>
    <div class="vcard-result">
      <div class="vcard-result-side vcard-result-a${aLeader ? ' vcard-result-winner' : ''}">
        <span class="vcard-result-pct">${pctA}%</span>
        <span class="vcard-result-name">${escapeHtml(battle.option_a)}</span>
      </div>
      <div class="vcard-result-bar">
        <div class="vcard-bar-a-wrap"><div class="vcard-bar-a" style="width:${pctA*2}%"></div></div>
        <div class="vcard-bar-b-wrap"><div class="vcard-bar-b" style="width:${pctB*2}%"></div></div>
      </div>
      <div class="vcard-result-side vcard-result-b${bLeader ? ' vcard-result-winner' : ''}">
        <span class="vcard-result-pct">${pctB}%</span>
        <span class="vcard-result-name">${escapeHtml(battle.option_b)}</span>
      </div>
    </div>
    <div class="vcard-footer">
      <span class="vcard-count">${voteTotalLabel({a: Math.round(pctA), b: Math.round(pctB)}, myChoice)}</span>
      <button class="battle-share-btn" onclick="shareBattle(event,'${battle.id}')">Share ↗</button>
    </div>`;
}

function renderVotedResult() {} // kept for compatibility - unused

// Click chosen side = unvote (back to no_opinion). Click other side = change vote.
async function handleVotedSideClick(battleId, side) {
  const current = MY_VOTES[battleId];
  if (current === side) {
    // Unvote — move back to stack
    await unvote(battleId);
  } else {
    await changeVote(battleId, side);
  }
}

async function unvote(battleId) {
  const oldChoice = MY_VOTES[battleId];
  if (!oldChoice || oldChoice === 'no_opinion') return;

  // Remove from tally
  if (TALLY[battleId] && (oldChoice === 'a' || oldChoice === 'b')) {
    TALLY[battleId][oldChoice] = Math.max(0, (TALLY[battleId][oldChoice] || 0) - 1);
  }

  // Set to no_opinion — stays in voted grid, does NOT go back to stack
  // Stack will only show it again on next page refresh
  MY_VOTES[battleId] = 'no_opinion';
  saveLocalVote(battleId, 'no_opinion');

  // Re-render card in-place as no_opinion state (shows vote buttons)
  const card = qs('voted-' + battleId);
  const battle = ALL_BATTLES.find(b => b.id === battleId);
  if (card && battle) {
    const newCard = buildVotedCard(battle, TALLY[battleId] || { a: 0, b: 0 }, 'no_opinion');
    card.replaceWith(newCard);
  }

  updateStats();
  persistVote(battleId, 'no_opinion');
}


async function changeVote(battleId, newChoice) {
  const oldChoice = MY_VOTES[battleId];
  if (oldChoice === newChoice) return;

  // Optimistic update
  if (oldChoice && oldChoice !== 'no_opinion' && TALLY[battleId]) {
    TALLY[battleId][oldChoice] = Math.max(0, (TALLY[battleId][oldChoice] || 0) - 1);
  }
  if (!TALLY[battleId]) TALLY[battleId] = { a: 0, b: 0 };
  TALLY[battleId][newChoice] = (TALLY[battleId][newChoice] || 0) + 1;

  MY_VOTES[battleId] = newChoice;
  saveLocalVote(battleId, newChoice);

  const battle = ALL_BATTLES.find(b => b.id === battleId);
  const card   = qs('voted-' + battleId);
  if (battle && card) {
    const newCard = buildVotedCard(battle, TALLY[battleId], newChoice);
    card.replaceWith(newCard);
  }

  updateStats();
  persistVote(battleId, newChoice);
  if (typeof gtag !== 'undefined')
    gtag('event', 'battle_vote_changed', { battle_id: battleId, from: oldChoice, to: newChoice });
}

/* ═══════════════════════════════════════
   SWIPE — with proper cleanup
═══════════════════════════════════════ */
function attachSwipe(card) {
  if (!card) return;
  const battleId = card.dataset.battleId;
  if (!battleId) return;

  let startX = 0, startY = 0, dx = 0, dragging = false;
  const THRESHOLD  = 72;
  const ROTATE_MAX = 20;

  function onStart(e) {
    if (IS_ANIMATING) return;
    const pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX; startY = pt.clientY; dx = 0; dragging = true;
    card.classList.add('dragging');
  }

  function onMove(e) {
    if (!dragging || IS_ANIMATING) return;
    const pt = e.touches ? e.touches[0] : e;
    dx = pt.clientX - startX;
    const dy = pt.clientY - startY;
    if (Math.abs(dx) < Math.abs(dy) && Math.abs(dx) < 10) return;
    e.preventDefault();
    const rot = (dx / window.innerWidth) * ROTATE_MAX;
    card.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;

    const indA = card.querySelector('.vote-indicator-a');
    const indB = card.querySelector('.vote-indicator-b');
    // Swipe left = A, swipe right = B
    if (dx < -20) {
      if (indA) indA.style.opacity = Math.min(1, (-dx - 20) / 60) + '';
      if (indB) indB.style.opacity = '0';
    } else if (dx > 20) {
      if (indB) indB.style.opacity = Math.min(1, (dx - 20) / 60) + '';
      if (indA) indA.style.opacity = '0';
    } else {
      if (indA) indA.style.opacity = '0';
      if (indB) indB.style.opacity = '0';
    }
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');
    if (IS_ANIMATING) return;

    if (dx < -THRESHOLD) {
      // Swiped left = choose A
      voteAndAdvance(battleId, 'a', 'fly-left');
    } else if (dx > THRESHOLD) {
      // Swiped right = choose B
      voteAndAdvance(battleId, 'b', 'fly-right');
    } else {
      // Snap back
      card.style.transition = 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)';
      card.style.transform  = '';
      const indA = card.querySelector('.vote-indicator-a');
      const indB = card.querySelector('.vote-indicator-b');
      if (indA) indA.style.opacity = '0';
      if (indB) indB.style.opacity = '0';
      setTimeout(() => { if (card) card.style.transition = ''; }, 360);
    }
    dx = 0;
  }

  card.addEventListener('mousedown',  onStart);
  card.addEventListener('touchstart', onStart, { passive: true });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup',  onEnd);
  window.addEventListener('touchend', onEnd);

  // Return cleanup fn
  ACTIVE_SWIPE_CLEANUP = () => {
    card.removeEventListener('mousedown',  onStart);
    card.removeEventListener('touchstart', onStart);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('mouseup',  onEnd);
    window.removeEventListener('touchend', onEnd);
  };
}

/* ═══════════════════════════════════════
   SHARE
═══════════════════════════════════════ */
async function shareBattle(e, battleId) {
  e.stopPropagation();
  const battle = ALL_BATTLES.find(b => b.id === battleId);
  if (!battle) return;
  if (typeof gtag !== 'undefined')
    gtag('event', 'share_clicked', { content_type: 'battle', battle_id: battleId });
  const myChoice = MY_VOTES[battleId];
  const voted = myChoice === 'a' ? battle.option_a : myChoice === 'b' ? battle.option_b : null;
  const text  = voted
    ? `${battle.question} I voted: ${voted}. What about you? thebestagain.com/battles.html`
    : `${battle.question} thebestagain.com/battles.html`;
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => {
      const btn = e.target;
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Share ↗'; }, 2000); }
    }).catch(() => {});
  }
}

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
function voteTotalLabel(counts, myChoice) {
  // counts.a and counts.b are real vote counts from TALLY
  const total = (counts.a || 0) + (counts.b || 0);
  if (!total || myChoice === 'no_opinion') return 'No votes yet';
  return `${total.toLocaleString()} vote${total !== 1 ? 's' : ''}`;
}

function qs(id) { return document.getElementById(id); }
function qsSet(id, prop, val) { const el = document.getElementById(id); if (el) el[prop] = val; }
function qsStyle(id, prop, val) { const el = document.getElementById(id); if (el) el.style[prop] = val; }

function escapeHtml(s) {
  return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

function pickEmoji(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('cebolla'))                        return '🧅';
  if (l.includes('coca'))                           return '🥤';
  if (l.includes('pepsi'))                          return '🥤';
  if (l.includes('mcdonald'))                       return '🍟';
  if (l.includes('burger king'))                    return '🍔';
  if (l.includes('jamón') || l.includes('jamon'))   return '🥩';
  if (l.includes('croqueta'))                       return '🍘';
  if (l.includes('pollo'))                          return '🍗';
  if (l.includes('churro') || l.includes('porra'))  return '🥐';
  if (l.includes('fanta'))                          return '🍊';
  if (l.includes('kas'))                            return '🍋';
  if (l.includes('piña') || l.includes('pina'))     return '🍍';
  if (l.includes('colacao') || l.includes('cola cao')) return '🍫';
  if (l.includes('nesquick'))                       return '🐰';
  if (l.includes('pepinillo'))                      return '🥒';
  if (l.includes('cerveza'))                        return '🍺';
  if (l.includes('vino'))                           return '🍷';
  if (l.includes('nutella') || l.includes('nocilla')) return '🫙';
  if (l.includes('sí') || l.includes('si '))        return '✅';
  if (l.includes('sin '))                           return '🚫';
  if (l.includes('con '))                           return '✅';
  if (l.includes('dulce'))                          return '🍬';
  if (l.includes('salado'))                         return '🧂';
  return '⚔️';
}
