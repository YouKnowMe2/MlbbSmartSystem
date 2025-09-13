// Starter inline dataset (used as fallback if local fetch is blocked)
const FALLBACK_HEROES = [
  { id: 1, name: "Alucard", roles: ["Fighter", "Assassin"], lanes: ["Jungle", "EXP"], year: 2016, img: "" },
  { id: 2, name: "Layla", roles: ["Marksman"], lanes: ["Gold"], year: 2016, img: "" },
  { id: 3, name: "Miya", roles: ["Marksman"], lanes: ["Gold"], year: 2016, img: "" },
  { id: 4, name: "Tigreal", roles: ["Tank"], lanes: ["Roam"], year: 2016, img: "" },
  { id: 5, name: "Gusion", roles: ["Assassin"], lanes: ["Jungle", "Mid"], year: 2018, img: "" },
  { id: 6, name: "Angela", roles: ["Support"], lanes: ["Roam"], year: 2018, img: "" },
  { id: 7, name: "Chou", roles: ["Fighter"], lanes: ["EXP", "Roam"], year: 2017, img: "" },
  { id: 8, name: "Alice", roles: ["Mage"], lanes: ["EXP", "Mid"], year: 2016, img: "" },
  { id: 9, name: "Kimmy", roles: ["Marksman", "Mage"], lanes: ["Mid", "Gold"], year: 2018, img: "" },
  { id: 10, name: "Balmond", roles: ["Fighter"], lanes: ["Jungle", "EXP"], year: 2016, img: "" }
];

const qs = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));

const searchEl = qs('#search');
const roleEl = qs('#role-filter');
const laneEl = qs('#lane-filter');
const gridEl = qs('#grid');
const countEl = qs('#count');

