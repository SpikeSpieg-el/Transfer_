document.addEventListener('DOMContentLoaded', () => {

            // Translations
            const translations = {
                ru: {
                    title: 'Расписание Вахт',
                    header: 'Расписание автобусов',
                    loading: 'Загрузка данных...',
                    loadingText: 'Загружаем расписание…',
                    fromPlaceholder: 'Откуда...',
                    toPlaceholder: 'Куда...',
                    searchPlaceholder: 'Номер автобуса, описание...',
                    sortLabel: 'Сортировать:',
                    sortTime: 'По времени',
                    sortBus: 'По номеру автобуса',
                    departure: 'Отправление',
                    arrival: 'Прибытие',
                    intermediate: 'Промежуточная',
                    description: 'Описание:',
                    scheduleFor: 'Расписание на:',
                    updated: 'Обновлено:',
                    updatedNow: 'Обновлено сейчас:',
                    cachedData: 'Данные из кеша от:',
                    errorLoading: 'Ошибка загрузки данных.',
                    errorMessage: 'Не удалось загрузить расписание. Источник временно недоступен. Попробуйте обновить страницу позже.',
                    noRoutes: 'Не удалось найти ни одного маршрута.',
                    currentDay: 'Актуальное',
                    previousDay: 'За вчера (вечер сегодня)',
                    archiveNoticeText: 'Вы просматриваете архивное расписание. Данные не обновляются.',
                    hidePast: 'Скрыть прошедшие'
                },
                en: {
                    title: 'Shuttle Schedule',
                    header: 'Bus Schedule',
                    loading: 'Loading data...',
                    loadingText: 'Loading schedule…',
                    fromPlaceholder: 'From...',
                    toPlaceholder: 'To...',
                    searchPlaceholder: 'Bus number, description...',
                    sortLabel: 'Sort by:',
                    sortTime: 'By time',
                    sortBus: 'By bus number',
                    departure: 'Departure',
                    arrival: 'Arrival',
                    intermediate: 'Stop',
                    description: 'Description:',
                    scheduleFor: 'Schedule for:',
                    updated: 'Updated:',
                    updatedNow: 'Updated now:',
                    cachedData: 'Cached data from:',
                    errorLoading: 'Error loading data.',
                    errorMessage: 'Failed to load schedule. Source temporarily unavailable. Please try refreshing the page later.',
                    noRoutes: 'No routes found.',
                    currentDay: 'Current',
                    previousDay: 'Previous (evening today)',
                    archiveNoticeText: 'You are viewing an archived schedule. This data is not updated.',
                    hidePast: 'Hide past routes'
                }
            };

            let currentLang = localStorage.getItem('language') || 'ru';
            let currentTheme = localStorage.getItem('theme') || 'light';
            
            let scheduleData = {
                current: null, // { ts, forDate, items }
                previous: null // { ts, forDate, items }
            };
            let currentView = 'current'; // 'current' or 'previous'
            let currentFilteredData = [];
            let currentSearchTerms = {};


            // Apply theme on load
            document.documentElement.setAttribute('data-theme', currentTheme);

            // Theme toggle
            const themeToggle = document.getElementById('themeToggle');
            const sunIcon = document.getElementById('sunIcon');
            const moonIcon = document.getElementById('moonIcon');

            function updateThemeIcon() {
                if (currentTheme === 'dark') {
                    sunIcon.style.display = 'none';
                    moonIcon.style.display = 'block';
                } else {
                    sunIcon.style.display = 'block';
                    moonIcon.style.display = 'none';
                }
            }

            updateThemeIcon();

            themeToggle.addEventListener('click', () => {
                currentTheme = currentTheme === 'light' ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', currentTheme);
                localStorage.setItem('theme', currentTheme);
                updateThemeIcon();
            });

            // Language toggle
            const langToggle = document.getElementById('langToggle');
            const langText = document.getElementById('langText');

            function updateLanguage() {
                const t = translations[currentLang];
                
                document.querySelectorAll('[data-i18n]').forEach(el => {
                    const key = el.getAttribute('data-i18n');
                    if (t[key]) el.textContent = t[key];
                });

                document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                    const key = el.getAttribute('data-i18n-placeholder');
                    if (t[key]) el.placeholder = t[key];
                });

                document.title = t.title;
                langText.textContent = currentLang === 'ru' ? 'EN' : 'RU';
                document.documentElement.lang = currentLang;
                updateView(); // Re-render headers and cards with new language
            }

            langToggle.addEventListener('click', () => {
                currentLang = currentLang === 'ru' ? 'en' : 'ru';
                localStorage.setItem('language', currentLang);
                updateLanguage();
            });

            // Refresh button functionality
            const refreshBtn = document.getElementById('refreshBtn');
            let isRefreshing = false;

            async function forceRefreshData() {
                if (isRefreshing) return;
                
                isRefreshing = true;
                refreshBtn.classList.add('rotating');
                refreshBtn.disabled = true;

                try {
                    console.log('🔄 Принудительное обновление данных...');
                    const liveData = await fetchAndParseData();
                    handleNewData(liveData);
                    updateView();
                    console.log('✅ Данные успешно обновлены');
                    showNotification(translations[currentLang].updatedNow.replace(':', ''), 'success');
                } catch (error) {
                    console.error('❌ Ошибка обновления:', error);
                    showNotification(translations[currentLang].errorLoading, 'error');
                } finally {
                    isRefreshing = false;
                    refreshBtn.classList.remove('rotating');
                    refreshBtn.disabled = false;
                }
            }

            function showNotification(message, type = 'info') {
                const notification = document.createElement('div');
                notification.className = `notification notification-${type}`;
                notification.textContent = message;
                document.body.appendChild(notification);
                
                setTimeout(() => notification.classList.add('show'), 10);
                setTimeout(() => {
                    notification.classList.remove('show');
                    setTimeout(() => notification.remove(), 300);
                }, 3000);
            }

            refreshBtn.addEventListener('click', forceRefreshData);

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
                    async () => { const r = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`, { mode: 'cors', cache: 'no-store' }); if (!r.ok) throw new Error(`corsproxy.io ${r.status}`); return await r.text(); },
                    async () => { const r = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, { mode: 'cors', cache: 'no-store' }); if (!r.ok) throw new Error(`codetabs ${r.status}`); return await r.text(); },
                    async () => { const r = await fetch(`https://proxy.cors.sh/${targetUrl.replace(/^https?:\/\//, '')}`, { headers: { 'x-cors-api-key': 'temp_1a2b3c4d5e6f7g8h9i0j' }, mode: 'cors', cache: 'no-store' }); if (!r.ok) throw new Error(`proxy.cors.sh ${r.status}`); return await r.text(); },
                    async () => { const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, { mode: 'cors', cache: 'no-store' }); if (!r.ok) throw new Error(`allorigins-raw ${r.status}`); return await r.text(); },
                    async () => { const r = await fetch(`https://corsproxy.org/?${encodeURIComponent(targetUrl)}`, { mode: 'cors', cache: 'no-store' }); if (!r.ok) throw new Error(`corsproxy.org ${r.status}`); return await r.text(); }
                ];

                async function withTimeout(promise, ms) {
                    return Promise.race([ promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)) ]);
                }

                for (const fetcher of tryFetchers) {
                    try {
                        const text = await withTimeout(fetcher(), 15000);
                        if (!text || text.length <= 100) throw new Error('empty');

                        const scheduleDataItems = [];
                        const doc = new DOMParser().parseFromString(text, 'text/html');
                        let forDate = '';
                        const dateMatch = (doc.body.textContent || '').match(/(\d{1,2}\.\d{1,2}(?:\.\d{4})?)/);
                        if (dateMatch) forDate = dateMatch[1].replace(/\.\d{4}$/, '');
                        
                        doc.querySelectorAll('table tr').forEach((row, index) => {
                            if (index === 0) return;
                            const cells = row.querySelectorAll('td');
                            if (cells.length >= 2) {
                                const time = (cells[0]?.textContent || '').trim();
                                const route = (cells[1]?.textContent || '').trim();
                                if (!time || time.toUpperCase() === 'ВРЕМЯ') return;
                                const busesText = (cells[2]?.textContent || '').trim();
                                let buses = Array.from(new Set(busesText.match(/\b\d{3}\b/g) || []));
                                const description = Array.from(cells).slice(3).map(c => c.textContent.trim()).filter(Boolean).join('; ');
                                scheduleDataItems.push({ time, buses, route, description, keywords: `${time} ${buses.join(' ')} ${route} ${description}`.toLowerCase() });
                            }
                        });

                        if (scheduleDataItems.length) return { items: scheduleDataItems, forDate };
                    } catch (e) { console.warn('Fetcher failed:', e.message); }
                }
                throw new Error('All fetchers failed');
            }

            function renderCards(data, searchTerms = {}) {
                const container = document.getElementById('scheduleContainer');
                const t = translations[currentLang];
                container.innerHTML = '';
                
                if (!data || data.length === 0) {
                     container.innerHTML = `<p class="error-message">${t.noRoutes}</p>`;
                     return;
                }

                const { fromValue = '', toValue = '' } = searchTerms;

                data.forEach(item => {
                    const busTags = item.buses.map(bus => `<span class="bus-tag">№ ${bus}</span>`).join('');
                    const stops = item.route.split(/→|\s-\s/).map(s => s.trim()).filter(Boolean);
                    let rowsHTML = '';
                    
                    stops.forEach((stop, index) => {
                        const isFirst = index === 0, isLast = index === stops.length - 1;
                        const label = isFirst ? t.departure : (isLast ? t.arrival : t.intermediate);
                        const iconClass = isFirst ? 'start' : (isLast ? 'end' : 'mid');
                        const stopLower = stop.toLowerCase();
                        const highlightClass = (fromValue && stopLower.includes(fromValue)) || (toValue && stopLower.includes(toValue)) ? 'highlighted' : '';
                        
                        rowsHTML += `
                            <div class="stop-row ${isFirst || isLast ? '' : 'is-mid'} ${highlightClass}">
                                <div class="stop-visual">
                                    <div class="stop-icon ${iconClass}"></div>
                                    ${!isLast ? `<div class="v-line"></div>` : ''}
                                </div>
                                <div class="stop-details">
                                    <div class="label">${label}</div>
                                    <div class="location">${stop}</div>
                                </div>
                            </div>`;
                    });
                    
                    const cardHTML = `
                        <article class="route-card" data-time="${item.time}" data-bus="${item.buses[0] || ''}" data-keywords="${item.keywords}">
                            <header class="card-header">
                                <span class="time">${item.time}</span>
                                <div class="bus-list">${busTags}</div>
                            </header>
                            <div class="route-path">${rowsHTML}</div>
                            ${item.description ? `<footer class="card-footer"><p><span class="label">${t.description}</span> ${item.description}</p></footer>` : ''}
                        </article>`;
                    container.insertAdjacentHTML('beforeend', cardHTML);
                });
            }
            
            function updateHeaderText(forDate, lastUpdated) {
                const scheduleDateElem = document.getElementById('scheduleDate');
                const lastUpdatedElem = document.getElementById('lastUpdated');
                const t = translations[currentLang];
                const datePrefix = t.scheduleFor;
                
                scheduleDateElem.textContent = `${datePrefix} ${forDate || new Date().toLocaleDateString(currentLang === 'ru' ? 'ru-RU' : 'en-US', { day: '2-digit', month: '2-digit' })}`;
                lastUpdatedElem.textContent = lastUpdated;
            }

            function isDataStale(generatedAt, forDate) {
                if (!generatedAt) return true;
                if ((new Date() - new Date(generatedAt)) / (1000 * 60 * 60) > 15) return true;
                if (forDate) {
                    const [day, month] = forDate.split('.').map(Number);
                    const now = new Date();
                    const scheduleDate = new Date(now.getFullYear(), month - 1, day);
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
                    if (scheduleDate.getTime() < today.getTime() || scheduleDate.getTime() > tomorrow.getTime()) return true;
                }
                return false;
            }

            function handleNewData(newData) {
                const currentCache = scheduleData.current;
                if (currentCache && currentCache.forDate && newData.forDate && newData.forDate !== currentCache.forDate) {
                    if (!scheduleData.previous || scheduleData.previous.forDate !== currentCache.forDate) {
                        console.log(`Archiving schedule for ${currentCache.forDate}.`);
                        localStorage.setItem('previousScheduleCache', JSON.stringify(currentCache));
                        scheduleData.previous = currentCache;
                    }
                }
                const newCacheEntry = { ts: Date.now(), forDate: newData.forDate, items: newData.items };
                localStorage.setItem('scheduleCache', JSON.stringify(newCacheEntry));
                scheduleData.current = newCacheEntry;
            }

            async function initializeApp() {
                scheduleData.current = JSON.parse(localStorage.getItem('scheduleCache') || 'null');
                scheduleData.previous = JSON.parse(localStorage.getItem('previousScheduleCache') || 'null');
                
                try {
                    const local = await fetchLocalSchedule();
                    if (!isDataStale(local.generatedAt, local.forDate)) {
                        handleNewData({ forDate: local.forDate, items: local.items });
                        console.log('✅ Using fresh local data');
                    } else {
                        throw new Error("Local data is stale");
                    }
                } catch (e) {
                    console.warn(`Could not use local data (${e.message}), trying live fetch...`);
                    try {
                        const liveData = await fetchAndParseData();
                        handleNewData(liveData);
                        console.log('✅ Fetched fresh data from server');
                    } catch (liveError) {
                        console.error(`Live fetch failed: ${liveError.message}`);
                        if (!scheduleData.current) {
                            const t = translations[currentLang];
                            updateHeaderText(null, t.errorLoading);
                            document.getElementById('scheduleContainer').innerHTML = `<div class="error-message">${t.errorMessage}</div>`;
                            document.getElementById('loader').classList.add('hidden');
                            return;
                        }
                        console.log('⚠️ Using stale data from cache');
                    }
                }
                setupControls();
                updateView();
                document.getElementById('loader').classList.add('hidden');
            }
            
            function updateView() {
                const t = translations[currentLang];
                const locale = currentLang === 'ru' ? 'ru-RU' : 'en-US';
                const dataToShow = scheduleData[currentView];
                
                const currentDayBtn = document.getElementById('currentDayBtn');
                const previousDayBtn = document.getElementById('previousDayBtn');
                const archiveNotice = document.getElementById('archiveNotice');
                
                const hidePastToggle = document.getElementById('hidePastToggle');
    
                if (currentView === 'previous') {
                    hidePastToggle.disabled = true;
                    hidePastToggle.checked = false; // Сбрасываем состояние при переключении
                } else {
                    hidePastToggle.disabled = false;
                }

                previousDayBtn.disabled = !scheduleData.previous;
                currentDayBtn.classList.toggle('active', currentView === 'current');
                previousDayBtn.classList.toggle('active', currentView === 'previous');
                archiveNotice.classList.toggle('visible', currentView === 'previous');

                if (!dataToShow || !dataToShow.items) {
                    document.getElementById('scheduleContainer').innerHTML = `<p class="error-message">${t.noRoutes}</p>`;
                    updateHeaderText(null, '');
                    return;
                }

                const dt = new Date(dataToShow.ts);
                const dateStr = dt.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
                const timeStr = dt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
                const updatedText = `${currentView === 'current' ? t.updated : t.cachedData} ${dateStr} ${timeStr}`;
                updateHeaderText(dataToShow.forDate, updatedText);
                
                applyFiltersAndSort();
            }

            function applyFiltersAndSort() {
                const activeDataSet = scheduleData[currentView];
                if (!activeDataSet || !activeDataSet.items) {
                    renderCards([]);
                    return;
                }

                const fromValue = document.getElementById('fromInput').value.toLowerCase().trim();
                const toValue = document.getElementById('toInput').value.toLowerCase().trim();
                const generalValue = document.getElementById('generalFilter').value.toLowerCase().trim();
                const hidePast = document.getElementById('hidePastToggle').checked;
                currentSearchTerms = { fromValue, toValue };

                currentFilteredData = activeDataSet.items.filter(item => {
                    if (generalValue && !item.keywords.includes(generalValue)) return false;
                    const stops = item.route.toLowerCase().split(/→|\s-\s/).map(s => s.trim());
                    const fromIndex = stops.findIndex(s => s.includes(fromValue));
                    if (fromValue && fromIndex === -1) return false;
                    const toIndex = stops.findIndex(s => s.includes(toValue));
                    if (toValue && (toIndex === -1 || (fromValue && toIndex <= fromIndex))) return false;
                    if (hidePast && currentView === 'current') {
            const now = new Date();
            const [hours, minutes] = item.time.split(':').map(Number);
            
            // Если время не является числовым (например, "по набору"), не скрываем
            if (isNaN(hours) || isNaN(minutes)) {
                return true;
            }
            
            const routeDate = new Date();
            routeDate.setHours(hours, minutes, 0, 0); // Устанавливаем время рейса на сегодня
            
            if (routeDate < now) {
                return false; // Рейс уже прошел, скрываем его
            }
        }
                    return true;
                });
                sortAndRender();
            }

            function sortAndRender() {
                const activeSort = document.getElementById('sortByTimeBtn').classList.contains('active') ? 'time' : 'bus';
                if (activeSort === 'time') {
                    currentFilteredData.sort((a, b) => a.time.localeCompare(b.time, 'kn', { numeric: true }));
                } else {
                    currentFilteredData.sort((a, b) => (parseInt(a.buses[0]) || 9999) - (parseInt(b.buses[0]) || 9999));
                }
                renderCards(currentFilteredData, currentSearchTerms);
            }

            function setupControls() {
                ['fromInput', 'toInput', 'generalFilter'].forEach(id => {
                    document.getElementById(id).addEventListener('input', applyFiltersAndSort);
                });
                document.getElementById('hidePastToggle').addEventListener('change', applyFiltersAndSort);
                
                document.getElementById('sortByTimeBtn').addEventListener('click', (e) => {
                    e.currentTarget.classList.add('active');
                    document.getElementById('sortByBusBtn').classList.remove('active');
                    sortAndRender();
                });
                document.getElementById('sortByBusBtn').addEventListener('click', (e) => {
                    e.currentTarget.classList.add('active');
                    document.getElementById('sortByTimeBtn').classList.remove('active');
                    sortAndRender();
                });

                document.getElementById('currentDayBtn').addEventListener('click', () => {
                    if (currentView === 'current') return;
                    currentView = 'current';
                    updateView();
                });
                document.getElementById('previousDayBtn').addEventListener('click', () => {
                    if (currentView === 'previous' || !scheduleData.previous) return;
                    currentView = 'previous';
                    updateView();
                });
            }

            initializeApp();
        });