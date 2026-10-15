/**
 * Topflix - jádro výběru "Dnes večer".
 * Sdílí ho titulka (dnes.js) a seriály (serials-tonight.js).
 * Netflix je hlavní osa, další služby přidá uživatel sám.
 * Potřebuje list-card.js (createTitleCard, LIST_PROVIDERS, WATCH_SEARCH ...).
 */
(function () {
    const NETFLIX = 'netflix';
    const SERVICES_KEY = 'topflix_my_services';
    const INTERNATIONAL_KEY = 'topflix_include_international';
    const HIDDEN_KEY = 'topflix_hidden_titles';
    const MIN_RATING = 70;
    const CURRENT_YEAR = new Date().getFullYear();
    const EXTRA_SERVICES = ['disney', 'max', 'apple', 'prime', 'skyshowtime'];

    const REGIONAL = new Set([
        'JP', 'KR', 'CN', 'TW', 'HK', 'TH', 'IN', 'ID', 'PH', 'VN', 'SG', 'MY',
        'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'UY', 'PY'
    ]);

    // "Pustit na …" a "běží na …" chtějí šestý pád.
    const PROVIDER_LOCATIVE = {
        netflix: 'Netflixu',
        disney: 'Disney+',
        max: 'Maxu',
        apple: 'Apple TV+',
        prime: 'Prime Video',
        skyshowtime: 'SkyShowtime'
    };

    // -----------------------------------------------------------------------
    // Uložené volby
    // -----------------------------------------------------------------------

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

    const prefs = {
        extras: [],
        includeInternational: false,
        hidden: {}
    };

    function loadPrefs() {
        const saved = readJson(SERVICES_KEY, []);
        prefs.extras = Array.isArray(saved) ? saved.filter((service) => EXTRA_SERVICES.includes(service)) : [];
        prefs.includeInternational = readJson(INTERNATIONAL_KEY, false) === true;
        const hidden = readJson(HIDDEN_KEY, {});
        prefs.hidden = hidden && typeof hidden === 'object' && !Array.isArray(hidden) ? hidden : {};
    }

    function setExtras(extras) {
        prefs.extras = extras.filter((service) => EXTRA_SERVICES.includes(service));
        // Stránky s katalogem drží v "moje služby" i Netflix.
        writeJson(SERVICES_KEY, prefs.extras.length ? [NETFLIX, ...prefs.extras] : []);
    }

    function keyOf(item) {
        return `${item.type}:${item.tmdb_id}`;
    }

    function hide(item, reason) {
        prefs.hidden[keyOf(item)] = { reason, at: new Date().toISOString().split('T')[0], title: item.title || item.title_original || '' };
        writeJson(HIDDEN_KEY, prefs.hidden);
    }

    function unhideAll() {
        prefs.hidden = {};
        writeJson(HIDDEN_KEY, prefs.hidden);
    }

    function hiddenCount() {
        return Object.keys(prefs.hidden).length;
    }

    function isHidden(item) {
        return Object.prototype.hasOwnProperty.call(prefs.hidden, keyOf(item));
    }

    // -----------------------------------------------------------------------
    // Data
    // -----------------------------------------------------------------------

    async function getJson(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data;
    }

    function normalize(item, type, source) {
        const providers = Array.isArray(item.providers) ? item.providers : [];
        const fromTop10 = source === 'top10';
        return {
            ...item,
            type,
            _source: source,
            _fromTop10: fromTop10,
            // Titul z Netflix Top 10 i z katalogu Netflixu na Netflixu běží, i když to TMDB ještě neví.
            providers: (fromTop10 || source === 'catalog') && providers.length === 0 ? [NETFLIX] : providers
        };
    }

    function sourceCount(item) {
        return ['tmdb_rating', 'imdb_rating', 'rotten_tomatoes_rating', 'metacritic_rating']
            .filter((key) => Number(item[key]) > 0).length;
    }

    function hasDescription(item) {
        return !!item.description && !item.description.startsWith('Popis není k dispozici');
    }

    function isRegional(item) {
        const origin = Array.isArray(item.origin_country) ? item.origin_country : [];
        return origin.some((code) => REGIONAL.has(code));
    }

    function allowedServices() {
        return [NETFLIX, ...prefs.extras];
    }

    function serviceOf(item) {
        const allowed = allowedServices();
        if (item.providers.includes(NETFLIX)) return NETFLIX;
        return item.providers.find((provider) => allowed.includes(provider)) || null;
    }

    function isWatchable(item) {
        // Top 10 je netflixová. Když TMDB hlásí jinou službu, titul je špatně napárovaný.
        if (item._fromTop10) return item.providers.includes(NETFLIX);
        return serviceOf(item) !== null;
    }

    function isPickable(item) {
        const rating = Number(item.avg_rating);
        if (!item.tmdb_id || !Number.isFinite(rating) || rating < MIN_RATING) return false;
        if (!isWatchable(item)) return false;
        if (!prefs.includeInternational && isRegional(item)) return false;
        if (isHidden(item)) return false;
        // Z Top 10 a z katalogu chodí i tituly s pár hlasy. Jediný zdroj hodnocení nestačí.
        if (item._source !== 'new' && sourceCount(item) < 2) return false;
        return true;
    }

    /**
     * Spojí zdroje do jednoho seznamu bez duplicit. Údaje z Top 10 mají přednost.
     * data = { top10, fresh, added } (odpovědi API, kterákoli může chybět)
     */
    function buildPool(data, options = {}) {
        const map = new Map();
        const add = (item) => {
            const key = keyOf(item);
            const prev = map.get(key);
            if (!prev) map.set(key, item);
            else if (item._fromTop10) map.set(key, { ...prev, ...item, _added: prev._added || item._added });
            else map.set(key, { ...item, ...prev, _added: prev._added || item._added });
        };
        const top10 = data.top10 || {};
        const fresh = data.fresh || {};
        const added = data.added || {};
        (top10.movies || []).forEach((item) => add(normalize(item, 'movie', 'top10')));
        (top10.series || []).forEach((item) => add(normalize(item, 'series', 'top10')));
        (fresh.movies || []).forEach((item) => add(normalize(item, item.type === 'series' ? 'series' : 'movie', 'new')));
        (fresh.series || []).forEach((item) => add(normalize(item, 'series', 'new')));
        if (added.comparable) {
            (added.added || []).forEach((item) => add({ ...normalize(item, item.type === 'series' ? 'series' : 'movie', 'catalog'), _added: item.first_seen }));
        }
        let items = [...map.values()].filter(isPickable);
        if (options.type) items = items.filter((item) => item.type === options.type);
        return items;
    }

    // -----------------------------------------------------------------------
    // Signály a texty
    // -----------------------------------------------------------------------

    function plural(n, one, few, many) {
        if (n === 1) return one;
        if (n >= 2 && n <= 4) return few;
        return many;
    }

    function onService(service) {
        return `na ${PROVIDER_LOCATIVE[service] || LIST_PROVIDERS[service] || service}`;
    }

    function capitalize(text) {
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
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
        if (item.is_new_entry) return 'Nově v Top 10';
        if (item.prev_rank == null && item.weeks_in_top10 > 1) return 'Návrat do Top 10';
        if (item.prev_rank > item.rank) return `↑ o ${item.prev_rank - item.rank}`;
        if (item.prev_rank < item.rank) return `↓ o ${item.rank - item.prev_rank}`;
        if (item.prev_rank === item.rank) return 'Drží pozici';
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
        } else if (item.limited_series) {
            parts.push('minisérie');
        }
        if (item.series_status === 'ended' && !item.limited_series) parts.push('ukončený');
        const seasons = Number(item.number_of_seasons);
        const episodes = Number(item.number_of_episodes);
        if (seasons === 1 && episodes > 0) {
            const label = `${episodes} ${plural(episodes, 'díl', 'díly', 'dílů')}`;
            parts.push(item.episode_runtime ? `${label} po ${item.episode_runtime} min` : label);
        } else if (episodes > 0) {
            parts.push(`${episodes} ${plural(episodes, 'díl', 'díly', 'dílů')} celkem`);
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

    function formatDay(date) {
        const parsed = new Date(`${date}T12:00:00`);
        if (Number.isNaN(parsed.getTime())) return date;
        return parsed.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
    }

    // Proč zrovna tohle: jedna věta ze signálů, které o titulu opravdu víme.
    function whyText(item, withSplit = false, maxParts = 0) {
        const parts = [];
        const service = serviceOf(item);
        if (item._fromTop10 && item.rank) {
            parts.push(`${item.rank}. v Top 10 na Netflixu`);
            if (item.is_new_entry) parts.push('novinka týdne');
            else if (weeksText(item)) parts.push(`drží se ${item.weeks_in_top10}. týden`);
        } else if (item._added) {
            parts.push(`na Netflix přibyl ${formatDay(item._added)}`);
        } else if (service && service !== NETFLIX) {
            parts.push(`běží ${onService(service)}`);
        }
        if ((item._fromTop10 || item._added) && isOlder(item)) parts.push(`z roku ${item.year}`);
        else if (!item._fromTop10 && parseInt(item.year, 10) >= CURRENT_YEAR) parts.push('letošní premiéra');
        const shape = seriesShape(item);
        if (shape) parts.push(shape);
        const quality = qualityText(item, withSplit);
        if (quality) parts.push(quality);
        return capitalize((maxParts ? parts.slice(0, maxParts) : parts).join(' · '));
    }

    function score(item) {
        let value = Number(item.avg_rating) || 0;
        if (item._fromTop10) value += item.rank <= 3 ? 8 : 5;
        if (item.weeks_in_top10 >= 2 && item.weeks_in_top10 <= 8) value += 2;
        if (item._added) value += 3;
        if (parseInt(item.year, 10) >= CURRENT_YEAR - 1) value += 3;
        if (sourceCount(item) >= 3) value += 2;
        // Netflix je hlavní osa, další služby jen doplňují.
        if (serviceOf(item) === NETFLIX) value += 5;
        return value;
    }

    // -----------------------------------------------------------------------
    // Kolik máte času
    // -----------------------------------------------------------------------

    const isWeekendSeries = (item) => item.type === 'series'
        && (item.series_status === 'ended' || item.limited_series || Number(item.number_of_seasons) <= 2)
        && (!item.number_of_episodes || Number(item.number_of_episodes) <= 16);

    const isLongSeries = (item) => item.type === 'series'
        && (Number(item.number_of_seasons) >= 3 || Number(item.number_of_episodes) >= 20);

    const TIME_FILTERS = {
        any: { label: 'Cokoli', test: () => true },
        short: { label: 'Film do 100 min', test: (item) => item.type === 'movie' && Number(item.runtime) > 0 && Number(item.runtime) <= 100 },
        movie: { label: 'Film na celý večer', test: (item) => item.type === 'movie' },
        weekend: { label: 'Seriál na víkend', test: isWeekendSeries },
        long: { label: 'Seriál na dlouho', test: isLongSeries }
    };

    // -----------------------------------------------------------------------
    // Výběr
    // -----------------------------------------------------------------------

    function median(values) {
        if (!values.length) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    }

    /**
     * Hlavní tip a alternativy podle situace. Sloty, které nemají kandidáta,
     * vypadnou. Když jich zbude málo, doplní se nejlépe hodnocenými tituly.
     */
    function choosePicks(pool, slots, options = {}) {
        const maxAlternatives = options.maxAlternatives || 5;
        const sorted = [...pool].sort((a, b) => score(b) - score(a));
        const used = new Set();
        const ctx = {
            medianPopularity: median(pool.filter((item) => item._source === 'new').map((item) => Number(item.popularity) || 0))
        };

        const onNetflix = (item) => serviceOf(item) === NETFLIX;
        const hero = sorted.find((item) => onNetflix(item) && hasDescription(item))
            || sorted.find(hasDescription) || sorted[0] || null;
        if (hero) used.add(keyOf(hero));

        const picks = [];
        slots.forEach((slot) => {
            if (picks.length >= maxAlternatives) return;
            const pick = sorted.find((item) => !used.has(keyOf(item)) && slot.test(item, ctx));
            if (!pick) return;
            used.add(keyOf(pick));
            picks.push({ label: slot.label, item: pick });
        });
        sorted.forEach((item) => {
            if (picks.length >= Math.min(3, maxAlternatives) || used.has(keyOf(item))) return;
            used.add(keyOf(item));
            picks.push({ label: 'Další tip', item });
        });
        return { hero, slots: picks, used };
    }

    // -----------------------------------------------------------------------
    // Vykreslení
    // -----------------------------------------------------------------------

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

    function detailHref(item) {
        return `detail.html?id=${encodeURIComponent(item.tmdb_id)}&type=${item.type}`;
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
        link.appendChild(el('span', 'visually-hidden', `, pustit ${item.title || item.title_original}`));
        return link;
    }

    function hideButtons(item, onChange, compact) {
        const wrap = el('div', compact ? 'hide-actions compact' : 'hide-actions');
        const title = item.title || item.title_original || '';
        [['seen', 'Už jsem viděl'], ['skip', 'Nezajímá mě']].forEach(([reason, label]) => {
            const button = el('button', 'hide-btn', label);
            button.type = 'button';
            if (compact) {
                button.append(el('span', 'visually-hidden', `: ${title}`));
            }
            button.addEventListener('click', () => {
                hide(item, reason);
                onChange();
            });
            wrap.appendChild(button);
        });
        return wrap;
    }

    function renderHero(root, hero, options = {}) {
        root.replaceChildren();
        if (!hero) {
            root.appendChild(el('p', 'empty-note', options.emptyText || 'Teď tu nic nepřesáhlo 70 %. Zkuste jinou volbu nebo přidejte další službu.'));
            return;
        }

        const quality = listQuality(Number(hero.avg_rating));
        const card = el('article', `hero-card quality-${quality}`);
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
        const title = el(options.headingTag || 'h3', 'hero-title');
        const titleLink = el('a', null, hero.title || hero.title_original);
        titleLink.href = detailHref(hero);
        title.appendChild(titleLink);

        const meta = el('p', 'hero-meta', metaParts(hero).join(' · '));
        const scoreRow = el('p', 'hero-score');
        scoreRow.append(el('span', `hero-score-value score-${quality}`, `${Math.round(hero.avg_rating)} %`));
        const sources = sourceCount(hero);
        scoreRow.append(el('span', 'hero-score-note', `${sources} ${plural(sources, 'zdroj', 'zdroje', 'zdrojů')} hodnocení`));

        copy.append(title, meta, scoreRow);
        const why = whyText(hero, true);
        if (why) {
            const whyNode = el('p', 'hero-why');
            whyNode.append(el('strong', null, 'Proč: '), why);
            copy.appendChild(whyNode);
        }
        if (hasDescription(hero)) copy.appendChild(el('p', 'hero-desc', hero.description));

        const actions = el('div', 'hero-actions');
        const service = serviceOf(hero);
        const play = playLink(hero, 'hero-play', `Pustit ${onService(service)}`);
        if (play) actions.appendChild(play);
        const more = el('a', 'hero-more', 'Detail a hodnocení');
        more.href = detailHref(hero);
        actions.appendChild(more);
        copy.appendChild(actions);
        if (options.onHide) copy.appendChild(hideButtons(hero, options.onHide, false));

        card.append(posterLink, copy);
        root.appendChild(card);
    }

    function row(item, reason, options = {}) {
        const wrap = el('div', 'slot');
        if (options.label) wrap.appendChild(el('p', 'slot-label', options.label));
        const card = createTitleCard({ ...item, reason }, {
            showType: options.showType !== false,
            showReason: !!reason,
            preferredProviders: allowedServices()
        });
        if (options.dim) card.classList.add('row-below');
        if (options.onHide) {
            const button = el('button', 'row-hide', '×');
            button.type = 'button';
            button.title = 'Skrýt: už jsem viděl nebo mě nezajímá';
            button.setAttribute('aria-label', `Skrýt ${item.title || item.title_original}`);
            button.addEventListener('click', () => {
                hide(item, 'skip');
                options.onHide();
            });
            card.appendChild(button);
        }
        wrap.appendChild(card);
        return wrap;
    }

    // -----------------------------------------------------------------------
    // Téma (stejné chování jako app.js: tmavá / světlá / podle slunce)
    // -----------------------------------------------------------------------

    function isDaylightSavingTime(date) {
        const year = date.getFullYear();
        const march = new Date(year, 2, 31);
        march.setDate(31 - march.getDay());
        const october = new Date(year, 9, 31);
        october.setDate(31 - october.getDay());
        return date >= march && date < october;
    }

    function isDarkNow() {
        // Praha: východ a západ slunce zjednodušeně
        const now = new Date();
        const latitude = 50.0755;
        const longitude = 14.4378;
        const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
        const declination = -23.45 * Math.cos((360 / 365) * (dayOfYear + 10) * Math.PI / 180);
        const hourAngle = Math.acos(-Math.tan(latitude * Math.PI / 180) * Math.tan(declination * Math.PI / 180)) * 180 / Math.PI;
        const solarNoon = 12 - (longitude / 15);
        const offset = isDaylightSavingTime(now) ? 2 : 1;
        const sunrise = solarNoon - hourAngle / 15 + offset;
        const sunset = solarNoon + hourAngle / 15 + offset;
        const time = now.getHours() + now.getMinutes() / 60;
        return time < sunrise || time >= sunset;
    }

    function currentTheme() {
        try { return localStorage.getItem('theme') || 'auto'; } catch (error) { return 'auto'; }
    }

    function applyTheme(button) {
        const theme = currentTheme();
        const actual = theme === 'auto' ? (isDarkNow() ? 'dark' : 'light') : theme;
        document.body.classList.toggle('light-mode', actual === 'light');
        const icon = button && button.querySelector('.theme-icon');
        if (icon) icon.textContent = { light: '☀️', dark: '🌙', auto: '🌓' }[theme];
    }

    function initTheme(button) {
        applyTheme(button);
        setInterval(() => { if (currentTheme() === 'auto') applyTheme(button); }, 60000);
        if (!button) return;
        button.addEventListener('click', () => {
            const next = { dark: 'light', light: 'auto', auto: 'dark' }[currentTheme()] || 'dark';
            try { localStorage.setItem('theme', next); } catch (error) { /* jen pro tuto návštěvu */ }
            applyTheme(button);
        });
    }

    window.TopflixDnes = {
        NETFLIX,
        EXTRA_SERVICES,
        MIN_RATING,
        TIME_FILTERS,
        prefs,
        loadPrefs,
        setExtras,
        unhideAll,
        hiddenCount,
        getJson,
        normalize,
        buildPool,
        choosePicks,
        sourceCount,
        serviceOf,
        isOlder,
        isRegional,
        isWeekendSeries,
        isLongSeries,
        chartMove,
        weeksText,
        seriesShape,
        whyText,
        onService,
        capitalize,
        formatDay,
        el,
        renderHero,
        row,
        initTheme
    };
})();
