/**
 * Topflix - Detail Page
 */

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const PROVIDER_NAMES = {
    netflix: 'Netflix',
    disney: 'Disney+',
    apple: 'Apple TV+',
    prime: 'Prime Video',
    max: 'Max',
    skyshowtime: 'SkyShowtime'
};

const loading = document.getElementById('loading');
const error = document.getElementById('error');
const detailContent = document.getElementById('detailContent');
const themeToggle = document.getElementById('themeToggle');

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadDetail();
});

// Theme (simplified)
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    applyTheme(savedTheme);
    themeToggle.addEventListener('click', toggleTheme);
}

function applyTheme(theme) {
    let actual = theme;
    if (theme === 'auto') {
        const now = new Date();
        const hour = now.getHours();
        actual = (hour < 7 || hour >= 20) ? 'dark' : 'light';
    }
    if (actual === 'light') {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
    }
    const icons = { 'light': '☀️', 'dark': '🌙', 'auto': '🌓' };
    themeToggle.querySelector('.theme-icon').textContent = icons[theme];
}

function toggleTheme() {
    const current = localStorage.getItem('theme') || 'auto';
    let next;
    if (current === 'dark') next = 'light';
    else if (current === 'light') next = 'auto';
    else next = 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
}

async function loadDetail() {
    const params = new URLSearchParams(window.location.search);
    const tmdbId = params.get('id');
    const type = params.get('type');

    if (!tmdbId || !type) {
        loading.classList.add('hidden');
        error.classList.remove('hidden');
        return;
    }

    try {
        const response = await fetch(`/api/detail?id=${tmdbId}&type=${type}`);
        if (!response.ok) throw new Error('Not found');
        const data = await response.json();

        if (!data.item) throw new Error('No data');

        renderDetail(data.item, data.history, data.similar);
        updateMeta(data.item);
        injectJsonLd(data.item);

        loading.classList.add('hidden');
        detailContent.classList.remove('hidden');
    } catch (err) {
        console.error('Detail load error:', err);
        loading.classList.add('hidden');
        error.classList.remove('hidden');
    }
}

