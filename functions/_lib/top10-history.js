/**
 * Historie Netflix Top 10 pro ČR (od července 2021).
 * 1) loadTop10Weeks: uloží syrová data z TSV, bez TMDB.
 * 2) mapTop10Step: po dávkách napáruje názvy na TMDB a zapíše je do archivu
 *    (content + appearance_history s datem týdne Netflixu).
 * 3) findMismatchedContent: najde řádky, které do archivu dřív zapsalo
 *    staré párování podle roku (Ted Bunny místo Teda).
 */

import { fetchCountriesTsv, parseCountryRows, COUNTRY_ISO } from './netflix-top10.js';
import { matchNetflixTitle } from './tmdb-match.js';
import { enrichWithOMDbRatings } from './omdb.js';
import { calculateWeightedRating, getQualityTier } from './ratings.js';

const REGIONAL_ORIGINS = new Set([
  'JP', 'KR', 'CN', 'TW', 'HK', 'TH', 'IN', 'ID', 'PH', 'VN', 'SG', 'MY',
  'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'UY', 'PY'
]);

const typeOfCategory = (category) => (category === 'TV' ? 'series' : 'movie');

export async function loadTop10Weeks(db, text = null) {
  const tsv = text || await fetchCountriesTsv();
  const rows = parseCountryRows(tsv, COUNTRY_ISO)
    .filter((row) => ['Films', 'TV'].includes(row.category) && row.week && row.title && row.rank);

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.batch(rows.slice(i, i + CHUNK).map((row) => db.prepare(`
      INSERT OR IGNORE INTO netflix_top10_weeks (week, category, rank, show_title, season_title, weeks_in_top10)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `).bind(row.week, row.category, row.rank, row.title, row.season_title, row.weeks_in_top10)));
  }
  const { weeks } = await db.prepare('SELECT COUNT(DISTINCT week) AS weeks FROM netflix_top10_weeks').first();
  return { rows: rows.length, weeks };
}

async function pendingTitles(db, limit) {
  // Nejdřív nejnovější tituly, aby se archiv plnil od současnosti do minulosti.
  const { results } = await db.prepare(`
    SELECT w.show_title, w.category, MAX(w.week) AS last_week
    FROM netflix_top10_weeks w
    LEFT JOIN netflix_title_map m
      ON m.show_title = w.show_title
     AND m.type = CASE w.category WHEN 'TV' THEN 'series' ELSE 'movie' END
    WHERE m.show_title IS NULL
    GROUP BY w.show_title, w.category
    ORDER BY last_week DESC
    LIMIT ?1
  `).bind(limit).all();
  return results || [];
}

async function remainingCount(db) {
  const { remaining } = await db.prepare(`
    SELECT COUNT(*) AS remaining FROM (
      SELECT w.show_title, w.category FROM netflix_top10_weeks w
      LEFT JOIN netflix_title_map m
        ON m.show_title = w.show_title
       AND m.type = CASE w.category WHEN 'TV' THEN 'series' ELSE 'movie' END
      WHERE m.show_title IS NULL
      GROUP BY w.show_title, w.category
    )
  `).first();
  return remaining;
}

