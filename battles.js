// battles.js — Battle voting page
// Anonymous via visitor_id (localStorage UUID), logged-in via user_id

/* ── Visitor ID ── */
function getVisitorId() {
  let vid = localStorage.getItem('tba_visitor_id');
  if (!vid) {
    vid = crypto.randomUUID ? crypto.randomUUID() : 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    localStorage.setItem('tba_visitor_id', vid);
  }
  return vid;
}

/* ── Voted cache (localStorage) ── */
const VOTED_KEY = 'tba_battle_votes'; // { battleId: 'a'|'b' }

function getLocalVotes() {
  try { return JSON.parse(localStorage.getItem(VOTED_KEY) || '{}'); } catch { return {}; }
}

function saveLocalVote(battleId, choice) {
  const v = getLocalVotes();
  v[battleId] = choice;
  localStorage.setItem(VOTED_KEY, JSON.stringify(v));
}

/* ── Main init ── */
async function initBattles() {
  const grid = document.getElementById('battlesGrid');
  const empty = document.getElementById('battlesEmpty');

  // Fetch battles + vote counts in parallel
  const [battlesRes, votesRes] = await Promise.all([
    sb.from('battles')
      .select('*')
      .eq('is_active', true)
      .order('position', { ascending: true }),
    sb.from('battle_votes')
      .select('battle_id, choice')
  ]);

  const battles = battlesRes.data || [];
  const allVotes = votesRes.data || [];

  if (!battles.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  // Tally votes per battle
  const tally = {}; // { battleId: { a: N, b: N } }
  allVotes.forEach(v => {
    if (!tally[v.battle_id]) tally[v.battle_id] = { a: 0, b: 0 };
    tally[v.battle_id][v.choice] = (tally[v.battle_id][v.choice] || 0) + 1;
  });

  // What has this visitor already voted?
  const localVotes = getLocalVotes();
  const visitorId  = getVisitorId();

  // Also check DB votes for this visitor (handles cross-device edge case)
  const { data: dbVisitorVotes } = await sb
    .from('battle_votes')
    .select('battle_id, choice')
    .eq('visitor_id', visitorId);

  const dbVoteMap = {}; // { battleId: choice }
  (dbVisitorVotes || []).forEach(v => { dbVoteMap[v.battle_id] = v.choice; });

  // Merge: DB takes priority over localStorage
  const myVotes = { ...localVotes, ...dbVoteMap };

  // Update stats bar
  const totalVotes = allVotes.length;
  document.getElementById('statsTotalVotes').textContent = totalVotes.toLocaleString();
  document.getElementById('statsTotalBattles').textContent = battles.length;
  document.getElementById('battlesStats').style.display = 'block';

  // Render cards
  grid.innerHTML = '';
  battles.forEach(battle => {
    const counts = tally[battle.id] || { a: 0, b: 0 };
    const myChoice = myVotes[battle.id] || null;
    const card = buildCard(battle, counts, myChoice);
    grid.appendChild(card);
  });
}

/* ── Build a battle card ── */
function buildCard(battle, counts, myChoice) {
  const card = document.createElement('div');
  card.className = 'battle-card' + (myChoice ? ' voted' : '');
  card.id = 'battle-' + battle.id;

  const emojiA = pickEmoji(battle.option_a);
  const emojiB = pickEmoji(battle.option_b);

  card.innerHTML = `
    <div class="battle-question">${escapeHtml(battle.question)}</div>
    <div class="battle-vs-row">
      <button class="battle-option ${myChoice === 'a' ? 'chosen-option' : ''} ${myChoice && leadingOption(counts) === 'a' ? 'winner-option' : ''}"
              onclick="castVote('${battle.id}', 'a', this)"
              data-side="a">
        <span class="battle-option-emoji">${emojiA}</span>
        <span class="battle-option-label">${escapeHtml(battle.option_a)}</span>
      </button>
      <div class="battle-vs-divider">VS</div>
      <button class="battle-option ${myChoice === 'b' ? 'chosen-option' : ''} ${myChoice && leadingOption(counts) === 'b' ? 'winner-option' : ''}"
              onclick="castVote('${battle.id}', 'b', this)"
              data-side="b">
        <span class="battle-option-emoji">${emojiB}</span>
        <span class="battle-option-label">${escapeHtml(battle.option_b)}</span>
      </button>
    </div>
    ${myChoice ? renderResults(battle, counts) : ''}
  `;

  return card;
}

/* ── Render results (bars) ── */
function renderResults(battle, counts) {
  const total = (counts.a || 0) + (counts.b || 0);
  const pctA  = total ? Math.round((counts.a / total) * 100) : 50;
  const pctB  = total ? Math.round((counts.b / total) * 100) : 50;
  const leader = leadingOption(counts);

  return `
    <div class="battle-results">
      <div class="battle-result-row">
        <span class="battle-result-label" title="${escapeHtml(battle.option_a)}">${escapeHtml(battle.option_a)}</span>
        <div class="battle-result-bar-wrap">
          <div class="battle-result-bar bar-a" style="width:${pctA}%"></div>
        </div>
        <span class="battle-result-pct ${leader === 'a' ? 'pct-winner' : ''}">${pctA}%</span>
      </div>
      <div class="battle-result-row">
        <span class="battle-result-label" title="${escapeHtml(battle.option_b)}">${escapeHtml(battle.option_b)}</span>
        <div class="battle-result-bar-wrap">
          <div class="battle-result-bar bar-b" style="width:${pctB}%"></div>
        </div>
        <span class="battle-result-pct ${leader === 'b' ? 'pct-winner' : ''}">${pctB}%</span>
      </div>
    </div>
    <div class="battle-vote-count">
      <span>${total.toLocaleString()} vote${total !== 1 ? 's' : ''}</span>
      <button class="battle-share-btn" onclick="shareBattle(event, '${battle.id}')">
        Share ↗
      </button>
    </div>
  `;
}

/* ── Cast a vote ── */
async function castVote(battleId, choice, btnEl) {
  const card = document.getElementById('battle-' + battleId);
  if (!card || card.classList.contains('voted')) return;

  // Optimistic lock — mark voted immediately
  card.classList.add('voted');

  const visitorId = getVisitorId();
  const user = await maybeUser();

  // Build insert payload — only set user_id if logged in
  const payload = {
    battle_id:  battleId,
    visitor_id: visitorId,
    choice:     choice
  };
  if (user) payload.user_id = user.id;

  const { error } = await sb.from('battle_votes').insert(payload);

  if (error) {
    // Already voted (unique constraint) — just reflect it visually
    // Don't revert the card, we still want to show results
    console.warn('Vote insert error (possibly duplicate):', error.message);
  }

  // Save locally regardless
  saveLocalVote(battleId, choice);

  // Fetch updated counts for this battle
  const { data: votes } = await sb
    .from('battle_votes')
    .select('choice')
    .eq('battle_id', battleId);

  const counts = { a: 0, b: 0 };
  (votes || []).forEach(v => { counts[v.choice] = (counts[v.choice] || 0) + 1; });

  // Fetch battle data for option labels
  const { data: battle } = await sb
    .from('battles')
    .select('*')
    .eq('id', battleId)
    .single();

  if (!battle) return;

  // Re-render options with winner class + append results
  const vsRow = card.querySelector('.battle-vs-row');
  const optionA = vsRow.querySelector('[data-side="a"]');
  const optionB = vsRow.querySelector('[data-side="b"]');

  if (choice === 'a') optionA.classList.add('chosen-option');
  else optionB.classList.add('chosen-option');

  const leader = leadingOption(counts);
  if (leader === 'a') optionA.classList.add('winner-option');
  else if (leader === 'b') optionB.classList.add('winner-option');

  // Remove old results if any, inject fresh
  const oldResults = card.querySelector('.battle-results');
  if (oldResults) oldResults.remove();
  const oldCount = card.querySelector('.battle-vote-count');
  if (oldCount) oldCount.remove();

  card.insertAdjacentHTML('beforeend', renderResults(battle, counts));

  // Animate bars in
  requestAnimationFrame(() => {
    const bars = card.querySelectorAll('.battle-result-bar');
    bars.forEach(b => {
      const w = b.style.width;
      b.style.width = '0%';
      requestAnimationFrame(() => { b.style.width = w; });
    });
  });
}

/* ── Share ── */
async function shareBattle(e, battleId) {
  e.stopPropagation();

  const { data: battle } = await sb
    .from('battles')
    .select('question, option_a, option_b')
    .eq('id', battleId)
    .single();

  if (!battle) return;

  const localVotes = getLocalVotes();
  const myChoice   = localVotes[battleId];
  const voted      = myChoice === 'a' ? battle.option_a : myChoice === 'b' ? battle.option_b : null;

  const text = voted
    ? `${battle.question} I voted: ${voted}. What about you? thebestagain.com/battles.html`
    : `${battle.question} thebestagain.com/battles.html`;

  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.querySelector(`#battle-${battleId} .battle-share-btn`);
      if (btn) {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Share ↗'; }, 2000);
      }
    }).catch(() => {});
  }
}

