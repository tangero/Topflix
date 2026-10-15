/**
 * Katalog Netflixu v ČR: týdenní snímek z TMDB discover a porovnání
 * s minulým snímkem. Z toho je "Nově přidáno na Netflix" (včetně starých
 * titulů) a "Z Netflixu zmizelo". Datum přidání neznáme přesně, jen den
 * synchronizace, kdy se titul poprvé objevil.
 */

import { NETFLIX_PROVIDER_ID, extractSeriesExtras } from './tmdb.js';
import { enrichWithOMDbRatings } from './omdb.js';
import { calculateWeightedRating } from './ratings.js';

// TMDB discover vrací nejvýš 500 stránek po 20 titulech.
export const MAX_PAGES = 500;
const PARALLEL_PAGES = 10;
// Když synchronizace uvidí méně než tento podíl dosud aktivních titulů,
// nic nemažeme: spíš selhalo TMDB, než že by Netflix ztratil půl katalogu.
const MIN_SEEN_RATIO = 0.8;

const stateKey = (type) => `catalog_sync:${type}`;

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function discoverUrl(apiKey, type, page) {
  const searchType = type === 'movie' ? 'movie' : 'tv';
  // Řazení podle data premiéry je mezi voláními stabilní, popularita ne.
  const sort = type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
  return `https://api.themoviedb.org/3/discover/${searchType}` +
    `?api_key=${apiKey}` +
    `&with_watch_providers=${NETFLIX_PROVIDER_ID}` +
    `&watch_region=CZ` +
    `&with_watch_monetization_types=flatrate` +
    `&sort_by=${sort}` +
    `&include_adult=false` +
    `&language=cs-CZ` +
    `&page=${page}`;
}

export function toCatalogRow(result, type) {
  const date = result.release_date || result.first_air_date || '';
  const year = parseInt(date.substring(0, 4), 10);
  return {
    tmdb_id: result.id,
    type,
    title: result.title || result.name || result.original_title || result.original_name || null,
    title_original: result.original_title || result.original_name || null,
    year: Number.isFinite(year) ? year : null,
    poster_url: result.poster_path ? `https://image.tmdb.org/t/p/w300${result.poster_path}` : null,
    popularity: Number(result.popularity) || null,
    vote_count: Number(result.vote_count) || 0,
    original_language: result.original_language || null
  };
}

async function fetchDiscoverPage(apiKey, type, page) {
  const response = await fetch(discoverUrl(apiKey, type, page));
  if (!response.ok) throw new Error(`TMDB discover ${type} p${page}: ${response.status}`);
  return response.json();
}

function upsertStatement(db, row, runDate, baseline) {
  // Nový titul: first_seen = dnes. Titul, který se vrátil po odstranění,
  // bereme jako nový přírůstek. Jinak jen posuneme last_seen.
  return db.prepare(`
    INSERT INTO netflix_catalog (
      tmdb_id, type, title, title_original, year, poster_url, popularity,
      vote_count, original_language, first_seen, last_seen, baseline
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, ?11)
    ON CONFLICT(tmdb_id, type) DO UPDATE SET
      title = excluded.title,
      title_original = excluded.title_original,
      year = excluded.year,
      poster_url = excluded.poster_url,
      popularity = excluded.popularity,
      vote_count = excluded.vote_count,
      first_seen = CASE WHEN netflix_catalog.removed_at IS NOT NULL THEN excluded.first_seen ELSE netflix_catalog.first_seen END,
      baseline = CASE WHEN netflix_catalog.removed_at IS NOT NULL THEN 0 ELSE netflix_catalog.baseline END,
      enriched_at = CASE WHEN netflix_catalog.removed_at IS NOT NULL THEN NULL ELSE netflix_catalog.enriched_at END,
      removed_at = NULL,
      last_seen = excluded.last_seen
  `).bind(
    row.tmdb_id, row.type, row.title, row.title_original, row.year, row.poster_url,
    row.popularity, row.vote_count, row.original_language, runDate, baseline ? 1 : 0
  );
}

/**
 * Jeden krok synchronizace. Projde `pages` stránek a uloží, kde skončil.
 * Volá se opakovaně, dokud nevrátí done: true.
 */
