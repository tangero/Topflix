/**
 * Topflix - Archive Page
 */

// State management
let allContent = [];
let currentOffset = 0;
const ITEMS_PER_PAGE = 50;

// Filters
let currentType = 'all'; // all, movie, series
let currentMinRating = 70; // 60, 70, 80
let currentSort = 'rating'; // rating, recent, popular
let includeInternational = false;
let netflixOnly = true;

// Region filter key
const INCLUDE_INTERNATIONAL_KEY = 'topflix_include_international';

// DOM elements
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const content = document.getElementById('content');
const updateInfo = document.getElementById('updateInfo');
const lastUpdate = document.getElementById('lastUpdate');
const typeFilter = document.getElementById('typeFilter');
const ratingFilter = document.getElementById('ratingFilter');
const sortSelect = document.getElementById('sortSelect');
const themeToggle = document.getElementById('themeToggle');
const includeInternationalCheckbox = document.getElementById('includeInternational');
const netflixOnlyCheckbox = document.getElementById('netflixOnly');
const hiddenCountFeedback = document.getElementById('hiddenCountFeedback');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const loadMoreContainer = document.getElementById('loadMoreContainer');
const totalCount = document.getElementById('totalCount');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initRegionFilter();
    loadStats();
    loadHiddenGems();
    fetchData();
    setupEventListeners();
});

// Theme management (same as app.js)
function getSunriseSunset() {
    const latitude = 50.0755;
    const longitude = 14.4378;
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const declination = -23.45 * Math.cos((360 / 365) * (dayOfYear + 10) * Math.PI / 180);
    const hourAngle = Math.acos(
        -Math.tan(latitude * Math.PI / 180) * Math.tan(declination * Math.PI / 180)
    ) * 180 / Math.PI;
    const solarNoon = 12 - (longitude / 15);
    const sunriseUTC = solarNoon - (hourAngle / 15);
    const sunsetUTC = solarNoon + (hourAngle / 15);
    const isDST = isDaylightSavingTime(now);
    const offset = isDST ? 2 : 1;
    return { sunrise: sunriseUTC + offset, sunset: sunsetUTC + offset };
}

function isDaylightSavingTime(date) {
    const year = date.getFullYear();
    const marchLastSunday = new Date(year, 2, 31);
    marchLastSunday.setDate(31 - marchLastSunday.getDay());
    const octoberLastSunday = new Date(year, 9, 31);
    octoberLastSunday.setDate(31 - octoberLastSunday.getDay());
    return date >= marchLastSunday && date < octoberLastSunday;
}

function shouldUseDarkMode() {
    const now = new Date();
    const currentTime = now.getHours() + now.getMinutes() / 60;
    const { sunrise, sunset } = getSunriseSunset();
    return currentTime < sunrise || currentTime >= sunset;
}

function applyTheme(theme) {
    let actualTheme = theme;
    if (theme === 'auto') {
        actualTheme = shouldUseDarkMode() ? 'dark' : 'light';
    }
    if (actualTheme === 'light') {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
    }
    const icons = { 'light': '☀️', 'dark': '🌙', 'auto': '🌓' };
    themeToggle.querySelector('.theme-icon').textContent = icons[theme];
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    applyTheme(savedTheme);
    if (savedTheme === 'auto') {
        setInterval(() => applyTheme('auto'), 60000);
    }
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'auto';
    let nextTheme;
    if (currentTheme === 'dark') nextTheme = 'light';
    else if (currentTheme === 'light') nextTheme = 'auto';
    else nextTheme = 'dark';
    localStorage.setItem('theme', nextTheme);
    applyTheme(nextTheme);
    if (nextTheme === 'auto') {
        setInterval(() => {
            if (localStorage.getItem('theme') === 'auto') applyTheme('auto');
        }, 60000);
    }
}

// Region filter management
function initRegionFilter() {
    const saved = localStorage.getItem(INCLUDE_INTERNATIONAL_KEY);
    includeInternational = saved === 'true';
    includeInternationalCheckbox.checked = includeInternational;
}

function toggleInternational() {
    includeInternational = includeInternationalCheckbox.checked;
    localStorage.setItem(INCLUDE_INTERNATIONAL_KEY, includeInternational);
    resetAndFetch(); // Reload data from API with new excludeRegional parameter
}

// Filter by region
function filterByRegion(items) {
    if (includeInternational) {
        hiddenCountFeedback.classList.add('hidden');
        return items;
    }

    const filtered = items.filter(item => !item.is_regional);

    const hiddenCount = items.length - filtered.length;
    if (hiddenCount > 0) {
        const itemWord = hiddenCount === 1 ? 'položka skryta' : (hiddenCount < 5 ? 'položky skryty' : 'položek skryto');
        hiddenCountFeedback.textContent = `(${hiddenCount} ${itemWord})`;
        hiddenCountFeedback.classList.remove('hidden');
    } else {
        hiddenCountFeedback.classList.add('hidden');
    }

    return filtered;
}