function contentStatements(db, item, weeks) {
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const rating = item.avg_rating || null;
  const origin = item.origin_country || [];
  const regional = origin.length > 0 && origin.every((code) => REGIONAL_ORIGINS.has(code));
  const tier = getQualityTier(rating).replace('-', '_');

  const statements = [db.prepare(`
    INSERT INTO content (
      tmdb_id, type, title, title_original, year, genre,
      avg_rating, tmdb_rating, quality_tier, poster_url, description, runtime,
      number_of_seasons, number_of_episodes, origin_country, is_regional,
      first_seen, last_seen, appearances, last_rank, last_source, tmdb_url,
      imdb_id, imdb_rating, rotten_tomatoes_rating, metacritic_rating, streaming_providers, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
              ?17, ?18, ?19, ?20, 'top10', ?21, ?22, ?23, ?24, ?25, ?26, unixepoch())
    ON CONFLICT(tmdb_id, type) DO UPDATE SET
      first_seen = MIN(content.first_seen, excluded.first_seen),
      last_seen = MAX(content.last_seen, excluded.last_seen),
      appearances = MAX(content.appearances, excluded.appearances),
      avg_rating = COALESCE(content.avg_rating, excluded.avg_rating),
      imdb_id = COALESCE(content.imdb_id, excluded.imdb_id),
      imdb_rating = COALESCE(content.imdb_rating, excluded.imdb_rating),
      rotten_tomatoes_rating = COALESCE(content.rotten_tomatoes_rating, excluded.rotten_tomatoes_rating),
      metacritic_rating = COALESCE(content.metacritic_rating, excluded.metacritic_rating),
      streaming_providers = COALESCE(content.streaming_providers, excluded.streaming_providers),
      updated_at = unixepoch()
  `).bind(
    item.tmdb_id, item.type, item.title, item.title_original || null,
    parseInt(item.year, 10) || null, item.genre || null,
    rating, item.tmdb_rating || null, tier, item.poster_url || null,
    item.description || null, item.runtime || null,
    item.number_of_seasons || null, item.number_of_episodes || null,
    JSON.stringify(origin), regional ? 1 : 0,
    first.week, last.week, weeks.length, last.rank, item.tmdb_url || null,
    item.imdb_id || null, item.imdb_rating || null, item.rotten_tomatoes_rating || null,
    item.metacritic_rating || null, JSON.stringify(item.providers || [])
  )];

  weeks.forEach((week) => {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO appearance_history (tmdb_id, type, date, source, rank, rating)
      VALUES (?1, ?2, ?3, 'top10', ?4, ?5)
    `).bind(item.tmdb_id, item.type, week.week, week.rank, rating || 0));
  });
  return statements;
}

/**
 * Napáruje dávku názvů z historie a zapíše je do archivu.
 */
export async function mapTop10Step(env, { limit = 25 } = {}) {
  const db = env.DB;
  const pending = await pendingTitles(db, limit);
  if (!pending.length) return { mapped: 0, not_found: 0, remaining: 0 };

  const matched = await Promise.all(pending.map(async (entry) => {
    const type = typeOfCategory(entry.category);
    const data = await matchNetflixTitle(entry.show_title, type, env.TMDB_API_KEY).catch(() => null);
    return { entry, type, data };
  }));

  let items = matched.filter((m) => m.data).map((m) => ({
    ...m.data,
    title: m.data.title_cz || m.entry.show_title,
    type: m.type,
    _show_title: m.entry.show_title,
    _category: m.entry.category
  }));
  if (env.OMDB_API_KEY && items.length) {
    items = await enrichWithOMDbRatings(items, env.OMDB_API_KEY);
  }
  items = items.map((item) => {
    const weighted = calculateWeightedRating(item);
    return { ...item, avg_rating: weighted !== null ? weighted : (item.tmdb_rating ? Math.round(item.tmdb_rating * 10) : null) };
  });

  const now = new Date().toISOString();
  const statements = [];
  for (const m of matched) {
    statements.push(db.prepare(`
      INSERT OR REPLACE INTO netflix_title_map (show_title, type, tmdb_id, matched_at) VALUES (?1, ?2, ?3, ?4)
    `).bind(m.entry.show_title, m.type, m.data ? m.data.tmdb_id : null, now));
  }
  for (const item of items) {
    const { results: weeks } = await db.prepare(`
      SELECT week, rank FROM netflix_top10_weeks
      WHERE show_title = ?1 AND category = ?2
      ORDER BY week ASC
    `).bind(item._show_title, item._category).all();
    if (weeks.length) statements.push(...contentStatements(db, item, weeks));
  }
  await db.batch(statements);

  return {
    mapped: items.length,
    not_found: matched.length - items.length,
    remaining: await remainingCount(db)
  };
}

/**
 * Řádky archivu ze zdroje Top 10, které neodpovídají žádnému napárovanému
 * názvu z historie. Vznikly starým párováním podle roku. Vrací je jen,
 * když je historie napárovaná celá, jinak by šlo o tituly, na které teprve dojde.
 */
export async function findMismatchedContent(db) {
  const remaining = await remainingCount(db);
  if (remaining > 0) return { ready: false, remaining, items: [] };

  const { results } = await db.prepare(`
    SELECT c.tmdb_id, c.type, c.title, c.year, c.first_seen, c.last_seen
    FROM content c
    WHERE c.last_source = 'top10'
      AND NOT EXISTS (SELECT 1 FROM netflix_title_map m WHERE m.tmdb_id = c.tmdb_id AND m.type = c.type)
      AND NOT EXISTS (
        SELECT 1 FROM appearance_history h
        WHERE h.tmdb_id = c.tmdb_id AND h.type = c.type AND h.source = 'netflix_new'
      )
    ORDER BY c.last_seen DESC
  `).all();
  return { ready: true, remaining: 0, items: results || [] };
}

export async function deleteMismatchedContent(db, items) {
  if (!items.length) return 0;
  const statements = [];
  items.forEach((item) => {
    statements.push(db.prepare('DELETE FROM appearance_history WHERE tmdb_id = ?1 AND type = ?2').bind(item.tmdb_id, item.type));
    statements.push(db.prepare('DELETE FROM content WHERE tmdb_id = ?1 AND type = ?2').bind(item.tmdb_id, item.type));
  });
  await db.batch(statements);
  return items.length;
}
