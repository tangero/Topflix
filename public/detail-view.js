/**
 * Vykreslení detailu titulu. ES modul bez window a document:
 * používá ho prohlížeč (detail.js) i Pages Function, která stránku
 * titulu vykreslí na serveru pro vyhledávače a náhledy při sdílení.
 */

export const SITE_URL = 'https://www.topflix.cz';

const PROVIDER_NAMES = {
    netflix: 'Netflix',
    disney: 'Disney+',
    apple: 'Apple TV+',
    prime: 'Prime Video',
    max: 'Max',
    skyshowtime: 'SkyShowtime'
};

export function escapeHtml(str) {
    if (str === null || str === undefined || str === '') return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function posterLarge(url) {
    return url ? String(url).replace('/w300/', '/w500/').replace('w300', 'w500') : '';
}

function czDate(iso) {
    const [y, m, d] = String(iso || '').split('-');
    if (!y || !m || !d) return escapeHtml(iso);
    return `${parseInt(d, 10)}. ${parseInt(m, 10)}. ${y}`;
}

/**
 * Tlačítko pro Netflix: s netflix_id přímo na titul, jinak vyhledávání.
 * Jen u titulů, které jsou na Netflixu.
 */
export function netflixWatch(item) {
    const providers = Array.isArray(item.streaming_providers) ? item.streaming_providers : [];
    if (!providers.includes('netflix')) return null;
    if (/^\d{5,12}$/.test(String(item.netflix_id || ''))) {
        return { href: `https://www.netflix.com/title/${item.netflix_id}`, direct: true, label: 'Pustit na Netflixu' };
    }
    const query = encodeURIComponent(item.title_original || item.title || '');
    return query ? { href: `https://www.netflix.com/search?q=${query}`, direct: false, label: 'Hledat na Netflixu' } : null;
}

function weeksLabel(n) {
    if (n === 1) return 'týden';
    return n >= 2 && n <= 4 ? 'týdny' : 'týdnů';
}

/**
 * HTML obsahu detailu. titlePath(item) vrací adresu stránky titulu,
 * shareUrl je adresa, kterou zkopíruje tlačítko pro sdílení.
 */
export function renderDetailHtml(item, history, similar, { shareUrl, titlePath }) {
    const typeLabel = item.type === 'movie' ? 'Film' : 'Seriál';
    const poster = posterLarge(item.poster_url);
    const posterHTML = poster
        ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(item.title)}" width="500" height="750">`
        : '<div class="no-poster" aria-hidden="true"></div>';

    let ratingsHTML = '';
    if (item.avg_rating) ratingsHTML += `<div class="detail-rating-card overall"><div class="source-name">Celkové</div><div class="source-value">${escapeHtml(item.avg_rating)}%</div></div>`;
    if (item.tmdb_rating) ratingsHTML += `<div class="detail-rating-card"><div class="source-name">TMDB</div><div class="source-value">${escapeHtml(item.tmdb_rating)}/10</div></div>`;
    if (item.imdb_rating) ratingsHTML += `<div class="detail-rating-card"><div class="source-name">IMDb</div><div class="source-value">${escapeHtml(item.imdb_rating)}/10</div></div>`;
    if (item.rotten_tomatoes_rating) ratingsHTML += `<div class="detail-rating-card"><div class="source-name">Rotten Tomatoes</div><div class="source-value">${escapeHtml(item.rotten_tomatoes_rating)}%</div></div>`;
    if (item.metacritic_rating) ratingsHTML += `<div class="detail-rating-card"><div class="source-name">Metacritic</div><div class="source-value">${escapeHtml(item.metacritic_rating)}</div></div>`;

    const metaParts = [typeLabel];
    if (item.year) metaParts.push(item.year);
    if (item.runtime) {
        const h = Math.floor(item.runtime / 60);
        const m = item.runtime % 60;
        metaParts.push(h > 0 ? `${h}h ${m}min` : `${m}min`);
    }
    if (item.number_of_seasons) metaParts.push(`${item.number_of_seasons} sezón`);
    if (item.number_of_episodes) metaParts.push(`${item.number_of_episodes} epizod`);
    if (item.genre) metaParts.push(item.genre);
    if (Array.isArray(item.origin_country) && item.origin_country.length > 0) metaParts.push(item.origin_country.join(', '));

    const providers = Array.isArray(item.streaming_providers) ? item.streaming_providers : [];
    const providersHTML = providers.length > 0
        ? `<div class="detail-providers"><h3>Kde sledovat</h3><div class="provider-badges">${providers.map((p) =>
            `<span class="provider-badge provider-${escapeHtml(p)}">${escapeHtml(PROVIDER_NAMES[p] || p)}</span>`).join('')}</div></div>`
        : '';

    const watch = netflixWatch(item);
    const watchHTML = watch
        ? `<div class="detail-watch"><a class="hero-play" href="${escapeHtml(watch.href)}" target="_blank" rel="noopener noreferrer" data-watch="${watch.direct ? 'direct' : 'search'}" data-provider="netflix" data-title="${escapeHtml(`${item.type}:${item.tmdb_id}`)}">${watch.label}</a></div>`
        : '';

    let linksHTML = '';
    if (item.tmdb_url) linksHTML += `<a href="${escapeHtml(item.tmdb_url)}" target="_blank" rel="noopener" class="detail-link-btn">TMDB</a>`;
    if (item.imdb_id) linksHTML += `<a href="https://www.imdb.com/title/${escapeHtml(item.imdb_id)}/" target="_blank" rel="noopener" class="detail-link-btn">IMDb</a>`;

    // Jen týdny v Top 10. Dny, kdy byl titul mezi novinkami, sem nepatří.
    const chartWeeks = (history || []).filter((h) => h.source === 'top10');
    const historyHTML = chartWeeks.length > 0
        ? `<div class="history-section"><h3>V české Top 10</h3><div class="history-list">${chartWeeks.map((h) =>
            `<span class="history-item">${h.rank ? `${escapeHtml(h.rank)}. místo · ` : ''}${czDate(h.date)}</span>`).join('')}</div></div>`
        : '';

    let similarHTML = '';
    const similarItems = (similar || []).filter((s) => titlePath(s));
    if (similarItems.length > 0) {
        similarHTML = `<div class="similar-section"><h3>Podobné tituly</h3><div class="similar-grid">${similarItems.map((s) => {
            const img = s.poster_url ? `<img src="${escapeHtml(s.poster_url)}" alt="${escapeHtml(s.title)}" loading="lazy">` : '';
            const color = s.avg_rating >= 80 ? 'var(--quality-excellent)' : s.avg_rating >= 70 ? 'var(--quality-good)' : 'var(--quality-average)';
            return `<a href="${escapeHtml(titlePath(s))}" class="similar-card">${img}<div class="similar-info"><h4>${escapeHtml(s.title)}</h4>`
                + `<div class="similar-meta">${escapeHtml(s.year || '')} ${s.genre ? '| ' + escapeHtml(s.genre) : ''}</div>`
                + `${s.avg_rating ? `<div class="similar-rating" style="color: ${color}">${escapeHtml(s.avg_rating)}%</div>` : ''}</div></a>`;
        }).join('')}</div></div>`;
    }

    const appearancesText = item.last_source === 'netflix_catalog'
        ? (item.first_seen ? `Na Netflix přibyl ${czDate(item.first_seen)}` : '')
        : (chartWeeks.length > 1 ? `${chartWeeks.length} ${weeksLabel(chartWeeks.length)} v Top 10` : '');

    return `
        <div class="detail-hero">
            <div class="detail-poster">${posterHTML}</div>
            <div class="detail-main">
                <h1 class="detail-title">${escapeHtml(item.title)}</h1>
                ${item.title_original && item.title !== item.title_original ? `<div class="detail-original-title">${escapeHtml(item.title_original)}</div>` : ''}
                <div class="detail-ratings">${ratingsHTML}</div>
                <div class="detail-meta">${metaParts.map((p) => `<span>${escapeHtml(p)}</span>`).join('<span>•</span>')}</div>
                ${appearancesText ? `<div class="detail-appearances">${appearancesText}</div>` : ''}
                ${providersHTML}
                ${watchHTML}
                ${item.description ? `<div class="detail-description">${escapeHtml(item.description)}</div>` : ''}
                <div class="detail-links">${linksHTML}</div>
                <div class="detail-share">
                    <button type="button" class="share-btn" data-share-url="${escapeHtml(shareUrl)}">Kopírovat odkaz</button>
                </div>
            </div>
        </div>
        ${historyHTML}
        ${similarHTML}
    `;
}

