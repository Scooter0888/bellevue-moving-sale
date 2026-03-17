#!/usr/bin/env node
/**
 * Build script: combines individual item JSON files from content/items/
 * into a single content/items.json for the frontend.
 * Runs as part of the Netlify build step.
 */
const fs = require('fs');
const path = require('path');

const itemsDir = path.join(__dirname, 'content', 'items');
const outFile = path.join(__dirname, 'content', 'items.json');

let items = [];

if (fs.existsSync(itemsDir)) {
  const files = fs.readdirSync(itemsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(itemsDir, file), 'utf8'));
      items.push(data);
    } catch (err) {
      console.warn(`Skipping ${file}: ${err.message}`);
    }
  }
}

// Sort by order descending (newest first)
items.sort((a, b) => (b.order || 0) - (a.order || 0));

fs.writeFileSync(outFile, JSON.stringify(items, null, 2));
console.log(`Built items.json with ${items.length} items`);
