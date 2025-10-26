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
                    // Cloudflare Workers CORS Proxy
                    async () => {
                        const url = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
                        const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
                        if (!r.ok) throw new Error(`corsproxy.io ${r.status}`);
                        return await r.text();
                    },
                    // API CORS Proxy
                    async () => {
                        const url = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;
                        const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
                        if (!r.ok) throw new Error(`codetabs ${r.status}`);
                        return await r.text();
                    },
                    // Proxy CORS SH alternative
                    async () => {
                        const url = `https://proxy.cors.sh/${targetUrl}`;
                        const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
                        if (!r.ok) throw new Error(`proxy.cors.sh ${r.status}`);
                        return await r.text();
                    },
                    // AllOrigins RAW
                    async () => {
                        const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
                        const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
                        if (!r.ok) throw new Error(`allorigins-raw ${r.status}`);
                        return await r.text();
                    },
                    // CORS Proxy
                    async () => {
                        const url = `https://corsproxy.org/?${encodeURIComponent(targetUrl)}`;
                        const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
                        if (!r.ok) throw new Error(`corsproxy.org ${r.status}`);
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
                    try {
                        const text = await withTimeout(fetcher(), 15000);
                        if (!text || text.length <= 100) throw new Error('empty');

                        const scheduleData = [];
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(text, 'text/html');

                        // Ищем актуальную дату на странице
                        let forDate = '';
                        const bodyText = doc.body.textContent || '';
                        const dateMatch = bodyText.match(/(\d{1,2}\.\d{1,2}(?:\.\d{4})?)/);
                        if (dateMatch) {
                            forDate = dateMatch[1].replace(/\.\d{4}$/, '');
                        }
                        
                        const rows = doc.querySelectorAll('table tr');
                        rows.forEach((row, index) => {
                            if (index === 0) return;
                            const cells = row.querySelectorAll('td');
                            if (cells.length >= 2) {
                                const time = (cells[0]?.textContent || '').trim();
                                const route = (cells[1]?.textContent || '').trim();
                                const busesText = (cells[2]?.textContent || '').trim();

                                // Пропускаем строки без времени или с заголовком
                                if (!time || time.toUpperCase() === 'ВРЕМЯ') return;

                                const descriptionParts = [];
                                for (let i = 3; i < cells.length; i++) {
                                    const cellText = (cells[i]?.textContent || '').trim();
                                    if (cellText) descriptionParts.push(cellText);
                                }
                                const description = descriptionParts.join('; ');
                                
                                let buses = (busesText.match(/\b\d{3}\b/g) || []);
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

                        if (scheduleData.length) {
                            try { localStorage.setItem('scheduleCache', JSON.stringify({ ts: Date.now(), data: scheduleData, forDate })); } catch {}
                            return { items: scheduleData, forDate };
                        }

                        errors.push('parsed 0 rows');
                    } catch (e) {
                        errors.push(String(e));
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
            
            function updateHeaderText(forDate, lastUpdated) {
                const scheduleDateElem = document.getElementById('scheduleDate');
                const lastUpdatedElem = document.getElementById('lastUpdated');
                
                if (forDate) {
                    scheduleDateElem.textContent = `Расписание автобусов на: ${forDate}`;
                } else {
                    const now = new Date();
                    const dateString = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
                    scheduleDateElem.textContent = `Расписание автобусов на: ${dateString}`;
                }
                
                lastUpdatedElem.textContent = lastUpdated;
            }

            async function initializeApp() {
                const scheduleContainer = document.getElementById('scheduleContainer');
                const loader = document.getElementById('loader');

                const now = new Date();
                const timeString = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

                try {
                    const local = await fetchLocalSchedule();
                    if (Array.isArray(local.items) && local.items.length > 0) {
                        const dt = new Date(local.generatedAt);
                        const updatedText = `Обновлено: ${dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
                        updateHeaderText(local.forDate, updatedText);
                        setupControls(local.items);
                    } else {
                        throw new Error("Local data is empty, trying live fetch");
                    }
                } catch (error) {
                    console.warn("Could not load local schedule, falling back to live fetch:", error);
                    try {
                        const liveData = await fetchAndParseData();
                        updateHeaderText(liveData.forDate, `Обновлено сейчас: ${timeString}`);
                        setupControls(liveData.items);
                    } catch (liveError) {
                        console.error("Live fetch failed:", liveError);
                        try {
                            const cached = JSON.parse(localStorage.getItem('scheduleCache') || 'null');
                            if (cached && Array.isArray(cached.data) && cached.data.length) {
                                const dt = new Date(cached.ts);
                                const cachedUpdatedText = `Показаны данные из кеша: ${dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
                                updateHeaderText(cached.forDate, cachedUpdatedText);
                                setupControls(cached.data);
                            } else {
                                throw new Error("Cache is also empty");
                            }
                        } catch (_) {
                            updateHeaderText(null, 'Ошибка загрузки данных.');
                            scheduleContainer.innerHTML = `<div class="error-message">Не удалось загрузить расписание. Источник временно недоступен. Попробуйте обновить страницу позже.</div>`;
                        }
                    }
                } finally {
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