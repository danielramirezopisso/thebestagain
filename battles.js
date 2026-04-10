// battles.js — Tinder-style card stack
// Swipe right = A, swipe left = B
// Tap left half = A, tap right half = B
// No opinion = valid answer, stored, never returns
// Change vote = click directly on the other option in voted grid

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
const VOTED_KEY = 'tba_battle_votes'; // { battleId: 'a'|'b'|'no_opinion' }

function getLocalVotes() {
  try { return JSON.parse(localStorage.getItem(VOTED_KEY) || '{}'); } catch { return {}; }
}

function saveLocalVote(battleId, choice) {
  const v = getLocalVotes();
  v[battleId] = choice;
  localStorage.setItem(VOTED_KEY, JSON.stringify(v));
}

/* ── Global state ── */
let ALL_BATTLES  = [];
let TALLY        = {};  // { battleId: { a: N, b: N } }
let MY_VOTES     = {};  // { battleId: 'a'|'b'|'no_opinion' }
let STACK_IDS    = [];  // unvoted battle IDs in order
let IS_ANIMATING = false;

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

  // Global tally (no_opinion not counted in A/B totals)
  allVotes.forEach(v => {
    if (!TALLY[v.battle_id]) TALLY[v.battle_id] = { a: 0, b: 0 };
    if (v.choice === 'a' || v.choice === 'b') {
      TALLY[v.battle_id][v.choice] = (TALLY[v.battle_id][v.choice] || 0) + 1;
    }
  });

  // This visitor's votes
  const visitorId = getVisitorId();
  const { data: dbVotes } = await sb.from('battle_votes')
    .select('battle_id, choice').eq('visitor_id', visitorId);
  const dbVoteMap = {};
  (dbVotes || []).forEach(v => { dbVoteMap[v.battle_id] = v.choice; });
  MY_VOTES = { ...getLocalVotes(), ...dbVoteMap };

  // Split
  STACK_IDS = ALL_BATTLES.filter(b => !MY_VOTES[b.id]).map(b => b.id);
  const votedBattles = ALL_BATTLES.filter(b => !!MY_VOTES[b.id]);

  // Stats
  const totalVotes = allVotes.filter(v => v.choice !== 'no_opinion').length;
  qs('statsTotalVotes').textContent = totalVotes.toLocaleString();
  qs('statsMyPending').textContent  = STACK_IDS.length;
  qs('battlesStats').style.display  = 'block';

  qs('battlesSkeletonWrap').style.display = 'none';

  renderStack();

  if (votedBattles.length) {
    qs('battlesDivider').style.display = 'flex';
    const grid = qs('battlesVotedGrid');
    votedBattles.forEach(b => {
      grid.appendChild(buildVotedCard(b, TALLY[b.id] || { a: 0, b: 0 }, MY_VOTES[b.id]));
    });
  }
}

/* ═══════════════════════════════════════
   CARD STACK
═══════════════════════════════════════ */

function renderStack() {
  const wrap = qs('stackWrap');
  wrap.innerHTML = '';

  if (!STACK_IDS.length) {
    qs('stackSection').style.display = 'none';
    qs('battlesAllDone').style.display = 'block';
    return;
  }

  qs('stackSection').style.display = 'flex';
  qs('battlesAllDone').style.display = 'none';

  // Render up to 3 — reversed so front card is last child (on top via z-index)
  const toRender = STACK_IDS.slice(0, 3).reverse();
  toRender.forEach(battleId => {
    const battle = ALL_BATTLES.find(b => b.id === battleId);
    if (battle) wrap.appendChild(buildStackCard(battle));
  });

  // Attach swipe to front (last child)
  attachSwipe(wrap.lastElementChild);
}

function buildStackCard(battle) {
  const card = document.createElement('div');
  card.className = 'stack-card';
  card.dataset.battleId = battle.id;

  const emojiA = pickEmoji(battle.option_a);
  const emojiB = pickEmoji(battle.option_b);

  card.innerHTML = `
    <div class="vote-indicator vote-indicator-a">A</div>
    <div class="vote-indicator vote-indicator-b">B</div>
    <div class="stack-card-question">${escapeHtml(battle.question)}</div>
    <div class="stack-card-options">
      <div class="stack-card-option tap-a" onclick="handleTapVote(event,'${battle.id}','a')">
        <div class="stack-option-emoji">${emojiA}</div>
        <div class="stack-option-label">${escapeHtml(battle.option_a)}</div>
        <div class="stack-option-sublabel">tap to vote</div>
      </div>
      <div class="stack-vs-divider">VS</div>
      <div class="stack-card-option tap-b" onclick="handleTapVote(event,'${battle.id}','b')">
        <div class="stack-option-emoji">${emojiB}</div>
        <div class="stack-option-label">${escapeHtml(battle.option_b)}</div>
        <div class="stack-option-sublabel">tap to vote</div>
      </div>
    </div>
  `;

  return card;
}

