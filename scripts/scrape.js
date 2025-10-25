#!/usr/bin/env node
/* eslint-disable */
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function fetchSource() {
  const targetUrl = 'http://3aic.ru/';
  const res = await fetch(targetUrl, { timeout: 20000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function parseHtml(html) {
  const $ = cheerio.load(html);
  const rows = $('table tr');
  const items = [];
  rows.each((i, el) => {
    if (i === 0) return; // skip header
    const cells = $(el).find('td');
    if (cells.length >= 2) {
      const time = ($(cells[0]).text() || '').trim();
      const route = ($(cells[1]).text() || '').trim();
      const busesText = ($(cells[2]).text() || '').trim();
      const description = ($(cells[3]).text() || '').trim();
      if (!time) return;
      const sourceText = [busesText, route, description].join(' ');
      let buses = (sourceText.replace(/[()]/g, ' ').match(/\b\d{1,3}\b/g) || []);
      buses = Array.from(new Set(buses));
      items.push({
        time,
        buses,
        route,
        description,
        keywords: `${time} ${buses.join(' ')} ${route} ${description}`.toLowerCase()
      });
    }
  });
  return items;
}

async function main() {
  try {
    const html = await fetchSource();
    const items = parseHtml(html);
    const out = {
      generatedAt: new Date().toISOString(),
      items
    };
    const outPath = path.join(__dirname, '..', 'data', 'schedule.json');
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log(`Wrote ${items.length} items to ${outPath}`);
  } catch (e) {
    console.error('Scrape failed:', e);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
