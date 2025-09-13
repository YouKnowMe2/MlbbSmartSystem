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
        catch (e) { reject(new Error('Bad JSON from ' + url)); }
      });
    }).on('error', reject);
  });
}

function buildUrl(params) {
  const sp = new URLSearchParams({ format: 'json', ...params });
  return `${API}?${sp.toString()}`;
}

async function getPageCategories(title) {
  const url = buildUrl({ action: 'query', prop: 'categories', cllimit: 'max', clshow: '!hidden', titles: title });
  const res = await get(url);
  const pages = res?.query?.pages || {};
  const first = Object.values(pages)[0];
  if (!first || first.missing === '' || first.invalid === '') return { exists: false, categories: [] };
  const cats = (first.categories || []).map(c => (c.title || '')).filter(Boolean);
  return { exists: true, categories: cats };
}

function decideStatus(categories) {
  const cats = categories.map(c => c.toLowerCase());
  if (cats.some(c => c.includes('cancelled') || c.includes('canceled'))) return 'cancelled';
  if (cats.some(c => c.includes('unreleased') || c.includes('beta') || c.includes('test'))) return 'unreleased';
  if (cats.some(c => c.includes('removed') || c.includes('retired'))) return 'removed';
  return 'present';
}

async function withPool(concurrency, tasks, worker) {
  const results = new Array(tasks.length);
  let idx = 0, active = 0;
  return new Promise((resolve, reject) => {
    const next = () => {
      if (idx >= tasks.length && active === 0) return resolve(results);
      while (active < concurrency && idx < tasks.length) {
        const i = idx++; active++;
        Promise.resolve(worker(tasks[i], i))
          .then((r) => { results[i] = r; active--; next(); })
          .catch((e) => { reject(e); });
      }
    };
    next();
  });
}

async function main() {
  const heroes = JSON.parse(fs.readFileSync(HEROES_JSON, 'utf8'));
  let count = { present: 0, cancelled: 0, unreleased: 0, removed: 0, unknown: 0 };
  await withPool(8, heroes, async (h) => {
    const title = h.name || '';
    if (!title) { h.status = 'unknown'; count.unknown++; return; }
    try {
      const { exists, categories } = await getPageCategories(title);
      if (!exists) { h.status = 'unknown'; count.unknown++; return; }
      const status = decideStatus(categories);
      h.status = status;
      count[status] = (count[status] || 0) + 1;
    } catch (e) {
      h.status = 'unknown'; count.unknown++;
    }
  });
  fs.writeFileSync(HEROES_JSON, JSON.stringify(heroes, null, 2));
  console.log('Heroes status:', count);
}

main().catch((e) => { console.error('Failed:', e.message || e); process.exit(1); });

