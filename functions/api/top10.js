/**
 * Topflix - Netflix Top 10 API Function (Cloudflare Pages)
 * Fetches Netflix Top 10 data and enriches with TMDB and ČSFD ratings
 */

// Helper: Get week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

// Helper: Sleep for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    const searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${apiKey}&query=${encodeURIComponent(title)}&language=cs-CZ`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.results || searchData.results.length === 0) {
      return null;
    }

    const searchItem = searchData.results[0];
    const tmdbId = searchItem.id;

    // Step 2: Get detailed info
    const detailsUrl = `https://api.themoviedb.org/3/${searchType}/${tmdbId}?api_key=${apiKey}&language=cs-CZ`;
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

    // Get origin country codes
    const originCountry = details.origin_country || [];

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
      origin_country: originCountry
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
  let quality = 'yellow';
  if (avgRating >= 70) quality = 'green';
  else if (avgRating < 50) quality = 'red';

  // Build result object
  const result = {
    rank,
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
    type
  };

  return result;
}

// Main data fetching and enrichment
export async function fetchAndEnrichData(apiKey) {
  const netflixData = await scrapeNetflixTop10();

  if (!netflixData) {
    throw new Error('Failed to fetch Netflix Top 10 data');
  }

  const enrichedMovies = [];
  const enrichedSeries = [];

  // Enrich movies
  for (const movie of netflixData.movies) {
    const enriched = await enrichTitle(movie.title, movie.rank, 'movie', apiKey);
    enrichedMovies.push(enriched);
  }

  // Enrich series
  for (const series of netflixData.series) {
    const enriched = await enrichTitle(series.title, series.rank, 'series', apiKey);
    enrichedSeries.push(enriched);
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
    // Check if required bindings exist
    if (!env.TOPFLIX_KV) {
      console.error('TOPFLIX_KV binding is missing!');
      return new Response(JSON.stringify({
        error: 'KV namespace not configured',
        details: 'TOPFLIX_KV binding is missing. Please configure it in Cloudflare Dashboard: Settings -> Functions -> KV namespace bindings'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    if (!env.TMDB_API_KEY) {
      console.error('TMDB_API_KEY is missing!');
      return new Response(JSON.stringify({
        error: 'TMDB API key not configured',
        details: 'TMDB_API_KEY environment variable is missing. Please add it in Cloudflare Dashboard: Settings -> Environment variables'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    const weekKey = `netflix_top10_cz_${getWeekNumber(new Date())}`;
    console.log('Fetching data for week:', weekKey);

    // Try to get from KV cache first
    let cachedData = await env.TOPFLIX_KV.get(weekKey);

    if (cachedData) {
      return new Response(cachedData, {
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // If not in cache, fetch fresh data
    const data = await fetchAndEnrichData(env.TMDB_API_KEY);
    const jsonData = JSON.stringify(data);

    // Store in KV with 7 day TTL
    await env.TOPFLIX_KV.put(weekKey, jsonData, {
      expirationTtl: 604800 // 7 days
    });

    return new Response(jsonData, {
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  } catch (error) {
    console.error('Error in top10 function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack,
      details: 'Check Cloudflare Dashboard -> Functions -> Real-time logs for more details'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  }
}
