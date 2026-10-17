/**
 * Měření kliků na „Pustit“. Ukládají se jen denní součty podle stránky,
 * sekce, typu odkazu, služby a titulu. Nic, co by identifikovalo návštěvníka.
 */

export const PAGES = new Set(['dnes', 'filmy', 'serialy', 'archiv', 'detail', 'newsletter']);
export const SECTIONS = new Set([
  'tip', 'alternativy', 'top10', 'pridano', 'premiery',
  'serial-tip', 'katalog', 'klenoty', 'archiv', 'detail', 'newsletter', 'jine'
]);
export const PROVIDERS = new Set(['netflix', 'disney', 'apple', 'prime', 'max', 'skyshowtime']);

/** Ověří a znormalizuje klik. Neplatný vrátí null. */
export function normalizeClick(input) {
  if (!input || typeof input !== 'object') return null;
  const page = String(input.page || '');
  const section = SECTIONS.has(String(input.section || '')) ? String(input.section) : 'jine';
  const watch = String(input.watch || '');
  const provider = String(input.provider || '');
  if (!PAGES.has(page) || !['direct', 'search'].includes(watch) || !PROVIDERS.has(provider)) return null;
  const tmdbId = Number.parseInt(input.tmdb_id, 10);
  const type = ['movie', 'series'].includes(input.type) ? input.type : '';
  const valid = Number.isInteger(tmdbId) && tmdbId > 0 && tmdbId < 1e9 && type;
  return { page, section, watch, provider, tmdb_id: valid ? tmdbId : 0, type: valid ? type : '' };
}

export async function recordClick(db, click, now = new Date()) {
  await db.prepare(`
    INSERT INTO watch_clicks_daily (date, page, section, watch, provider, tmdb_id, type, clicks)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)
    ON CONFLICT(date, page, section, watch, provider, tmdb_id, type) DO UPDATE SET clicks = clicks + 1
  `).bind(now.toISOString().slice(0, 10), click.page, click.section, click.watch, click.provider, click.tmdb_id, click.type).run();
}

/** Souhrn za posledních N dní pro správce. */
export async function clickStats(db, days = 14, now = new Date()) {
  const since = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const all = (sql) => db.prepare(sql).bind(since).all().then((r) => r.results || []);
  const [total, bySection, byDay, topTitles] = await Promise.all([
    all(`SELECT watch, SUM(clicks) AS clicks FROM watch_clicks_daily WHERE date >= ?1 GROUP BY watch`),
    all(`SELECT page, section, watch, SUM(clicks) AS clicks FROM watch_clicks_daily WHERE date >= ?1
         GROUP BY page, section, watch ORDER BY clicks DESC`),
    all(`SELECT date, SUM(clicks) AS clicks FROM watch_clicks_daily WHERE date >= ?1 GROUP BY date ORDER BY date`),
    all(`SELECT w.tmdb_id, w.type, COALESCE(c.title, k.title) AS title, SUM(w.clicks) AS clicks
         FROM watch_clicks_daily w
         LEFT JOIN content c ON c.tmdb_id = w.tmdb_id AND c.type = w.type
         LEFT JOIN netflix_catalog k ON k.tmdb_id = w.tmdb_id AND k.type = w.type
         WHERE w.date >= ?1 AND w.tmdb_id > 0
         GROUP BY w.tmdb_id, w.type ORDER BY clicks DESC LIMIT 20`)
  ]);
  return { since, days, total, by_section: bySection, by_day: byDay, top_titles: topTitles };
}
