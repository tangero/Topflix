/**
 * Topflix - náhled titulky "Dnes".
 * Jeden tip na večer, alternativy podle situace, Top 10 s kontextem.
 * Netflix je výchozí, další služby přidá uživatel sám.
 */

const NETFLIX = 'netflix';
const SERVICES_KEY = 'topflix_my_services';
const INTERNATIONAL_KEY = 'topflix_include_international';
const MIN_RATING = 70;
const CURRENT_YEAR = new Date().getFullYear();

const REGIONAL = new Set([
    'JP', 'KR', 'CN', 'TW', 'HK', 'TH', 'IN', 'ID', 'PH', 'VN', 'SG', 'MY',
    'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'UY', 'PY'
]);

const EXTRA_SERVICES = ['disney', 'max', 'apple', 'prime', 'skyshowtime'];

// "Pustit na …" a "běží na …" chtějí šestý pád.
const PROVIDER_LOCATIVE = {
    netflix: 'Netflixu',
    disney: 'Disney+',
    max: 'Maxu',
    apple: 'Apple TV+',
    prime: 'Prime Video',
    skyshowtime: 'SkyShowtime'
};

function onService(service) {
    return `na ${PROVIDER_LOCATIVE[service] || LIST_PROVIDERS[service] || service}`;
}

const state = {
    top10: null,
    fresh: null,
    chart: 'movies',
    extras: readJson(SERVICES_KEY, []).filter((service) => EXTRA_SERVICES.includes(service)),
    includeInternational: readJson(INTERNATIONAL_KEY, false) === true
};

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        // Bez localStorage se volba jen nezapamatuje.
    }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function getJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
}

function normalize(item, type, fromTop10) {
    const providers = Array.isArray(item.providers) ? item.providers : [];
    return {
        ...item,
        type,
        _fromTop10: fromTop10,
        // Titul z Netflix Top 10 na Netflixu běží, i když ho TMDB ještě nemá.
        providers: fromTop10 && providers.length === 0 ? [NETFLIX] : providers
    };
}

function sourceCount(item) {
    return ['tmdb_rating', 'imdb_rating', 'rotten_tomatoes_rating', 'metacritic_rating']
        .filter((key) => Number(item[key]) > 0).length;
}

function hasDescription(item) {
    return item.description && !item.description.startsWith('Popis není k dispozici');
}

function isRegional(item) {
    const origin = Array.isArray(item.origin_country) ? item.origin_country : [];
    return origin.length > 0 && origin.every((code) => REGIONAL.has(code));
}

function allowedServices() {
    return [NETFLIX, ...state.extras];
}

function serviceOf(item) {
    const allowed = allowedServices();
    if (item.providers.includes(NETFLIX)) return NETFLIX;
    return item.providers.find((provider) => allowed.includes(provider)) || null;
}

function isWatchable(item) {
    // Top 10 je netflixová. Když TMDB hlásí jinou službu, titul jsme spárovali špatně.
    if (item._fromTop10) return item.providers.includes(NETFLIX);
    return serviceOf(item) !== null;
}

function isPickable(item) {
    const rating = Number(item.avg_rating);
    if (!item.tmdb_id || !Number.isFinite(rating) || rating < MIN_RATING) return false;
    if (!isWatchable(item)) return false;
    if (!state.includeInternational && isRegional(item)) return false;
    // Z Top 10 chodí i tituly s pár hlasy. Jediný zdroj hodnocení nestačí.
    if (item._fromTop10 && sourceCount(item) < 2) return false;
    return true;
}

function buildPool() {
    const map = new Map();
    const add = (item) => {
        const key = `${item.type}:${item.tmdb_id}`;
        const prev = map.get(key);
        if (!prev || item._fromTop10) map.set(key, { ...(prev || {}), ...item });
    };
    const top10 = state.top10 || {};
    const fresh = state.fresh || {};
    (top10.movies || []).forEach((item) => add(normalize(item, 'movie', true)));
    (top10.series || []).forEach((item) => add(normalize(item, 'series', true)));
    (fresh.movies || []).forEach((item) => add(normalize(item, item.type === 'series' ? 'series' : 'movie', false)));
    (fresh.series || []).forEach((item) => add(normalize(item, 'series', false)));
    return [...map.values()].filter(isPickable);
}

