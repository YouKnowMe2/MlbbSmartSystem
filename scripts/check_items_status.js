#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const ITEMS_JSON = path.join(process.cwd(), 'data', 'items.json');
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
  // Signals that the item is not in current game
  const removedSignals = ['removed', 'deprecated', 'obsolete', 'retired', 'unreleased', 'unavailable', 'legacy'];
  const removed = cats.some(c => removedSignals.some(sig => c.includes(sig)));
  return removed ? 'removed' : 'present';
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
  const items = JSON.parse(fs.readFileSync(ITEMS_JSON, 'utf8'));
  let removedCount = 0, presentCount = 0, missingCount = 0;
  await withPool(8, items, async (it) => {
    const title = it.name || '';
    if (!title) { it.status = 'unknown'; return; }
    try {
      const { exists, categories } = await getPageCategories(title);
      if (!exists) { it.status = 'unknown'; missingCount++; return; }
      const status = decideStatus(categories);
      it.status = status;
      if (status === 'removed') removedCount++; else presentCount++;
    } catch (e) {
      it.status = 'unknown';
    }
  });
  fs.writeFileSync(ITEMS_JSON, JSON.stringify(items, null, 2));
  console.log('Done. Present:', presentCount, 'Removed:', removedCount, 'Unknown:', (items.length - presentCount - removedCount));
}

main().catch((e) => { console.error('Failed:', e.message || e); process.exit(1); });

