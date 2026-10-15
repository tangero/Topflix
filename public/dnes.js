/**
 * Topflix - titulka "Dnes".
 * Volba času, jeden tip s důvodem, alternativy podle situace, Top 10 s kontextem,
 * nově přidané tituly na Netflix a premiéry nad 70 %.
 */
(function () {
    const T = window.TopflixDnes;
    const { el } = T;

    const state = {
        top10: null,
        fresh: null,
        added: null,
        chart: 'movies',
        time: 'any'
    };

    const SLOTS = [
        { label: 'Film na dnešek', test: (item) => item.type === 'movie' },
        { label: 'Seriál na víkend', test: T.isWeekendSeries },
        { label: 'Do 100 minut', test: (item) => item.type === 'movie' && Number(item.runtime) > 0 && Number(item.runtime) <= 100 },
        { label: 'Starší, nově na Netflixu', test: (item) => (item._added || item._fromTop10) && T.isOlder(item) },
        {
            label: 'Méně známé, výborně hodnocené',
            test: (item, ctx) => item._source === 'new' && Number(item.avg_rating) >= 80
                && T.sourceCount(item) >= 2 && Number(item.popularity || 0) <= ctx.medianPopularity
        }
    ];

    function data() {
        return { top10: state.top10, fresh: state.fresh, added: state.added };
    }

    // ---------------------------------------------------------------------
    // Výběr na dnešek
    // ---------------------------------------------------------------------

    function renderTimeChips() {
        const root = document.getElementById('timeChips');
        root.replaceChildren();
        Object.entries(T.TIME_FILTERS).forEach(([key, filter]) => {
            const button = el('button', 'time-chip', filter.label);
            button.type = 'button';
            button.setAttribute('aria-pressed', state.time === key ? 'true' : 'false');
            button.addEventListener('click', () => {
                state.time = key;
                renderPicks();
            });
            root.appendChild(button);
        });
    }

    function renderPicks() {
        renderTimeChips();
        const filter = T.TIME_FILTERS[state.time] || T.TIME_FILTERS.any;
        const pool = T.buildPool(data()).filter((item) => filter.test(item));
        // S volbou času dávají smysl jen sloty, které jí odpovídají. Zbytek doplní "Další tip".
        const { hero, slots, used } = T.choosePicks(pool, state.time === 'any' ? SLOTS : [], { maxAlternatives: 5 });

        T.renderHero(document.getElementById('hero'), hero, {
            onHide: renderAll,
            emptyText: state.time === 'any'
                ? 'Teď tu nic nepřesáhlo 70 %. Zkuste přidat další službu níže.'
                : 'Na tuhle volbu teď nic nad 70 % nemáme. Zkuste jinou.'
        });

        const root = document.getElementById('alternatives');
        root.replaceChildren();
        slots.forEach(({ label, item }) => {
            root.appendChild(T.row(item, T.whyText(item, false, 3), { label, onHide: renderAll }));
        });
        document.getElementById('altBlock').classList.toggle('hidden', slots.length === 0);
        renderHiddenNote();
        return used;
    }

    function renderHiddenNote() {
        const note = document.getElementById('hiddenNote');
        note.replaceChildren();
        const count = T.hiddenCount();
        if (!count) {
            note.classList.add('hidden');
            return;
        }
        note.classList.remove('hidden');
        note.append(`Skryli jste ${count} ${count === 1 ? 'titul' : count < 5 ? 'tituly' : 'titulů'}. `);
        const button = el('button', 'text-btn', 'Vrátit je do výběru');
        button.type = 'button';
        button.addEventListener('click', () => {
            T.unhideAll();
            renderAll();
        });
        note.appendChild(button);
    }

    // ---------------------------------------------------------------------
    // Top 10
    // ---------------------------------------------------------------------

    function formatWeek(week) {
        const date = new Date(`${week}T12:00:00`);
        if (Number.isNaN(date.getTime())) return week;
        return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
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
            weekNode.textContent = '';
            root.appendChild(el('li', 'empty-note', 'Top 10 se nepodařilo načíst.'));
            return;
        }
        weekNode.textContent = top10.week
            ? `Česká Top 10 za týden do ${formatWeek(top10.week)}. Netflix ji zveřejňuje v úterý.`
            : '';

        const type = state.chart === 'series' ? 'series' : 'movie';
        (top10[state.chart] || []).forEach((raw) => {
            const item = T.normalize(raw, type, 'top10');
            const li = el('li', 'chart-item');
            li.appendChild(el('span', 'chart-rank', String(item.rank)));

            const notes = [];
            const move = T.chartMove(item);
            if (move) notes.push(move);
            const weeks = T.weeksText(item);
            if (weeks && !item.is_new_entry) notes.push(weeks);
            if (item.type === 'series' && item.season_number > 1) notes.push(`${item.season_number}. řada`);

            if (!item.tmdb_id || !item.providers.includes(T.NETFLIX)) {
                // Bez spárovaného titulu ukážeme aspoň název z Netflixu.
                const plain = el('div', 'chart-plain');
                plain.appendChild(el('p', 'pick-title', raw.title || item.title));
                plain.appendChild(el('p', 'pick-meta', notes.join(' · ') || 'Bez údajů z TMDB'));
                li.appendChild(plain);
            } else {
                const card = T.row(item, notes.join(' · '), { showType: false }).firstChild;
                if (!(Number(item.avg_rating) >= T.MIN_RATING)) card.classList.add('row-below');
                li.appendChild(card);
            }
            root.appendChild(li);
        });
    }

    // ---------------------------------------------------------------------
    // Nově přidáno na Netflix
    // ---------------------------------------------------------------------

    function addedItems() {
        const added = state.added;
        if (!added || !added.comparable) return null;
        return (added.added || [])
            .map((item) => ({ ...T.normalize(item, item.type === 'series' ? 'series' : 'movie', 'catalog'), _added: item.first_seen }))
            .filter((item) => T.prefs.includeInternational || !T.isRegional(item));
    }

    function renderAdded() {
        const root = document.getElementById('added');
        const sub = document.getElementById('addedSub');
        const heading = document.getElementById('added-heading');
        root.replaceChildren();

        const items = addedItems();
        if (items) {
            heading.textContent = 'Nově přidáno na Netflix';
            sub.textContent = `Co v posledních 30 dnech přibylo do českého katalogu, i starší tituly. Netflix katalog kontrolujeme dvakrát týdně, naposledy ${T.formatDay(state.added.last_sync)}.`;
            const rated = items.filter((item) => Number(item.avg_rating) > 0);
            const good = rated.filter((item) => Number(item.avg_rating) >= T.MIN_RATING)
                .sort((a, b) => (b._added || '').localeCompare(a._added || '') || Number(b.avg_rating) - Number(a.avg_rating));
            const rest = rated.filter((item) => Number(item.avg_rating) < T.MIN_RATING);
            if (!good.length) {
                root.appendChild(el('p', 'empty-note', 'Za posledních 30 dní nepřibylo nic nad 70 %.'));
            }
            good.slice(0, 10).forEach((item) => {
                const notes = [`přidáno ${T.formatDay(item._added)}`];
                if (T.isOlder(item)) notes.push(`z roku ${item.year}`);
                root.appendChild(T.row(item, notes.join(' · ')));
            });
            if (rest.length) {
                root.appendChild(listDetails(`Další přírůstky pod 70 % (${rest.length})`, rest.slice(0, 20), (item) => `přidáno ${T.formatDay(item._added)}`));
            }
            const removed = (state.added.removed || []).map((item) => T.normalize(item, item.type === 'series' ? 'series' : 'movie', 'catalog'));
            if (removed.length) {
                root.appendChild(listDetails(`Z Netflixu zmizelo (${removed.length})`, removed.slice(0, 20), (item) => `naposledy ${T.formatDay(item.removed_at)}`, true));
            }
            return;
        }

        // Než budou dva snímky katalogu: starší tituly, které se drží v Top 10.
        heading.textContent = 'Starší tituly, nově v Top 10';
        sub.textContent = 'Filmy a seriály z dřívějška, které se teď drží v české Top 10. Často to znamená, že na Netflix právě přibyly. Přesný přehled přírůstků katalogu zapneme, jakmile ho budeme sledovat aspoň dva týdny.';
        const top10 = state.top10 || {};
        const older = [
            ...(top10.movies || []).map((item) => T.normalize(item, 'movie', 'top10')),
            ...(top10.series || []).map((item) => T.normalize(item, 'series', 'top10'))
        ].filter((item) => item.tmdb_id && item.providers.includes(T.NETFLIX) && T.isOlder(item) && (item.weeks_in_top10 || 1) <= 6);

        if (!older.length) {
            root.appendChild(el('p', 'empty-note', 'Tento týden v Top 10 nejsou žádné starší tituly.'));
            return;
        }
        older
            .sort((a, b) => (Number(b.avg_rating) || 0) - (Number(a.avg_rating) || 0))
            .forEach((item) => {
                const notes = [`z roku ${item.year}`];
                notes.push(item.is_new_entry ? 'nově v Top 10' : (T.weeksText(item) || `${item.rank}. v Top 10`));
                root.appendChild(T.row(item, notes.join(' · '), { dim: !(Number(item.avg_rating) >= T.MIN_RATING) }));
            });
    }

    function listDetails(summaryText, items, noteOf, plain) {
        const details = el('details', 'more-list');
        details.appendChild(el('summary', null, summaryText));
        const list = el('div', 'slot-list');
        items.forEach((item) => {
            if (plain) {
                const line = el('p', 'plain-line');
                line.append(el('strong', null, item.title || item.title_original || ''), ` · ${item.year || ''} · ${noteOf(item)}`);
                list.appendChild(line);
            } else {
                list.appendChild(T.row(item, noteOf(item), { dim: true }));
            }
        });
        details.appendChild(list);
        return details;
    }

    // ---------------------------------------------------------------------
    // Premiéry a služby
    // ---------------------------------------------------------------------

    function renderFresh(used) {
        const root = document.getElementById('fresh');
        root.replaceChildren();
        const items = T.buildPool({ fresh: state.fresh })
            .filter((item) => !used.has(`${item.type}:${item.tmdb_id}`))
            .sort((a, b) => (Number(b.avg_rating) || 0) - (Number(a.avg_rating) || 0))
            .slice(0, 8);
        if (!items.length) {
            root.appendChild(el('p', 'empty-note', 'Žádné premiéry nad 70 %.'));
            return;
        }
        items.forEach((item) => {
            const service = T.serviceOf(item);
            const reason = service && service !== T.NETFLIX ? `běží ${T.onService(service)}` : T.seriesShape(item);
            root.appendChild(T.row(item, T.capitalize(reason || ''), { onHide: renderAll }));
        });
    }

    function renderServiceChips() {
        const root = document.getElementById('serviceChips');
        root.replaceChildren();
        T.EXTRA_SERVICES.forEach((service) => {
            const button = el('button', 'service-chip', LIST_PROVIDERS[service]);
            button.type = 'button';
            button.setAttribute('aria-pressed', T.prefs.extras.includes(service) ? 'true' : 'false');
            button.addEventListener('click', () => {
                const extras = T.prefs.extras.includes(service)
                    ? T.prefs.extras.filter((value) => value !== service)
                    : [...T.prefs.extras, service];
                T.setExtras(extras);
                renderAll();
            });
            root.appendChild(button);
        });
    }

    function injectJsonLd(items) {
        const old = document.getElementById('jsonld-dnes');
        if (old) old.remove();
        if (!items.length) return;
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'jsonld-dnes';
        script.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Topflix - na co se dívat dnes večer na Netflixu',
            itemListElement: items.map((item, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                item: {
                    '@type': item.type === 'series' ? 'TVSeries' : 'Movie',
                    name: item.title || item.title_original,
                    ...(item.year ? { datePublished: String(item.year) } : {}),
                    ...(item.poster_url ? { image: item.poster_url } : {}),
                    ...(item.avg_rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: item.avg_rating, bestRating: 100, worstRating: 0 } } : {})
                }
            }))
        });
        document.head.appendChild(script);
    }

    function renderAll() {
        const used = renderPicks();
        renderChart();
        renderAdded();
        renderFresh(used);
        renderServiceChips();
        const pool = T.buildPool(data());
        injectJsonLd(pool.filter((item) => used.has(`${item.type}:${item.tmdb_id}`)));
    }

    function setupNewsletter() {
        const form = document.getElementById('newsletterForm');
        const input = document.getElementById('newsletterEmail');
        const message = document.getElementById('newsletterMessage');
        if (!form) return;
        const show = (text, type) => {
            message.textContent = text;
            message.className = `newsletter-message ${type}`;
        };
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = input.value.trim();
            if (!email) {
                show('Zadejte e-mail.', 'error');
                return;
            }
            const button = form.querySelector('button');
            input.disabled = true;
            button.disabled = true;
            show('Přihlašuji…', 'success');
            try {
                const response = await fetch('/api/newsletter-subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.error || 'Přihlášení se nepovedlo.');
                show('Hotovo. Výběr vám přijde e-mailem každé úterý odpoledne.', 'success');
                input.value = '';
            } catch (error) {
                show(error.message, 'error');
                input.disabled = false;
                button.disabled = false;
            }
        });
    }

    async function init() {
        T.loadPrefs();
        setupNewsletter();
        T.initTheme(document.getElementById('themeToggle'));
        document.querySelectorAll('.seg-btn').forEach((button) => {
            button.addEventListener('click', () => {
                state.chart = button.dataset.chart;
                renderChart();
            });
        });

        const [top10, fresh, added] = await Promise.allSettled([
            T.getJson('/api/top10'),
            T.getJson('/api/netflix-new'),
            T.getJson('/api/netflix-added')
        ]);
        state.top10 = top10.status === 'fulfilled' ? top10.value : null;
        state.fresh = fresh.status === 'fulfilled' ? fresh.value : null;
        state.added = added.status === 'fulfilled' ? added.value : null;
        if (!state.top10 && !state.fresh) {
            document.getElementById('hero').replaceChildren(el('p', 'empty-note', 'Data se nepodařilo načíst. Zkuste to za chvíli.'));
            return;
        }
        renderAll();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
