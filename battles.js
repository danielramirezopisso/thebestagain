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
    sb.from('battles').select('*').eq('is_active', true).order('position', { ascending: true }),
    sb.from('battle_votes').select('battle_id, choice')
  ]);

  ALL_BATTLES = battlesRes.data || [];
  const allVotes = votesRes.data || [];

  if (!ALL_BATTLES.length) {
    qs('battlesSkeletonWrap').style.display = 'none';
    qs('battlesEmpty').style.display = 'block';
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

  qs('battlesSkeletonWrap').style.display = 'none';
  updateStats();
  renderStack();

  if (votedBattles.length) {
    qs('battlesDivider').style.display = 'flex';
    const grid = qs('battlesVotedGrid');
    votedBattles.forEach(b => {
      grid.appendChild(buildVotedCard(b, TALLY[b.id] || { a: 0, b: 0 }, MY_VOTES[b.id]));
    });
  }
}

function updateStats() {
  const total   = Object.values(TALLY).reduce((s, t) => s + (t.a || 0) + (t.b || 0), 0);
  const pending = STACK_IDS.length;
  const done    = ALL_BATTLES.length - pending;
  const pct     = ALL_BATTLES.length ? Math.round((done / ALL_BATTLES.length) * 100) : 0;

  qs('statsTotalVotes').textContent = total.toLocaleString();
  qs('statsMyPending').textContent  = pending;
  qs('battlesStats').style.display  = 'block';
  qs('battlesProgress').style.display = 'block';

  // Progress bar
  const bar = qs('progressBar');
  const lbl = qs('progressLabel');
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent = pct === 100 ? 'All voted! 🏆' : `${pct}% voted (${done}/${ALL_BATTLES.length})`;
}

/* ═══════════════════════════════════════
   CARD STACK
═══════════════════════════════════════ */
function renderStack() {
  const wrap = qs('stackWrap');
  wrap.innerHTML = '';
  if (ACTIVE_SWIPE_CLEANUP) { ACTIVE_SWIPE_CLEANUP(); ACTIVE_SWIPE_CLEANUP = null; }

  if (!STACK_IDS.length) {
    qs('stackSection').style.display = 'none';
    qs('battlesAllDone').style.display = 'block';
    return;
  }

  qs('stackSection').style.display = 'flex';
  qs('battlesAllDone').style.display = 'none';

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
  card.innerHTML = `
    <div class="vote-indicator vote-indicator-a">A</div>
    <div class="vote-indicator vote-indicator-b">B</div>
    <div class="stack-card-question">${escapeHtml(battle.question)}</div>
    <div class="stack-card-options">
      <div class="stack-card-opt" onclick="handleTapVote(event,'${battle.id}','a')">
        <div class="stack-opt-emoji">${eA}</div>
        <div class="stack-opt-label">${escapeHtml(battle.option_a)}</div>
        <div class="stack-opt-hint">← tap</div>
      </div>
      <div class="stack-vs-overlay">VS</div>
      <div class="stack-card-opt" onclick="handleTapVote(event,'${battle.id}','b')">
        <div class="stack-opt-emoji">${eB}</div>
        <div class="stack-opt-label">${escapeHtml(battle.option_b)}</div>
        <div class="stack-opt-hint">tap →</div>
      </div>
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
      qs('stackSection').style.display = 'none';
      qs('battlesAllDone').style.display = 'block';
    }

    // Prepend voted card
    const battle = ALL_BATTLES.find(b => b.id === battleId);
    if (battle) {
      const votedCard = buildVotedCard(battle, TALLY[battleId] || { a: 0, b: 0 }, choice);
      const grid = qs('battlesVotedGrid');
      grid.insertBefore(votedCard, grid.firstChild);
      qs('battlesDivider').style.display = 'flex';
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
function buildVotedCard(battle, counts, myChoice) {
  const card = document.createElement('div');
  card.className = 'voted-card';
  card.id = 'voted-' + battle.id;
  card.innerHTML = `
    <div class="voted-card-question">${escapeHtml(battle.question)}</div>
    ${renderVotedResult(battle, counts, myChoice)}
    <div class="voted-card-footer">
      <span class="voted-card-count">${voteTotalLabel(counts, myChoice)}</span>
      <button class="battle-share-btn" onclick="shareBattle(event,'${battle.id}')">Share ↗</button>
    </div>`;
  return card;
}

function renderVotedResult(battle, counts, myChoice) {
  // No opinion → show real options so they can vote
  if (myChoice === 'no_opinion') {
    const eA = pickEmoji(battle.option_a);
    const eB = pickEmoji(battle.option_b);
    return `
      <div class="voted-result no-opinion-vote">
        <div class="no-opinion-label">You had no opinion — vote now?</div>
        <div class="voted-result-opts">
          <button class="voted-nop-btn" onclick="changeVote('${battle.id}','a')">
            <span>${eA}</span> ${escapeHtml(battle.option_a)}
          </button>
          <button class="voted-nop-btn" onclick="changeVote('${battle.id}','b')">
            <span>${eB}</span> ${escapeHtml(battle.option_b)}
          </button>
        </div>
      </div>`;
  }

  const total  = (counts.a || 0) + (counts.b || 0);
  const pctA   = total ? Math.round((counts.a / total) * 100) : 50;
  const pctB   = 100 - pctA;
  const leader = pctA > pctB ? 'a' : pctB > pctA ? 'b' : null;

  const cls = side => ['voted-result-side',
    myChoice === side ? 'my-choice' : '',
    leader === side   ? 'leader'    : ''
  ].filter(Boolean).join(' ');

  return `
    <div class="voted-result">
      <div class="${cls('a')}" onclick="changeVote('${battle.id}','a')">
        <div class="voted-result-bar" style="width:${pctA}%"></div>
        <div class="voted-result-emoji">${pickEmoji(battle.option_a)}</div>
        <div class="voted-result-pct">${pctA}%</div>
        <div class="voted-result-label">${escapeHtml(battle.option_a)}</div>
      </div>
      <div class="${cls('b')}" onclick="changeVote('${battle.id}','b')">
        <div class="voted-result-bar" style="width:${pctB}%"></div>
        <div class="voted-result-emoji">${pickEmoji(battle.option_b)}</div>
        <div class="voted-result-pct">${pctB}%</div>
        <div class="voted-result-label">${escapeHtml(battle.option_b)}</div>
      </div>
    </div>`;
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
    card.replaceWith(buildVotedCard(battle, TALLY[battleId], newChoice));
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
  const total = (counts.a || 0) + (counts.b || 0);
  if (!total && myChoice === 'no_opinion') return 'No votes yet';
  return `${total.toLocaleString()} vote${total !== 1 ? 's' : ''}`;
}

function qs(id) { return document.getElementById(id); }

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
