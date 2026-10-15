/**
 * Topflix - Frontend Application
 */

// HTML sanitization to prevent XSS
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// State management
let allData = {
    top10: {
        movies: [],
        series: [],
        updated: '',
        next_update: ''
    },
    new: {
        movies: [],
        series: [],
        updated: '',
        period: ''
    }
};

let currentSection = 'top10'; // top10, new
let currentSort = 'rank'; // rank, rating, recommended, popularity

// Region filter
const INCLUDE_INTERNATIONAL_KEY = 'topflix_include_international';
let includeInternational = false;

// Platform filter
const PLATFORM_FILTER_KEY = 'topflix_platform_filter';
let activePlatform = 'all'; // all, netflix, disney, apple, prime, max, skyshowtime

// Genre filter
const GENRE_FILTER_KEY = 'topflix_genre_filter';
let activeGenre = 'all';

// My services
const MY_SERVICES_KEY = 'topflix_my_services';
let myServices = []; // array of provider slugs user subscribes to
let myServicesFilterActive = false;

// Search
let searchQuery = '';
let searchResults = null; // null = not searching, array = search results
let searchDebounceTimer = null;

let tonightSettled = { top10: false, new: false };
let tonightIgnoreServices = false;
let sectionLoading = { top10: false, new: false };

const REGIONAL_ORIGINS = new Set([
    'JP', 'KR', 'CN', 'TW', 'HK', 'TH', 'IN', 'ID', 'PH', 'VN', 'SG', 'MY',
    'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'UY', 'PY'
]);

// Provider display names
const PROVIDER_NAMES = {
    netflix: 'Netflix',
    disney: 'Disney+',
    apple: 'Apple TV+',
    prime: 'Prime Video',
    max: 'Max',
    skyshowtime: 'SkyShowtime'
};

// API endpoints
const API_ENDPOINTS = {
    top10: '/api/top10',
    new: '/api/netflix-new'
};

// DOM elements
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const content = document.getElementById('content');
const updateInfo = document.getElementById('updateInfo');
const lastUpdate = document.getElementById('lastUpdate');
const nextUpdate = document.getElementById('nextUpdate');
const tabButtons = document.querySelectorAll('.tab-btn');
const sortSelect = document.getElementById('sortSelect');
const themeToggle = document.getElementById('themeToggle');
const includeInternationalCheckbox = document.getElementById('includeInternational');
const hiddenCountFeedback = document.getElementById('hiddenCountFeedback');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initRegionFilter();
    initPlatformFilter();
    initMyServices();
    initGenreFilter();
    initSearch();
    initFilterDisclosure();
    loadHome();
    setupEventListeners();
    setupNewsletterForm();
});

function cardOptions(extra = {}) {
    return {
        preferredProviders: myServices,
        defaultType: 'movie',
        ...extra
    };
}

function isRegionalOrigin(item) {
    const origins = item.origin_country || [];
    return origins.some((country) => REGIONAL_ORIGINS.has(country));
}

// Platform filter management
function initPlatformFilter() {
    // Netflix je výchozí. Kdo si vybere jinou službu nebo "Vše", tomu to zůstane.
    const saved = localStorage.getItem(PLATFORM_FILTER_KEY);
    activePlatform = saved || 'netflix';
    updatePlatformChips();
}

function updatePlatformChips() {
    const chips = document.querySelectorAll('.platform-chip');
    chips.forEach(chip => {
        if (chip.dataset.provider === activePlatform) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });
}

function filterByPlatform(items) {
    if (activePlatform === 'all') return items;
    return items.filter(item => {
        const providers = item.providers || [];
        // Netflix Top 10 je z Netflixu, i když TMDB službu ještě nezná.
        if (activePlatform === 'netflix' && currentSection === 'top10' && providers.length === 0) return true;
        return providers.includes(activePlatform);
    });
}

// My Services management
function initMyServices() {
    const saved = localStorage.getItem(MY_SERVICES_KEY);
    if (saved) {
        try { myServices = JSON.parse(saved); } catch(e) { myServices = []; }
    }
    updateMyServicesUI();
}

function updateMyServicesUI() {
    const checkboxes = document.querySelectorAll('.service-checkbox');
    checkboxes.forEach(label => {
        const input = label.querySelector('input');
        const service = label.dataset.service;
        if (myServices.includes(service)) {
            input.checked = true;
            label.classList.add('checked');
        } else {
            input.checked = false;
            label.classList.remove('checked');
        }
    });

    const btn = document.getElementById('myServicesBtn');
    if (btn) {
        if (myServices.length > 0 && myServicesFilterActive) {
            btn.classList.add('active');
            btn.textContent = `Moje služby (${myServices.length})`;
        } else if (myServices.length > 0) {
            btn.classList.remove('active');
            btn.textContent = `Moje služby (${myServices.length})`;
        } else {
            btn.classList.remove('active');
            btn.textContent = 'Moje služby';
        }
    }
}

