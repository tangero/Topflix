/**
 * Topflix - Frontend Application
 */

// State management
let allData = {
    movies: [],
    series: [],
    updated: '',
    next_update: ''
};

let currentFilter = 'all'; // all, movie, series
let currentSort = 'rank'; // rank, rating, recommended

// API endpoint - change this to your deployed Worker URL
const API_ENDPOINT = '/api/top10';

// DOM elements
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const content = document.getElementById('content');
const updateInfo = document.getElementById('updateInfo');
const lastUpdate = document.getElementById('lastUpdate');
const nextUpdate = document.getElementById('nextUpdate');
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

// Fetch data from API
async function fetchData() {
    try {
        loading.classList.remove('hidden');
        error.classList.add('hidden');
        content.classList.add('hidden');
        updateInfo.classList.add('hidden');

        // Try to get from localStorage first (7-day cache)
        const cachedData = getCachedData();
        if (cachedData) {
            allData = cachedData;
            displayData();
            return;
        }

        // Fetch from API
        const response = await fetch(API_ENDPOINT);
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }

        const data = await response.json();
        allData = data;

        // Cache the data
        cacheData(data);

        displayData();
    } catch (err) {
        console.error('Error fetching data:', err);
        loading.classList.add('hidden');
        error.classList.remove('hidden');
    }
}

// Cache management
function cacheData(data) {
    const cacheItem = {
        data,
        timestamp: Date.now()
    };
    localStorage.setItem('topflix_data', JSON.stringify(cacheItem));
}

function getCachedData() {
    const cached = localStorage.getItem('topflix_data');
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

    // Update info
    lastUpdate.textContent = `Data k: ${formatDate(allData.updated)}`;
    nextUpdate.textContent = `Další update: ${formatDate(allData.next_update)}`;

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

    if (currentFilter === 'all') {
        items = [...allData.movies, ...allData.series];
    } else if (currentFilter === 'movie') {
        items = allData.movies;
    } else if (currentFilter === 'series') {
        items = allData.series;
    }

    return items;
}

// Get sorted data
function getSortedData(data) {
    const filtered = [...data];

    if (currentSort === 'rank') {
        return filtered.sort((a, b) => a.rank - b.rank);
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

    // Ratings
    const tmdbRating = item.tmdb_rating
        ? `<div class="rating-item">
            <span class="star">⭐</span>
            <span class="label">TMDB:</span>
            <span class="value">${item.tmdb_rating}/10</span>
           </div>`
        : '';

    const csfdRating = item.csfd_rating
        ? `<div class="rating-item">
            <span class="star">⭐</span>
            <span class="label">ČSFD:</span>
            <span class="value">${item.csfd_rating}%</span>
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

    card.innerHTML = `
        <div class="card-content">
            <div class="card-poster">
                ${posterHTML}
            </div>
            <div class="card-info">
                <div class="card-header">
                    <span class="rank-badge">#${item.rank}</span>
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
    localStorage.removeItem('topflix_data');
    fetchData();
}

// Expose refresh function globally if needed
window.refreshTopflixData = refreshData;
