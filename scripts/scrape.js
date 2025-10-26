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
  
  let forDate = '';
  try {
    const pageText = $('body').text();
    // Ищем дату в формате ДД.ММ.ГГГГ или ДД.ММ, чтобы установить актуальную дату расписания
    const dateMatch = pageText.match(/(\d{1,2}\.\d{1,2}(?:\.\d{4})?)/);
    if (dateMatch) {
        // Убираем год, если он есть, для краткости
        forDate = dateMatch[1].replace(/\.\d{4}$/, '');
    }
  } catch {}

  rows.each((i, el) => {
    if (i === 0) return; // Пропускаем заголовок таблицы
    const cells = $(el).find('td');
    
    if (cells.length >= 2) {
      const time = ($(cells[0]).text() || '').trim();
      const route = ($(cells[1]).text() || '').trim();
      const busesText = ($(cells[2]).text() || '').trim();
      
      // Пропускаем строки без времени или с заголовком
      if (!time || time.toUpperCase() === 'ВРЕМЯ') return;
      
      // Собираем описание из всех последующих ячеек, чтобы ничего не упустить
      const descriptionParts = [];
      for (let j = 3; j < cells.length; j++) {
          const cellText = $(cells[j]).text().trim();
          if (cellText) {
              descriptionParts.push(cellText);
          }
      }
      const description = descriptionParts.join('; ');
      
      // Улучшенный парсинг номеров автобусов: ищем 3-значные числа
      let buses = (busesText.match(/\b\d{3}\b/g) || []);
      buses = Array.from(new Set(buses)); // Убираем дубликаты
      
      items.push({
        time,
        buses,
        route,
        description,
        keywords: `${time} ${buses.join(' ')} ${route} ${description}`.toLowerCase()
      });
    }
  });
  return { items, forDate };
}

async function main() {
  try {
    const html = await fetchSource();
    const parsed = parseHtml(html);
    const out = {
      generatedAt: new Date().toISOString(),
      forDate: parsed.forDate || '',
      items: parsed.items
    };
    const outPath = path.join(__dirname, '..', 'data', 'schedule.json');
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log(`Wrote ${parsed.items.length} items to ${outPath} for date ${parsed.forDate}`);
  } catch (e) {
    console.error('Scrape failed:', e);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
