#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const HEROES_JSON = path.join(process.cwd(), 'data', 'heroes.json');
const ITEMS_JSON = path.join(process.cwd(), 'data', 'items.json');
const HERO_DIR = path.join(process.cwd(), 'images', 'heroes');
const ITEM_DIR = path.join(process.cwd(), 'images', 'items');

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function fileExists(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }

function slugify(s) {
  return String(s).toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function getExtFromUrl(u) {
  try { const pathname = new URL(u).pathname; const m = pathname.match(/\.([a-zA-Z0-9]+)$/); return m ? m[1].toLowerCase() : null; } catch { return null; }
}
function getExtFromContentType(ct) {
  if (!ct) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  return 'jpg';
}

function fetchHead(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      resolve(res.headers['content-type'] || '');
    });
    req.on('error', () => resolve(''));
    req.end();
  });
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const doReq = (u) => {
      https.get(u, (res) => {
        if ([301,302,303,307,308].includes(res.statusCode)) {
          const loc = res.headers.location; if (!loc) return reject(new Error('Redirect without location'));
          return doReq(loc);
        }
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' for ' + u));
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

async function materializeImage(url, destDir, baseName) {
  if (!url || !/^https?:/i.test(url)) return null;
  ensureDir(destDir);
  let ext = getExtFromUrl(url) || getExtFromContentType(await fetchHead(url));
  const rel = path.join('images', path.basename(destDir), `${baseName}.${ext}`);
  const abs = path.join(process.cwd(), rel);
  if (fileExists(abs)) return rel.replace(/\\/g, '/');
  await download(url, abs);
  return rel.replace(/\\/g, '/');
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
  const items = JSON.parse(fs.readFileSync(ITEMS_JSON, 'utf8'));

  console.log(`Heroes to process: ${heroes.length}`);
  await withPool(8, heroes, async (h) => {
    const name = h.name || '';
    if (!name) return;
    const base = slugify(name);
    if (h.img && !/^https?:/i.test(h.img)) return; // already local
    const local = await materializeImage(h.img, HERO_DIR, base).catch((e) => { console.warn('Hero image failed', name, e.message || e); });
    if (local) h.img = local;
  });
  fs.writeFileSync(HEROES_JSON, JSON.stringify(heroes, null, 2));
  console.log('Updated', HEROES_JSON);

  console.log(`Items to process: ${items.length}`);
  await withPool(8, items, async (it) => {
    const id = (it.id && String(it.id)) || slugify(it.name || 'item');
    if (it.icon && !/^https?:/i.test(it.icon)) return; // already local
    const local = await materializeImage(it.icon, ITEM_DIR, id).catch((e) => { console.warn('Item image failed', it.name || id, e.message || e); });
    if (local) it.icon = local;
  });
  fs.writeFileSync(ITEMS_JSON, JSON.stringify(items, null, 2));
  console.log('Updated', ITEMS_JSON);
}

main().catch((e) => { console.error('Failed:', e.message || e); process.exit(1); });

