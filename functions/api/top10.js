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
    const searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${apiKey}&query=${encodeURIComponent(title)}&language=cs-CZ`;

    const response = await fetch(searchUrl);
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const item = data.results[0];

      // Get genres
      const genresUrl = `https://api.themoviedb.org/3/genre/${searchType}/list?api_key=${apiKey}&language=cs-CZ`;
      const genresResponse = await fetch(genresUrl);
      const genresData = await genresResponse.json();

      const genres = item.genre_ids
        .map(id => genresData.genres.find(g => g.id === id)?.name)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');

      // Build TMDB URL
      const tmdbUrl = `https://www.themoviedb.org/${searchType}/${item.id}`;

      return {
        tmdb_id: item.id,
        tmdb_url: tmdbUrl,
        title_original: item.original_title || item.original_name,
        title_cz: item.title || item.name,
        year: (item.release_date || item.first_air_date || '').substring(0, 4),
        genre: genres || 'N/A',
        tmdb_rating: item.vote_average ? parseFloat(item.vote_average.toFixed(1)) : null,
        description: item.overview || 'Popis není k dispozici.',
        poster_url: item.poster_path
          ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
          : null
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching TMDB data:', error);
    return null;
  }
}

// ČSFD Scraper - improved version
async function getCSFDData(title) {
  try {
    await sleep(2000); // Rate limiting: 2 seconds between requests

    const searchUrl = `https://www.csfd.cz/hledat/?q=${encodeURIComponent(title)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'cs,en;q=0.9',
      }
    });

    const html = await response.text();

    // ČSFD structure: Find first film/TV show result
    // Look for article with class "article" containing film data

    // Pattern 1: Try to find rating in film article structure
    // The rating is typically in format: <div class="film-rating-average">XX%</div>
    const articleMatch = html.match(/<article[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/article>/i);

    if (articleMatch) {
      const articleHtml = articleMatch[1];

      // Extract URL - typically /film/123456-nazev/ or /tvshow/...
      const urlMatch = articleHtml.match(/href="(\/film\/[^"]+|\/serial\/[^"]+)"/i);
      const csfdUrl = urlMatch ? `https://www.csfd.cz${urlMatch[1]}` : null;

      // Extract rating - look for percentage in rating context
      // Multiple patterns to try:

      // Pattern: <span class="average">XX%</span>
      let ratingMatch = articleHtml.match(/<span[^>]*class="[^"]*average[^"]*"[^>]*>(\d+)%<\/span>/i);

      if (!ratingMatch) {
        // Pattern: rating-XX% in class or data attribute
        ratingMatch = articleHtml.match(/rating-(\d+)%/i);
      }

      if (!ratingMatch) {
        // Pattern: data-rating="XX"
        const dataRating = articleHtml.match(/data-rating="(\d+)"/i);
        if (dataRating) {
          ratingMatch = [null, dataRating[1]];
        }
      }

      if (!ratingMatch) {
        // Fallback: any XX% in the article (more reliable than global search)
        ratingMatch = articleHtml.match(/(\d{1,3})%/);
      }

      const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;

      // Validate rating is in reasonable range (10-100)
      // Ratings below 10% are likely parsing errors (wrong element scraped)
      const validRating = rating && rating >= 10 && rating <= 100 ? rating : null;

      console.log(`ČSFD data for "${title}": rating=${validRating}, url=${csfdUrl}`);

      return {
        rating: validRating,
        url: csfdUrl
      };
    }

    // If article not found, try simpler approach
    const simpleUrlMatch = html.match(/href="(\/film\/[^"]+)"/i);
    if (simpleUrlMatch) {
      return {
        rating: null,
        url: `https://www.csfd.cz${simpleUrlMatch[1]}`
      };
    }

    console.log(`ČSFD: No data found for "${title}"`);
    return { rating: null, url: null };

  } catch (error) {
    console.error('Error fetching ČSFD data:', error);
    return { rating: null, url: null };
  }
}

// Process a single title (enrich with TMDB and ČSFD data)
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

  // Get ČSFD data (rating + URL)
  const csfdData = await getCSFDData(tmdbData.title_cz || title);

  // Calculate average rating and quality indicator
  // Only use available ratings (TMDB always available, ČSFD optional)
  const ratings = [];
  if (tmdbData.tmdb_rating) ratings.push(tmdbData.tmdb_rating * 10); // Convert 0-10 to 0-100
  if (csfdData.rating) ratings.push(csfdData.rating);

  const avgRating = ratings.length > 0
    ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
    : null;

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

  // Only include ČSFD data if rating exists
  if (csfdData.rating !== null) {
    result.csfd_rating = csfdData.rating;
  }

  // Include ČSFD URL if available (even without rating)
  if (csfdData.url) {
    result.csfd_url = csfdData.url;
  }

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