export async function syncCatalogStep(env, { type, pages = 40, restart = false }) {
  if (!['movie', 'series'].includes(type)) throw new Error('Invalid type');
  const db = env.DB;
  const kv = env.TOPFLIX_KV;
  const runDate = today();

  let state = restart ? null : await kv.get(stateKey(type), 'json');
  if (!state || state.done) {
    if (state && state.done && state.run_date === runDate && !restart) {
      return { ...state, skipped: true };
    }
    const { count } = await db.prepare('SELECT COUNT(*) AS count FROM netflix_catalog WHERE type = ?1').bind(type).first();
    const { active } = await db.prepare('SELECT COUNT(*) AS active FROM netflix_catalog WHERE type = ?1 AND removed_at IS NULL').bind(type).first();
    state = {
      type,
      run_date: runDate,
      baseline: count === 0,
      page: 1,
      total_pages: null,
      seen: 0,
      active_before: active,
      done: false
    };
    await db.prepare(`
      INSERT OR REPLACE INTO netflix_catalog_runs (run_date, type, baseline, pages, seen, added, removed)
      VALUES (?1, ?2, ?3, 0, 0, 0, 0)
    `).bind(runDate, type, state.baseline ? 1 : 0).run();
  }

  const lastPage = Math.min(state.total_pages || MAX_PAGES, MAX_PAGES);
  const endPage = Math.min(state.page + pages - 1, lastPage);
  let page = state.page;

  while (page <= endPage) {
    const chunk = [];
    for (let p = page; p <= Math.min(page + PARALLEL_PAGES - 1, endPage); p++) chunk.push(p);
    const results = await Promise.all(chunk.map((p) => fetchDiscoverPage(env.TMDB_API_KEY, type, p)));

    const statements = [];
    results.forEach((data) => {
      if (data.total_pages && !state.total_pages) state.total_pages = data.total_pages;
      (data.results || []).forEach((result) => {
        statements.push(upsertStatement(db, toCatalogRow(result, type), state.run_date, state.baseline));
      });
    });
    if (statements.length) await db.batch(statements);
    state.seen += statements.length;
    page = chunk[chunk.length - 1] + 1;

    // TMDB řekne počet stránek až v první odpovědi.
    if (state.total_pages && page > Math.min(state.total_pages, MAX_PAGES)) break;
  }

  state.page = page;
  const finished = state.total_pages != null && page > Math.min(state.total_pages, MAX_PAGES);

  if (finished) {
    state.done = true;
    await finishRun(db, state);
  }

  await kv.put(stateKey(type), JSON.stringify(state), { expirationTtl: 60 * 60 * 24 * 14 });
  return state;
}

async function finishRun(db, state) {
  const { added } = await db.prepare(`
    SELECT COUNT(*) AS added FROM netflix_catalog
    WHERE type = ?1 AND first_seen = ?2 AND baseline = 0
  `).bind(state.type, state.run_date).first();

  let removed = 0;
  let note = null;
  const enough = state.baseline || !state.active_before || state.seen >= state.active_before * MIN_SEEN_RATIO;
  // Nad 500 stránek TMDB zbytek katalogu nevrátí. Tituly za hranicí by se pak
  // střídavě "ztrácely", takže úbytky v tom případě nepočítáme.
  const capped = state.total_pages > MAX_PAGES;
  if (capped) {
    note = `catalog has ${state.total_pages} pages, TMDB returns ${MAX_PAGES}; removals skipped`;
  } else if (enough) {
    const result = await db.prepare(`
      UPDATE netflix_catalog SET removed_at = ?2
      WHERE type = ?1 AND last_seen < ?2 AND removed_at IS NULL
    `).bind(state.type, state.run_date).run();
    removed = result.meta?.changes || 0;
  } else {
    note = `seen ${state.seen} of ${state.active_before} active, removals skipped`;
  }

  state.added = added;
  state.removed = removed;
  await db.prepare(`
    UPDATE netflix_catalog_runs
    SET pages = ?3, seen = ?4, added = ?5, removed = ?6, finished_at = ?7, note = ?8
    WHERE run_date = ?1 AND type = ?2
  `).bind(state.run_date, state.type, state.page - 1, state.seen, added, removed, new Date().toISOString(), note).run();
}

/**
 * Doplní detaily a hodnocení k přírůstkům, které je ještě nemají.
 */
