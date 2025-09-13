#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ITEMS_PATH = path.join(process.cwd(), 'data', 'items.json');
const REMOVED_PATH = path.join(process.cwd(), 'data', 'items_removed.json');

function main() {
  const items = JSON.parse(fs.readFileSync(ITEMS_PATH, 'utf8'));
  const removed = items.filter(it => (it.status || '').toLowerCase() === 'removed');
  const kept = items.filter(it => (it.status || '').toLowerCase() !== 'removed');

  fs.writeFileSync(ITEMS_PATH, JSON.stringify(kept, null, 2));
  fs.writeFileSync(REMOVED_PATH, JSON.stringify(removed, null, 2));
  console.log(`Split complete. Kept: ${kept.length}, Removed: ${removed.length}`);
}

main();

