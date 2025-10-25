 document.addEventListener('DOMContentLoaded', () => {

            async function fetchLocalSchedule() {
                const url = `./data/schedule.json?t=${Date.now()}`;
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) throw new Error(`local json ${res.status}`);
                const j = await res.json();
                if (!j || !Array.isArray(j.items)) throw new Error('local json invalid');
                return j;
            }

            async function fetchAndParseData() {
                const targetUrl = 'http://3aic.ru/';

                const tryFetchers = [
                    // Jina reader mirror first (often unblocked on mobile)
                    async () => {
                        const url = `https://r.jina.ai/http://3aic.ru/`;
                        const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
                        if (!r.ok) throw new Error(`jina http ${r.status}`);
                        return await r.text();
                    },
                    // Jina with www variant
                    async () => {
                        const url = `https://r.jina.ai/http://www.3aic.ru/`;
                        const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
                        if (!r.ok) throw new Error(`jina http www ${r.status}`);
                        return await r.text();
                    },
                    // Jina with https variant (in case origin supports it intermittently)
                    async () => {
                        const url = `https://r.jina.ai/https://3aic.ru/`;
                        const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
                        if (!r.ok) throw new Error(`jina https ${r.status}`);
                        return await r.text();
                    },
                    // AllOrigins JSON endpoint (some ISPs block /raw but allow /get)
                    async () => {
                        const url = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&nocache=${Date.now()}`;
                        const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
                        if (!r.ok) throw new Error(`allorigins(get) ${r.status}`);
                        const j = await r.json();
                        if (!j || !j.contents) throw new Error('allorigins(get) empty');
                        return j.contents;
                    },
                    // AllOrigins raw as last fallback
                    async () => {
                        const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}&nocache=${Date.now()}`;
                        const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
                        if (!r.ok) throw new Error(`allorigins(raw) ${r.status}`);
                        return await r.text();
                    }
                ];

                async function withTimeout(promise, ms) {
                    return Promise.race([
                        promise,
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
                    ]);
                }

                const errors = [];
                for (const fetcher of tryFetchers) {
                    let text = '';
                    try {
                        text = await withTimeout(fetcher(), 9000);
                        if (!text || text.length <= 100) throw new Error('empty');

                        const lower = text.toLowerCase();
                        const htmlHasTable = lower.includes('<table');

                        let scheduleData = [];
                        if (htmlHasTable) {
                            // HTML parsing
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(text, 'text/html');
                            const rows = doc.querySelectorAll('table tr');
                            rows.forEach((row, index) => {
                                if (index === 0) return;
                                const cells = row.querySelectorAll('td');
                                if (cells.length >= 2) {
                                    const time = (cells[0]?.textContent || '').trim();
                                    const route = (cells[1]?.textContent || '').trim();
                                    const busesText = (cells[2]?.textContent || '').trim();
                                    const description = (cells[3]?.textContent || '').trim();
                                    if (!time) return;
                                    // try to extract buses from busesText or route/description if needed
                                    const sourceText = [busesText, route, description].join(' ');
                                    let buses = sourceText.replace(/[()]/g, ' ').match(/\b\d{1,3}\b/g) || [];
                                    buses = Array.from(new Set(buses));
                                    scheduleData.push({
                                        time,
                                        buses,
                                        route,
                                        description,
                                        keywords: `${time} ${buses.join(' ')} ${route} ${description}`.toLowerCase()
                                    });
                                }
                            });
                        } else {
                            // Plain text parsing (Jina). Heuristic: lines that start with time HH:MM
                            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                            const timeRe = /^(\d{1,2}:\d{2})\s+(.+)$/;
                            const busParenRe = /\(([^)]+)\)/; // capture content in parentheses if present
                            for (const line of lines) {
                                const m = line.match(timeRe);
                                if (!m) continue;
                                const time = m[1];
                                let rest = m[2];
                                let buses = [];
                                let description = '';

                                const pm = rest.match(busParenRe);
                                if (pm) {
                                    buses = pm[1].split(/[\s,]+/).map(s => s.replace(/[^0-9]/g, '')).filter(Boolean);
                                    rest = rest.replace(busParenRe, '').trim();
                                } else {
                                    const nums = rest.match(/\b\d{1,3}\b/g);
                                    if (nums) buses = nums;
                                }

                                // Try to split route vs description by two spaces or ' — ' dash
                                let route = rest;
                                const dashIdx = rest.indexOf('—');
                                if (dashIdx > 0) {
                                    route = rest.substring(0, dashIdx).trim();
                                    description = rest.substring(dashIdx + 1).trim();
                                }

                                if (route && time) {
                                    scheduleData.push({
                                        time,
                                        buses,
                                        route,
                                        description,
                                        keywords: `${time} ${buses.join(' ')} ${route} ${description}`.toLowerCase()
                                    });
                                }
                            }
                        }

                        if (scheduleData.length) {
                            try { localStorage.setItem('scheduleCache', JSON.stringify({ ts: Date.now(), data: scheduleData })); } catch {}
                            return scheduleData;
                        }

                        // parsed 0 rows, try next fetcher
                        errors.push('parsed 0 rows');
                    } catch (e) {
                        errors.push(String(e));
                        continue;
                    }
                }
                throw new Error('Не удалось получить данные (' + errors.join(' | ') + ')');
            }

            function renderCards(data) {
                const container = document.getElementById('scheduleContainer');
                container.innerHTML = '';
                
                if (data.length === 0) {
                     container.innerHTML = `<p class="error-message">Не удалось найти ни одного маршрута.</p>`;
                     return;
                }

                data.forEach(item => {
                    const busTags = item.buses.map(bus => `<span class="bus-tag">№ ${bus}</span>`).join('');
                    
                    const stops = item.route
                        .split('→')
                        .flatMap(part => part.split(' - '))
                        .map(stop => stop.trim())
                        .filter(stop => stop);
                    let rowsHTML = '';
                    stops.forEach((stop, index) => {
                        const isFirst = index === 0;
                        const isLast = index === stops.length - 1;
                        const label = isFirst ? 'Отправление' : (isLast ? 'Прибытие' : 'Промежуточная');
                        const iconClass = isFirst ? 'start' : (isLast ? 'end' : 'mid');
                        const pointClass = isFirst || isLast ? '' : 'is-mid';
                        const lineHTML = !isLast ? `<div class=\"v-line\"></div>` : '';
                        rowsHTML += `
                            <div class="stop-row ${pointClass}">
                                <div class="stop-visual">
                                    <div class="stop-icon ${iconClass}"></div>
                                    ${lineHTML}
                                </div>
                                <div class="stop-details">
                                    <div class="label">${label}</div>
                                    <div class="location">${stop}</div>
                                </div>
                            </div>`;
                    });
                    if (stops.length < 1) {
                        rowsHTML = `
                            <div class="stop-row">
                                <div class="stop-visual">
                                    <div class="stop-icon start"></div>
                                </div>
                                <div class="stop-details">
                                    <div class="location">${item.route}</div>
                                </div>
                            </div>`;
                    }

                    const cardHTML = `
                        <article class="route-card" data-time="${item.time}" data-bus="${item.buses[0] || ''}" data-route="${item.route.toLowerCase()}" data-keywords="${item.keywords}">
                            <div class="card-header">
                                <span class="time">${item.time}</span>
                                <div class="bus-list">${busTags.length > 0 ? busTags : ''}</div>
                            </div>

                            <div class="route-path">${rowsHTML}</div>

                            ${item.description ? `
                            <div class="card-footer">
                                <p><span class="label">Описание:</span> ${item.description}</p>
                            </div>` : ''}
                        </article>`;
                    container.insertAdjacentHTML('beforeend', cardHTML);
                });
            }
            
            async function initializeApp() {
                const scheduleDateElem = document.getElementById('scheduleDate');
                const lastUpdatedElem = document.getElementById('lastUpdated');
                const scheduleContainer = document.getElementById('scheduleContainer');
                const loader = document.getElementById('loader');

                const now = new Date();
                const dateString = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
                const timeString = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                scheduleDateElem.textContent = `Расписание автобусов на: ${dateString}`;
                lastUpdatedElem.textContent = `Последнее обновление: ${timeString}`;

                try {
                    // Try local pre-scraped JSON first (no CORS, works on GH Pages without VPN)
                    const local = await fetchLocalSchedule();
                    if (Array.isArray(local.items) && local.items.length) {
                        if (local.generatedAt) {
                            const dt = new Date(local.generatedAt);
                            lastUpdatedElem.textContent = `Обновлено экшеном: ${dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
                        }
                        setupControls(local.items);
                        if (loader) loader.classList.add('hidden');
                        return;
                    }
                    // Fallback to live fetchers if local is empty
                    const scheduleData = await fetchAndParseData();
                    setupControls(scheduleData);
                    if (loader) loader.classList.add('hidden');
                } catch(error) {
                    console.error("Ошибка загрузки:", error);
                    try {
                        const cached = JSON.parse(localStorage.getItem('scheduleCache') || 'null');
                        if (cached && Array.isArray(cached.data) && cached.data.length) {
                            const dt = new Date(cached.ts);
                            lastUpdatedElem.textContent = `Показаны данные из кеша: ${dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
                            setupControls(cached.data);
                            if (loader) loader.classList.add('hidden');
                            return;
                        }
                    } catch (_) { /* ignore parse errors */ }
                    lastUpdatedElem.textContent = 'Ошибка загрузки данных.';
                    scheduleContainer.innerHTML = `<div class="error-message">Не удалось загрузить расписание. Источник временно недоступен. Попробуйте обновить страницу позже.</div>`;
                    if (loader) loader.classList.add('hidden');
                }
            }
            
            function setupControls(data) {
                const fromInput = document.getElementById('fromInput');
                const toInput = document.getElementById('toInput');
                const generalFilter = document.getElementById('generalFilter');
                const sortByTimeBtn = document.getElementById('sortByTimeBtn');
                const sortByBusBtn = document.getElementById('sortByBusBtn');
                let currentData = [...data];

                function applyFilters() {
                    const fromValue = fromInput.value.toLowerCase().trim();
                    const toValue = toInput.value.toLowerCase().trim();
                    const generalValue = generalFilter.value.toLowerCase().trim();
                    
                    const filteredData = data.filter(item => {
                        const route = item.route.toLowerCase();
                        const keywords = item.keywords;
                        if (generalValue && !keywords.includes(generalValue)) return false;

                        const stops = route.split(/→| - /).map(s => s.trim());
                        const fromIndex = stops.findIndex(s => s.includes(fromValue));
                        if (fromValue && fromIndex === -1) return false;
                        
                        const toIndex = stops.findIndex(s => s.includes(toValue));
                        if (toValue) {
                            if (toIndex === -1) return false;
                            if (fromValue && toIndex <= fromIndex) return false;
                        }
                        return true;
                    });
                    
                    currentData = filteredData;
                    sortAndRender();
                }

                function sortAndRender(criteria) {
                    const activeSort = criteria || (sortByTimeBtn.classList.contains('active') ? 'time' : 'bus');

                    if (activeSort === 'time') {
                        currentData.sort((a, b) => a.time.localeCompare(b.time, 'kn', { numeric: true }));
                    } else if (activeSort === 'bus') {
                        currentData.sort((a, b) => (parseInt(a.buses[0]) || 9999) - (parseInt(b.buses[0]) || 9999));
                    }
                    renderCards(currentData);
                }
                
                [fromInput, toInput, generalFilter].forEach(input => input.addEventListener('input', applyFilters));
                
                sortByTimeBtn.addEventListener('click', () => {
                    sortByTimeBtn.classList.add('active');
                    sortByBusBtn.classList.remove('active');
                    sortAndRender('time');
                });

                sortByBusBtn.addEventListener('click', () => {
                    sortByBusBtn.classList.add('active');
                    sortByTimeBtn.classList.remove('active');
                    sortAndRender('bus');
                });
                
                applyFilters();
            }

            initializeApp();
        });