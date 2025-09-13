#!/usr/bin/env node
// Fetch latest MLBB heroes and equipment from Fandom API
// Outputs: data/heroes.json and data/items.json with name + image URL (icon)

const fs = require('fs');
const path = require('path');
const https = require('https');

const API = 'https://mobile-legends.fandom.com/api.php';

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          try {
            const json = JSON.parse(body);
            resolve(json);
          } catch (e) {
            reject(new Error('Failed to parse JSON from ' + url + ': ' + e.message));
          }
        });
      })
      .on('error', reject);
  });
}

function buildUrl(params) {
  const sp = new URLSearchParams({ format: 'json', ...params });
  return `${API}?${sp.toString()}`;
}

async function fetchCategoryMembers(categoryTitle) {
  const members = [];
  let c = undefined;
  do {
    const url = buildUrl({
      action: 'query',
      list: 'categorymembers',
      cmtitle: categoryTitle,
      cmlimit: '500',
      cmnamespace: '0',
      ...(c ? { cmcontinue: c } : {}),
    });
    const res = await get(url);
    const part = res?.query?.categorymembers || [];
    members.push(...part);
    c = res?.continue?.cmcontinue;
  } while (c);
  return members; // [{pageid, ns, title}]
}

async function fetchPageImages(titles) {
  // titles: array of strings, up to 50 per request
  const byTitle = {};
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const url = buildUrl({
      action: 'query',
      prop: 'pageimages',
      piprop: 'original|thumbnail',
      pithumbsize: '512',
      titles: chunk.join('|'),
    });
    const res = await get(url);
    const pages = res?.query?.pages || {};
    for (const k of Object.keys(pages)) {
      const p = pages[k];
      const title = p?.title;
      const img = p?.original?.source || p?.thumbnail?.source || '';
      if (title) byTitle[title] = img;
    }
  }
  return byTitle; // { title: imageUrl }
}

async function fetchListFromPageLinks(pageTitle) {
  // Fallback: get page links (ns=0) as item titles
  const url = buildUrl({ action: 'parse', page: pageTitle, prop: 'links' });
  const res = await get(url);
  const links = res?.parse?.links || [];
  return links.filter(l => l.ns === 0 && !l.exists === false).map(l => l['*']);
}

async function getHeroes() {
  // Try category first
  let members = [];
  try {
    members = await fetchCategoryMembers('Category:Heroes');
  } catch (_) {
    // ignore
  }
  if (!members.length) {
    // Fallback from list page links
    const titles = await fetchListFromPageLinks('List_of_heroes');
    members = titles.map(t => ({ title: t }));
  }
  const titles = members.map(m => m.title).filter(Boolean);
  const images = await fetchPageImages(titles);
  const list = titles.map((t, idx) => ({
    id: idx + 1,
    name: t,
    roles: [],
    lanes: [],
    year: null,
    img: images[t] || '',
    damageType: '',
    tags: []
  }));
  return list;
}

async function getItems() {
  // Try category variants for equipment/items
  let members = [];
  const categories = ['Category:Equipment', 'Category:Items'];
  for (const cat of categories) {
    try {
      const m = await fetchCategoryMembers(cat);
      if (m.length) { members = m; break; }
    } catch (_) {}
  }
  if (!members.length) {
    const titles = await fetchListFromPageLinks('Equipment');
    members = titles.map(t => ({ title: t }));
  }
  // Filter out obvious non-items
  const titles = members.map(m => m.title).filter(Boolean).filter(t => !/Equipment|List|Category:/i.test(t));
  const images = await fetchPageImages(titles);
  const list = titles.map((t) => ({
    id: t
      .toLowerCase()
      .replace(/'/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, ''),
    name: t,
    type: '',
    tags: [],
    notes: '',
    icon: images[t] || '',
  }));
  return list;
}

async function main() {
  const outDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('Fetching heroes...');
  const heroes = await getHeroes();
  console.log(`Heroes: ${heroes.length}`);
  const heroesPath = path.join(outDir, 'heroes.json');
  fs.writeFileSync(heroesPath, JSON.stringify(heroes, null, 2));

  console.log('Fetching items...');
  const items = await getItems();
  console.log(`Items: ${items.length}`);
  const itemsPath = path.join(outDir, 'items.json');
  fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2));

  console.log('Done. Wrote', heroesPath, 'and', itemsPath);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