function renderDetail(item, history, similar) {
    const typeLabel = item.type === 'movie' ? 'Film' : 'Seriál';

    // Poster
    const posterHTML = item.poster_url
        ? `<img src="${escapeHtml(item.poster_url.replace('/w300/', '/w500/').replace('w300', 'w500'))}" alt="${escapeHtml(item.title)}">`
        : '<div class="no-poster">🎬</div>';

    // Ratings
    let ratingsHTML = '';
    if (item.avg_rating) {
        ratingsHTML += `<div class="detail-rating-card overall"><div class="source-name">Celkové</div><div class="source-value">${item.avg_rating}%</div></div>`;
    }
    if (item.tmdb_rating) {
        ratingsHTML += `<div class="detail-rating-card"><div class="source-name">TMDB</div><div class="source-value">${item.tmdb_rating}/10</div></div>`;
    }
    if (item.imdb_rating) {
        ratingsHTML += `<div class="detail-rating-card"><div class="source-name">IMDb</div><div class="source-value">${item.imdb_rating}/10</div></div>`;
    }
    if (item.rotten_tomatoes_rating) {
        ratingsHTML += `<div class="detail-rating-card"><div class="source-name">Rotten Tomatoes</div><div class="source-value">${item.rotten_tomatoes_rating}%</div></div>`;
    }
    if (item.metacritic_rating) {
        ratingsHTML += `<div class="detail-rating-card"><div class="source-name">Metacritic</div><div class="source-value">${item.metacritic_rating}</div></div>`;
    }

    // Meta
    const metaParts = [];
    metaParts.push(typeLabel);
    if (item.year) metaParts.push(item.year);
    if (item.runtime) {
        const h = Math.floor(item.runtime / 60);
        const m = item.runtime % 60;
        metaParts.push(h > 0 ? `${h}h ${m}min` : `${m}min`);
    }
    if (item.number_of_seasons) metaParts.push(`${item.number_of_seasons} sezón`);
    if (item.number_of_episodes) metaParts.push(`${item.number_of_episodes} epizod`);
    if (item.genre) metaParts.push(item.genre);
    if (item.origin_country && item.origin_country.length > 0) {
        metaParts.push(item.origin_country.join(', '));
    }

    // Providers
    const providers = item.streaming_providers || [];
    let providersHTML = '';
    if (providers.length > 0) {
        const badges = providers.map(p => {
            const name = PROVIDER_NAMES[p] || p;
            return `<span class="provider-badge provider-${escapeHtml(p)}">${escapeHtml(name)}</span>`;
        }).join('');
        providersHTML = `<div class="detail-providers"><h3>Kde sledovat</h3><div class="provider-badges">${badges}</div></div>`;
    }

    // External links
    let linksHTML = '';
    if (item.tmdb_url) {
        linksHTML += `<a href="${escapeHtml(item.tmdb_url)}" target="_blank" rel="noopener" class="detail-link-btn">TMDB</a>`;
    }
    if (item.imdb_id) {
        linksHTML += `<a href="https://www.imdb.com/title/${escapeHtml(item.imdb_id)}/" target="_blank" rel="noopener" class="detail-link-btn">IMDb</a>`;
    }

    // Share
    const shareUrl = window.location.href;
    const shareTitle = `${item.title} - Topflix`;

    // History
    let historyHTML = '';
    if (history && history.length > 0) {
        const historyItems = history.map(h => {
            const rankText = h.rank ? ` #${h.rank}` : '';
            return `<span class="history-item">${h.date}${rankText} (${h.source})</span>`;
        }).join('');
        historyHTML = `<div class="history-section"><h3>Historie v Top 10</h3><div class="history-list">${historyItems}</div></div>`;
    }

    // Similar
    let similarHTML = '';
    if (similar && similar.length > 0) {
        const similarCards = similar.map(s => {
            const poster = s.poster_url ? `<img src="${escapeHtml(s.poster_url)}" alt="${escapeHtml(s.title)}" loading="lazy">` : '';
            const ratingColor = s.avg_rating >= 80 ? 'var(--quality-excellent)' : s.avg_rating >= 70 ? 'var(--quality-good)' : 'var(--quality-average)';
            return `
                <a href="detail.html?id=${s.tmdb_id}&type=${s.type}" class="similar-card">
                    ${poster}
                    <div class="similar-info">
                        <h4>${escapeHtml(s.title)}</h4>
                        <div class="similar-meta">${s.year || ''} ${s.genre ? '| ' + escapeHtml(s.genre) : ''}</div>
                        ${s.avg_rating ? `<div class="similar-rating" style="color: ${ratingColor}">${s.avg_rating}%</div>` : ''}
                    </div>
                </a>
            `;
        }).join('');
        similarHTML = `<div class="similar-section"><h3>Podobné tituly</h3><div class="similar-grid">${similarCards}</div></div>`;
    }

    // Appearances
    const appearances = item.appearances || 0;
    const appearancesText = appearances > 1 ? `${appearances}× v Top 10` : '';

    detailContent.innerHTML = `
        <div class="detail-hero">
            <div class="detail-poster">${posterHTML}</div>
            <div class="detail-main">
                <h1 class="detail-title">${escapeHtml(item.title)}</h1>
                ${item.title_original && item.title !== item.title_original
                    ? `<div class="detail-original-title">${escapeHtml(item.title_original)}</div>`
                    : ''}
                <div class="detail-ratings">${ratingsHTML}</div>
                <div class="detail-meta">${metaParts.map(p => `<span>${escapeHtml(p)}</span>`).join('<span>•</span>')}</div>
                ${appearancesText ? `<div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.75rem;">${appearancesText}</div>` : ''}
                ${providersHTML}
                ${item.description ? `<div class="detail-description">${escapeHtml(item.description)}</div>` : ''}
                <div class="detail-links">${linksHTML}</div>
                <div class="detail-share">
                    <button class="share-btn" onclick="copyToClipboard('${escapeHtml(shareUrl)}')">Kopírovat odkaz</button>
                </div>
            </div>
        </div>
        ${historyHTML}
        ${similarHTML}
    `;
}

function updateMeta(item) {
    const title = `${item.title} - Topflix`;
    const desc = item.description ? item.description.substring(0, 160) : `${item.title} na Topflix`;
    const url = window.location.href;
    const image = item.poster_url ? item.poster_url.replace('w300', 'w500') : '';

    document.getElementById('pageTitle').textContent = title;
    document.getElementById('metaDescription').content = desc;
    document.getElementById('ogUrl').content = url;
    document.getElementById('ogTitle').content = title;
    document.getElementById('ogDescription').content = desc;
    document.getElementById('ogImage').content = image;
    document.getElementById('twTitle').content = title;
    document.getElementById('twDescription').content = desc;
    document.getElementById('twImage').content = image;
}

function injectJsonLd(item) {
    const schema = {
        '@context': 'https://schema.org',
        '@type': item.type === 'series' ? 'TVSeries' : 'Movie',
        'name': item.title,
        'alternateName': item.title_original || undefined,
        'datePublished': item.year || undefined,
        'genre': item.genre ? item.genre.split(',').map(g => g.trim()) : undefined,
        'description': item.description || undefined,
        'image': item.poster_url ? item.poster_url.replace('w300', 'w500') : undefined,
        'url': window.location.href
    };

    if (item.avg_rating) {
        schema.aggregateRating = {
            '@type': 'AggregateRating',
            'ratingValue': (item.avg_rating / 10).toFixed(1),
            'bestRating': '10',
            'worstRating': '0',
            'ratingCount': 1
        };
    }

    if (item.runtime) {
        schema.duration = `PT${item.runtime}M`;
    }

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('.share-btn');
        if (btn) {
            const original = btn.textContent;
            btn.textContent = 'Zkopírováno!';
            setTimeout(() => { btn.textContent = original; }, 2000);
        }
    });
}