// Load database stats
async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) return;

        const data = await response.json();
        const stats = data.stats;

        totalCount.textContent = `${stats.total} titulů v archivu, z toho ${stats.movies} filmů a ${stats.series} seriálů. Nad 70 % jich je ${stats.quality}, nad 80 % ${stats.excellent}.`;
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

// Load hidden gems
async function loadHiddenGems() {
    try {
        const gemsGrid = document.getElementById('gemsGrid');
        const gemsSection = document.getElementById('hiddenGemsSection');
        const response = await fetch(`/api/hidden-gems?limit=6&excludeRegional=true&netflixOnly=${netflixOnly}`);
        if (!response.ok) return;
        const data = await response.json();
        const gems = data.data || [];

        gemsSection.classList.toggle('hidden', gems.length === 0);
        if (gems.length === 0) return;

        gemsGrid.replaceChildren(...gems.map((item) => archiveRow(item)));

        gemsSection.classList.remove('hidden');
    } catch (err) {
        console.error('Error loading hidden gems:', err);
    }
}

// Event listeners
function setupEventListeners() {
    themeToggle.addEventListener('click', toggleTheme);
    includeInternationalCheckbox.addEventListener('change', toggleInternational);
    netflixOnlyCheckbox.addEventListener('change', () => {
        netflixOnly = netflixOnlyCheckbox.checked;
        loadHiddenGems();
        resetAndFetch();
    });

    typeFilter.addEventListener('change', (e) => {
        currentType = e.target.value;
        resetAndFetch();
    });

    ratingFilter.addEventListener('change', (e) => {
        currentMinRating = parseInt(e.target.value);
        resetAndFetch();
    });

    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        resetAndFetch();
    });

    loadMoreBtn.addEventListener('click', () => {
        currentOffset += ITEMS_PER_PAGE;
        fetchData(true); // append mode
    });
}

// Reset and fetch
function resetAndFetch() {
    currentOffset = 0;
    allContent = [];
    content.innerHTML = '';
    fetchData(false);
}

// Fetch data from API
async function fetchData(appendMode = false) {
    try {
        if (!appendMode) {
            loading.classList.remove('hidden');
            error.classList.add('hidden');
            content.classList.add('hidden');
            updateInfo.classList.add('hidden');
            loadMoreContainer.classList.add('hidden');
        } else {
            loadMoreBtn.disabled = true;
            loadMoreBtn.textContent = 'Načítání...';
        }

        // Build API URL with query parameters
        const params = new URLSearchParams({
            limit: ITEMS_PER_PAGE,
            offset: currentOffset,
            minRating: currentMinRating,
            orderBy: currentSort,
            excludeRegional: !includeInternational,
            netflixOnly
        });

        if (currentType !== 'all') {
            params.append('type', currentType);
        }

        const response = await fetch(`/api/archive?${params.toString()}`);

        if (!response.ok) {
            const errorData = await response.json();
            console.error('API Error:', errorData);
            throw new Error(errorData.error || 'Failed to fetch data');
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // Append or replace content
        if (appendMode) {
            allContent = [...allContent, ...data.data];
        } else {
            allContent = data.data;
        }

        // Update UI
        lastUpdate.textContent = `Aktualizováno: ${data.updated}`;
        updateInfo.classList.remove('hidden');

        displayData();

        // Show/hide load more button
        if (data.data.length === ITEMS_PER_PAGE) {
            loadMoreContainer.classList.remove('hidden');
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = 'Načíst další';
        } else {
            loadMoreContainer.classList.add('hidden');
        }

        loading.classList.add('hidden');
        content.classList.remove('hidden');
    } catch (err) {
        console.error('Error fetching data:', err);
        loading.classList.add('hidden');
        error.classList.remove('hidden');
        if (appendMode) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = 'Načíst další';
        }
    }
}

// Display data
function displayData() {
    const filtered = filterByRegion(allContent);

    content.innerHTML = '';

    if (filtered.length === 0) {
        content.innerHTML = '<p class="empty-note">Žádné tituly k zobrazení.</p>';
        return;
    }

    filtered.forEach(item => {
        content.appendChild(archiveRow(item));
    });
}

// Render content (for region filter changes)
function renderContent() {
    displayData();
}

function formatArchiveDate(date) {
    const parsed = new Date(`${date}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

// Řádek archivu: stejný jako na titulce, s poznámkou, kdy byl titul naposledy vidět.
function archiveRow(item) {
    const providers = Array.isArray(item.streaming_providers) ? item.streaming_providers : [];
    let reason = '';
    if (item.last_source === 'top10' && item.last_seen) {
        reason = `Naposledy v Top 10 ${formatArchiveDate(item.last_seen)}`;
    } else if (item.last_seen) {
        reason = `Mezi novinkami ${formatArchiveDate(item.last_seen)}`;
    }
    if (providers.length === 0) {
        reason = reason ? `${reason} · dostupnost neověřena` : 'Dostupnost neověřena';
    }
    return createTitleCard({ ...item, providers, quality: null, reason }, {
        showType: true,
        showReason: !!reason,
        preferredProviders: ['netflix']
    });
}
