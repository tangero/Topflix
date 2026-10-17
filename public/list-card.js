/**
 * Kompaktní řádek titulu pro filmy a seriály.
 * Klasický skript, sdílený mezi index.html a serials.html.
 */

const LIST_PROVIDERS = {
    netflix: 'Netflix',
    disney: 'Disney+',
    apple: 'Apple TV+',
    prime: 'Prime Video',
    max: 'Max',
    skyshowtime: 'SkyShowtime'
};

const LIST_PROVIDER_SHORT = {
    netflix: 'Netflix',
    disney: 'Disney+',
    apple: 'Apple',
    prime: 'Prime',
    max: 'Max',
    skyshowtime: 'Sky'
};

const WATCH_SEARCH = {
    netflix: (q) => `https://www.netflix.com/search?q=${q}`,
    disney: (q) => `https://www.disneyplus.com/search?q=${q}`,
    prime: (q) => `https://www.primevideo.com/search?phrase=${q}`,
    max: (q) => `https://play.max.com/search?q=${q}`,
    apple: (q) => `https://tv.apple.com/cz/search?term=${q}`,
    skyshowtime: (q) => `https://www.skyshowtime.com/watch/search?q=${q}`
};

function listEscape(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function listQuality(rating) {
    if (rating >= 80) return 'excellent';
    if (rating >= 70) return 'good';
    if (rating >= 60) return 'average';
    if (rating >= 50) return 'below-average';
    return 'poor';
}

function listRuntime(minutes) {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}min`;
    if (hours > 0) return `${hours}h`;
    return `${mins}min`;
}

function listSeasons(item) {
    if (!item.number_of_seasons) return null;
    const n = item.number_of_seasons;
    const label = n === 1 ? 'řada' : n < 5 ? 'řady' : 'řad';
    return `${n} ${label}`;
}

function listSplit(item) {
    const audience = [];
    if (item.tmdb_rating > 0) audience.push(item.tmdb_rating * 10);
    if (item.imdb_rating > 0) audience.push(item.imdb_rating * 10);
    const critics = [];
    if (item.rotten_tomatoes_rating > 0) critics.push(Number(item.rotten_tomatoes_rating));
    if (item.metacritic_rating > 0) critics.push(Number(item.metacritic_rating));
    if (!audience.length || !critics.length) return null;
    const audienceScore = Math.round(audience.reduce((sum, value) => sum + value, 0) / audience.length);
    const criticScore = Math.round(critics.reduce((sum, value) => sum + value, 0) / critics.length);
    if (Math.abs(audienceScore - criticScore) < 15) return null;
    return `Diváci ${audienceScore} · kritika ${criticScore}`;
}

function listProvider(item, preferred) {
    const providers = item.providers || [];
    if (preferred && preferred.length) {
        const mine = providers.find((provider) => preferred.includes(provider));
        if (mine) return mine;
    }
    return providers[0] || null;
}

function createTitleCard(item, options = {}) {
    const showType = !!options.showType;
    const showReason = !!options.showReason;
    const type = item.type === 'series' || item.type === 'movie'
        ? item.type
        : (options.defaultType || 'movie');
    const typeLabel = type === 'series' ? 'Seriál' : 'Film';
    const providerId = listProvider(item, options.preferredProviders || []);
    const providerName = providerId ? (LIST_PROVIDERS[providerId] || providerId) : '';
    const rating = Number(item.avg_rating);
    const hasRating = Number.isFinite(rating) && rating > 0;
    const quality = item.quality || listQuality(hasRating ? rating : 0);
    const title = item.title || item.title_original || 'Bez názvu';

    const meta = [];
    if (showType) meta.push(typeLabel);
    if (item.year) meta.push(String(item.year));
    const length = type === 'series' ? listSeasons(item) : listRuntime(item.runtime);
    if (length) meta.push(length);

    const split = listSplit(item);
    const detailHref = (window.TopflixUrl && window.TopflixUrl.titlePath({ ...item, type }))
        || `detail.html?id=${encodeURIComponent(item.tmdb_id)}&type=${type}`;
    const query = encodeURIComponent(item.title_original || item.title || '');
    const playHref = providerId && WATCH_SEARCH[providerId] && query
        ? WATCH_SEARCH[providerId](query)
        : '';

    const poster = item.poster_url
        ? `<img class="pick-poster" src="${listEscape(item.poster_url)}" alt="" loading="lazy" width="56" height="84">`
        : '<div class="pick-poster pick-poster-empty" aria-hidden="true"></div>';
    const score = hasRating
        ? `<span class="pick-score score-${listQuality(rating)}">${Math.round(rating)}</span>`
        : '';

    const article = document.createElement('article');
    article.className = `pick-row quality-${quality}`;
    article.innerHTML = `
        <a class="pick-main" href="${detailHref}">
            ${poster}
            <div class="pick-copy">
                <h3 class="pick-title">${listEscape(title)}</h3>
                ${meta.length ? `<p class="pick-meta">${meta.map(listEscape).join(' · ')}</p>` : ''}
                ${showReason && item.reason ? `<p class="pick-why">${listEscape(item.reason)}</p>` : ''}
                ${split ? `<p class="pick-split">${listEscape(split)}</p>` : ''}
            </div>
            ${score}
        </a>
        ${playHref ? `<a class="pick-play" href="${playHref}" target="_blank" rel="noopener noreferrer">${listEscape(LIST_PROVIDER_SHORT[providerId] || providerName)}<span class="visually-hidden">, pustit ${listEscape(title)}</span></a>` : ''}
    `;
    return article;
}

function initFilterDisclosure() {
    const button = document.getElementById('filtersToggle');
    const panel = document.getElementById('filtersPanel');
    if (!button || !panel) return;
    button.addEventListener('click', () => {
        const willOpen = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !willOpen);
        button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        button.textContent = willOpen ? 'Skrýt filtry' : 'Upravit výběr';
    });
}

function openFilterPanel() {
    const button = document.getElementById('filtersToggle');
    const panel = document.getElementById('filtersPanel');
    if (!panel || !button) return;
    panel.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    button.textContent = 'Skrýt filtry';
}

function updateFilterStatus(parts) {
    const status = document.getElementById('filterStatus');
    if (!status) return;
    const text = (parts || []).filter(Boolean).join(' · ');
    status.textContent = text;
    status.classList.toggle('hidden', !text);
}