// ---------------------------------------------------------------------------
// Signály a texty
// ---------------------------------------------------------------------------

function plural(n, one, few, many) {
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return few;
    return many;
}

function audienceCritics(item) {
    const audience = [item.tmdb_rating, item.imdb_rating].filter((v) => Number(v) > 0).map((v) => v * 10);
    const critics = [item.rotten_tomatoes_rating, item.metacritic_rating].filter((v) => Number(v) > 0).map(Number);
    if (!audience.length || !critics.length) return null;
    const avg = (values) => Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
    return { audience: avg(audience), critics: avg(critics) };
}

function chartMove(item) {
    if (!item._fromTop10 || !item.rank) return null;
    if (item.is_new_entry) return { text: 'Nově v Top 10', tone: 'new' };
    if (item.prev_rank == null && item.weeks_in_top10 > 1) return { text: 'Návrat do Top 10', tone: 'back' };
    if (item.prev_rank > item.rank) return { text: `↑ o ${item.prev_rank - item.rank}`, tone: 'up' };
    if (item.prev_rank < item.rank) return { text: `↓ o ${item.rank - item.prev_rank}`, tone: 'down' };
    if (item.prev_rank === item.rank) return { text: 'Drží pozici', tone: 'same' };
    return null;
}

function weeksText(item) {
    const weeks = item.weeks_in_top10;
    if (!weeks || weeks < 2) return null;
    return `${weeks}. týden v Top 10`;
}

function seriesShape(item) {
    if (item.type !== 'series') return null;
    const parts = [];
    if (item.season_number > 1) {
        // Netflix uvádí řadu, která se teď sleduje. Nejnovější je jen tehdy, když sedí s TMDB.
        const latest = Number(item.number_of_seasons) === item.season_number;
        parts.push(latest ? `nová ${item.season_number}. řada` : `v Top 10 je ${item.season_number}. řada`);
    }
    else if (item.limited_series) parts.push('minisérie');
    if (item.series_status === 'ended' && !item.limited_series) parts.push('ukončený');
    const seasons = Number(item.number_of_seasons);
    const episodes = Number(item.number_of_episodes);
    if (seasons === 1 && episodes > 0) {
        parts.push(item.episode_runtime
            ? `${episodes} ${plural(episodes, 'díl', 'díly', 'dílů')} po ${item.episode_runtime} min`
            : `${episodes} ${plural(episodes, 'díl', 'díly', 'dílů')}`);
    }
    return parts.length ? parts.join(', ') : null;
}

function isOlder(item) {
    const year = parseInt(item.year, 10);
    return Number.isFinite(year) && year <= CURRENT_YEAR - 2;
}

// Rozchod diváků a kritiky ukazuje řádek sám (listSplit), v textu ho opakujeme jen u hlavního tipu.
function qualityText(item, withSplit) {
    const split = audienceCritics(item);
    if (split && Math.abs(split.audience - split.critics) < 15) return 'diváci i kritika se shodnou';
    if (split && withSplit) return `diváci ${split.audience}, kritika ${split.critics}`;
    return null;
}

