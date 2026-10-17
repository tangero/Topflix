import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { createD1 } from './d1shim.mjs';
import {
  collectTitles,
  lookupWikidata,
  attachNetflixIds,
  refreshNetflixIds,
  syncNetflixIdsStep,
  netflixTitleUrl
} from '../../functions/_lib/netflix-ids.js';
import { netflixWatch } from '../../public/detail-view.js';

const MIGRATIONS = [
  'migrations/0001_initial_schema.sql',
  'migrations/0003_multi_ratings_providers.sql',
  'migrations/0004_netflix_catalog_history.sql',
  'migrations/0005_netflix_ids.sql'
];

// Náhrada Wikidat: odpovídá podle toho, jestli dotaz hledá TMDB, nebo IMDb ID.
function fakeWikidata({ tmdb = {}, imdb = {} }, calls = []) {
  return async (url) => {
    const query = decodeURIComponent(new URL(url).searchParams.get('query'));
    calls.push(query);
    let bindings = [];
    if (query.includes('wdt:P345')) {
      bindings = Object.entries(imdb)
        .filter(([id]) => query.includes(`"${id}"`))
        .map(([id, nf]) => ({ imdb: { value: id }, nf: { value: nf } }));
    } else {
      bindings = Object.entries(tmdb)
        .filter(([k]) => {
          const [kind, id] = k.split(':');
          return query.includes(`"${id}"`) && query.includes(kind === 'movie' ? 'P4947' : 'P4983');
        })
        .map(([k, nf]) => {
          const [kind, id] = k.split(':');
          return { tmdb: { value: id }, kind: { value: kind }, nf: { value: nf } };
        });
    }
    return new Response(JSON.stringify({ results: { bindings } }), { status: 200 });
  };
}

test('collectTitles finds titles anywhere in an API answer', () => {
  const data = {
    week: '2026-10-04',
    movies: [{ tmdb_id: 808, type: 'movie', title: 'Shrek' }],
    series: [{ tmdb_id: 258165, type: 'series' }],
    item: { tmdb_id: 1, type: 'movie', similar: [{ tmdb_id: 2, type: 'movie' }] },
    noise: [{ tmdb_id: 3, type: 'person' }, { title: 'bez id' }]
  };
  assert.deepEqual(collectTitles(data).map((t) => t.tmdb_id).sort((a, b) => a - b), [1, 2, 808, 258165]);
});

test('lookupWikidata reads TMDB matches, falls back to IMDb and drops invalid ids', async () => {
  const calls = [];
  const fetchImpl = fakeWikidata({
    tmdb: { 'movie:808': '60020686', 'series:258165': '81611854', 'movie:5': 'not-an-id' },
    imdb: { tt0000099: '81000001' }
  }, calls);
  const ids = await lookupWikidata([
    { tmdb_id: 808, type: 'movie' },
    { tmdb_id: 258165, type: 'series' },
    { tmdb_id: 5, type: 'movie' },
    { tmdb_id: 99, type: 'movie', imdb_id: 'tt0000099' }
  ], fetchImpl);
  assert.equal(ids.get('movie:808'), '60020686');
  assert.equal(ids.get('series:258165'), '81611854');
  assert.equal(ids.get('movie:5'), undefined);
  assert.equal(ids.get('movie:99'), '81000001');
  assert.equal(calls.length, 2);
});

test('attach, refresh and attach again: found ids stick, missing ones wait three days', async () => {
  const db = createD1(MIGRATIONS);
  const items = () => [{ tmdb_id: 808, type: 'movie' }, { tmdb_id: 77, type: 'series' }];
  const t0 = new Date('2026-10-17T10:00:00Z');

  const first = items();
  const stale = await attachNetflixIds(db, first, t0.getTime());
  assert.equal(stale.length, 2);
  const result = await refreshNetflixIds(db, stale, { fetchImpl: fakeWikidata({ tmdb: { 'movie:808': '60020686' } }), now: t0 });
  assert.deepEqual(result, { checked: 2, found: 1 });

  const second = items();
  const staleAgain = await attachNetflixIds(db, second, t0.getTime() + 60 * 60 * 1000);
  assert.equal(second[0].netflix_id, '60020686');
  assert.equal(second[1].netflix_id, undefined);
  assert.equal(staleAgain.length, 0, 'not found is not retried within 3 days');

  const later = items();
  const staleLater = await attachNetflixIds(db, later, t0.getTime() + 4 * 24 * 60 * 60 * 1000);
  assert.deepEqual(staleLater.map((i) => i.tmdb_id), [77]);
});