function handleTapVote(e, battleId, choice) {
  if (IS_ANIMATING) return;
  e.stopPropagation();
  voteAndAdvance(battleId, choice, choice === 'a' ? 'fly-right' : 'fly-left');
}

function castNoOpinion() {
  if (IS_ANIMATING || !STACK_IDS.length) return;
  voteAndAdvance(STACK_IDS[0], 'no_opinion', 'fly-up');
}

/* ── Animate card off + update state ── */
async function voteAndAdvance(battleId, choice, flyClass) {
  IS_ANIMATING = true;
  const wrap  = qs('stackWrap');
  const front = wrap.lastElementChild;
  if (!front) { IS_ANIMATING = false; return; }

  // Flash indicator
  if (flyClass === 'fly-right') {
    const ind = front.querySelector('.vote-indicator-a');
    if (ind) ind.style.opacity = '1';
  } else if (flyClass === 'fly-left') {
    const ind = front.querySelector('.vote-indicator-b');
    if (ind) ind.style.opacity = '1';
  }

  // Trigger fly animation
  front.classList.add(flyClass);

  // Promote cards behind
  setTimeout(() => wrap.classList.add('promoting'), 50);

  setTimeout(async () => {
    front.remove();
    wrap.classList.remove('promoting');

    STACK_IDS.shift();
    MY_VOTES[battleId] = choice;
    saveLocalVote(battleId, choice);

    qs('statsMyPending').textContent = STACK_IDS.length;

    const newFront = wrap.lastElementChild;
    if (newFront) attachSwipe(newFront);

    if (!STACK_IDS.length) {
      qs('stackSection').style.display = 'none';
      qs('battlesAllDone').style.display = 'block';
    }

    // Update tally
    const battle = ALL_BATTLES.find(b => b.id === battleId);
    if (choice !== 'no_opinion') {
      if (!TALLY[battleId]) TALLY[battleId] = { a: 0, b: 0 };
      TALLY[battleId][choice] = (TALLY[battleId][choice] || 0) + 1;
      const cur = parseInt(qs('statsTotalVotes').textContent.replace(/,/g, '')) || 0;
      qs('statsTotalVotes').textContent = (cur + 1).toLocaleString();
    }

    // Prepend voted card
    if (battle) {
      const votedCard = buildVotedCard(battle, TALLY[battleId] || { a: 0, b: 0 }, choice);
      const grid = qs('battlesVotedGrid');
      grid.insertBefore(votedCard, grid.firstChild);
      qs('battlesDivider').style.display = 'flex';
    }

    IS_ANIMATING = false;

    // Fire & forget DB write
    persistVote(battleId, choice);
    if (typeof gtag !== 'undefined') gtag('event', 'battle_voted', { battle_id: battleId, choice });
  }, 400);
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
    </div>
  `;
  return card;
}

function renderVotedResult(battle, counts, myChoice) {
  // No opinion case
  if (myChoice === 'no_opinion') {
    const total = (counts.a || 0) + (counts.b || 0);
    const pctA  = total ? Math.round((counts.a / total) * 100) : 50;
    const pctB  = 100 - pctA;
    return `
      <div class="voted-card-result no-opinion-result">
        <div class="voted-result-side no-opinion-side my-choice">
          <div class="voted-result-pct">No opinion</div>
          <div class="voted-result-label" style="font-size:11px;color:var(--muted);margin-top:4px;">
            ${escapeHtml(battle.option_a)} ${pctA}% &nbsp;·&nbsp; ${escapeHtml(battle.option_b)} ${pctB}%
          </div>
        </div>
      </div>`;
  }

  const total  = (counts.a || 0) + (counts.b || 0);
  const pctA   = total ? Math.round((counts.a / total) * 100) : 50;
  const pctB   = 100 - pctA;
  const leader = pctA > pctB ? 'a' : pctB > pctA ? 'b' : null;

  const cls = (side) => [
    'voted-result-side',
    myChoice === side ? 'my-choice' : '',
    leader === side   ? 'leader'    : ''
  ].filter(Boolean).join(' ');

  return `
    <div class="voted-card-result">
      <div class="${cls('a')}"
           onclick="changeVote('${battle.id}','a')"
           title="${myChoice !== 'a' ? 'Change to ' + escapeHtml(battle.option_a) : ''}">
        <div class="voted-result-bar" style="width:${pctA}%"></div>
        <div class="voted-result-emoji">${pickEmoji(battle.option_a)}</div>
        <div class="voted-result-pct">${pctA}%</div>
        <div class="voted-result-label">${escapeHtml(battle.option_a)}</div>
      </div>
      <div class="${cls('b')}"
           onclick="changeVote('${battle.id}','b')"
           title="${myChoice !== 'b' ? 'Change to ' + escapeHtml(battle.option_b) : ''}">
        <div class="voted-result-bar" style="width:${pctB}%"></div>
        <div class="voted-result-emoji">${pickEmoji(battle.option_b)}</div>
        <div class="voted-result-pct">${pctB}%</div>
        <div class="voted-result-label">${escapeHtml(battle.option_b)}</div>
      </div>
    </div>`;
}

async function changeVote(battleId, newChoice) {
  const oldChoice = MY_VOTES[battleId];
  if (!oldChoice || oldChoice === newChoice || oldChoice === 'no_opinion') return;

  // Optimistic tally update
  if (TALLY[battleId]) {
    if (oldChoice === 'a' || oldChoice === 'b')
      TALLY[battleId][oldChoice] = Math.max(0, (TALLY[battleId][oldChoice] || 0) - 1);
    TALLY[battleId][newChoice] = (TALLY[battleId][newChoice] || 0) + 1;
  }

  MY_VOTES[battleId] = newChoice;
  saveLocalVote(battleId, newChoice);

  const battle = ALL_BATTLES.find(b => b.id === battleId);
  const card   = qs('voted-' + battleId);
  if (battle && card) {
    card.replaceWith(buildVotedCard(battle, TALLY[battleId] || { a: 0, b: 0 }, newChoice));
  }

  persistVote(battleId, newChoice);
  if (typeof gtag !== 'undefined')
    gtag('event', 'battle_vote_changed', { battle_id: battleId, from: oldChoice, to: newChoice });
}

/* ═══════════════════════════════════════
   SWIPE GESTURE
═══════════════════════════════════════ */

function attachSwipe(card) {
  if (!card) return;
  const battleId = card.dataset.battleId;
  if (!battleId) return;

  let startX = 0, startY = 0, dx = 0, dragging = false;
  const THRESHOLD  = 80;
  const ROTATE_MAX = 18;

  function onStart(e) {
    if (IS_ANIMATING) return;
    const pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX; startY = pt.clientY; dx = 0;
    dragging = true;
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
    if (dx > 20) {
      if (indA) indA.style.opacity = Math.min(1, (dx - 20) / 60) + '';
      if (indB) indB.style.opacity = '0';
    } else if (dx < -20) {
      if (indB) indB.style.opacity = Math.min(1, (-dx - 20) / 60) + '';
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

    if (dx > THRESHOLD) {
      voteAndAdvance(battleId, 'a', 'fly-right');
    } else if (dx < -THRESHOLD) {
      voteAndAdvance(battleId, 'b', 'fly-left');
    } else {
      // Snap back
      card.style.transition = 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)';
      card.style.transform  = '';
      const indA = card.querySelector('.vote-indicator-a');
      const indB = card.querySelector('.vote-indicator-b');
      if (indA) indA.style.opacity = '0';
      if (indB) indB.style.opacity = '0';
      setTimeout(() => { card.style.transition = ''; }, 360);
    }
    dx = 0;
  }

  card.addEventListener('mousedown',  onStart);
  card.addEventListener('touchstart', onStart, { passive: true });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup',  onEnd);
  window.addEventListener('touchend', onEnd);
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
  if (!total && myChoice === 'no_opinion') return 'You skipped this one';
  return `${total.toLocaleString()} vote${total !== 1 ? 's' : ''}`;
}

function qs(id) { return document.getElementById(id); }

function escapeHtml(s) {
  return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

function pickEmoji(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('cebolla'))                       return '🧅';
  if (l.includes('coca'))                          return '🥤';
  if (l.includes('pepsi'))                         return '🥤';
  if (l.includes('mcdonald'))                      return '🍟';
  if (l.includes('burger king'))                   return '🍔';
  if (l.includes('jamón') || l.includes('jamon'))  return '🥩';
  if (l.includes('croqueta'))                      return '🍘';
  if (l.includes('pollo'))                         return '🍗';
  if (l.includes('churro') || l.includes('porra')) return '🥐';
  if (l.includes('fanta'))                         return '🍊';
  if (l.includes('kas'))                           return '🍋';
  if (l.includes('piña') || l.includes('pina'))    return '🍍';
  if (l.includes('colacao') || l.includes('cola cao')) return '🍫';
  if (l.includes('nesquick'))                      return '🐰';
  if (l.includes('pepinillo'))                     return '🥒';
  if (l.includes('cerveza'))                       return '🍺';
  if (l.includes('vino'))                          return '🍷';
  if (l.includes('nutella') || l.includes('nocilla')) return '🫙';
  if (l.includes('sí') || l.includes('si '))       return '✅';
  if (l.includes('sin '))                          return '🚫';
  if (l.includes('con '))                          return '✅';
  if (l.includes('dulce'))                         return '🍬';
  if (l.includes('salado'))                        return '🧂';
  return '⚔️';
}
