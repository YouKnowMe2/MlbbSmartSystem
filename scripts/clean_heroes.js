#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const HEROES_JSON = path.join(process.cwd(), 'data', 'heroes.json');
const API = 'https://mobile-legends.fandom.com/api.php';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error('Bad JSON from ' + url + ': ' + e.message)); }
      });
    }).on('error', reject);
  });
}

function buildUrl(params) {
  const sp = new URLSearchParams({ format: 'json', ...params });
  return `${API}?${sp.toString()}`;
}

async function getLinksFrom(page) {
  const url = buildUrl({ action: 'parse', page, prop: 'links' });
  const res = await get(url);
  const links = res?.parse?.links || [];
  return links
    .filter(l => l.ns === 0 && l.exists !== '')
    .map(l => l['*'])
    .filter(Boolean);
}

async function getCategoryMembers(catTitle) {
  const titles = [];
  let c = undefined;
  do {
    const url = buildUrl({ action: 'query', list: 'categorymembers', cmtitle: catTitle, cmnamespace: '0', cmlimit: '500', ...(c ? { cmcontinue: c } : {}) });
    const res = await get(url);
    titles.push(...(res?.query?.categorymembers || []).map(m => m.title));
    c = res?.continue?.cmcontinue;
  } while (c);
  return titles;
}

function normalize(s) { return String(s || '').trim(); }

async function buildPlayableSet() {
  const sets = [];
  try { sets.push(new Set(await getLinksFrom('List_of_heroes'))); } catch (_) {}
  // Try to include a stricter category if it exists
  for (const cat of ['Category:Heroes', 'Category:Playable Heroes', 'Category:Playable heroes']) {
    try { sets.push(new Set(await getCategoryMembers(cat))); } catch (_) {}
  }
  // Union all
  const playable = new Set();
  for (const s of sets) for (const t of s) if (t) playable.add(normalize(t));
  return playable;
}

function isObviouslyNotHero(title) {
  const t = title.toLowerCase();
  const bad = [
    'heroes', 'cancelled', 'canceled', 'role', 'roles', 'fighter', 'assassin', 'mage', 'marksman', 'tank', 'support',
    'lightborn', 'v.e.n.o.m', 'venom', 'oriental fighters', 'the exorcists', 'exorcists', 'member introduction',
    'heavenly artifacts', 'side laner',
    // Explicit non-hero role pages
    'exp laner', 'gold laner', 'mid laner', 'roamer', 'jungler', 'laner'
  ];
  return bad.some(w => t.includes(w));
}

async function main() {
  const heroes = JSON.parse(fs.readFileSync(HEROES_JSON, 'utf8'));
  const playable = await buildPlayableSet();
  const before = heroes.length;
  const filtered = heroes.filter(h => {
    const name = normalize(h.name);
    if (!name) return false;
    if (isObviouslyNotHero(name)) return false;
    return playable.has(name);
  });
  const after = filtered.length;
  fs.writeFileSync(HEROES_JSON, JSON.stringify(filtered, null, 2));
  console.log(`Filtered heroes: ${before} -> ${after}`);
}

main().catch(e => { console.error('Failed:', e.message || e); process.exit(1); });
