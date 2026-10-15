/**
 * Topflix - Netflix Top 10 API Function (Cloudflare Pages)
 * Fetches Netflix Top 10 data and enriches with TMDB and OMDb ratings
 */

import { createDatabase } from '../_lib/database.js';
import { enrichWithOMDbRatings } from '../_lib/omdb.js';
import { calculateWeightedRating, getQualityTier } from '../_lib/ratings.js';
import { matchNetflixTitle } from '../_lib/tmdb-match.js';
import {
  fetchCountriesTsv,
  parseCountryRows,
  buildLatestWeek
} from '../_lib/netflix-top10.js';

// Netflix Top 10 pro ČR: poslední týden s počtem týdnů v žebříčku a předchozím pořadím
async function scrapeNetflixTop10() {
  try {
    const text = await fetchCountriesTsv();
    return buildLatestWeek(parseCountryRows(text));
  } catch (error) {
    console.error('Error scraping Netflix Top 10:', error);
    return null;
  }
}

// ČSFD scraping removed - using TMDB only for simpler and more reliable ratings

// Kontext z Netflix Top 10: týdny v žebříčku, předchozí pořadí, řada seriálu
function chartFields(entry) {
  return {
    weeks_in_top10: entry.weeks_in_top10,
    prev_rank: entry.prev_rank,
    is_new_entry: entry.is_new_entry,
    season_title: entry.season_title,
    season_number: entry.season_number,
    limited_series: entry.limited_series
  };
}

// Process a single title (enrich with TMDB data only)
async function enrichTitle(entry, type, apiKey) {
  const { title, rank } = entry;
  const tmdbData = await matchNetflixTitle(title, type, apiKey);

  if (!tmdbData) {
    return {
      rank,
      title,
      type,
      ...chartFields(entry),
      error: 'Data not found'
    };
  }

  // Calculate weighted rating from all available sources
  // Initial avg_rating from TMDB only (OMDb enrichment happens later in fetchAndEnrichData)
  const avgRating = tmdbData.tmdb_rating
    ? Math.round(tmdbData.tmdb_rating * 10)
    : null;

  const quality = getQualityTier(avgRating);

  // Build result object
  const result = {
    rank,
    tmdb_id: tmdbData.tmdb_id,
    title: tmdbData.title_cz || title,
    title_original: tmdbData.title_original,
    year: tmdbData.year,
    genre: tmdbData.genre,
    tmdb_rating: tmdbData.tmdb_rating,
    tmdb_url: tmdbData.tmdb_url,
    avg_rating: avgRating,
    quality,
    description: tmdbData.description,
    poster_url: tmdbData.poster_url,
    origin_country: tmdbData.origin_country,
    countries: tmdbData.countries,
    imdb_id: tmdbData.imdb_id,
    providers: tmdbData.providers,
    type,
    ...chartFields(entry),
    source: 'top10' // Mark as coming from Top 10
  };

  // Add type-specific fields
  if (type === 'movie') {
    result.runtime = tmdbData.runtime;
  } else if (type === 'series') {
    result.number_of_seasons = tmdbData.number_of_seasons;
    result.number_of_episodes = tmdbData.number_of_episodes;
    result.series_status = tmdbData.series_status;
    result.episode_runtime = tmdbData.episode_runtime;
    result.last_air_date = tmdbData.last_air_date;
  }

  return result;
}

// Main data fetching and enrichment
export async function fetchAndEnrichData(apiKey, omdbApiKey) {
  const netflixData = await scrapeNetflixTop10();

  if (!netflixData) {
    throw new Error('Failed to fetch Netflix Top 10 data');
  }

  // Enrich all titles in parallel (max 20 items = 10 movies + 10 series)
  let [enrichedMovies, enrichedSeries] = await Promise.all([
    Promise.all(netflixData.movies.map(movie =>
      enrichTitle(movie, 'movie', apiKey)
    )),
    Promise.all(netflixData.series.map(series =>
      enrichTitle(series, 'series', apiKey)
    ))
  ]);

  // Enrich with OMDb ratings (IMDb, RT, Metacritic) if API key available
  if (omdbApiKey) {
    [enrichedMovies, enrichedSeries] = await Promise.all([
      enrichWithOMDbRatings(enrichedMovies, omdbApiKey),
      enrichWithOMDbRatings(enrichedSeries, omdbApiKey)
    ]);
  }

  // Recalculate weighted average rating from all available sources
  const recalculate = (items) => items.map(item => {
    const weighted = calculateWeightedRating(item);
    if (weighted !== null) {
      item.avg_rating = weighted;
      item.quality = getQualityTier(weighted);
    }
    return item;
  });
  enrichedMovies = recalculate(enrichedMovies);
  enrichedSeries = recalculate(enrichedSeries);

  const today = new Date();
  const nextTuesday = new Date(today);
  nextTuesday.setDate(today.getDate() + ((2 - today.getDay() + 7) % 7 || 7));

  return {
    updated: today.toISOString().split('T')[0],
    next_update: nextTuesday.toISOString().split('T')[0],
    week: netflixData.week,
    movies: enrichedMovies,
    series: enrichedSeries
  };
}

// CORS headers
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Pages Function handler - exports onRequest for /api/top10
export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: getCorsHeaders()
    });
  }

  // API endpoint
  try {
    // Warn if KV is missing (optional - used for caching)
    if (!env.TOPFLIX_KV) {
      console.warn('TOPFLIX_KV binding is missing - caching will be disabled');
    }

    // Check for required API key
    if (!env.TMDB_API_KEY) {
      console.error('TMDB_API_KEY is missing!');
      return new Response(JSON.stringify({
        error: 'Server configuration error'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Denní klíč: Netflix zveřejňuje novou Top 10 v úterý. S týdenním klíčem
    // by pondělní stažení drželo minulý týden až do neděle.
    const weekKey = `netflix_top10_cz_${new Date().toISOString().split('T')[0]}_v5`;
    console.log('Fetching data for week:', weekKey);

    // Try to get from KV cache first (if available)
    let cachedData = null;
    if (env.TOPFLIX_KV) {
      cachedData = await env.TOPFLIX_KV.get(weekKey);
    }

    if (cachedData) {
      console.log('Returning cached data from KV');
      return new Response(cachedData, {
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // If not in cache, fetch fresh data
    console.log('Fetching fresh data from APIs');
    const data = await fetchAndEnrichData(env.TMDB_API_KEY, env.OMDB_API_KEY);
    const jsonData = JSON.stringify(data);

    // Store in D1 database once per Netflix week, so a daily cache key
    // does not count one chart week as seven appearances.
    const storedWeek = env.TOPFLIX_KV ? await env.TOPFLIX_KV.get('top10_db_week') : null;
    if (env.DB && data.week && storedWeek !== data.week) {
      try {
        const db = createDatabase(env);
        const allContent = [...data.movies, ...data.series];
        const dbResult = await db.upsertContentBatch(allContent);
        console.log('D1 database updated:', dbResult);
        if (env.TOPFLIX_KV) await env.TOPFLIX_KV.put('top10_db_week', data.week);
      } catch (dbError) {
        console.error('D1 database error (non-fatal):', dbError);
        // Continue even if DB fails - don't block API response
      }
    }

    // Store in KV with 7 day TTL (if available)
    if (env.TOPFLIX_KV) {
      await env.TOPFLIX_KV.put(weekKey, jsonData, {
        expirationTtl: 172800 // 2 days
      });
      console.log('Data cached in KV');
    }

    return new Response(jsonData, {
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  } catch (error) {
    console.error('Error in top10 function:', error.message, error.stack);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  }
}