/** Texty pro <title>, popis a náhled při sdílení. */
export function buildMeta(item, url) {
    const kind = item.type === 'series' ? 'seriál' : 'film';
    const year = item.year ? ` (${item.year})` : '';
    const rating = item.avg_rating ? `, hodnocení ${item.avg_rating} %` : '';
    const title = `${item.title}${year}: ${kind} na Netflixu${rating} | Topflix`;
    const desc = item.description
        ? String(item.description).slice(0, 155).replace(/\s+\S*$/, '') + (String(item.description).length > 155 ? '…' : '')
        : `${item.title}${year} na Netflixu: hodnocení z TMDB, IMDb a Rotten Tomatoes.`;
    return { title, description: desc, url, image: posterLarge(item.poster_url) };
}

/**
 * Strukturovaná data Movie / TVSeries. Bez aggregateRating: číslo je průměr
 * cizích hodnocení, ne hodnocení uživatelů Topflixu, a Google ho jako
 * hodnocení stránky nepřijímá.
 */
export function buildJsonLd(item, url) {
    const sameAs = [];
    if (item.tmdb_url) sameAs.push(item.tmdb_url);
    if (item.imdb_id) sameAs.push(`https://www.imdb.com/title/${item.imdb_id}/`);
    const schema = {
        '@context': 'https://schema.org',
        '@type': item.type === 'series' ? 'TVSeries' : 'Movie',
        name: item.title,
        alternateName: item.title_original && item.title_original !== item.title ? item.title_original : undefined,
        datePublished: item.year ? String(item.year) : undefined,
        genre: item.genre ? String(item.genre).split(',').map((g) => g.trim()).filter(Boolean) : undefined,
        description: item.description || undefined,
        image: posterLarge(item.poster_url) || undefined,
        duration: item.type !== 'series' && item.runtime ? `PT${item.runtime}M` : undefined,
        numberOfSeasons: item.type === 'series' && item.number_of_seasons ? item.number_of_seasons : undefined,
        sameAs: sameAs.length ? sameAs : undefined,
        url
    };
    // JSON.stringify vynechá undefined; "<" escapujeme, aby text nemohl ukončit <script>.
    return JSON.stringify(schema).replace(/</g, '\\u003c');
}
