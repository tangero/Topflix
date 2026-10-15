// historie Top 10: načtení týdnů, párování po dávkách, úklid starého párování. Spouští: npm run test:data
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { createD1, createKV } from './d1shim.mjs';

test('historie Top 10: načtení týdnů, párování po dávkách, úklid starého párování', async () => {
const R = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const db = createD1([`${R}/migrations/0001_initial_schema.sql`, `${R}/migrations/0003_multi_ratings_providers.sql`, `${R}/migrations/0004_netflix_catalog_history.sql`]);
const tsv = fs.readFileSync(new URL('./fixtures/top10-cz.tsv', import.meta.url), 'utf8');
let ids = new Map(); let next = 1000;
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.hostname.includes('netflix')) return new Response(tsv);
  if (u.pathname.includes('/search/')) {
    const q = u.searchParams.get('query');
    if (q === 'Unknownzzz') return Response.json({ results: [] });
    if (!ids.has(q)) ids.set(q, next++);
    return Response.json({ results: [{ id: ids.get(q), title: q, name: q, popularity: 5, vote_count: 50 }] });
  }
  const id = +u.pathname.split('/').pop();
  return Response.json({ id, title: 'CZ ' + id, name: 'CZ ' + id, vote_average: 7.4, release_date: '2012-05-05', first_air_date: '2012-05-05', production_countries: [{ iso_3166_1: 'US' }], 'watch/providers': { results: { CZ: { flatrate: [{ provider_id: 8 }] } } } });
};
const h = await import(`${R}/functions/_lib/top10-history.js`);
// starý chybný řádek z dřívějšího párování
db.raw.exec(`insert into content (tmdb_id,type,title,first_seen,last_seen,last_source,avg_rating) values (1,'movie','Ted Bunny','2026-10-13','2026-10-13','top10',41);
insert into appearance_history (tmdb_id,type,date,source,rank,rating) values (1,'movie','2026-10-13','top10',4,41);`);
const l = await h.loadTop10Weeks(db);
assert.equal(l.weeks, 275); assert.equal(l.rows, 5500);
assert.equal((await h.loadTop10Weeks(db)).rows, 5500); // idempotentní
assert.equal((await db.prepare('select count(*) c from netflix_top10_weeks').first()).c, 5500);
assert.equal((await h.findMismatchedContent(db)).ready, false);
const env = { DB: db, TMDB_API_KEY: 'k' };
let r = await h.mapTop10Step(env, { limit: 40 });
assert.equal(r.mapped, 40);
// první dávka jsou nejnovější tituly
const shrek = await db.prepare("select c.* from content c join netflix_title_map m on m.tmdb_id=c.tmdb_id and m.type=c.type where m.show_title='Shrek'").first();
assert.ok(shrek, 'Shrek mapped first');
const hist = await db.prepare('select count(*) c from appearance_history where tmdb_id=?1').bind(shrek.tmdb_id).first();
assert.equal(hist.c, shrek.appearances);
let n = 0; while (r.remaining > 0 && n < 60) { r = await h.mapTop10Step(env, { limit: 40 }); n++; }
assert.equal(r.remaining, 0);
const mm = await h.findMismatchedContent(db);
assert.equal(mm.ready, true);
assert.deepEqual(mm.items.map((i) => i.title), ['Ted Bunny']);
assert.equal(await h.deleteMismatchedContent(db, mm.items), 1);
assert.equal((await db.prepare('select count(*) c from content where tmdb_id=1').first()).c, 0);
});
