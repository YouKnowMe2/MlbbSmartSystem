#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const p = path.join(process.cwd(), 'data', 'items.json');
const items = JSON.parse(fs.readFileSync(p, 'utf8'));
for (const it of items) { it.icon = ''; }
fs.writeFileSync(p, JSON.stringify(items, null, 2));
console.log('Cleared all item icons in', p);

