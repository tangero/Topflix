import test from 'node:test';
import assert from 'node:assert/strict';

import { createD1 } from './d1shim.mjs';
import { evaluateData, evaluateNewsletter, loadNewsletterInputs } from '../../functions/_lib/health-checks.js';
import { normalizeClick, recordClick, clickStats } from '../../functions/_lib/watch-clicks.js';
import { onRequestGet as goNetflix } from '../../functions/go/netflix/[id].js';
import { onRequestPost as clickPost } from '../../functions/api/click.js';
import { newsletterLinks, generateNewsletterHTML, generateNewsletterText } from '../../functions/_lib/newsletter-generator.js';

const MIGRATIONS = [
  'migrations/0001_initial_schema.sql',
  'migrations/0003_multi_ratings_providers.sql',
  'migrations/0004_netflix_catalog_history.sql',
  'migrations/0006_watch_clicks.sql'
];
const NOW = new Date('2026-10-17T12:00:00Z');

test('data health: current data is healthy', () => {
  const r = evaluateData({ chartWeek: '2026-10-04', lastNew: '2026-10-17', lastCatalog: '2026-10-16T02:58:53Z', totalRecords: 2266, qualityRecords: 1135 }, NOW);
  assert.equal(r.status, 'healthy');
  assert.deepEqual(r.issues, []);
  assert.equal(r.top10_week_age_days, 13);
});

test('data health: stale chart, new titles and catalog are reported', () => {
  const r = evaluateData({ chartWeek: '2026-09-27', lastNew: '2026-10-10', lastCatalog: '2026-10-01T00:00:00Z', totalRecords: 2266 }, NOW);
  assert.equal(r.status, 'degraded');
  assert.equal(r.issues.length, 3);
  assert.match(r.issues[0], /Top 10 week 2026-09-27 is 20 days old/);
});

test('data health: missing inputs degrade instead of passing silently', () => {
  const r = evaluateData({ totalRecords: 10 }, NOW);
  assert.equal(r.status, 'degraded');
  assert.equal(r.issues.length, 4);
});

function fakeResend(routes, calls = []) {
  return async (url) => {
    const path = new URL(url).pathname + new URL(url).search;
    calls.push(path);
    const hit = Object.keys(routes).find((k) => path.startsWith(k));
    if (!hit) return new Response('{}', { status: 404 });
    const body = routes[hit];
    return typeof body === 'number' ? new Response('{}', { status: body }) : new Response(JSON.stringify(body), { status: 200 });
  };
}

const RESEND_ROUTES = {
  '/broadcasts?': { data: [
    { id: 'b-old', status: 'sent', sent_at: '2026-10-09 15:00:00.000+00' },
    { id: 'b-new', status: 'sent', sent_at: '2026-10-16 05:39:08.123+00' },
    { id: 'b-draft', status: 'draft', sent_at: null }
  ] },
  '/broadcasts/b-new': { subject: 'Stojí za vidění', html: '<p>x</p>', text: '' },
  '/contacts?': { has_more: false, data: [{ id: 'c1', unsubscribed: false }, { id: 'c2', unsubscribed: true }, { id: 'c3', unsubscribed: false }] }
};

test('newsletter health: public view shows only the last send', async () => {
  const env = { RESEND_API_KEY: 're_x', RESEND_AUDIENCE_ID: 'aud' };
  const calls = [];
  const inputs = await loadNewsletterInputs(env, { admin: false, fetchImpl: fakeResend(RESEND_ROUTES, calls) });
  const r = evaluateNewsletter(env, inputs, { admin: false }, NOW);
  assert.equal(r.status, 'healthy');
  assert.equal(r.last_sent, '2026-10-16T05:39:08.123Z');
  assert.equal(r.days_since_last, 1);
  assert.equal(r.active_subscribers, undefined);
  assert.deepEqual(calls, ['/broadcasts?limit=20']);
});

test('newsletter health: admin sees subscribers and a missing text version', async () => {
  const env = { RESEND_API_KEY: 're_x', RESEND_AUDIENCE_ID: 'aud' };
  const inputs = await loadNewsletterInputs(env, { admin: true, fetchImpl: fakeResend(RESEND_ROUTES) });
  const r = evaluateNewsletter(env, inputs, { admin: true }, NOW);
  assert.equal(r.active_subscribers, 2);
  assert.equal(r.last_broadcast.text_length, 0);
  assert.equal(r.status, 'degraded');
  assert.match(r.issues.join(' '), /without a plain-text version/);
});

test('newsletter health: a key without read access is reported, not crashed', async () => {
  const env = { RESEND_API_KEY: 're_x' };
  const inputs = await loadNewsletterInputs(env, { fetchImpl: fakeResend({ '/broadcasts?': 401 }) });
  const r = evaluateNewsletter(env, inputs, {}, NOW);
  assert.equal(r.status, 'degraded');
  assert.match(r.issues[0], /cannot read broadcasts/);
});

