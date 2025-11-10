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
let currentSort = 'rank'; // rank, rating, recommended, popularity

// Region filter
const INCLUDE_INTERNATIONAL_KEY = 'topflix_include_international';
let includeInternational = false;

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
    fetchData();
    setupEventListeners();
    setupNewsletterForm();
});

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

    // Asian countries
    const asianCountries = ['JP', 'KR', 'CN', 'TW', 'HK', 'TH', 'IN', 'ID', 'PH', 'VN', 'SG', 'MY'];
    // Latin American countries
    const latinCountries = ['MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'UY', 'PY'];

    const filtered = items.filter(item => {
        const origins = item.origin_country || [];
        // Keep item if it doesn't have any Asian or Latin American country
        return !origins.some(country =>
            asianCountries.includes(country) || latinCountries.includes(country)
        );
    });

    // Update feedback
    const hiddenCount = items.length - filtered.length;
    if (hiddenCount > 0) {
        hiddenCountFeedback.textContent = `(${hiddenCount} ${hiddenCount === 1 ? 'seriál skryt' : 'seriálů skryto'})`;
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
            if (currentSection === 'new' && allData.new.movies.length === 0) {
                fetchData('new');
            } else {
                displayData();
            }
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
    const regionFiltered = filterByRegion(filteredData);
    const sortedData = getSortedData(regionFiltered);

    content.innerHTML = '';

    if (sortedData.length === 0) {
        content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Žádné tituly k zobrazení.</p>';
        return;
    }

    sortedData.forEach(item => {
        content.appendChild(createTitleCard(item));
    });
}

// Get filtered data - Series only for this page
function getFilteredData() {
    const sectionData = allData[currentSection];
    return sectionData.series || [];
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

// Helper: Format runtime (minutes to hours and minutes)
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
    card.className = `title-card quality-${item.quality}`;

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

    // Origin country or production countries
    if (item.origin_country && item.origin_country.length > 0) {
        metaParts.push(`🌍 ${item.origin_country.join(', ')}`);
    } else if (item.countries && item.countries.length > 0) {
        metaParts.push(`🌍 ${item.countries.join(', ')}`);
    }

    // Year
    if (item.year) {
        metaParts.push(`📅 ${item.year}`);
    }

    // Seasons and episodes for series
    const seasonInfo = [];
    if (item.number_of_seasons) {
        const seasonLabel = item.number_of_seasons === 1 ? 'řada' :
                           item.number_of_seasons <= 4 ? 'řady' : 'řad';
        seasonInfo.push(`${item.number_of_seasons} ${seasonLabel}`);
    }
    if (item.number_of_episodes) {
        seasonInfo.push(`${item.number_of_episodes} epizod`);
    }
    if (seasonInfo.length > 0) {
        metaParts.push(`📺 ${seasonInfo.join(', ')}`);
    }

    // Genre
    if (item.genre) {
        metaParts.push(`🎭 ${item.genre}`);
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
                showNewsletterMessage('✅ Úspěšně přihlášeno! Newsletter budete dostávat každou středu.', 'success');
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
