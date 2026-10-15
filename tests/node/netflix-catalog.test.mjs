// katalog Netflixu: výchozí snímek, přírůstky, úbytky, pojistka a návrat titulu. Spouští: npm run test:data
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createD1, createKV } from './d1shim.mjs';

test('katalog Netflixu: výchozí snímek, přírůstky, úbytky, pojistka a návrat titulu', async () => {
const R = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const db = createD1([`${R}/migrations/0001_initial_schema.sql`, `${R}/migrations/0003_multi_ratings_providers.sql`, `${R}/migrations/0004_netflix_catalog_history.sql`]);
const kv = createKV();
const env = { DB: db, TOPFLIX_KV: kv, TMDB_API_KEY: 'k' };
let catalog = { movie: [], series: [] };
const mk = (id, title, year) => ({ id, title, original_title: title, release_date: `${year}-01-01`, popularity: id, vote_count: 10, poster_path: '/p.jpg' });
for (let i = 1; i <= 45; i++) catalog.movie.push(mk(i, 'Film ' + i, 2000 + (i % 25)));
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.pathname.includes('/discover/')) {
    const type = u.pathname.endsWith('/movie') ? 'movie' : 'series';
    const page = +u.searchParams.get('page');
    const list = catalog[type];
    return Response.json({ page, total_pages: Math.max(1, Math.ceil(list.length / 20)), results: list.slice((page - 1) * 20, page * 20) });
  }
  const id = +u.pathname.split('/').pop();
  return Response.json({ id, title: 'CZ ' + id, overview: 'Popis', genres: [{ name: 'Drama' }], vote_average: 7.8, runtime: 95, production_countries: [{ iso_3166_1: 'US' }], external_ids: {} });
};
const lib = await import(`${R}/functions/_lib/netflix-catalog.js`);
const run = async (type, pages = 2) => { let s; let n = 0; do { s = await lib.syncCatalogStep(env, { type, pages }); n++; } while (!s.done && n < 10); return { s, n }; };

// 1) výchozí snímek
let { s, n } = await run('movie');
assert.equal(s.baseline, true); assert.equal(s.seen, 45); assert.equal(n, 2);
assert.equal((await db.prepare('select count(*) c from netflix_catalog where baseline=1').first()).c, 45);
// stejný den znovu -> skipped
assert.equal((await lib.syncCatalogStep(env, { type: 'movie' })).skipped, true);

// 2) další den: přibyl starý film 900, zmizel film 3
let ch = await lib.getCatalogChanges(db);
assert.equal(ch.comparable, false);
db.raw.exec("update netflix_catalog set last_seen='2026-01-01', first_seen='2026-01-01'; update netflix_catalog_runs set run_date='2026-01-01'");
catalog.movie = catalog.movie.filter((m) => m.id !== 3).concat([mk(900, 'Shrek', 2001)]);
await kv.delete('catalog_sync:movie');
({ s } = await run('movie'));
assert.equal(s.baseline, false); assert.equal(s.added, 1); assert.equal(s.removed, 1);
ch = await lib.getCatalogChanges(db, { days: 30 });
assert.equal(ch.comparable, true);
assert.deepEqual(ch.added.map((r) => r.tmdb_id), [900]);
assert.deepEqual(ch.removed.map((r) => r.tmdb_id), [3]);
assert.equal(ch.added[0].year, 2001);

// 3) obohacení přírůstku
const e = await lib.enrichAddedStep(env, { limit: 10 });
assert.equal(e.enriched, 1); assert.equal(e.remaining, 0);
const row = await db.prepare('select * from netflix_catalog where tmdb_id=900').first();
assert.equal(row.avg_rating, 78); assert.equal(row.runtime, 95); assert.equal(row.title, 'CZ 900');

// 4) TMDB vrátí jen zlomek katalogu -> nic se nemaže
db.raw.exec("update netflix_catalog set last_seen='2026-02-01'; update netflix_catalog_runs set run_date='2026-02-01' where run_date=date('now')");
catalog.movie = catalog.movie.slice(0, 10);
await kv.put('catalog_sync:movie', JSON.stringify({ done: true, run_date: '2026-02-01' }));
({ s } = await run('movie'));
assert.equal(s.removed, 0);
assert.equal((await db.prepare('select count(*) c from netflix_catalog where removed_at is not null').first()).c, 1);
const runRow = await db.prepare("select note from netflix_catalog_runs where run_date = date('now')").first();
assert.match(runRow.note, /removals skipped/);

// 5) film 3 se vrátil -> znovu přírůstek
catalog.movie.push(mk(3, 'Film 3', 2003));
db.raw.exec("update netflix_catalog_runs set run_date='2026-03-01' where run_date=date('now')");
await kv.put('catalog_sync:movie', JSON.stringify({ done: true, run_date: '2026-03-01' }));
({ s } = await run('movie'));
const r3 = await db.prepare('select first_seen, removed_at, baseline from netflix_catalog where tmdb_id=3').first();
assert.equal(r3.removed_at, null); assert.equal(r3.baseline, 0); assert.equal(r3.first_seen, lib.today());
});

test('katalog nad 500 stránek: úbytky se nepočítají', async () => {
  const R = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
  const db = createD1([`${R}/migrations/0001_initial_schema.sql`, `${R}/migrations/0003_multi_ratings_providers.sql`, `${R}/migrations/0004_netflix_catalog_history.sql`]);
  const kv = createKV();
  const env = { DB: db, TOPFLIX_KV: kv, TMDB_API_KEY: 'k' };
  let ids = [1, 2, 3];
  globalThis.fetch = async (url) => {
    const page = +new URL(String(url)).searchParams.get('page');
    const results = page === 1 ? ids.map((id) => ({ id, title: `T${id}`, release_date: '2020-01-01' })) : [];
    return Response.json({ page, total_pages: 600, results });
  };
  const lib = await import(`${R}/functions/_lib/netflix-catalog.js`);
  const run = async () => { let s; do { s = await lib.syncCatalogStep(env, { type: 'movie', pages: 80 }); } while (!s.done); return s; };
  await run();
  db.raw.exec("update netflix_catalog set last_seen='2026-01-01'; update netflix_catalog_runs set run_date='2026-01-01'");
  await kv.put('catalog_sync:movie', JSON.stringify({ done: true, run_date: '2026-01-01' }));
  ids = [1, 2];
  const state = await run();
  assert.equal(state.removed, 0);
  const runRow = await db.prepare("select note from netflix_catalog_runs where run_date = date('now')").first();
  assert.match(runRow.note, /600 pages/);
});
