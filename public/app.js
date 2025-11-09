/**
 * Topflix - Frontend Application
 */

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
let currentFilter = 'all'; // all, movie, series
let currentSort = 'rank'; // rank, rating, recommended, popularity

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
const filterButtons = document.querySelectorAll('.filter-btn');
const sortSelect = document.getElementById('sortSelect');
const themeToggle = document.getElementById('themeToggle');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchData();
    setupEventListeners();
});

// Theme management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.querySelector('.theme-icon').textContent = '🌙';
    }
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeToggle.querySelector('.theme-icon').textContent = isLight ? '🌙' : '☀️';
}

// Event listeners
function setupEventListeners() {
    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);

    // Section tabs
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSection = btn.dataset.section;

            // Update sort options based on section
            updateSortOptions();

            // Load data for the section if not already loaded
            if (currentSection === 'new' && allData.new.movies.length === 0) {
                fetchData('new');
            } else {
                displayData();
            }
        });
    });

    // Filter buttons
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderContent();
        });
    });

    // Sort select
    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderContent();
    });
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

// Fetch data from API
async function fetchData(section = 'top10') {
    try {
        loading.classList.remove('hidden');
        error.classList.add('hidden');
        content.classList.add('hidden');
        updateInfo.classList.add('hidden');

        const endpoint = API_ENDPOINTS[section];
        const cacheKey = `topflix_data_${section}`;

        // Try to get from localStorage first (7-day cache)
        const cachedData = getCachedData(cacheKey);
        if (cachedData) {
            // Sanitize cached data too (in case old invalid data is cached)
            const sanitized = sanitizeData(cachedData);
            allData[section] = sanitized;
            displayData();
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

        // Cache the data
        cacheData(data, cacheKey);

        displayData();
    } catch (err) {
        console.error('Error fetching data:', err);
        console.error('API Endpoint:', endpoint);
        loading.classList.add('hidden');
        error.classList.remove('hidden');
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
                    if (cleanMovie.avg_rating >= 70) cleanMovie.quality = 'green';
                    else if (cleanMovie.avg_rating < 50) cleanMovie.quality = 'red';
                    else cleanMovie.quality = 'yellow';
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
                    if (cleanSeries.avg_rating >= 70) cleanSeries.quality = 'green';
                    else if (cleanSeries.avg_rating < 50) cleanSeries.quality = 'red';
                    else cleanSeries.quality = 'yellow';
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

function getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    try {
        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        const sevenDays = 7 * 24 * 60 * 60 * 1000;

        if (age < sevenDays) {
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
        lastUpdate.textContent = `Data k: ${formatDate(sectionData.updated)}`;
        nextUpdate.textContent = `Další update: ${formatDate(sectionData.next_update)}`;
    } else if (currentSection === 'new') {
        lastUpdate.textContent = `Aktualizováno: ${formatDate(sectionData.updated)}`;
        nextUpdate.textContent = sectionData.period || 'Posledních 6 měsíců';
    }

    // Render content
    renderContent();
}

// Render content based on filters and sort
function renderContent() {
    const filteredData = getFilteredData();
    const sortedData = getSortedData(filteredData);

    content.innerHTML = '';

    if (sortedData.length === 0) {
        content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Žádné tituly k zobrazení.</p>';
        return;
    }

    sortedData.forEach(item => {
        content.appendChild(createTitleCard(item));
    });
}

// Get filtered data
function getFilteredData() {
    let items = [];
    const sectionData = allData[currentSection];

    if (currentFilter === 'all') {
        items = [...sectionData.movies, ...sectionData.series];
    } else if (currentFilter === 'movie') {
        items = sectionData.movies;
    } else if (currentFilter === 'series') {
        items = sectionData.series;
    }

    return items;
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
    if (rating >= 70) return 'green';
    if (rating < 50) return 'red';
    return 'yellow';
}

// Create title card element
function createTitleCard(item) {
    const card = document.createElement('div');
    card.className = `title-card quality-${item.quality}`;

    // Poster
    const posterHTML = item.poster_url
        ? `<img src="${item.poster_url}" alt="${item.title}" loading="lazy">`
        : '<div class="no-poster">🎬</div>';

    // Type badge
    const typeLabel = item.type === 'movie' ? 'Film' : 'Seriál';

    // TMDB Rating with color coding
    const tmdbRating = item.tmdb_rating
        ? `<div class="rating-item rating-${getRatingQuality(item.tmdb_rating * 10)}">
            <span class="star">⭐</span>
            <span class="label">TMDB:</span>
            ${item.tmdb_url
                ? `<a href="${item.tmdb_url}" target="_blank" rel="noopener noreferrer" class="rating-link" onclick="event.stopPropagation()">
                    <span class="value">${item.tmdb_rating}/10</span>
                   </a>`
                : `<span class="value">${item.tmdb_rating}/10</span>`
            }
           </div>`
        : '';

    // ČSFD Rating with color coding - only show if rating exists AND is >= 10%
    // Ratings below 10% are invalid (parsing errors)
    const csfdRating = (item.csfd_rating && item.csfd_rating >= 10)
        ? `<div class="rating-item rating-${getRatingQuality(item.csfd_rating)}">
            <span class="star">⭐</span>
            <span class="label">ČSFD:</span>
            ${item.csfd_url
                ? `<a href="${item.csfd_url}" target="_blank" rel="noopener noreferrer" class="rating-link" onclick="event.stopPropagation()">
                    <span class="value">${item.csfd_rating}%</span>
                   </a>`
                : `<span class="value">${item.csfd_rating}%</span>`
            }
           </div>`
        : '';

    // Quality badge
    let qualityText = 'Průměr';
    let qualityClass = 'yellow';
    if (item.avg_rating >= 70) {
        qualityText = 'Doporučeno';
        qualityClass = 'green';
    } else if (item.avg_rating < 50) {
        qualityText = 'Slabé';
        qualityClass = 'red';
    }

    const qualityBadge = item.avg_rating
        ? `<span class="quality-badge ${qualityClass}">
            ${qualityText} (${item.avg_rating}%)
           </span>`
        : '';

    // Rank badge (only for Top 10 section where rank exists)
    const rankBadge = item.rank
        ? `<span class="rank-badge">#${item.rank}</span>`
        : '';

    card.innerHTML = `
        <div class="card-content">
            <div class="card-poster">
                ${posterHTML}
            </div>
            <div class="card-info">
                <div class="card-header">
                    ${rankBadge}
                    <div class="card-title">
                        <h2>${item.title || item.title_original}</h2>
                        ${item.title_original && item.title !== item.title_original
                            ? `<div class="original-title">${item.title_original}</div>`
                            : ''}
                    </div>
                </div>
                <div class="ratings">
                    ${tmdbRating}
                    ${csfdRating}
                    ${qualityBadge}
                </div>
                <div class="meta">
                    <span>📺 ${typeLabel}</span>
                    ${item.year ? `<span>📅 ${item.year}</span>` : ''}
                    ${item.genre ? `<span>🎭 ${item.genre}</span>` : ''}
                </div>
                ${item.description
                    ? `<div class="description">${item.description}</div>`
                    : ''}
            </div>
        </div>
    `;

    // Toggle expanded description on click
    card.addEventListener('click', () => {
        card.classList.toggle('card-expanded');
    });

    return card;
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

// Refresh data (for manual refresh button if needed)
function refreshData() {
    localStorage.removeItem('topflix_data_top10');
    localStorage.removeItem('topflix_data_new');
    fetchData(currentSection);
}

// Expose refresh function globally if needed
window.refreshTopflixData = refreshData;