function filterByMyServices(items) {
    if (!myServicesFilterActive || myServices.length === 0) return items;
    return items.filter(item => {
        const providers = item.providers || [];
        return providers.some(p => myServices.includes(p));
    });
}

// Genre filter management
function initGenreFilter() {
    const saved = localStorage.getItem(GENRE_FILTER_KEY);
    activeGenre = saved || 'all';
}

function extractGenres(items) {
    const genreSet = new Set();
    items.forEach(item => {
        if (item.genre) {
            item.genre.split(',').forEach(g => {
                const trimmed = g.trim();
                if (trimmed && trimmed !== 'N/A') genreSet.add(trimmed);
            });
        }
    });
    return Array.from(genreSet).sort();
}

function renderGenreChips(genres) {
    const container = document.getElementById('genreFilter');
    if (!container) return;

    if (genres.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '<button class="genre-chip' + (activeGenre === 'all' ? ' active' : '') + '" data-genre="all">Vše</button>';
    genres.forEach(genre => {
        const isActive = activeGenre === genre ? ' active' : '';
        html += `<button class="genre-chip${isActive}" data-genre="${escapeHtml(genre)}">${escapeHtml(genre)}</button>`;
    });
    container.innerHTML = html;

    container.querySelectorAll('.genre-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            activeGenre = chip.dataset.genre;
            localStorage.setItem(GENRE_FILTER_KEY, activeGenre);
            container.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderContent();
        });
    });
}

function filterByGenre(items) {
    if (activeGenre === 'all') return items;
    return items.filter(item => {
        if (!item.genre) return false;
        return item.genre.split(',').some(g => g.trim() === activeGenre);
    });
}

// Search functionality
function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');

    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchDebounceTimer);

        if (query.length === 0) {
            clearSearch();
            return;
        }

        searchClear.classList.remove('hidden');

        if (query.length < 2) return;

        searchDebounceTimer = setTimeout(() => {
            performSearch(query);
        }, 300);
    });

    if (searchClear) {
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            clearSearch();
        });
    }
}

function clearSearch() {
    searchQuery = '';
    searchResults = null;
    const searchClear = document.getElementById('searchClear');
    const searchInfo = document.getElementById('searchResultsInfo');
    if (searchClear) searchClear.classList.add('hidden');
    if (searchInfo) searchInfo.classList.add('hidden');
    renderContent();
}