test('clicks: only known values are stored, unknown section becomes "jine"', () => {
  assert.equal(normalizeClick({ page: 'x', watch: 'direct', provider: 'netflix' }), null);
  assert.equal(normalizeClick({ page: 'dnes', watch: 'play', provider: 'netflix' }), null);
  assert.equal(normalizeClick({ page: 'dnes', watch: 'direct', provider: 'hbo' }), null);
  assert.deepEqual(normalizeClick({ page: 'dnes', section: '<script>', watch: 'direct', provider: 'netflix', tmdb_id: '808', type: 'movie' }),
    { page: 'dnes', section: 'jine', watch: 'direct', provider: 'netflix', tmdb_id: 808, type: 'movie' });
  assert.deepEqual(normalizeClick({ page: 'dnes', section: 'tip', watch: 'search', provider: 'netflix', tmdb_id: 'abc', type: 'movie' }),
    { page: 'dnes', section: 'tip', watch: 'search', provider: 'netflix', tmdb_id: 0, type: '' });
});

test('clicks: daily counts add up and the summary groups them', async () => {
  const db = createD1(MIGRATIONS);
  db.raw.prepare(`INSERT INTO content (tmdb_id, type, title, first_seen, last_seen) VALUES (808, 'movie', 'Shrek', '2026-10-01', '2026-10-01')`).run();
  const click = normalizeClick({ page: 'dnes', section: 'tip', watch: 'direct', provider: 'netflix', tmdb_id: 808, type: 'movie' });
  await recordClick(db, click, NOW);
  await recordClick(db, click, NOW);
  await recordClick(db, normalizeClick({ page: 'filmy', section: 'katalog', watch: 'search', provider: 'netflix' }), NOW);
  const stats = await clickStats(db, 14, NOW);
  assert.deepEqual(stats.total.map((r) => [r.watch, r.clicks]).sort(), [['direct', 2], ['search', 1]]);
  assert.deepEqual(stats.top_titles.map((r) => [r.title, r.clicks]), [['Shrek', 2]]);
  assert.equal(stats.by_day[0].clicks, 3);
});

function fakeContext(url, db, body) {
  const pending = [];
  return {
    request: new Request(url, body === undefined ? {} : { method: 'POST', body }),
    env: { DB: db },
    params: { id: new URL(url).pathname.split('/').pop() },
    waitUntil: (p) => pending.push(p),
    pending
  };
}

test('/go/netflix redirects only to a Netflix title and counts newsletter clicks', async () => {
  const db = createD1(MIGRATIONS);
  const ctx = fakeContext('https://www.topflix.cz/go/netflix/60020686?s=newsletter&t=movie-808', db);
  const res = await goNetflix(ctx);
  await Promise.all(ctx.pending);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), 'https://www.netflix.com/title/60020686');
  const row = db.raw.prepare('SELECT page, section, tmdb_id, clicks FROM watch_clicks_daily').get();
  assert.deepEqual({ ...row }, { page: 'newsletter', section: 'newsletter', tmdb_id: 808, clicks: 1 });

  const bad = await goNetflix(fakeContext('https://www.topflix.cz/go/netflix/evil.com', db));
  assert.equal(bad.headers.get('Location'), 'https://www.topflix.cz/');
});

test('/api/click always answers 204 and stores valid beacons', async () => {
  const db = createD1(MIGRATIONS);
  const ok = fakeContext('https://www.topflix.cz/api/click', db, JSON.stringify({ page: 'detail', section: 'detail', watch: 'direct', provider: 'netflix', type: 'series', tmdb_id: 258165 }));
  assert.equal((await clickPost(ok)).status, 204);
  await Promise.all(ok.pending);
  const junk = fakeContext('https://www.topflix.cz/api/click', db, 'not json');
  assert.equal((await clickPost(junk)).status, 204);
  assert.equal(db.raw.prepare('SELECT SUM(clicks) AS n FROM watch_clicks_daily').get().n, 1);
});

test('newsletter links: title page with UTM, Pustit via /go with an id, Topflix page without', () => {
  const withId = newsletterLinks({ tmdb_id: 808, type: 'movie', title: 'Shrek', netflix_id: '60020686' });
  assert.equal(withId.page, 'https://www.topflix.cz/film/shrek-808?utm_source=newsletter&utm_medium=email&utm_campaign=weekly');
  assert.equal(withId.watch, 'https://www.topflix.cz/go/netflix/60020686?s=newsletter&t=movie-808');
  assert.equal(withId.label, 'Pustit na Netflixu');
  const without = newsletterLinks({ tmdb_id: 258165, type: 'series', title: 'Na východ od ráje' });
  assert.equal(without.label, 'Zobrazit na Topflixu');
  assert.equal(without.watch, without.page);

  const data = { movies: [{ tmdb_id: 808, type: 'movie', title: '<b>Shrek</b>', avg_rating: 82, netflix_id: '60020686', description: 'Zlobr.' }],
    series: [], regionalMovies: [], regionalSeries: [] };
  const html = generateNewsletterHTML(data);
  assert.match(html, /href="https:\/\/www\.topflix\.cz\/go\/netflix\/60020686\?s=newsletter&amp;t=movie-808"/);
  assert.match(html, /&lt;b&gt;Shrek&lt;\/b&gt;<\/a>/);
  assert.match(generateNewsletterText(data), /Pustit na Netflixu: https:\/\/www\.topflix\.cz\/go\/netflix\/60020686/);
});