// Proč zrovna tohle: jedna věta ze signálů, které o titulu opravdu víme.
function whyText(item, withSplit = false) {
    const parts = [];
    const service = serviceOf(item);
    if (item._fromTop10 && item.rank) {
        parts.push(`${item.rank}. v Top 10 na Netflixu`);
        const weeks = weeksText(item);
        if (item.is_new_entry) parts.push('novinka týdne');
        else if (weeks) parts.push(`drží se ${item.weeks_in_top10}. týden`);
    } else if (service && service !== NETFLIX) {
        parts.push(`běží ${onService(service)}`);
    }
    if (item._fromTop10 && isOlder(item)) parts.push(`z roku ${item.year}`);
    else if (!item._fromTop10 && parseInt(item.year, 10) >= CURRENT_YEAR) parts.push('letošní premiéra');
    const shape = seriesShape(item);
    if (shape) parts.push(shape);
    const quality = qualityText(item, withSplit);
    if (quality) parts.push(quality);
    const text = parts.join(' · ');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function score(item) {
    let value = Number(item.avg_rating) || 0;
    if (item._fromTop10) value += item.rank <= 3 ? 8 : 5;
    if (item.weeks_in_top10 >= 2 && item.weeks_in_top10 <= 8) value += 2;
    if (parseInt(item.year, 10) >= CURRENT_YEAR - 1) value += 3;
    if (sourceCount(item) >= 3) value += 2;
    // Netflix je hlavní osa, další služby jen doplňují.
    if (serviceOf(item) === NETFLIX) value += 5;
    return value;
}

// ---------------------------------------------------------------------------
// Výběr
// ---------------------------------------------------------------------------

const SLOTS = [
    {
        label: 'Film na dnešek',
        test: (item) => item.type === 'movie'
    },
    {
        label: 'Seriál na víkend',
        test: (item) => item.type === 'series'
            && (item.series_status === 'ended' || item.limited_series || Number(item.number_of_seasons) <= 2)
            && (!item.number_of_episodes || Number(item.number_of_episodes) <= 16)
    },
    {
        label: 'Do 100 minut',
        test: (item) => item.type === 'movie' && Number(item.runtime) > 0 && Number(item.runtime) <= 100
    },
    {
        label: 'Starší, teď v Top 10',
        test: (item) => item._fromTop10 && isOlder(item)
    },
    {
        label: 'Méně známé, výborně hodnocené',
        test: (item, ctx) => !item._fromTop10 && Number(item.avg_rating) >= 80
            && sourceCount(item) >= 2 && Number(item.popularity || 0) <= ctx.medianPopularity
    }
];

function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function choosePicks(pool) {
    const sorted = [...pool].sort((a, b) => score(b) - score(a));
    const used = new Set();
    const keyOf = (item) => `${item.type}:${item.tmdb_id}`;
    const ctx = {
        medianPopularity: median(pool.filter((item) => !item._fromTop10).map((item) => Number(item.popularity) || 0))
    };

    const onNetflix = (item) => serviceOf(item) === NETFLIX;
    const hero = sorted.find((item) => onNetflix(item) && hasDescription(item))
        || sorted.find(hasDescription) || sorted[0] || null;
    if (hero) used.add(keyOf(hero));

    const slots = [];
    SLOTS.forEach((slot) => {
        const pick = sorted.find((item) => !used.has(keyOf(item)) && slot.test(item, ctx));
        if (!pick) return;
        used.add(keyOf(pick));
        slots.push({ label: slot.label, item: pick });
    });
    return { hero, slots };
}

// ---------------------------------------------------------------------------
// Vykreslení
// ---------------------------------------------------------------------------

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function metaParts(item) {
    const parts = [item.type === 'series' ? 'Seriál' : 'Film'];
    if (item.year) parts.push(String(item.year));
    const length = item.type === 'series' ? listSeasons(item) : listRuntime(item.runtime);
    if (length) parts.push(length);
    return parts;
}

function playLink(item, className, label) {
    const service = serviceOf(item);
    const query = encodeURIComponent(item.title_original || item.title || '');
    if (!service || !WATCH_SEARCH[service] || !query) return null;
    const link = el('a', className);
    link.href = WATCH_SEARCH[service](query);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.append(label || (LIST_PROVIDER_SHORT[service] || service));
    const hidden = el('span', 'visually-hidden', `, pustit ${item.title || item.title_original}`);
    link.appendChild(hidden);
    return link;
}

function detailHref(item) {
    return `/detail.html?id=${encodeURIComponent(item.tmdb_id)}&type=${item.type}`;
}

function renderHero(hero) {
    const root = document.getElementById('hero');
    root.replaceChildren();
    if (!hero) {
        root.appendChild(el('p', 'empty-note', 'Dnes tu nic nepřesáhlo 70 %. Zkuste přidat další službu níže.'));
        return;
    }

    const card = el('article', `hero-card quality-${listQuality(Number(hero.avg_rating))}`);
    const posterLink = el('a', 'hero-poster');
    posterLink.href = detailHref(hero);
    posterLink.setAttribute('aria-hidden', 'true');
    posterLink.tabIndex = -1;
    if (hero.poster_url) {
        const img = el('img');
        img.src = hero.poster_url.replace('/w300/', '/w500/');
        img.alt = '';
        img.width = 220;
        img.height = 330;
        posterLink.appendChild(img);
    }

    const copy = el('div', 'hero-copy');
    const title = el('h1', 'hero-title');
    const titleLink = el('a', null, hero.title || hero.title_original);
    titleLink.href = detailHref(hero);
    title.appendChild(titleLink);

    const meta = el('p', 'hero-meta', metaParts(hero).join(' · '));
    const scoreRow = el('p', 'hero-score');
    const scoreValue = el('span', `hero-score-value score-${listQuality(Number(hero.avg_rating))}`, `${Math.round(hero.avg_rating)} %`);
    scoreRow.append(scoreValue);
    const sources = sourceCount(hero);
    scoreRow.append(el('span', 'hero-score-note', `${sources} ${plural(sources, 'zdroj', 'zdroje', 'zdrojů')} hodnocení`));

    const why = whyText(hero, true);
    const whyNode = why ? el('p', 'hero-why') : null;
    if (whyNode) {
        whyNode.append(el('strong', null, 'Proč: '), why);
    }

    const description = hasDescription(hero) ? el('p', 'hero-desc', hero.description) : null;

    const actions = el('div', 'hero-actions');
    const service = serviceOf(hero);
    const play = playLink(hero, 'hero-play', `Pustit ${onService(service)}`);
    if (play) actions.appendChild(play);
    const more = el('a', 'hero-more', 'Detail a hodnocení');
    more.href = detailHref(hero);
    actions.appendChild(more);

    copy.append(title, meta, scoreRow);
    if (whyNode) copy.appendChild(whyNode);
    if (description) copy.appendChild(description);
    copy.appendChild(actions);
    card.append(posterLink, copy);
    root.appendChild(card);
}

function slotRow(label, item, reason) {
    const wrap = el('div', 'slot');
    if (label) wrap.appendChild(el('p', 'slot-label', label));
    const row = createTitleCard({ ...item, reason }, {
        showType: true,
        showReason: !!reason,
        preferredProviders: allowedServices()
    });
    wrap.appendChild(row);
    return wrap;
}

function renderSlots(slots) {
    const root = document.getElementById('alternatives');
    root.replaceChildren();
    if (!slots.length) {
        root.appendChild(el('p', 'empty-note', 'Další tituly nad 70 % teď nemáme.'));
        return;
    }
    slots.forEach(({ label, item }) => root.appendChild(slotRow(label, item, whyText(item))));
}

function renderChart() {
    const root = document.getElementById('chart');
    const weekNode = document.getElementById('chartWeek');
    root.replaceChildren();
    document.querySelectorAll('.seg-btn').forEach((button) => {
        button.setAttribute('aria-pressed', button.dataset.chart === state.chart ? 'true' : 'false');
    });

    const top10 = state.top10;
    if (!top10) {
        root.appendChild(el('li', 'empty-note', 'Top 10 se nepodařilo načíst.'));
        return;
    }
    weekNode.textContent = top10.week ? `Česká Top 10 za týden do ${formatWeek(top10.week)}. Netflix ji zveřejňuje každé úterý.` : '';

    const type = state.chart === 'series' ? 'series' : 'movie';
    (top10[state.chart] || []).forEach((raw) => {
        const item = normalize(raw, type, true);
        const li = el('li', 'chart-item');
        li.appendChild(el('span', 'chart-rank', String(item.rank)));

        const notes = [];
        const move = chartMove(item);
        if (move) notes.push(move.text);
        const weeks = weeksText(item);
        if (weeks && !item.is_new_entry) notes.push(weeks);
        if (item.type === 'series' && item.season_number > 1) notes.push(`${item.season_number}. řada`);

        if (!item.tmdb_id || !item.providers.includes(NETFLIX)) {
            const plain = el('div', 'chart-plain');
            plain.appendChild(el('p', 'pick-title', raw.title || item.title));
            plain.appendChild(el('p', 'pick-meta', notes.join(' · ') || 'Bez údajů z TMDB'));
            li.appendChild(plain);
        } else {
            const rating = Number(item.avg_rating);
            const row = createTitleCard({ ...item, reason: notes.join(' · ') }, {
                showType: false,
                showReason: notes.length > 0,
                preferredProviders: [NETFLIX]
            });
            if (!(rating >= MIN_RATING)) row.classList.add('chart-below');
            li.appendChild(row);
        }
        root.appendChild(li);
    });
}

function renderOlder() {
    const root = document.getElementById('added');
    root.replaceChildren();
    // Kandidáti i pod 70 %: tady jde o přehled, hodnocení je vidět u řádku.
    const top10 = state.top10 || {};
    const items = [
        ...(top10.movies || []).map((item) => normalize(item, 'movie', true)),
        ...(top10.series || []).map((item) => normalize(item, 'series', true))
    ].filter((item) => item.tmdb_id && item.providers.includes(NETFLIX) && isOlder(item) && (item.weeks_in_top10 || 1) <= 6);

    if (!items.length) {
        root.appendChild(el('p', 'empty-note', 'Tento týden v Top 10 nejsou žádné starší tituly.'));
        return;
    }
    items
        .sort((a, b) => (Number(b.avg_rating) || 0) - (Number(a.avg_rating) || 0))
        .forEach((item) => {
            const notes = [`z roku ${item.year}`];
            const weeks = weeksText(item);
            notes.push(item.is_new_entry ? 'nově v Top 10' : (weeks || `${item.rank}. v Top 10`));
            const row = slotRow(null, item, notes.join(' · '));
            if (!(Number(item.avg_rating) >= MIN_RATING)) row.classList.add('chart-below');
            root.appendChild(row);
        });
}

function renderFresh(pool, usedKeys) {
    const root = document.getElementById('fresh');
    root.replaceChildren();
    const items = pool
        .filter((item) => !item._fromTop10 && !usedKeys.has(`${item.type}:${item.tmdb_id}`))
        .sort((a, b) => (Number(b.avg_rating) || 0) - (Number(a.avg_rating) || 0))
        .slice(0, 8);
    if (!items.length) {
        root.appendChild(el('p', 'empty-note', 'Žádné novinky nad 70 %.'));
        return;
    }
    items.forEach((item) => {
        const service = serviceOf(item);
        const reason = service && service !== NETFLIX ? `běží ${onService(service)}` : seriesShape(item);
        root.appendChild(slotRow(null, item, reason ? reason.charAt(0).toUpperCase() + reason.slice(1) : ''));
    });
}

function renderServiceChips() {
    const root = document.getElementById('serviceChips');
    root.replaceChildren();
    EXTRA_SERVICES.forEach((service) => {
        const button = el('button', 'service-chip', LIST_PROVIDERS[service]);
        button.type = 'button';
        button.setAttribute('aria-pressed', state.extras.includes(service) ? 'true' : 'false');
        button.addEventListener('click', () => {
            state.extras = state.extras.includes(service)
                ? state.extras.filter((value) => value !== service)
                : [...state.extras, service];
            // Hlavní stránka si v "moje služby" drží i Netflix.
            writeJson(SERVICES_KEY, state.extras.length ? [NETFLIX, ...state.extras] : []);
            render();
        });
        root.appendChild(button);
    });
}

function formatWeek(week) {
    const date = new Date(`${week}T12:00:00`);
    if (Number.isNaN(date.getTime())) return week;
    return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function render() {
    const pool = buildPool();
    const { hero, slots } = choosePicks(pool);
    const used = new Set([hero, ...slots.map((slot) => slot.item)].filter(Boolean).map((item) => `${item.type}:${item.tmdb_id}`));
    renderHero(hero);
    renderSlots(slots);
    renderChart();
    renderOlder();
    renderFresh(pool, used);
    renderServiceChips();
}

function applyTheme() {
    let theme = 'auto';
    try { theme = localStorage.getItem('theme') || 'auto'; } catch (error) { /* výchozí */ }
    const light = theme === 'light'
        || (theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.body.classList.toggle('light-mode', light);
}

async function init() {
    applyTheme();
    document.querySelectorAll('.seg-btn').forEach((button) => {
        button.addEventListener('click', () => {
            state.chart = button.dataset.chart;
            renderChart();
        });
    });

    const [top10, fresh] = await Promise.allSettled([getJson('/api/top10'), getJson('/api/netflix-new')]);
    state.top10 = top10.status === 'fulfilled' ? top10.value : null;
    state.fresh = fresh.status === 'fulfilled' ? fresh.value : null;
    if (!state.top10 && !state.fresh) {
        document.getElementById('hero').replaceChildren(el('p', 'empty-note', 'Data se nepodařilo načíst. Zkuste to za chvíli.'));
        return;
    }
    render();
}

document.addEventListener('DOMContentLoaded', init);