test('a failed Wikidata call keeps the claim for one hour only', async () => {
  const db = createD1(MIGRATIONS);
  const t0 = new Date('2026-10-17T10:00:00Z');
  const failing = async () => new Response('busy', { status: 503 });
  await assert.rejects(refreshNetflixIds(db, [{ tmdb_id: 808, type: 'movie' }], { fetchImpl: failing, now: t0 }));

  const soon = [{ tmdb_id: 808, type: 'movie' }];
  assert.equal((await attachNetflixIds(db, soon, t0.getTime() + 30 * 60 * 1000)).length, 0);
  const afterHour = [{ tmdb_id: 808, type: 'movie' }];
  assert.equal((await attachNetflixIds(db, afterHour, t0.getTime() + 2 * 60 * 60 * 1000)).length, 1);
});

test('a later found id is not overwritten by a later miss', async () => {
  const db = createD1(MIGRATIONS);
  const t0 = new Date('2026-10-17T10:00:00Z');
  await refreshNetflixIds(db, [{ tmdb_id: 808, type: 'movie' }], { fetchImpl: fakeWikidata({ tmdb: { 'movie:808': '60020686' } }), now: t0 });
  await refreshNetflixIds(db, [{ tmdb_id: 808, type: 'movie' }], { fetchImpl: fakeWikidata({}), now: new Date('2026-10-25T10:00:00Z') });
  const row = db.raw.prepare('SELECT netflix_id FROM netflix_ids WHERE tmdb_id = 808').get();
  assert.equal(row.netflix_id, '60020686');
});

test('without the netflix_ids table nothing breaks', async () => {
  const db = createD1(['migrations/0001_initial_schema.sql']);
  const items = [{ tmdb_id: 808, type: 'movie' }];
  assert.deepEqual(await attachNetflixIds(db, items), []);
  assert.equal(items[0].netflix_id, undefined);
});

test('syncNetflixIdsStep walks the archive and the catalog in batches', async () => {
  const db = createD1(MIGRATIONS);
  const ins = db.raw.prepare(`INSERT INTO content (tmdb_id, type, title, first_seen, last_seen, imdb_id) VALUES (?, ?, ?, '2026-10-01', '2026-10-01', ?)`);
  ins.run(808, 'movie', 'Shrek', 'tt0126029');
  ins.run(258165, 'series', 'Na východ od ráje', null);
  ins.run(3, 'movie', 'Bez ID', null);
  const fetchImpl = fakeWikidata({ tmdb: { 'movie:808': '60020686', 'series:258165': '81611854' } });
  const now = new Date('2026-10-17T10:00:00Z');

  const step1 = await syncNetflixIdsStep(db, { limit: 2, fetchImpl, now });
  assert.equal(step1.checked, 2);
  assert.equal(step1.remaining, 1);
  const step2 = await syncNetflixIdsStep(db, { limit: 2, fetchImpl, now });
  assert.equal(step2.checked, 1);
  assert.equal(step2.remaining, 0);
  const found = db.raw.prepare('SELECT COUNT(*) AS n FROM netflix_ids WHERE netflix_id IS NOT NULL').get();
  assert.equal(found.n, 2);
});

test('web links: direct /title/ with an id, honest search without one', () => {
  const ctx = { window: {}, document: {}, encodeURIComponent };
  vm.runInNewContext(`${fs.readFileSync('public/list-card.js', 'utf8')}\nthis.listWatchLink = listWatchLink;`, ctx);
  const { listWatchLink } = ctx;

  assert.deepEqual({ ...listWatchLink({ netflix_id: '60020686', title: 'Shrek' }, 'netflix') },
    { href: 'https://www.netflix.com/title/60020686', direct: true });
  assert.deepEqual({ ...listWatchLink({ title_original: 'Shrek' }, 'netflix') },
    { href: 'https://www.netflix.com/search?q=Shrek', direct: false });
  assert.equal(listWatchLink({ netflix_id: '60020686', title: 'Shrek' }, 'disney').direct, false);
  assert.equal(listWatchLink({ netflix_id: '<x>', title_original: 'Shrek' }, 'netflix').direct, false);
  assert.equal(netflixTitleUrl('60020686'), 'https://www.netflix.com/title/60020686');
  assert.equal(netflixTitleUrl('javascript:x'), '');
});

test('detail page button: play with an id, search without, nothing off Netflix', () => {
  assert.equal(netflixWatch({ streaming_providers: ['netflix'], netflix_id: '60020686' }).label, 'Pustit na Netflixu');
  assert.equal(netflixWatch({ streaming_providers: ['netflix'], title: 'Shrek' }).label, 'Hledat na Netflixu');
  assert.equal(netflixWatch({ streaming_providers: ['disney'], netflix_id: '60020686' }), null);
});