/* ── Helpers ── */
function leadingOption(counts) {
  if ((counts.a || 0) > (counts.b || 0)) return 'a';
  if ((counts.b || 0) > (counts.a || 0)) return 'b';
  return null; // tie
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// Very simple emoji map — matches keywords in option text
function pickEmoji(label) {
  const l = label.toLowerCase();
  if (l.includes('cebolla'))    return '🧅';
  if (l.includes('coca'))       return '🥤';
  if (l.includes('pepsi'))      return '🥤';
  if (l.includes('mcdonald'))   return '🍟';
  if (l.includes('burger king'))return '🍔';
  if (l.includes('croqueta') || l.includes('jamón') || l.includes('jamon')) return '🥩';
  if (l.includes('pollo'))      return '🍗';
  if (l.includes('churro'))     return '🥐';
  if (l.includes('porra'))      return '🥐';
  if (l.includes('fanta'))      return '🍊';
  if (l.includes('kas'))        return '🍋';
  if (l.includes('piña') || l.includes('pina')) return '🍍';
  if (l.includes('sí') || l.includes('si '))    return '✅';
  if (l.includes('no') || l.includes('jamás'))  return '❌';
  if (l.includes('colacao') || l.includes('cola cao')) return '🍫';
  if (l.includes('nesquick'))   return '🐰';
  if (l.includes('pepinillo'))  return '🥒';
  if (l.includes('borde') || l.includes('como')) return '🍕';
  if (l.includes('cerveza'))    return '🍺';
  if (l.includes('vino'))       return '🍷';
  if (l.includes('dulce'))      return '🥐';
  if (l.includes('salado'))     return '🥚';
  if (l.includes('nutella'))    return '🫙';
  if (l.includes('nocilla'))    return '🫙';
  if (l.includes('con '))       return '✅';
  if (l.includes('sin '))       return '🚫';
  return '⚔️';
}
