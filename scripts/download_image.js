#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const HEROES_PATH = path.join(process.cwd(), 'data', 'heroes.json');
const HERO_OUT_DIR = path.join(process.cwd(), 'images', 'heroes');

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function getExtFromContentType(ct) {
  if (!ct) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  return 'jpg';
}

function getExtFromUrl(u) {
  try {
    const pathname = new URL(u).pathname;
    const m = pathname.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : null;
  } catch (_) { return null; }
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const doReq = (u) => {
      https.get(u, (res) => {
        if ([301,302,303,307,308].includes(res.statusCode)) {
          const loc = res.headers.location;
          if (!loc) return reject(new Error('Redirect with no location'));
          return doReq(loc);
        }
        if (res.statusCode !== 200) {
          return reject(new Error('HTTP ' + res.statusCode + ' for ' + u));
        }
        const tmp = destPath + '.part';
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            fs.renameSync(tmp, destPath);
            resolve();
          });
        });
        out.on('error', reject);
      }).on('error', reject);
    };
    doReq(url);
  });
}

async function main() {
  const nameArg = process.argv.slice(2).join(' ').trim();
  if (!nameArg) throw new Error('Usage: node scripts/download_image.js <Hero Name>');
  const heroes = JSON.parse(fs.readFileSync(HEROES_PATH, 'utf8'));
  const hero = heroes.find(h => (h.name||'').toLowerCase() === nameArg.toLowerCase());
  if (!hero) throw new Error('Hero not found: ' + nameArg);
  const url = (hero.img || '').trim();
  if (!url) throw new Error('Hero has no image URL: ' + nameArg);

  ensureDir(HERO_OUT_DIR);
  const slug = slugify(hero.name);
  let ext = getExtFromUrl(url);
  if (!ext) {
    // Probe headers to decide extension
    ext = await new Promise((resolve) => {
      https.get(url, (res) => {
        const ct = res.headers['content-type'] || '';
        resolve(getExtFromContentType(ct));
        res.destroy();
      }).on('error', () => resolve('jpg'));
    });
  }
  const destRel = path.join('images', 'heroes', `${slug}.${ext}`);
  const destAbs = path.join(process.cwd(), destRel);

  console.log('Downloading', nameArg, '→', destRel);
  await download(url, destAbs);

  // update heroes.json
  hero.img = destRel.replace(/\\/g, '/');
  fs.writeFileSync(HEROES_PATH, JSON.stringify(heroes, null, 2));
  console.log('Saved and updated data at', HEROES_PATH);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });

