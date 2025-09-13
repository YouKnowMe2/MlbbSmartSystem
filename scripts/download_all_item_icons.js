#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const ITEMS_JSON = path.join(process.cwd(), 'data', 'items.json');
const ITEM_DIR = path.join(process.cwd(), 'images', 'items');
const API = 'https://mobile-legends.fandom.com/api.php';

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function slugify(s) { return String(s).toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

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

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const doReq = (u) => {
      https.get(u, (res) => {
        if ([301,302,303,307,308].includes(res.statusCode)) {
          const loc = res.headers.location; if (!loc) return reject(new Error('Redirect with no location'));
          return doReq(loc);
        }
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        const tmp = destPath + '.part';
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => out.close(() => { fs.renameSync(tmp, destPath); resolve(); }));
        out.on('error', reject);
      }).on('error', reject);
    };
    doReq(url);
  });
}

function buildUrl(params) {
  const sp = new URLSearchParams({ format: 'json', ...params });
  return `${API}?${sp.toString()}`;
}

async function getPrimaryPageImage(title) {
  const url = buildUrl({ action: 'query', prop: 'pageimages', piprop: 'original|thumbnail', pithumbsize: '256', titles: title });
  const res = await get(url);
  const pages = res?.query?.pages || {};
  const first = Object.values(pages)[0];
  return first?.original?.source || first?.thumbnail?.source || '';
}

async function getPageImages(title) {
  const url = buildUrl({ action: 'query', prop: 'images', titles: title, imlimit: '100' });
  const res = await get(url);
  const pages = res?.query?.pages || {};
  const first = Object.values(pages)[0];
  const images = (first?.images || []).map(i => i.title).filter(t => t && t.startsWith('File:'));
  return images;
}

async function getImageUrl(fileTitle) {
  const url = buildUrl({ action: 'query', titles: fileTitle, prop: 'imageinfo', iiprop: 'url' });
  const res = await get(url);
  const pages = res?.query?.pages || {};
  const first = Object.values(pages)[0];
  const info = first?.imageinfo?.[0];
  return info?.url || '';
}

function scoreFileName(fileTitle, itemName) {
  const f = fileTitle.toLowerCase();
  const base = f.replace(/^file:/, '');
  const nameSlug = slugify(itemName);
  const baseSlug = base.replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  let score = 0;
  if (baseSlug === nameSlug) score += 60;
  if (base.includes(nameSlug)) score += 20;
  if (base.endsWith('.png')) score += 2;
  if (base.includes('icon')) score += 3;
  if (base.includes('item')) score += 2;
  const genericBad = ['splash','wallpaper','hero','fighter','assassin','mage','marksman','tank','support','role_','effect','equip','throw','skill'];
  if (!base.includes(nameSlug) && genericBad.some(w => base.includes(w))) score -= 20;
  return score;
}

async function pickIconUrlForItemName(name) {
  let url = await getPrimaryPageImage(name);
  try {
    const badPrimary = url && /effect|equip|show/i.test(new URL(url).pathname);
    if (badPrimary) url = '';
  } catch(_) {}
  if (url) return url;
  const files = await getPageImages(name);
  if (!files.length) return '';
  const best = files.map(ft => ({ ft, s: scoreFileName(ft, name) })).sort((a,b) => b.s - a.s)[0];
  if (!best || best.s < 0) return '';
  return await getImageUrl(best.ft);
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
  ensureDir(ITEM_DIR);
  const need = items.map((it, i) => ({ it, i }))
    .filter(({ it }) => !it.icon || /^https?:/i.test(it.icon));
  console.log(`Items needing icons: ${need.length}`);
  await withPool(6, need, async ({ it, i }) => {
    const name = it.name || '';
    const idSlug = slugify(it.id || name || ('item_' + i));
    try {
      const url = await pickIconUrlForItemName(name);
      if (!url) { console.warn('No icon URL for', name); return; }
      const ext = path.extname(new URL(url).pathname) || '.png';
      const rel = path.join('images','items', `${idSlug}${ext}`);
      const abs = path.join(process.cwd(), rel);
      await download(url, abs);
      it.icon = rel.replace(/\\/g, '/');
      console.log('Saved', name, '→', rel);
    } catch (e) {
      console.warn('Failed', name, e.message || e);
    }
  });
  fs.writeFileSync(ITEMS_JSON, JSON.stringify(items, null, 2));
  console.log('Updated', ITEMS_JSON);
}

main().catch((e) => { console.error('Failed:', e.message || e); process.exit(1); });

