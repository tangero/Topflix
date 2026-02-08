/**
 * Streaming New - API Function (Cloudflare Pages)
 * Fetches newly added movies and series on CZ streaming platforms with TMDB ratings
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
const PROVIDER_IDS = Object.keys(PROVIDERS).join('|'); // "8|337|350|119|1899|1773"

// Extract provider slugs from TMDB watch/providers response for CZ
function extractProviders(watchProviders) {
  if (!watchProviders?.results?.CZ) return [];
  const cz = watchProviders.results.CZ;
  const flatrate = cz.flatrate || [];
  return flatrate
    .map(p => PROVIDERS[p.provider_id])
    .filter(Boolean);
}

// TMDB API Integration - Get streaming new content
async function getStreamingNewContent(apiKey, type = 'movie', limit = 100) {
  try {
    // Calculate date range: last 180 days
    const today = new Date();
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(today.getMonth() - 6);

    const dateFrom = sixMonthsAgo.toISOString().split('T')[0];

    // TMDB Discover API with Netflix watch provider
    const searchType = type === 'movie' ? 'movie' : 'tv';
    const dateParam = type === 'movie' ? 'primary_release_date' : 'first_air_date';

    // Calculate how many pages we need (TMDB returns 20 items per page)
    const itemsPerPage = 20;
    const pagesToFetch = Math.min(Math.ceil(limit / itemsPerPage), 10);

    // Fetch discovery pages in parallel (max 5 concurrent)
    const pageNumbers = Array.from({ length: pagesToFetch }, (_, i) => i + 1);
    const pageResults = await Promise.all(
      pageNumbers.map(page => {
        const discoverUrl = `https://api.themoviedb.org/3/discover/${searchType}` +
          `?api_key=${apiKey}` +
          `&with_watch_providers=${PROVIDER_IDS}` +
          `&watch_region=CZ` +
          `&${dateParam}.gte=${dateFrom}` +
          `&sort_by=popularity.desc` +
          `&vote_count.gte=30` +
          `&language=cs-CZ` +
          `&page=${page}`;
        return fetch(discoverUrl).then(r => r.json()).catch(() => ({ results: [] }));
      })
    );

    const allItems = pageResults.flatMap(data => data.results || []).slice(0, limit);

    if (allItems.length === 0) {
      return [];
    }

    // Fetch details for all items in parallel batches of 10
    const BATCH_SIZE = 10;
    const results = [];

    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      const batch = allItems.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          try {
            const detailsUrl = `https://api.themoviedb.org/3/${searchType}/${item.id}?api_key=${apiKey}&language=cs-CZ&append_to_response=external_ids,watch/providers`;
            const detailsResponse = await fetch(detailsUrl);
            const details = await detailsResponse.json();

            const genres = details.genres
              ?.map(g => g.name)
              .filter(Boolean)
              .slice(0, 3)
              .join(', ') || 'N/A';

            const countries = details.production_countries
              ?.slice(0, 2)
              .map(c => c.name)
              .filter(Boolean) || [];

            const originCountry = type === 'movie'
              ? (details.production_countries?.map(c => c.iso_3166_1).filter(Boolean) || [])
              : (details.origin_country || []);

            // Extract IMDb ID from external_ids
            const imdbId = details.external_ids?.imdb_id || null;

            // Extract streaming providers from watch/providers
            const providers = extractProviders(details['watch/providers']);

            const result = {
              tmdb_id: item.id,
              tmdb_url: `https://www.themoviedb.org/${searchType}/${item.id}`,
              title: details.title || details.name,
              title_original: details.original_title || details.original_name,
              year: (details.release_date || details.first_air_date || '').substring(0, 4),
              genre: genres,
              tmdb_rating: details.vote_average ? parseFloat(details.vote_average.toFixed(1)) : null,
              description: details.overview || 'Popis není k dispozici.',
              poster_url: details.poster_path
                ? `https://image.tmdb.org/t/p/w300${details.poster_path}`
                : null,
              type: type,
              popularity: item.popularity,
              countries: countries,
              origin_country: originCountry,
              imdb_id: imdbId,
              providers: providers
            };

            if (type === 'movie') {
              result.runtime = details.runtime || null;
            } else if (type === 'series') {
              result.number_of_seasons = details.number_of_seasons || null;
              result.number_of_episodes = details.number_of_episodes || null;
            }

            return result;
          } catch (error) {
            console.error(`Error fetching details for ${item.id}:`, error);
            return null;
          }
        })
      );
      results.push(...batchResults.filter(Boolean));
    }

    return results;
  } catch (error) {
    console.error(`Error fetching Netflix new ${type}:`, error);
    return [];
  }
}

// Calculate quality indicator based on rating
function getQualityIndicator(rating) {
  if (!rating) return { quality: 'poor', label: 'Bez hodnocení' };

  const ratingPercent = rating * 10; // Convert 0-10 to 0-100

  if (ratingPercent >= 80) {
    return { quality: 'excellent', label: 'Výjimečné' };
  } else if (ratingPercent >= 70) {
    return { quality: 'good', label: 'Velmi dobré' };
  } else if (ratingPercent >= 60) {
    return { quality: 'average', label: 'Průměrné' };
  } else if (ratingPercent >= 50) {
    return { quality: 'below-average', label: 'Slabé' };
  } else {
    return { quality: 'poor', label: 'Špatné' };
  }
}

// Main data fetching
export async function fetchNetflixNew(apiKey, omdbApiKey) {
  // Fetch both movies and series in parallel from all CZ streaming platforms
  let [movies, series] = await Promise.all([
    getStreamingNewContent(apiKey, 'movie', 150),
    getStreamingNewContent(apiKey, 'series', 150)
  ]);

  // Enrich with OMDb ratings (IMDb, RT, Metacritic) if API key available
  if (omdbApiKey) {
    [movies, series] = await Promise.all([
      enrichWithOMDbRatings(movies, omdbApiKey),
      enrichWithOMDbRatings(series, omdbApiKey)
    ]);
  }

  // Add quality indicators
  const processedMovies = movies.map(movie => {
    const { quality, label } = getQualityIndicator(movie.tmdb_rating);
    return {
      ...movie,
      quality,
      quality_label: label,
      avg_rating: movie.tmdb_rating ? Math.round(movie.tmdb_rating * 10) : null,
      source: 'netflix_new' // Mark as coming from Netflix New
    };
  });

  const processedSeries = series.map(show => {
    const { quality, label } = getQualityIndicator(show.tmdb_rating);
    return {
      ...show,
      quality,
      quality_label: label,
      avg_rating: show.tmdb_rating ? Math.round(show.tmdb_rating * 10) : null,
      source: 'netflix_new' // Mark as coming from Netflix New
    };
  });

  const today = new Date();

  return {
    updated: today.toISOString().split('T')[0],
    period: 'Posledních 6 měsíců',
    attribution: 'Data od JustWatch a TMDB',
    movies: processedMovies,
    series: processedSeries
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

// Pages Function handler - exports onRequest for /api/netflix-new
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
    if (!env.TMDB_API_KEY) {
      console.error('TMDB_API_KEY is missing!');
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

    // Generate cache key based on date (v5 for increased limits to 150)
    const cacheKey = `netflix_new_${new Date().toISOString().split('T')[0]}_v6`;
    console.log('Fetching data for:', cacheKey);

    // Try to get from KV cache first (if available)
    let cachedData = null;
    if (env.TOPFLIX_KV) {
      cachedData = await env.TOPFLIX_KV.get(cacheKey);
    }

    if (cachedData) {
      console.log('Returning cached data');
      return new Response(cachedData, {
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // If not in cache, fetch fresh data
    const data = await fetchNetflixNew(env.TMDB_API_KEY, env.OMDB_API_KEY);
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

    // Store in KV with 24 hour TTL (if available)
    if (env.TOPFLIX_KV) {
      await env.TOPFLIX_KV.put(cacheKey, jsonData, {
        expirationTtl: 86400 // 24 hours
      });
    }

    return new Response(jsonData, {
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  } catch (error) {
    console.error('Error in netflix-new function:', error.message, error.stack);
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
