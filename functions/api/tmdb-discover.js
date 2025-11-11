/**
 * TMDB Discovery API - Bulk Netflix content discovery
 * Discovers movies and TV shows available on Netflix using TMDB Discovery API
 */

import { createDatabase } from '../_lib/database.js';

// CORS headers
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Sleep for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch a page of content from TMDB Discovery API
 */
async function fetchDiscoveryPage(type, page, apiKey, options = {}) {
  const {
    minRating = 7.0,
    sortBy = 'popularity.desc',
    region = 'CZ'
  } = options;

  const endpoint = type === 'movie' ? 'movie' : 'tv';

  // Build URL with filters
  const params = new URLSearchParams({
    api_key: apiKey,
    language: 'cs-CZ',
    region: region,
    page: page,
    sort_by: sortBy,
    'vote_average.gte': minRating,
    'vote_count.gte': 100, // Minimum votes for reliable rating
    with_watch_providers: '8', // Netflix provider ID
    watch_region: region
  });

  const url = `https://api.themoviedb.org/3/discover/${endpoint}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching page ${page}:`, error);
    return null;
  }
}

/**
 * Get detailed info for a single item
 */
async function getDetailedInfo(tmdbId, type, apiKey) {
  const endpoint = type === 'movie' ? 'movie' : 'tv';
  const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${apiKey}&language=cs-CZ`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const details = await response.json();

    // Build TMDB URL
    const tmdbUrl = `https://www.themoviedb.org/${endpoint}/${tmdbId}`;

    // Get genres (first 3)
    const genres = details.genres
      ?.map(g => g.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ') || 'N/A';

    // Get production countries
    const countries = details.production_countries
      ?.slice(0, 2)
      .map(c => c.name)
      .filter(Boolean) || [];

    // Get origin country codes
    const originCountry = type === 'movie'
      ? (details.production_countries?.map(c => c.iso_3166_1).filter(Boolean) || [])
      : (details.origin_country || []);

    // Base result
    const result = {
      tmdb_id: tmdbId,
      type: type,
      tmdb_url: tmdbUrl,
      title: details.title || details.name,
      title_original: details.original_title || details.original_name,
      year: (details.release_date || details.first_air_date || '').substring(0, 4),
      genre: genres,
      tmdb_rating: details.vote_average ? parseFloat(details.vote_average.toFixed(1)) : null,
      avg_rating: details.vote_average ? Math.round(details.vote_average * 10) : null,
      description: details.overview || 'Popis není k dispozici.',
      poster_url: details.poster_path
        ? `https://image.tmdb.org/t/p/w300${details.poster_path}`
        : null,
      countries: countries,
      origin_country: originCountry,
      source: 'netflix_new' // Use allowed source value for DB constraint
    };

    // Add type-specific fields
    if (type === 'movie') {
      result.runtime = details.runtime || null;
    } else if (type === 'tv') {
      result.number_of_seasons = details.number_of_seasons || null;
      result.number_of_episodes = details.number_of_episodes || null;
    }

    return result;
  } catch (error) {
    console.error(`Error fetching details for ${tmdbId}:`, error);
    return null;
  }
}

/**
 * Discover Netflix content
 */
async function discoverNetflixContent(apiKey, options = {}) {
  const {
    type = 'movie', // 'movie' or 'tv'
    pages = 5,
    minRating = 7.0,
    sortBy = 'popularity.desc'
  } = options;

  console.log(`Starting discovery: type=${type}, pages=${pages}, minRating=${minRating}`);

  const allResults = [];
  let totalPages = 0;

  // Fetch discovery pages
  for (let page = 1; page <= pages; page++) {
    console.log(`Fetching page ${page}/${pages}...`);

    const pageData = await fetchDiscoveryPage(type, page, apiKey, {
      minRating,
      sortBy,
      region: 'CZ'
    });

    if (!pageData || !pageData.results) {
      console.log(`No more results at page ${page}`);
      break;
    }

    totalPages = pageData.total_pages;
    allResults.push(...pageData.results);

    // Rate limiting: wait 250ms between pages
    if (page < pages) {
      await sleep(250);
    }
  }

  console.log(`Discovered ${allResults.length} items, enriching with details...`);

  // Enrich with detailed info
  const enrichedResults = [];

  for (let i = 0; i < allResults.length; i++) {
    const item = allResults[i];
    console.log(`Enriching ${i + 1}/${allResults.length}: ${item.title || item.name}`);

    const details = await getDetailedInfo(item.id, type, apiKey);

    if (details) {
      enrichedResults.push(details);
    }

    // Rate limiting: wait 200ms between detail requests
    if (i < allResults.length - 1) {
      await sleep(200);
    }
  }

  console.log(`Successfully enriched ${enrichedResults.length} items`);

  return {
    type,
    count: enrichedResults.length,
    total_available: totalPages * 20,
    pages_fetched: pages,
    items: enrichedResults
  };
}

/**
 * Pages Function handler
 */
export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: getCorsHeaders()
    });
  }

  try {
    // Check for required API key
    if (!env.TMDB_API_KEY) {
      return new Response(JSON.stringify({
        error: 'TMDB API key not configured'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Parse query parameters
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'movie'; // 'movie' or 'tv'
    const pages = parseInt(url.searchParams.get('pages') || '5');
    const minRating = parseFloat(url.searchParams.get('minRating') || '7.0');
    const sortBy = url.searchParams.get('sortBy') || 'popularity.desc';

    // Validate parameters
    if (!['movie', 'tv'].includes(type)) {
      return new Response(JSON.stringify({
        error: 'Invalid type parameter',
        details: 'Type must be "movie" or "tv"'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    if (pages < 1 || pages > 20) {
      return new Response(JSON.stringify({
        error: 'Invalid pages parameter',
        details: 'Pages must be between 1 and 20'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Discover content
    console.log('Starting TMDB discovery...');
    const data = await discoverNetflixContent(env.TMDB_API_KEY, {
      type,
      pages,
      minRating,
      sortBy
    });

    // Store in D1 database (if available)
    if (env.DB && data.items.length > 0) {
      try {
        const db = createDatabase(env);
        const dbResult = await db.upsertContentBatch(data.items);
        console.log('D1 database updated:', dbResult);

        data.db_result = {
          inserted: dbResult.inserted,
          updated: dbResult.updated,
          success: dbResult.success
        };
      } catch (dbError) {
        console.error('D1 database error (non-fatal):', dbError);
        data.db_error = dbError.message;
      }
    }

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  } catch (error) {
    console.error('Error in tmdb-discover function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  }
}
