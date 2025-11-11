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
const hiddenCountFeedback = document.getElementById('hiddenCountFeedback');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const loadMoreContainer = document.getElementById('loadMoreContainer');
const totalCount = document.getElementById('totalCount');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initRegionFilter();
    loadStats();
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
    renderContent();
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

        totalCount.innerHTML = `
            <strong>📊 Statistiky databáze:</strong>
            ${stats.total} celkem •
            ${stats.movies} filmů •
            ${stats.series} seriálů •
            ${stats.quality} kvalitních (≥70%) •
            ${stats.excellent} výjimečných (≥80%) •
            průměrné hodnocení ${stats.avgRating}%
        `;
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

// Event listeners
function setupEventListeners() {
    themeToggle.addEventListener('click', toggleTheme);
    includeInternationalCheckbox.addEventListener('change', toggleInternational);

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
            excludeRegional: !includeInternational
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
        content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Žádné tituly k zobrazení.</p>';
        return;
    }

    filtered.forEach(item => {
        content.appendChild(createTitleCard(item));
    });
}

// Render content (for region filter changes)
function renderContent() {
    displayData();
}

// Helper: Format runtime
function formatRuntime(minutes) {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}min`;
    if (hours > 0) return `${hours}h`;
    return `${mins}min`;
}

// Create title card element
function createTitleCard(item) {
    const card = document.createElement('div');
    card.className = `title-card quality-${item.quality_tier || 'average'}`;

    // Poster
    const posterHTML = item.poster_url
        ? `<img src="${item.poster_url}" alt="${item.title}" loading="lazy">`
        : '<div class="no-poster">🎬</div>';

    // Rating badge with quality indicator
    let qualityText = '❌';
    let qualityClass = 'poor';
    if (item.avg_rating >= 80) {
        qualityText = '💣';
        qualityClass = 'excellent';
    } else if (item.avg_rating >= 70) {
        qualityText = '✅';
        qualityClass = 'good';
    } else if (item.avg_rating >= 60) {
        qualityText = '👍';
        qualityClass = 'average';
    } else if (item.avg_rating >= 50) {
        qualityText = '⚠️';
        qualityClass = 'below-average';
    }

    const ratingBadge = item.avg_rating
        ? `<div class="rating-badge rating-${qualityClass}">
            ${item.avg_rating}% ${qualityText}
           </div>`
        : '';

    // Build metadata line
    const metaParts = [];

    // Type (movie or series)
    metaParts.push(item.type === 'movie' ? '🎬 Film' : '📺 Seriál');

    // Origin country
    if (item.origin_country && Array.isArray(item.origin_country) && item.origin_country.length > 0) {
        metaParts.push(`🌍 ${item.origin_country.join(', ')}`);
    }

    // Year
    if (item.year) {
        metaParts.push(`📅 ${item.year}`);
    }

    // Runtime for movies
    if (item.runtime) {
        metaParts.push(`⏱️ ${formatRuntime(item.runtime)}`);
    }

    // Seasons/episodes for series
    if (item.number_of_seasons) {
        metaParts.push(`📺 ${item.number_of_seasons} sezón`);
    }

    // Genre
    if (item.genre) {
        metaParts.push(`🎭 ${item.genre}`);
    }

    // Appearances count
    if (item.appearances > 1) {
        metaParts.push(`🔄 ${item.appearances}× v Top 10`);
    }

    card.innerHTML = `
        <div class="card-content">
            <div class="card-poster">
                ${posterHTML}
                ${ratingBadge}
            </div>
            <div class="card-info">
                <div class="card-title">
                    <h2>${item.title || item.title_original}</h2>
                    ${item.title_original && item.title !== item.title_original
                        ? `<div class="original-title">${item.title_original}</div>`
                        : ''}
                </div>
                <div class="meta">
                    ${metaParts.join(' • ')}
                </div>
                ${item.description
                    ? `<div class="description">${item.description}</div>`
                    : ''}
                <div class="links">
                    ${item.tmdb_url
                        ? `<a href="${item.tmdb_url}" target="_blank" rel="noopener" class="tmdb-link">TMDB</a>`
                        : ''}
                </div>
            </div>
        </div>
    `;

    return card;
}
