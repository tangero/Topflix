/**
 * Topflix - Netflix Top 10 API Function (Cloudflare Pages)
 * Fetches Netflix Top 10 data and enriches with TMDB and ČSFD ratings
 */

import { createDatabase } from '../_lib/database.js';
import { enrichWithOMDbRatings } from '../_lib/omdb.js';

// Streaming provider IDs and slugs for CZ market
const PROVIDERS = {
  8:    'netflix',
  337:  'disney',
  350:  'apple',
  119:  'prime',
  1899: 'max',
  1773: 'skyshowtime'
};

// Extract provider slugs from TMDB watch/providers response for CZ
function extractProviders(watchProviders) {
  if (!watchProviders?.results?.CZ) return [];
  const cz = watchProviders.results.CZ;
  const flatrate = cz.flatrate || [];
  return flatrate
    .map(p => PROVIDERS[p.provider_id])
    .filter(Boolean);
}

// Helper: Get week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}


// Netflix Top 10 Scraper
async function scrapeNetflixTop10() {
  try {
    const url = 'https://top10.netflix.com/data/all-weeks-countries.tsv';
    const response = await fetch(url);
    const text = await response.text();

    const lines = text.split('\n');
    const headers = lines[0].split('\t');

    // Find the most recent week for Czech Republic
    const czechData = [];
    let latestWeek = '';

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t');
      if (values.length < 5) continue;

      const country = values[headers.indexOf('country_name')];
      const week = values[headers.indexOf('week')];
      const category = values[headers.indexOf('category')];
      const showTitle = values[headers.indexOf('show_title')];
      const weeklyRank = values[headers.indexOf('weekly_rank')];

      if (country === 'Czech Republic' || country === 'Czechia') {
        if (!latestWeek || week > latestWeek) {
          latestWeek = week;
        }

        czechData.push({
          week,
          category,
          title: showTitle,
          rank: parseInt(weeklyRank)
        });
      }
    }

    // Filter only the latest week
    const latestData = czechData.filter(item => item.week === latestWeek);

    // Separate movies and series
    const movies = latestData
      .filter(item => item.category === 'Films')
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 10);

    const series = latestData
      .filter(item => item.category === 'TV')
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 10);

    return {
      week: latestWeek,
      movies: movies.map(m => ({ rank: m.rank, title: m.title })),
      series: series.map(s => ({ rank: s.rank, title: s.title }))
    };
  } catch (error) {
    console.error('Error scraping Netflix Top 10:', error);
    return null;
  }
}

// TMDB API Integration
async function getTMDBData(title, type, apiKey) {
  try {
    const searchType = type === 'movie' ? 'movie' : 'tv';

    // Step 1: Search to get ID
    // Try searching with current year first (most Netflix Top 10 content is recent)
    const currentYear = new Date().getFullYear();
    const yearParam = type === 'movie' ? 'primary_release_year' : 'first_air_date_year';

    let searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${apiKey}&query=${encodeURIComponent(title)}&${yearParam}=${currentYear}&language=cs-CZ`;
    let searchResponse = await fetch(searchUrl);
    let searchData = await searchResponse.json();

    // If no results with current year, try without year filter
    if (!searchData.results || searchData.results.length === 0) {
      searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${apiKey}&query=${encodeURIComponent(title)}&language=cs-CZ`;
      searchResponse = await fetch(searchUrl);
      searchData = await searchResponse.json();
    }

    // If still no results and title starts with "The ", try without it
    if ((!searchData.results || searchData.results.length === 0) && title.startsWith('The ')) {
      const titleWithoutThe = title.substring(4);
      searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${apiKey}&query=${encodeURIComponent(titleWithoutThe)}&${yearParam}=${currentYear}&language=cs-CZ`;
      searchResponse = await fetch(searchUrl);
      searchData = await searchResponse.json();
    }

    if (!searchData.results || searchData.results.length === 0) {
      return null;
    }

    // Prefer recent results (within last 3 years)
    let searchItem = searchData.results[0];
    const recentYearThreshold = currentYear - 3;

    for (const result of searchData.results.slice(0, 5)) {
      const releaseYear = parseInt((result.release_date || result.first_air_date || '').substring(0, 4));
      if (releaseYear >= recentYearThreshold) {
        searchItem = result;
        break;
      }
    }

    const tmdbId = searchItem.id;

    // Step 2: Get detailed info with external_ids and watch providers in one request
    const detailsUrl = `https://api.themoviedb.org/3/${searchType}/${tmdbId}?api_key=${apiKey}&language=cs-CZ&append_to_response=external_ids,watch/providers`;
    const detailsResponse = await fetch(detailsUrl);
    const details = await detailsResponse.json();

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

    // Extract streaming providers from watch/providers
    const providers = extractProviders(details['watch/providers']);

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
    }

    return result;
  } catch (error) {
    console.error('Error fetching TMDB data:', error);
    return null;
  }
}

// ČSFD scraping removed - using TMDB only for simpler and more reliable ratings

// Process a single title (enrich with TMDB data only)
async function enrichTitle(title, rank, type, apiKey) {
  const tmdbData = await getTMDBData(title, type, apiKey);

  if (!tmdbData) {
    return {
      rank,
      title,
      type,
      error: 'Data not found'
    };
  }

  // Calculate rating (TMDB only, converted to 0-100 scale)
  const avgRating = tmdbData.tmdb_rating
    ? Math.round(tmdbData.tmdb_rating * 10)
    : null;

  // Quality indicator based on rating
  let quality = 'poor';
  if (avgRating >= 80) quality = 'excellent';
  else if (avgRating >= 70) quality = 'good';
  else if (avgRating >= 60) quality = 'average';
  else if (avgRating >= 50) quality = 'below-average';

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
    source: 'top10' // Mark as coming from Top 10
  };

  // Add type-specific fields
  if (type === 'movie') {
    result.runtime = tmdbData.runtime;
  } else if (type === 'series') {
    result.number_of_seasons = tmdbData.number_of_seasons;
    result.number_of_episodes = tmdbData.number_of_episodes;
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
      enrichTitle(movie.title, movie.rank, 'movie', apiKey)
    )),
    Promise.all(netflixData.series.map(series =>
      enrichTitle(series.title, series.rank, 'series', apiKey)
    ))
  ]);

  // Enrich with OMDb ratings (IMDb, RT, Metacritic) if API key available
  if (omdbApiKey) {
    [enrichedMovies, enrichedSeries] = await Promise.all([
      enrichWithOMDbRatings(enrichedMovies, omdbApiKey),
      enrichWithOMDbRatings(enrichedSeries, omdbApiKey)
    ]);
  }

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

    const weekKey = `netflix_top10_cz_${getWeekNumber(new Date())}_v4`;
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
