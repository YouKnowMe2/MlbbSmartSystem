#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const ITEMS_JSON = path.join(process.cwd(), 'data', 'items.json');
const ITEM_DIR = path.join(process.cwd(), 'images', 'items');
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

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function slugify(s) { return String(s).toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

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
  return images; // [ 'File:Something.png', ... ]
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
  let score = 0;
  // Strong preference for exact item name in filename
  const baseSlug = base.replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (baseSlug === nameSlug) score += 60;
  if (base.includes(nameSlug)) score += 20;
  if (base.endsWith('.png')) score += 2;
  if (base.includes('icon')) score += 3;
  if (base.includes('item')) score += 2;
  // Penalize role/class/hero related generic icons unless also name-matched
  const genericBad = ['splash','wallpaper','hero','fighter','assassin','mage','marksman','tank','support','role_','effect','equip','throw','skill'];
  if (!base.includes(nameSlug) && genericBad.some(w => base.includes(w))) score -= 20;
  return score;
}

async function main() {
  const query = process.argv.slice(2).join(' ').trim();
  if (!query) throw new Error('Usage: node scripts/download_item_icon.js "<Item Name>"');

  const items = JSON.parse(fs.readFileSync(ITEMS_JSON, 'utf8'));
  const item = items.find(it => (it.name||'').toLowerCase() === query.toLowerCase())
             || items.find(it => slugify(it.name||'') === slugify(query))
             || null;
  if (!item) throw new Error('Item not found in items.json: ' + query);

  const title = item.name;
  // Try primary infobox image first (usually the item icon)
  let url = await getPrimaryPageImage(title);
  try {
    const badPrimary = url && /effect|equip|show/i.test(new URL(url).pathname);
    if (badPrimary) url = '';
  } catch (_) {}
  if (!url) {
    const files = await getPageImages(title);
    if (!files.length) throw new Error('No files found on page: ' + title);
    const best = files
      .map(ft => ({ ft, s: scoreFileName(ft, title) }))
      .sort((a,b) => b.s - a.s)[0];
    if (!best || best.s < 0) throw new Error('Could not identify a suitable icon for ' + title);
    url = await getImageUrl(best.ft);
    if (!url) throw new Error('No URL for image ' + best.ft);
  }

  ensureDir(ITEM_DIR);
  const ext = path.extname(new URL(url).pathname) || '.png';
  const destRel = path.join('images', 'items', `${slugify(item.id || item.name)}${ext}`);
  const destAbs = path.join(process.cwd(), destRel);
  console.log('Downloading icon', title, '→', destRel, '\nfrom', url);
  await download(url, destAbs);

  item.icon = destRel.replace(/\\/g, '/');
  fs.writeFileSync(ITEMS_JSON, JSON.stringify(items, null, 2));
  console.log('Updated', ITEMS_JSON);
}

main().catch(e => { console.error('Failed:', e.message || e); process.exit(1); });
