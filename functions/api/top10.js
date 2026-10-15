/**
 * Topflix - Netflix Top 10 API Function (Cloudflare Pages)
 * Fetches Netflix Top 10 data and enriches with TMDB and OMDb ratings
 */

import { createDatabase } from '../_lib/database.js';
import { enrichWithOMDbRatings } from '../_lib/omdb.js';
import { calculateWeightedRating, getQualityTier } from '../_lib/ratings.js';
import { extractProviders, extractSeriesExtras } from '../_lib/tmdb.js';
import {
  fetchCountriesTsv,
  parseCountryRows,
  buildLatestWeek,
  shortlistByTitle,
  pickBestMatch
} from '../_lib/netflix-top10.js';

// Helper: Get week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}


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

// TMDB API Integration
async function getTMDBData(title, type, apiKey) {
  try {
    const searchType = type === 'movie' ? 'movie' : 'tv';

    // Step 1: Netflix uvádí anglické názvy, hledáme proto v en-US a bez roku.
    // Top 10 v ČR je plná starého katalogu (Shrek, Ted), rok vydání tedy nic neříká.
    const queries = [title];
    if (title.startsWith('The ')) queries.push(title.substring(4));

    let candidates = [];
    for (const query of queries) {
      const searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-US`;
      const searchData = await fetch(searchUrl).then(r => r.json()).catch(() => ({}));
      candidates = searchData.results || [];
      if (candidates.length > 0) break;
    }

    if (candidates.length === 0) {
      return null;
    }

    // Step 2: U nejlepších shod podle názvu ověříme, jestli běží na Netflixu v ČR.
    const shortlist = shortlistByTitle(title, candidates, 3);
    const detailed = await Promise.all(shortlist.map(async (candidate) => {
      const url = `https://api.themoviedb.org/3/${searchType}/${candidate.id}?api_key=${apiKey}&language=cs-CZ&append_to_response=external_ids,watch/providers`;
      const details = await fetch(url).then(r => r.json()).catch(() => null);
      if (!details || !details.id) return null;
      const providers = extractProviders(details['watch/providers']);
      return { ...candidate, details, providers, on_netflix_cz: providers.includes('netflix') };
    }));

    const best = pickBestMatch(title, detailed.filter(Boolean));
    if (!best) {
      return null;
    }

    const tmdbId = best.id;
    const details = best.details;

    // Build TMDB URL
    const tmdbUrl = `https://www.themoviedb.org/${searchType}/${tmdbId}`;

    // Get genres (first 3)
    const genres = details.genres
      ?.map(g => g.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ') || 'N/A';

    // Get production countries (first 2, convert to friendly names)
    const countries = details.production_countries
      ?.slice(0, 2)
      .map(c => c.name)
      .filter(Boolean) || [];

    // Get origin country codes (different for movies vs series)
    // Movies: extract ISO codes from production_countries
    // Series: use origin_country directly
    const originCountry = type === 'movie'
      ? (details.production_countries?.map(c => c.iso_3166_1).filter(Boolean) || [])
      : (details.origin_country || []);

    // Extract IMDb ID from external_ids
    const imdbId = details.external_ids?.imdb_id || null;

    const providers = best.providers;

    // Base result object
    const result = {
      tmdb_id: tmdbId,
      tmdb_url: tmdbUrl,
      title_original: details.original_title || details.original_name,
      title_cz: details.title || details.name,
      year: (details.release_date || details.first_air_date || '').substring(0, 4),
      genre: genres,
      tmdb_rating: details.vote_average ? parseFloat(details.vote_average.toFixed(1)) : null,
      description: details.overview || 'Popis není k dispozici.',
      poster_url: details.poster_path
        ? `https://image.tmdb.org/t/p/w300${details.poster_path}`
        : null,
      countries: countries,
      origin_country: originCountry,
      imdb_id: imdbId,
      providers: providers
    };

    // Add type-specific fields
    if (type === 'movie') {
      result.runtime = details.runtime || null; // minutes
    } else if (type === 'series') {
      result.number_of_seasons = details.number_of_seasons || null;
      result.number_of_episodes = details.number_of_episodes || null;
      Object.assign(result, extractSeriesExtras(details));
    }

    return result;
  } catch (error) {
    console.error('Error fetching TMDB data:', error);
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
  const tmdbData = await getTMDBData(title, type, apiKey);

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

    const weekKey = `netflix_top10_cz_${getWeekNumber(new Date())}_v5`;
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

    // Store in D1 database (if available)
    if (env.DB) {
      try {
        const db = createDatabase(env);
        const allContent = [...data.movies, ...data.series];
        const dbResult = await db.upsertContentBatch(allContent);
        console.log('D1 database updated:', dbResult);
      } catch (dbError) {
        console.error('D1 database error (non-fatal):', dbError);
        // Continue even if DB fails - don't block API response
      }
    }

    // Store in KV with 7 day TTL (if available)
    if (env.TOPFLIX_KV) {
      await env.TOPFLIX_KV.put(weekKey, jsonData, {
        expirationTtl: 604800 // 7 days
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
