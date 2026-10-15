/**
 * Topflix - "Seriál na dnešek" na stránce seriálů.
 * Používá jádro z dnes-core.js. Seriál se vybírá podle jiných věcí než film:
 * jestli je ukončený, jestli vyšla nová řada a jak dlouhé jsou díly.
 */
(function () {
    const T = window.TopflixDnes;
    if (!T) return;
    const { el } = T;

    const isShortEpisodes = (item) => Number(item.episode_runtime) > 0 && Number(item.episode_runtime) <= 30;
    const isNewSeason = (item) => item.season_number > 1 && Number(item.number_of_seasons) === item.season_number;

    const FILTERS = {
        any: { label: 'Cokoli', test: () => true },
        weekend: { label: 'Na víkend', test: T.isWeekendSeries },
        long: { label: 'Na dlouho', test: T.isLongSeries },
        season: { label: 'Nová řada', test: isNewSeason },
        short: { label: 'Krátké díly', test: isShortEpisodes }
    };

    const SLOTS = [
        { label: 'Na víkend', test: T.isWeekendSeries },
        { label: 'Nová řada', test: isNewSeason },
        { label: 'Krátké díly', test: isShortEpisodes },
        { label: 'Na dlouho', test: T.isLongSeries }
    ];

    const state = { data: {}, filter: 'any' };

    function renderChips() {
        const root = document.getElementById('seriesChips');
        root.replaceChildren();
        Object.entries(FILTERS).forEach(([key, filter]) => {
            const button = el('button', 'time-chip', filter.label);
            button.type = 'button';
            button.setAttribute('aria-pressed', state.filter === key ? 'true' : 'false');
            button.addEventListener('click', () => {
                state.filter = key;
                render();
            });
            root.appendChild(button);
        });
    }

    function renderHiddenNote() {
        const note = document.getElementById('seriesHiddenNote');
        note.replaceChildren();
        const count = T.hiddenCount();
        note.classList.toggle('hidden', !count);
        if (!count) return;
        note.append(`Skryli jste ${count} ${count === 1 ? 'titul' : count < 5 ? 'tituly' : 'titulů'}. `);
        const button = el('button', 'text-btn', 'Vrátit je do výběru');
        button.type = 'button';
        button.addEventListener('click', () => {
            T.unhideAll();
            render();
        });
        note.appendChild(button);
    }

    function render() {
        T.loadPrefs();
        renderChips();
        const filter = FILTERS[state.filter] || FILTERS.any;
        const pool = T.buildPool(state.data, { type: 'series' }).filter((item) => filter.test(item));
        const { hero, slots } = T.choosePicks(pool, state.filter === 'any' ? SLOTS : [], { maxAlternatives: 4 });

        T.renderHero(document.getElementById('seriesHero'), hero, {
            onHide: render,
            emptyText: state.filter === 'any'
                ? 'Teď tu žádný seriál nepřesáhl 70 %.'
                : 'Na tuhle volbu teď žádný seriál nad 70 % nemáme. Zkuste jinou.'
        });

        const root = document.getElementById('seriesPicks');
        root.replaceChildren();
        slots.forEach(({ label, item }) => {
            root.appendChild(T.row(item, T.whyText(item, false, 3), { label, showType: false, onHide: render }));
        });
        renderHiddenNote();
    }

    async function init() {
        const [top10, fresh, added] = await Promise.allSettled([
            T.getJson('/api/top10'),
            T.getJson('/api/netflix-new'),
            T.getJson('/api/netflix-added')
        ]);
        state.data = {
            top10: top10.status === 'fulfilled' ? top10.value : null,
            fresh: fresh.status === 'fulfilled' ? fresh.value : null,
            added: added.status === 'fulfilled' ? added.value : null
        };
        if (!state.data.top10 && !state.data.fresh) {
            document.getElementById('seriesHero').replaceChildren(el('p', 'empty-note', 'Data se nepodařilo načíst. Zkuste to za chvíli.'));
            return;
        }
        render();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