function placeholderSvg(name) {
  const initial = (name?.trim()?.[0] || '?').toUpperCase();
  const bg = '#1a2230';
  const fg = '#9fb0c6';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='#0f1622'/>
        <stop offset='100%' stop-color='${bg}'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' fill='url(#g)'/>
    <text x='50%' y='54%' font-family='Segoe UI, Roboto, Arial' font-size='220' font-weight='700' fill='${fg}' text-anchor='middle' dominant-baseline='middle'>${initial}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

async function loadHeroes() {
  try {
    const res = await fetch('data/heroes.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('Empty dataset');
    return data;
  } catch (e) {
    console.info('Using fallback dataset:', e?.message || e);
    // Enrich fallback with minimal tags for recommendations
    return FALLBACK_HEROES.map(h => ({
      ...h,
      damageType: h.damageType || (h.roles?.includes('Mage') ? 'magic' : (h.roles?.includes('Marksman') ? 'physical' : 'physical')),
      tags: h.tags || []
    }));
  }
}

async function loadItems() {
  try {
    const res = await fetch('data/items.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('Empty items dataset');
    return data;
  } catch (e) {
    console.warn('Items not available:', e?.message || e);
    return [];
  }
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function populateRoleFilter(heroes) {
  const roles = uniqueSorted(heroes.flatMap(h => h.roles || []));
  for (const r of roles) {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    roleEl.appendChild(opt);
  }
}

function populateBuilderSelects(heroes) {
  const yourHeroEl = qs('#your-hero');
  const oppEls = qsa('.opponent');
  if (!yourHeroEl || !oppEls.length) return;
  const options = ['<option value="">—</option>', ...heroes.map(h => `<option value="${h.id}">${h.name}</option>`)];
  yourHeroEl.innerHTML = options.join('');
  oppEls.forEach(sel => sel.innerHTML = options.join(''));
}

function summarizeOpponents(opponents) {
  const total = opponents.length || 1;
  const counts = opponents.reduce((acc, h) => {
    const dt = h.damageType || 'physical';
    acc.damage[dt] = (acc.damage[dt] || 0) + 1;
    for (const t of (h.tags || [])) acc.tags[t] = (acc.tags[t] || 0) + 1;
    return acc;
  }, { damage: { physical: 0, magic: 0, hybrid: 0 }, tags: {} });
  counts.mix = {
    physical: (counts.damage.physical + 0.5 * counts.damage.hybrid) / total,
    magic: (counts.damage.magic + 0.5 * counts.damage.hybrid) / total,
  };
  return counts;
}

function recommendDefense(yourHero, opponents, items) {
  const s = summarizeOpponents(opponents);
  const picks = [];
  const pushIf = (pred, ids) => { if (pred) picks.push(...ids); };

  // Magic vs Physical mix
  pushIf(s.mix.magic >= 0.5, ['athenas_shield', 'radiant_armor']);
  pushIf(s.mix.physical >= 0.5, ['antique_cuirass', 'blade_armor']);

  // Anti-heal if many sustain/heal tags
  const sustainPressure = (s.tags['sustain'] || 0) + (s.tags['heal'] || 0) + (s.tags['regen'] || 0);
  pushIf(sustainPressure >= 1, ['dominance_ice']);

  // Generic safety
  picks.push('immortality');

  // Map ids to item objects and unique
  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  const unique = Array.from(new Set(picks)).map(id => byId[id]).filter(Boolean);
  return unique;
}

function recommendOffense(yourHero, opponents, items) {
  const s = summarizeOpponents(opponents);
  const picks = [];
  const heroDmg = yourHero?.damageType || 'physical';
  const isPhysical = heroDmg === 'physical';
  const isMagic = heroDmg === 'magic';

  if (isPhysical) {
    picks.push('blade_of_despair');
    // Assume armor stacking into tanky comps
    if ((opponents.filter(h => (h.roles||[]).includes('Tank')).length) >= 1 || s.mix.physical < 0.6) {
      picks.push('malefic_roar');
    }
    // Anti-heal vs sustain
    const sustainPressure = (s.tags['sustain'] || 0) + (s.tags['heal'] || 0) + (s.tags['regen'] || 0);
    if (sustainPressure >= 1) picks.push('sea_halberd');
  } else if (isMagic) {
    picks.push('genius_wand');
    if ((opponents.filter(h => (h.roles||[]).includes('Tank')).length) >= 1 || s.mix.magic < 0.6) {
      picks.push('divine_glaive');
    }
    const sustainPressure = (s.tags['sustain'] || 0) + (s.tags['heal'] || 0) + (s.tags['regen'] || 0);
    if (sustainPressure >= 1) picks.push('necklace_of_durance');
  }

  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  const unique = Array.from(new Set(picks)).map(id => byId[id]).filter(Boolean);
  return unique;
}

function renderItemList(el, items) {
  el.innerHTML = items.map(i => `
    <li class="item-row" title="${i.notes || ''}">
      ${i.icon ? `<img class="item-icon" src="${i.icon}" alt="" onerror="this.style.display='none'" />` : ''}
      <span class="item-name"><strong>${i.name}</strong></span>
      <small class="muted">(${(i.tags||[]).join(', ')})</small>
    </li>
  `).join('');
}

function renderCards(list) {
  gridEl.innerHTML = list.map(h => {
    const img = h.img && h.img.trim().length ? h.img : placeholderSvg(h.name);
    const roles = (h.roles || []).map(r => `<span class="pill">${r}</span>`).join('');
    const lanes = (h.lanes || []).map(l => `<span class="pill">${l}</span>`).join('');
    const safeYear = h.year ? `<span class="year">${h.year}</span>` : '';
    return `
      <article class="card" tabindex="0" aria-label="${h.name}">
        <img class="avatar" src="${img}" alt="${h.name}" onerror="this.onerror=null;this.src='${placeholderSvg(h.name)}'" />
        <div class="title"><div class="name">${h.name}</div>${safeYear}</div>
        <div class="meta">${roles}</div>
        <div class="meta">${lanes}</div>
      </article>
    `;
  }).join('');
}

function applyFilters(heroes) {
  const q = searchEl.value.trim().toLowerCase();
  const r = roleEl.value;
  const l = laneEl.value;
  const result = heroes.filter(h => {
    const nameOk = !q || h.name.toLowerCase().includes(q);
    const roleOk = !r || (h.roles || []).includes(r);
    const laneOk = !l || (h.lanes || []).includes(l) || (l === 'Any' && (h.lanes || []).length === 0);
    return nameOk && roleOk && laneOk;
  });
  countEl.textContent = `${result.length} shown`;
  return result;
}

(async function init() {
  const heroes = await loadHeroes();
  populateRoleFilter(heroes);
  populateBuilderSelects(heroes);
  const items = await loadItems();
  const render = () => renderCards(applyFilters(heroes));
  searchEl.addEventListener('input', render);
  roleEl.addEventListener('change', render);
  laneEl.addEventListener('change', render);
  render();
  // Wire up recommender button
  const yourHeroEl = qs('#your-hero');
  const oppEls = qsa('.opponent');
  const btn = qs('#recommend');
  const defList = qs('#defense-list');
  const offList = qs('#offense-list');
  const getHero = (sel) => heroes.find(h => String(h.id) === String(sel.value));
  btn?.addEventListener('click', () => {
    const yourHero = getHero(yourHeroEl);
    const opponents = oppEls.map(getHero).filter(Boolean);
    if (!yourHero || opponents.length === 0) {
      defList.innerHTML = '<li>Select your hero and at least one opponent.</li>';
      offList.innerHTML = '';
      return;
    }
    const def = recommendDefense(yourHero, opponents, items);
    const off = recommendOffense(yourHero, opponents, items);
    renderItemList(defList, def);
    renderItemList(offList, off);
  });
})();