async function performSearch(query) {
    searchQuery = query;
    const searchInfo = document.getElementById('searchResultsInfo');

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=movie`);
        if (!response.ok) throw new Error('Search failed');
        const data = await response.json();

        searchResults = data.data || [];

        if (searchInfo) {
            searchInfo.textContent = `Nalezeno ${searchResults.length} výsledků pro "${escapeHtml(query)}"`;
            searchInfo.classList.remove('hidden');
        }

        renderSearchResults();
    } catch (err) {
        console.error('Search error:', err);
        // Fallback: filter loaded data locally
        searchResults = null;
        const allItems = getFilteredData();
        const matched = allItems.filter(item =>
            (item.title && item.title.toLowerCase().includes(query.toLowerCase())) ||
            (item.title_original && item.title_original.toLowerCase().includes(query.toLowerCase()))
        );

        if (searchInfo) {
            searchInfo.textContent = `Nalezeno ${matched.length} výsledků pro "${escapeHtml(query)}"`;
            searchInfo.classList.remove('hidden');
        }

        content.innerHTML = '';
        if (matched.length === 0) {
            content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Nic nenalezeno.</p>';
        } else {
            matched.forEach(item => content.appendChild(createTitleCard(item, cardOptions())));
        }
    }
}

function renderSearchResults() {
    if (!searchResults) return;

    content.innerHTML = '';
    if (searchResults.length === 0) {
        content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Nic nenalezeno.</p>';
        return;
    }

    searchResults.forEach(item => {
        // Normalize archive-style items to match card format
        if (!item.quality && item.quality_tier) item.quality = item.quality_tier;
        if (!item.quality) item.quality = getRatingQuality(item.avg_rating);
        if (item.streaming_providers && !item.providers) item.providers = item.streaming_providers;
        content.appendChild(createTitleCard(item, cardOptions()));
    });
}

// JSON-LD structured data for SEO
function generateJsonLd(items) {
    const ldItems = items.slice(0, 20).map(item => {
        const schema = {
            '@type': item.type === 'series' ? 'TVSeries' : 'Movie',
            'name': item.title || item.title_original,
            'datePublished': item.year || undefined,
            'genre': item.genre ? item.genre.split(',').map(g => g.trim()) : undefined,
            'description': item.description || undefined,
            'image': item.poster_url || undefined
        };
        if (item.avg_rating) {
            schema.aggregateRating = {
                '@type': 'AggregateRating',
                'ratingValue': (item.avg_rating / 10).toFixed(1),
                'bestRating': '10',
                'worstRating': '0'
            };
        }
        return schema;
    });

    return {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        'name': 'Topflix - Nejlepší filmy na streamovacích platformách',
        'itemListElement': ldItems.map((item, i) => ({
            '@type': 'ListItem',
            'position': i + 1,
            'item': item
        }))
    };
}

function injectJsonLd(items) {
    // Remove previous JSON-LD
    const existing = document.getElementById('topflix-jsonld');
    if (existing) existing.remove();

    if (!items || items.length === 0) return;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'topflix-jsonld';
    script.textContent = JSON.stringify(generateJsonLd(items));
    document.head.appendChild(script);
}

// Theme management with auto mode based on sunrise/sunset in Prague
function getSunriseSunset() {
    // Prague coordinates
    const latitude = 50.0755;
    const longitude = 14.4378;

    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Calculate day of year
    const dayOfYear = Math.floor((now - new Date(year, 0, 0)) / 86400000);

    // Solar declination (simplified)
    const declination = -23.45 * Math.cos((360 / 365) * (dayOfYear + 10) * Math.PI / 180);

    // Hour angle for sunrise/sunset
    const hourAngle = Math.acos(
        -Math.tan(latitude * Math.PI / 180) * Math.tan(declination * Math.PI / 180)
    ) * 180 / Math.PI;

    // Calculate sunrise and sunset in UTC
    const solarNoon = 12 - (longitude / 15);
    const sunriseUTC = solarNoon - (hourAngle / 15);
    const sunsetUTC = solarNoon + (hourAngle / 15);

    // Convert to Prague time (UTC+1 in winter, UTC+2 in summer)
    const isDST = isDaylightSavingTime(now);
    const offset = isDST ? 2 : 1;

    const sunrise = sunriseUTC + offset;
    const sunset = sunsetUTC + offset;

    return { sunrise, sunset };
}

function isDaylightSavingTime(date) {
    // DST in EU: last Sunday in March to last Sunday in October
    const year = date.getFullYear();

    // Last Sunday in March
    const marchLastSunday = new Date(year, 2, 31);
    marchLastSunday.setDate(31 - marchLastSunday.getDay());

    // Last Sunday in October
    const octoberLastSunday = new Date(year, 9, 31);
    octoberLastSunday.setDate(31 - octoberLastSunday.getDay());

    return date >= marchLastSunday && date < octoberLastSunday;
}

function shouldUseDarkMode() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours + minutes / 60;

    const { sunrise, sunset } = getSunriseSunset();

    // Dark mode between sunset and sunrise
    return currentTime < sunrise || currentTime >= sunset;
}

function applyTheme(theme) {
    let actualTheme = theme;

    // If auto mode, determine actual theme based on sun position
    if (theme === 'auto') {
        actualTheme = shouldUseDarkMode() ? 'dark' : 'light';
    }

    // Apply theme
    if (actualTheme === 'light') {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
    }

    // Update icon
    const icons = {
        'light': '☀️',
        'dark': '🌙',
        'auto': '🌓'
    };
    themeToggle.querySelector('.theme-icon').textContent = icons[theme];
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    applyTheme(savedTheme);

    // If auto mode, update every minute
    if (savedTheme === 'auto') {
        setInterval(() => {
            applyTheme('auto');
        }, 60000); // Check every minute
    }
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'auto';

    // Cycle through: dark → light → auto → dark
    let nextTheme;
    if (currentTheme === 'dark') {
        nextTheme = 'light';
    } else if (currentTheme === 'light') {
        nextTheme = 'auto';
    } else {
        nextTheme = 'dark';
    }

    localStorage.setItem('theme', nextTheme);
    applyTheme(nextTheme);

    // If switching to auto, start interval
    if (nextTheme === 'auto') {
        setInterval(() => {
            if (localStorage.getItem('theme') === 'auto') {
                applyTheme('auto');
            }
        }, 60000);
    }
}

// Region filter management
function initRegionFilter() {
    // Load preference from localStorage (default: false = hide international)
    const saved = localStorage.getItem(INCLUDE_INTERNATIONAL_KEY);
    includeInternational = saved === 'true';
    includeInternationalCheckbox.checked = includeInternational;
}

function toggleInternational() {
    includeInternational = includeInternationalCheckbox.checked;
    localStorage.setItem(INCLUDE_INTERNATIONAL_KEY, includeInternational);
    renderContent();
}

// Filter by region - remove Asian and Latin American films/series
function filterByRegion(items) {
    if (includeInternational) {
        hiddenCountFeedback.classList.add('hidden');
        return items;
    }

    const filtered = items.filter(item => !isRegionalOrigin(item));

    // Update feedback
    const hiddenCount = items.length - filtered.length;
    if (hiddenCount > 0) {
        hiddenCountFeedback.textContent = `(${hiddenCount} ${hiddenCount === 1 ? 'film skryt' : 'filmů skryto'})`;
        hiddenCountFeedback.classList.remove('hidden');
    } else {
        hiddenCountFeedback.classList.add('hidden');
    }

    return filtered;
}

// Event listeners
function setupEventListeners() {
    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);

    // Region filter toggle
    includeInternationalCheckbox.addEventListener('change', toggleInternational);

    // Section tabs
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSection = btn.dataset.section;

            // Update sort options based on section
            updateSortOptions();

            // Load data for the section if not already loaded
            if (currentSection === 'new' && allData.new.movies.length === 0 && allData.new.series.length === 0 && !sectionLoading.new) {
                fetchData('new');
            } else if (!sectionLoading[currentSection]) {
                displayData();
            }
        });
    });

    // Sort select
    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderContent();
    });

    // Platform filter chips
    document.querySelectorAll('.platform-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            activePlatform = chip.dataset.provider;
            localStorage.setItem(PLATFORM_FILTER_KEY, activePlatform);
            updatePlatformChips();
            renderContent();
        });
    });

    // My Services toggle
    const myServicesBtn = document.getElementById('myServicesBtn');
    const myServicesPanel = document.getElementById('myServicesPanel');
    if (myServicesBtn && myServicesPanel) {
        myServicesBtn.addEventListener('click', () => {
            if (myServicesPanel.classList.contains('hidden')) {
                myServicesPanel.classList.remove('hidden');
            } else if (myServices.length > 0) {
                // Toggle filter active/inactive
                myServicesFilterActive = !myServicesFilterActive;
                updateMyServicesUI();
                renderContent();
            } else {
                myServicesPanel.classList.add('hidden');
            }
        });

        // Service checkboxes
        myServicesPanel.querySelectorAll('.service-checkbox').forEach(label => {
            label.addEventListener('click', (e) => {
                e.preventDefault();
                const input = label.querySelector('input');
                const service = input.value;
                if (myServices.includes(service)) {
                    myServices = myServices.filter(s => s !== service);
                } else {
                    myServices.push(service);
                }
                localStorage.setItem(MY_SERVICES_KEY, JSON.stringify(myServices));
                tonightIgnoreServices = false;
                updateMyServicesUI();
                renderTonight();
                if (myServicesFilterActive) renderContent();
            });
        });
    }
}

// Update sort options based on section
function updateSortOptions() {
    if (currentSection === 'top10') {
        sortSelect.innerHTML = `
            <option value="rank">Pořadí na Netflix</option>
            <option value="rating">Hodnocení (nejlepší)</option>
            <option value="recommended">Jen doporučené (≥70%)</option>
        `;
        if (currentSort === 'popularity') currentSort = 'rank';
    } else if (currentSection === 'new') {
        sortSelect.innerHTML = `
            <option value="popularity">Popularita</option>
            <option value="rating">Hodnocení (nejlepší)</option>
            <option value="recommended">Jen doporučené (≥70%)</option>
        `;
        if (currentSort === 'rank') currentSort = 'popularity';
    }
    sortSelect.value = currentSort;
}

function loadHome() {
    return Promise.all([
        fetchData('top10'),
        fetchData('new', { silent: true })
    ]);
}

// Fetch data from API
async function fetchData(section = 'top10', options = {}) {
    const silent = !!options.silent;
    if (sectionLoading[section]) return;
    sectionLoading[section] = true;

    try {
        if (!silent) {
            loading.classList.remove('hidden');
            error.classList.add('hidden');
            content.classList.add('hidden');
            updateInfo.classList.add('hidden');
        }

        const endpoint = API_ENDPOINTS[section];
        const cacheKey = `topflix_data_${section}`;

        // Try to get from localStorage first (2-hour cache)
        const cachedData = getCachedData(cacheKey);
        if (cachedData) {
            // Sanitize cached data too (in case old invalid data is cached)
            const sanitized = sanitizeData(cachedData);
            allData[section] = sanitized;
            tonightSettled[section] = true;
            if (section === currentSection) displayData();
            else renderTonight();
            return;
        }

        // Fetch from API
        const response = await fetch(endpoint);

        if (!response.ok) {
            // Try to get error details from response
            let errorDetails = 'Failed to fetch data';
            try {
                const errorData = await response.json();
                console.error('API Error:', errorData);
                if (errorData.error) {
                    errorDetails = errorData.error;
                }
                if (errorData.details) {
                    console.error('Details:', errorData.details);
                }
                if (errorData.stack) {
                    console.error('Stack:', errorData.stack);
                }
            } catch (e) {
                console.error('Could not parse error response');
            }
            throw new Error(errorDetails);
        }

        const data = await response.json();

        // Check if data has error field
        if (data.error) {
            console.error('API returned error:', data);
            throw new Error(data.error);
        }

        // Sanitize data - remove invalid ČSFD ratings (< 10%)
        const sanitized = sanitizeData(data);
        allData[section] = sanitized;
        tonightSettled[section] = true;

        // Cache the data
        cacheData(data, cacheKey);

        if (section === currentSection) displayData();
        else renderTonight();
    } catch (err) {
        console.error('Error fetching data:', err);
        tonightSettled[section] = true;
        if (silent) {
            renderTonight();
            return;
        }
        loading.classList.add('hidden');
        error.classList.remove('hidden');
        renderTonight();
    } finally {
        sectionLoading[section] = false;
    }
}

// Sanitize data - remove invalid ČSFD ratings
function sanitizeData(data) {
    const cleanData = { ...data };

    // Clean movies
    if (cleanData.movies) {
        cleanData.movies = cleanData.movies.map(movie => {
            const cleanMovie = { ...movie };

            // Remove ČSFD rating if < 10% (invalid)
            if (cleanMovie.csfd_rating && cleanMovie.csfd_rating < 10) {
                console.warn(`Removing invalid ČSFD rating ${cleanMovie.csfd_rating}% for movie: ${cleanMovie.title}`);
                delete cleanMovie.csfd_rating;

                // Recalculate average rating without ČSFD
                if (cleanMovie.tmdb_rating) {
                    cleanMovie.avg_rating = Math.round(cleanMovie.tmdb_rating * 10);

                    // Update quality
                    if (cleanMovie.avg_rating >= 80) cleanMovie.quality = 'excellent';
                    else if (cleanMovie.avg_rating >= 70) cleanMovie.quality = 'good';
                    else if (cleanMovie.avg_rating >= 60) cleanMovie.quality = 'average';
                    else if (cleanMovie.avg_rating >= 50) cleanMovie.quality = 'below-average';
                    else cleanMovie.quality = 'poor';
                }
            }

            return cleanMovie;
        });
    }

    // Clean series
    if (cleanData.series) {
        cleanData.series = cleanData.series.map(series => {
            const cleanSeries = { ...series };

            // Remove ČSFD rating if < 10% (invalid)
            if (cleanSeries.csfd_rating && cleanSeries.csfd_rating < 10) {
                console.warn(`Removing invalid ČSFD rating ${cleanSeries.csfd_rating}% for series: ${cleanSeries.title}`);
                delete cleanSeries.csfd_rating;

                // Recalculate average rating without ČSFD
                if (cleanSeries.tmdb_rating) {
                    cleanSeries.avg_rating = Math.round(cleanSeries.tmdb_rating * 10);

                    // Update quality
                    if (cleanSeries.avg_rating >= 80) cleanSeries.quality = 'excellent';
                    else if (cleanSeries.avg_rating >= 70) cleanSeries.quality = 'good';
                    else if (cleanSeries.avg_rating >= 60) cleanSeries.quality = 'average';
                    else if (cleanSeries.avg_rating >= 50) cleanSeries.quality = 'below-average';
                    else cleanSeries.quality = 'poor';
                }
            }

            return cleanSeries;
        });
    }

    return cleanData;
}

// Cache management
function cacheData(data, key) {
    const cacheItem = {
        data,
        timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(cacheItem));
}

// Cache TTL per section: top10 changes weekly, netflix-new changes daily
const CACHE_TTL = {
    topflix_data_top10: 24 * 60 * 60 * 1000, // 24 hours
    topflix_data_new: 12 * 60 * 60 * 1000     // 12 hours
};

function getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    try {
        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        const ttl = CACHE_TTL[key] || 2 * 60 * 60 * 1000;

        if (age < ttl) {
            return data;
        }
    } catch (err) {
        console.error('Error reading cache:', err);
    }

    return null;
}

// Display data
function displayData() {
    loading.classList.add('hidden');
    content.classList.remove('hidden');
    updateInfo.classList.remove('hidden');

    const sectionData = allData[currentSection];

    // Update info based on section
    if (currentSection === 'top10') {
        lastUpdate.textContent = `Aktualizováno: ${formatDate(sectionData.updated)}`;
        // Show Netflix week info if available
        const weekInfo = sectionData.week ? ` (Netflix týden: ${formatDate(sectionData.week)})` : '';
        nextUpdate.textContent = `Další update: ${formatDate(sectionData.next_update)}${weekInfo}`;
    } else if (currentSection === 'new') {
        lastUpdate.textContent = `Aktualizováno: ${formatDate(sectionData.updated)}`;
        nextUpdate.textContent = sectionData.period || 'Posledních 6 měsíců';
    }

    // Render content
    renderContent();
}

// Render content based on filters and sort
function renderContent() {
    renderTonight();
    syncFilterStatus();

    // If search is active, show search results
    if (searchQuery && searchResults) {
        renderSearchResults();
        return;
    }

    const filteredData = getFilteredData();
    const platformFiltered = filterByPlatform(filteredData);
    const servicesFiltered = filterByMyServices(platformFiltered);
    const genreFiltered = filterByGenre(servicesFiltered);
    const regionFiltered = filterByRegion(genreFiltered);
    const sortedData = getSortedData(regionFiltered);

    // Update genre chips based on current data (before genre filter)
    const genresFromData = extractGenres(filterByPlatform(getFilteredData()));
    renderGenreChips(genresFromData);

    content.innerHTML = '';

    if (sortedData.length === 0) {
        content.innerHTML = '<p class="empty-note">Žádné tituly k zobrazení.</p>';
        return;
    }

    sortedData.forEach(item => {
        content.appendChild(createTitleCard(item, cardOptions()));
    });

    // Inject JSON-LD structured data
    injectJsonLd(sortedData);
}

// Get filtered data - Movies only for this page
function getFilteredData() {
    const sectionData = allData[currentSection];
    const items = sectionData.movies || [];
    return items.filter(item => item.title || item.title_original);
}

function syncFilterStatus() {
    const parts = [];
    if (activePlatform !== 'all') parts.push(PROVIDER_NAMES[activePlatform] || activePlatform);
    if (activeGenre !== 'all') parts.push(activeGenre);
    if (currentSort === 'recommended') parts.push('jen nad 70 %');
    else if (currentSort === 'rating') parts.push('podle hodnocení');
    updateFilterStatus(parts);
}

function pickScore(item) {
    let score = Number(item.avg_rating) || 0;
    if (item._fromTop10 && item.rank) score += 8;
    else if (item._fromTop10) score += 4;
    const year = parseInt(item.year, 10);
    if (year >= new Date().getFullYear() - 1) score += 3;
    return score;
}

function tonightReason(item) {
    if (item._fromTop10 && item.rank) {
        const providers = item.providers || [];
        if (providers.length === 0 || providers.includes('netflix')) {
            return `Teď ${item.rank}. na Netflixu`;
        }
        const where = (PROVIDER_NAMES[providers[0]] || providers[0]);
        return `${item.rank}. v Top 10, běží na ${where}`;
    }
    const year = parseInt(item.year, 10);
    const fresh = year >= new Date().getFullYear() - 1;
    if (fresh && item.avg_rating >= 80) return 'Nové a vysoko hodnocené';
    if (fresh) return 'Novější titul nad 70 %';
    if (item.avg_rating >= 80) return 'Patří k tomu lepšímu, co teď běží';
    return 'Jistější volba nad 70 %';
}

function addTonightItem(map, item, fromTop10) {
    if (!item || !item.tmdb_id) return;
    const rating = Number(item.avg_rating);
    if (!Number.isFinite(rating) || rating < 70) return;
    if (!includeInternational && isRegionalOrigin(item)) return;
    const providers = item.providers || [];
    if (!tonightIgnoreServices && myServices.length > 0 && !providers.some((provider) => myServices.includes(provider))) return;

    const type = item.type === 'series' ? 'series' : 'movie';
    const key = `${type}:${item.tmdb_id}`;
    const next = { ...item, type, _fromTop10: fromTop10 };
    const prev = map.get(key);
    if (!prev || fromTop10) {
        map.set(key, {
            ...(prev || {}),
            ...next,
            rank: item.rank || prev?.rank,
            _fromTop10: fromTop10 || prev?._fromTop10 || false
        });
    }
}

function collectTonightPool() {
    const map = new Map();
    (allData.top10.movies || []).forEach((item) => addTonightItem(map, item, true));
    (allData.top10.series || []).forEach((item) => addTonightItem(map, item, true));
    (allData.new.movies || []).forEach((item) => addTonightItem(map, { ...item, type: item.type || 'movie' }, false));
    (allData.new.series || []).forEach((item) => addTonightItem(map, { ...item, type: 'series' }, false));
    return [...map.values()];
}

function takeTonightPicks(items) {
    const sorted = [...items].sort((a, b) => pickScore(b) - pickScore(a));
    const picks = [];
    const counts = { movie: 0, series: 0 };
    sorted.forEach((item) => {
        if (picks.length >= 6) return;
        const type = item.type === 'series' ? 'series' : 'movie';
        if (counts[type] >= 4) return;
        picks.push(item);
        counts[type] += 1;
    });
    if (picks.length < 6) {
        sorted.forEach((item) => {
            if (picks.length >= 6 || picks.includes(item)) return;
            picks.push(item);
        });
    }
    return picks.map((item) => ({ ...item, reason: tonightReason(item) }));
}

function renderServicesHint() {
    const hint = document.getElementById('tonightServicesHint');
    if (!hint) return;
    hint.replaceChildren();

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-btn';

    if (myServices.length === 0) {
        button.textContent = 'Vybrat moje služby';
        button.addEventListener('click', () => {
            openFilterPanel();
            const panel = document.getElementById('myServicesPanel');
            if (panel) panel.classList.remove('hidden');
        });
        hint.appendChild(button);
        return;
    }

    if (tonightIgnoreServices) {
        hint.append('Výběr ze všech služeb. ');
        button.textContent = 'Vrátit moje služby';
        button.addEventListener('click', () => {
            tonightIgnoreServices = false;
            renderTonight();
        });
        hint.appendChild(button);
        return;
    }

    const names = myServices.map((service) => PROVIDER_NAMES[service] || service).join(', ');
    hint.append(`Jen ${names}. `);
    button.textContent = 'Změnit';
    button.addEventListener('click', () => {
        openFilterPanel();
        const panel = document.getElementById('myServicesPanel');
        if (panel) panel.classList.remove('hidden');
    });
    hint.appendChild(button);
}

function withTonightFlags(flags, readPool) {
    const savedIgnore = tonightIgnoreServices;
    const savedRegion = includeInternational;
    if (Object.prototype.hasOwnProperty.call(flags, 'ignoreServices')) {
        tonightIgnoreServices = flags.ignoreServices;
    }
    if (Object.prototype.hasOwnProperty.call(flags, 'allowRegional')) {
        includeInternational = flags.allowRegional;
    }
    try {
        return readPool();
    } finally {
        tonightIgnoreServices = savedIgnore;
        includeInternational = savedRegion;
    }
}

function renderTonightEmpty(options) {
    const root = document.getElementById('tonight');
    const wrap = document.createElement('div');
    wrap.className = 'tonight-empty';
    const text = document.createElement('p');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-btn';

    if (options.servicesWouldHelp) {
        text.textContent = 'Na vašich službách teď nic není nad 70 %.';
        button.textContent = 'Zobrazit i ostatní služby';
        button.addEventListener('click', () => {
            tonightIgnoreServices = true;
            renderTonight();
        });
        wrap.append(text, button);
    } else if (options.regionWouldHelp) {
        text.textContent = 'Po skrytí asijských a latinskoamerických titulů tu nic nad 70 % nezbylo.';
        button.textContent = 'Zahrnout je do výběru';
        button.addEventListener('click', () => {
            includeInternationalCheckbox.checked = true;
            toggleInternational();
        });
        wrap.append(text, button);
    } else {
        text.textContent = 'Teď tu nic nepřesáhlo 70 %.';
        wrap.append(text);
    }
    root.appendChild(wrap);
}

function renderTonight() {
    const root = document.getElementById('tonight');
    if (!root) return;
    renderServicesHint();

    if (!tonightSettled.top10 || !tonightSettled.new) return;

    const picks = takeTonightPicks(collectTonightPool());
    const withoutServices = withTonightFlags({ ignoreServices: true }, collectTonightPool);
    const withRegion = withTonightFlags({ allowRegional: true }, collectTonightPool);

    root.replaceChildren();
    const hasAnyData = ['top10', 'new'].some((section) =>
        (allData[section].movies || []).length || (allData[section].series || []).length
    );
    if (picks.length === 0 && !hasAnyData) {
        const wrap = document.createElement('div');
        wrap.className = 'tonight-empty';
        const text = document.createElement('p');
        text.textContent = 'Výběr se nepodařilo sestavit. Zkuste to za chvíli.';
        wrap.appendChild(text);
        root.appendChild(wrap);
        return;
    }
    if (picks.length === 0) {
        renderTonightEmpty({
            servicesWouldHelp: myServices.length > 0 && !tonightIgnoreServices && withoutServices.length > 0,
            regionWouldHelp: !includeInternational && withRegion.length > 0
        });
        return;
    }

    picks.forEach((item) => {
        root.appendChild(createTitleCard(item, cardOptions({ showType: true, showReason: true })));
    });
}

// Get sorted data
function getSortedData(data) {
    const filtered = [...data];

    if (currentSort === 'rank') {
        return filtered.sort((a, b) => a.rank - b.rank);
    } else if (currentSort === 'popularity') {
        return filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    } else if (currentSort === 'rating') {
        return filtered
            .filter(item => item.avg_rating !== null)
            .sort((a, b) => b.avg_rating - a.avg_rating);
    } else if (currentSort === 'recommended') {
        return filtered
            .filter(item => item.avg_rating !== null && item.avg_rating >= 70)
            .sort((a, b) => b.avg_rating - a.avg_rating);
    }

    return filtered;
}

// Helper: Get quality class based on rating (0-100 scale)
function getRatingQuality(rating) {
    if (rating >= 80) return 'excellent';
    if (rating >= 70) return 'good';
    if (rating >= 60) return 'average';
    if (rating >= 50) return 'below-average';
    return 'poor';
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';

    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    return `${day}.${month}.${year}`;
}

// Newsletter subscription
function setupNewsletterForm() {
    const newsletterForm = document.getElementById('newsletterForm');
    const newsletterEmail = document.getElementById('newsletterEmail');
    const newsletterMessage = document.getElementById('newsletterMessage');

    if (newsletterForm) {
        console.log('Newsletter form found, attaching event listener');

        newsletterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Newsletter form submitted');

            const email = newsletterEmail.value.trim();
            console.log('Email:', email);

            if (!email) {
                showNewsletterMessage('Prosím zadejte platný email', 'error');
                return;
            }

            // Disable form
            newsletterEmail.disabled = true;
            newsletterForm.querySelector('button').disabled = true;
            showNewsletterMessage('⏳ Přihlašuji...', 'success');

            try {
                console.log('Sending request to /api/newsletter-subscribe');
                const response = await fetch('/api/newsletter-subscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email })
                });

                console.log('Response status:', response.status);
                const data = await response.json();
                console.log('Response data:', data);

                if (!response.ok) {
                    throw new Error(data.error || 'Nepodařilo se přihlásit k odběru');
                }

                // Success
                showNewsletterMessage('✅ Úspěšně přihlášeno! Newsletter budete dostávat každé úterý odpoledne.', 'success');
                newsletterEmail.value = '';

                // Keep form disabled after successful subscription
                setTimeout(() => {
                    newsletterMessage.classList.add('hidden');
                }, 5000);
            } catch (error) {
                console.error('Newsletter subscription error:', error);
                showNewsletterMessage('❌ ' + error.message, 'error');

                // Re-enable form on error
                newsletterEmail.disabled = false;
                newsletterForm.querySelector('button').disabled = false;
            }
        });
    } else {
        console.error('Newsletter form NOT found!');
    }

    function showNewsletterMessage(message, type) {
        newsletterMessage.textContent = message;
        newsletterMessage.className = `newsletter-message ${type}`;
        newsletterMessage.classList.remove('hidden');
    }
}

// Refresh data (for manual refresh button if needed)
function refreshData() {
    localStorage.removeItem('topflix_data_top10');
    localStorage.removeItem('topflix_data_new');
    fetchData(currentSection);
}

// Expose refresh function globally if needed
window.refreshTopflixData = refreshData;
