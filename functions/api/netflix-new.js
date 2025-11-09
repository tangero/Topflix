/**
 * Netflix New - API Function (Cloudflare Pages)
 * Fetches newly added movies and series on Netflix CZ with TMDB ratings
 */

// Helper: Sleep for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// TMDB API Integration - Get Netflix new content
async function getNetflixNewContent(apiKey, type = 'movie', limit = 20) {
  try {
    // Calculate date range: last 180 days
    const today = new Date();
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(today.getMonth() - 6);

    const dateFrom = sixMonthsAgo.toISOString().split('T')[0];

    // TMDB Discover API with Netflix watch provider
    const searchType = type === 'movie' ? 'movie' : 'tv';
    const dateParam = type === 'movie' ? 'primary_release_date' : 'first_air_date';

    const discoverUrl = `https://api.themoviedb.org/3/discover/${searchType}` +
      `?api_key=${apiKey}` +
      `&with_watch_providers=8` + // Netflix ID
      `&watch_region=CZ` +
      `&${dateParam}.gte=${dateFrom}` +
      `&sort_by=popularity.desc` +
      `&vote_count.gte=50` + // Minimum votes for quality
      `&language=cs-CZ` +
      `&page=1`;

    const response = await fetch(discoverUrl);
    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return [];
    }

    // Get genres for mapping
    const genresUrl = `https://api.themoviedb.org/3/genre/${searchType}/list?api_key=${apiKey}&language=cs-CZ`;
    const genresResponse = await fetch(genresUrl);
    const genresData = await genresResponse.json();

    // Process results and limit to specified number
    const results = data.results.slice(0, limit).map(item => {
      const genres = item.genre_ids
        .map(id => genresData.genres.find(g => g.id === id)?.name)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');

      const tmdbUrl = `https://www.themoviedb.org/${searchType}/${item.id}`;

      return {
        tmdb_id: item.id,
        tmdb_url: tmdbUrl,
        title: item.title || item.name,
        title_original: item.original_title || item.original_name,
        year: (item.release_date || item.first_air_date || '').substring(0, 4),
        genre: genres || 'N/A',
        tmdb_rating: item.vote_average ? parseFloat(item.vote_average.toFixed(1)) : null,
        description: item.overview || 'Popis není k dispozici.',
        poster_url: item.poster_path
          ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
          : null,
        type: type,
        popularity: item.popularity
      };
    });

    return results;
  } catch (error) {
    console.error(`Error fetching Netflix new ${type}:`, error);
    return [];
  }
}

// Calculate quality indicator based on rating
function getQualityIndicator(rating) {
  if (!rating) return { quality: 'yellow', label: 'Průměr' };

  const ratingPercent = rating * 10; // Convert 0-10 to 0-100

  if (ratingPercent >= 70) {
    return { quality: 'green', label: 'Doporučeno' };
  } else if (ratingPercent < 50) {
    return { quality: 'red', label: 'Slabé' };
  } else {
    return { quality: 'yellow', label: 'Průměr' };
  }
}

// Main data fetching
export async function fetchNetflixNew(apiKey) {
  // Fetch both movies and series in parallel
  const [movies, series] = await Promise.all([
    getNetflixNewContent(apiKey, 'movie', 20),
    getNetflixNewContent(apiKey, 'series', 20)
  ]);

  // Add quality indicators
  const processedMovies = movies.map(movie => {
    const { quality, label } = getQualityIndicator(movie.tmdb_rating);
    return {
      ...movie,
      quality,
      quality_label: label,
      avg_rating: movie.tmdb_rating ? Math.round(movie.tmdb_rating * 10) : null
    };
  });

  const processedSeries = series.map(show => {
    const { quality, label } = getQualityIndicator(show.tmdb_rating);
    return {
      ...show,
      quality,
      quality_label: label,
      avg_rating: show.tmdb_rating ? Math.round(show.tmdb_rating * 10) : null
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

    // Generate cache key based on date
    const cacheKey = `netflix_new_${new Date().toISOString().split('T')[0]}`;
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
    const data = await fetchNetflixNew(env.TMDB_API_KEY);
    const jsonData = JSON.stringify(data);

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
    console.error('Error in netflix-new function:', error);
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