export async function enrichAddedStep(env, { limit = 20 } = {}) {
  const db = env.DB;
  const { results: rows } = await db.prepare(`
    SELECT tmdb_id, type FROM netflix_catalog
    WHERE baseline = 0 AND removed_at IS NULL AND enriched_at IS NULL
    ORDER BY first_seen DESC, popularity DESC
    LIMIT ?1
  `).bind(limit).all();

  if (!rows.length) return { enriched: 0, remaining: 0 };

  let items = await Promise.all(rows.map(async (row) => {
    const searchType = row.type === 'movie' ? 'movie' : 'tv';
    const url = `https://api.themoviedb.org/3/${searchType}/${row.tmdb_id}?api_key=${env.TMDB_API_KEY}&language=cs-CZ&append_to_response=external_ids`;
    const details = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!details || !details.id) return { ...row, failed: true };

    const item = {
      ...row,
      title: details.title || details.name,
      title_original: details.original_title || details.original_name,
      description: details.overview || null,
      genre: (details.genres || []).map((g) => g.name).filter(Boolean).slice(0, 3).join(', ') || null,
      origin_country: row.type === 'movie'
        ? (details.production_countries || []).map((c) => c.iso_3166_1).filter(Boolean)
        : (details.origin_country || []),
      imdb_id: details.external_ids?.imdb_id || null,
      tmdb_rating: details.vote_average ? parseFloat(details.vote_average.toFixed(1)) : null
    };
    if (row.type === 'movie') {
      item.runtime = details.runtime || null;
    } else {
      item.number_of_seasons = details.number_of_seasons || null;
      item.number_of_episodes = details.number_of_episodes || null;
      Object.assign(item, extractSeriesExtras(details));
    }
    return item;
  }));

  if (env.OMDB_API_KEY) {
    items = await enrichWithOMDbRatings(items, env.OMDB_API_KEY);
  }

  const now = new Date().toISOString();
  const statements = items.map((item) => {
    if (item.failed) {
      return db.prepare('UPDATE netflix_catalog SET enriched_at = ?3 WHERE tmdb_id = ?1 AND type = ?2')
        .bind(item.tmdb_id, item.type, now);
    }
    const weighted = calculateWeightedRating(item);
    const avg = weighted !== null ? weighted : (item.tmdb_rating ? Math.round(item.tmdb_rating * 10) : null);
    return db.prepare(`
      UPDATE netflix_catalog SET
        enriched_at = ?3, title = COALESCE(?4, title), title_original = COALESCE(?5, title_original),
        description = ?6, genre = ?7, runtime = ?8, number_of_seasons = ?9, number_of_episodes = ?10,
        series_status = ?11, episode_runtime = ?12, origin_country = ?13, imdb_id = ?14,
        tmdb_rating = ?15, imdb_rating = ?16, rotten_tomatoes_rating = ?17, metacritic_rating = ?18,
        avg_rating = ?19
      WHERE tmdb_id = ?1 AND type = ?2
    `).bind(
      item.tmdb_id, item.type, now, item.title || null, item.title_original || null,
      item.description, item.genre, item.runtime || null, item.number_of_seasons || null,
      item.number_of_episodes || null, item.series_status || null, item.episode_runtime || null,
      JSON.stringify(item.origin_country || []), item.imdb_id,
      item.tmdb_rating, item.imdb_rating || null, item.rotten_tomatoes_rating || null,
      item.metacritic_rating || null, avg
    );
  });
  await db.batch(statements);

  const { remaining } = await db.prepare(`
    SELECT COUNT(*) AS remaining FROM netflix_catalog
    WHERE baseline = 0 AND removed_at IS NULL AND enriched_at IS NULL
  `).first();
  return { enriched: items.length, remaining };
}

function parseRow(row) {
  let origin = [];
  try { origin = row.origin_country ? JSON.parse(row.origin_country) : []; } catch { origin = []; }
  return {
    ...row,
    origin_country: origin,
    providers: ['netflix'],
    baseline: !!row.baseline
  };
}

/**
 * Přírůstky a úbytky za posledních `days` dní.
 */
export async function getCatalogChanges(db, { days = 30, limit = 60 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const columns = `tmdb_id, type, title, title_original, year, poster_url, popularity, vote_count,
    first_seen, last_seen, removed_at, baseline, description, genre, runtime, number_of_seasons,
    number_of_episodes, series_status, episode_runtime, origin_country, imdb_id, tmdb_rating,
    imdb_rating, rotten_tomatoes_rating, metacritic_rating, avg_rating`;

  const [added, removed, runs] = await Promise.all([
    db.prepare(`
      SELECT ${columns} FROM netflix_catalog
      WHERE baseline = 0 AND removed_at IS NULL AND first_seen >= ?1
      ORDER BY first_seen DESC, avg_rating DESC, popularity DESC
      LIMIT ?2
    `).bind(since, limit).all(),
    db.prepare(`
      SELECT ${columns} FROM netflix_catalog
      WHERE removed_at IS NOT NULL AND removed_at >= ?1
      ORDER BY removed_at DESC, popularity DESC
      LIMIT ?2
    `).bind(since, limit).all(),
    db.prepare(`
      SELECT run_date, type, baseline, finished_at FROM netflix_catalog_runs
      WHERE finished_at IS NOT NULL ORDER BY run_date ASC
    `).all()
  ]);

  const finished = runs.results || [];
  const tracking = finished.length ? finished[0].run_date : null;
  const lastRun = finished.length ? finished[finished.length - 1].run_date : null;
  // Přírůstky umíme ukázat až po druhé dokončené synchronizaci.
  const comparable = finished.filter((run) => !run.baseline).length > 0;

  return {
    since,
    tracking_since: tracking,
    last_sync: lastRun,
    comparable,
    added: (added.results || []).map(parseRow),
    removed: (removed.results || []).map(parseRow)
  };
}
