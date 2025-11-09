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

// ČSFD Scraper - two-step process
async function getCSFDData(title, year, type) {
  // Skip ČSFD for series - they have complex season ratings that aren't useful
  if (type === 'series') {
    console.log(`ČSFD: Skipping series "${title}" - ČSFD only used for movies`);
    return { rating: null, url: null };
  }

  try {
    await sleep(2000); // Rate limiting: 2 seconds between requests

    // Build search query
    // For movies: search WITH year (many movies share names)
    const searchQuery = year ? `${title} ${year}` : title;

    // Step 1: Search for the film to get URL
    const searchUrl = `https://www.csfd.cz/hledat/?q=${encodeURIComponent(searchQuery)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'cs,en;q=0.9',
      }
    });

    const searchHtml = await searchResponse.text();

    // Extract ALL articles from search results (not just first one!)
    const articleMatches = searchHtml.matchAll(/<article[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/article>/gi);
    const articles = Array.from(articleMatches);

    if (articles.length === 0) {
      console.log(`ČSFD: No search results for "${title}"`);
      return { rating: null, url: null };
    }

    console.log(`ČSFD: Found ${articles.length} articles for "${title}"`);

    let csfdUrl = null;

    // For movies: look for first /film/ URL (take first article)
    for (const articleMatch of articles) {
      const articleHtml = articleMatch[1];
      const urlMatch = articleHtml.match(/href="(\/film\/[^"]+)"/i);

      if (urlMatch) {
        csfdUrl = urlMatch[1];
        console.log(`ČSFD: Found movie URL: ${csfdUrl}`);
        break;
      }
    }

    if (!csfdUrl) {
      console.log(`ČSFD: No URL found for "${title}"`);
      return { rating: null, url: null };
    }

    // Ensure it's absolute URL
    if (!csfdUrl.startsWith('http')) {
      csfdUrl = `https://www.csfd.cz${csfdUrl}`;
    }

    // Make sure we're on main page, not gallery or other subpage
    // Remove trailing paths like /galerie/, /videa/, etc.
    csfdUrl = csfdUrl.replace(/(\/film\/\d+-[^\/]+|\/serial\/\d+-[^\/]+)\/.*$/, '$1/');

    console.log(`ČSFD: Found URL for "${title}": ${csfdUrl}`);

    // Step 2: Fetch the film page to get rating
    await sleep(2000); // Another 2s delay before fetching film page

    const filmResponse = await fetch(csfdUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'cs,en;q=0.9',
      }
    });

    const filmHtml = await filmResponse.text();

    // Extract rating from film page
    // ČSFD film page patterns (try multiple approaches):

    let rating = null;

    // Pattern 1: <div class="film-rating-average">XX%</div>
    let ratingMatch = filmHtml.match(/<div[^>]*class="[^"]*film-rating-average[^"]*"[^>]*>(\d+)%<\/div>/i);
    if (ratingMatch) {
      rating = parseInt(ratingMatch[1]);
      console.log(`ČSFD: Found rating via film-rating-average: ${rating}%`);
    }

    // Pattern 2: Look in film-header-name or film-header section
    if (!rating) {
      const headerMatch = filmHtml.match(/<header[^>]*class="[^"]*film-header[^"]*"[^>]*>([\s\S]*?)<\/header>/i);
      if (headerMatch) {
        const percentMatch = headerMatch[1].match(/(\d{2,3})%/);
        if (percentMatch) {
          rating = parseInt(percentMatch[1]);
          console.log(`ČSFD: Found rating in header: ${rating}%`);
        }
      }
    }

    // Pattern 3: rating average in any context
    if (!rating) {
      ratingMatch = filmHtml.match(/(?:hodnocení|rating)[^>]*?>(\d{2,3})%/i);
      if (ratingMatch) {
        rating = parseInt(ratingMatch[1]);
        console.log(`ČSFD: Found rating via generic pattern: ${rating}%`);
      }
    }

    // Pattern 4: data-rating attribute
    if (!rating) {
      const dataRating = filmHtml.match(/data-rating="(\d+)"/i);
      if (dataRating) {
        rating = parseInt(dataRating[1]);
        console.log(`ČSFD: Found rating via data-rating: ${rating}%`);
      }
    }

    // Pattern 5: Look in origin section (where ratings are shown)
    if (!rating) {
      const originMatch = filmHtml.match(/<div[^>]*class="[^"]*origin[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (originMatch) {
        const percentMatch = originMatch[1].match(/(\d{2,3})%/);
        if (percentMatch) {
          rating = parseInt(percentMatch[1]);
          console.log(`ČSFD: Found rating in origin: ${rating}%`);
        }
      }
    }

    // Pattern 6: Fallback - take first valid percentage from all percentages
    // This catches ratings that appear in HTML but not in specific sections
    if (!rating) {
      const allPercents = filmHtml.match(/(\d{2,3})%/g);
      if (allPercents && allPercents.length > 0) {
        // Try first few percentages, pick first valid one (10-100 range)
        for (const percent of allPercents.slice(0, 5)) {
          const value = parseInt(percent);
          if (value >= 10 && value <= 100) {
            rating = value;
            console.log(`ČSFD: Found rating via fallback (first valid %): ${rating}%`);
            break;
          }
        }
      }
    }

    // Validate rating is in reasonable range (10-100)
    // Ratings below 10% are likely parsing errors
    const validRating = rating && rating >= 10 && rating <= 100 ? rating : null;

    if (!validRating && rating) {
      console.log(`ČSFD: Invalid rating ${rating}% for "${title}" (year: ${year}) - discarded`);
    } else if (validRating) {
      console.log(`ČSFD: Valid rating ${validRating}% for "${title}" (year: ${year})`);
    } else {
      console.log(`ČSFD: No rating found for "${title}" (year: ${year}) at ${csfdUrl}`);
    }

    return {
      rating: validRating,
      url: csfdUrl
    };

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
  // Pass title, year, and type for better matching
  const csfdData = await getCSFDData(
    tmdbData.title_cz || title,
    tmdbData.year,
    type
  );

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
