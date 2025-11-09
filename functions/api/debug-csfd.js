/**
 * Debug endpoint for ČSFD scraping
 * Usage: /api/debug-csfd?title=Název filmu
 */

// Helper: Sleep for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const title = url.searchParams.get('title');
  const year = url.searchParams.get('year') || null;
  const type = url.searchParams.get('type') || 'movie'; // default to movie

  if (!title) {
    return new Response(JSON.stringify({
      error: 'Missing title parameter',
      usage: '/api/debug-csfd?title=Název filmu&year=2022&type=series'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const debug = {
      input: { title, year, type },
      step1_search: {},
      step2_film_page: {}
    };

    // STEP 1: Search
    await sleep(2000);

    // For series: search WITHOUT year (series names are unique, year confuses ČSFD)
    // For movies: search WITH year (many movies share names)
    const searchQuery = (type === 'series') ? title : (year ? `${title} ${year}` : title);
    debug.step1_search.search_strategy = type === 'series'
      ? 'Series: searching WITHOUT year'
      : 'Movie: searching WITH year';

    const searchUrl = `https://www.csfd.cz/hledat/?q=${encodeURIComponent(searchQuery)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'cs,en;q=0.9',
      }
    });

    const searchHtml = await searchResponse.text();
    debug.step1_search.url = searchUrl;
    debug.step1_search.html_length = searchHtml.length;

    // Extract article from search
    const articleMatch = searchHtml.match(/<article[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      const articleHtml = articleMatch[1];
      debug.step1_search.article_preview = articleHtml.substring(0, 500);

      // Extract URL - prefer /serial/ for series, /film/ for movies
      const expectedPrefix = type === 'series' ? '/serial/' : '/film/';
      let urlMatch = articleHtml.match(new RegExp(`href="(${expectedPrefix.replace('/', '\\/')}[^"]+)"`, 'i'));

      debug.step1_search.expected_type = type;
      debug.step1_search.expected_prefix = expectedPrefix;

      // Fallback: try both types
      if (!urlMatch) {
        urlMatch = articleHtml.match(/href="(\/film\/[^"]+|\/serial\/[^"]+)"/i);
        debug.step1_search.fallback_used = true;
      }

      if (urlMatch) {
        let csfdUrl = urlMatch[1];
        debug.step1_search.raw_url = csfdUrl;

        // Ensure it's absolute URL
        if (!csfdUrl.startsWith('http')) {
          csfdUrl = `https://www.csfd.cz${csfdUrl}`;
        }

        // Remove trailing paths like /galerie/, /videa/, etc.
        const beforeCleanup = csfdUrl;
        csfdUrl = csfdUrl.replace(/(\/film\/\d+-[^\/]+|\/serial\/\d+-[^\/]+)\/.*$/, '$1/');

        if (beforeCleanup !== csfdUrl) {
          debug.step1_search.url_cleanup = `Removed: ${beforeCleanup.replace(csfdUrl, '')}`;
        }

        debug.step1_search.extracted_url = csfdUrl;
      } else {
        debug.step1_search.extracted_url = null;
        debug.step1_search.error = 'No URL found in article';
      }

      // Check if rating in search (shouldn't be)
      const searchPercents = articleHtml.match(/(\d{1,3})%/g);
      debug.step1_search.percentages_found = searchPercents || [];
    } else {
      debug.step1_search.error = 'No article found in search results';
    }

    // STEP 2: Film page (only if URL found)
    if (debug.step1_search.extracted_url) {
      await sleep(2000); // Rate limit

      const filmResponse = await fetch(debug.step1_search.extracted_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'cs,en;q=0.9',
        }
      });

      const filmHtml = await filmResponse.text();
      debug.step2_film_page.url = debug.step1_search.extracted_url;
      debug.step2_film_page.html_length = filmHtml.length;
      debug.step2_film_page.html_preview = filmHtml.substring(0, 1000);

      // Extract title from page to verify correct film
      const titleMatch = filmHtml.match(/<title>([^<]+)<\/title>/i);
      debug.step2_film_page.page_title = titleMatch ? titleMatch[1] : 'Title not found';

      // Try all rating patterns on film page
      const patterns = {};

      // Pattern 1: film-rating-average
      const pattern1 = filmHtml.match(/<div[^>]*class="[^"]*film-rating-average[^"]*"[^>]*>(\d+)%<\/div>/i);
      patterns.film_rating_average = pattern1 ? pattern1[1] : null;

      // Pattern 2: any rating>XX%
      const pattern2 = filmHtml.match(/rating[^>]*>(\d+)%/i);
      patterns.rating_generic = pattern2 ? pattern2[1] : null;

      // Pattern 3: data-rating
      const pattern3 = filmHtml.match(/data-rating="(\d+)"/i);
      patterns.data_rating = pattern3 ? pattern3[1] : null;

      // Pattern 4: rating section
      const ratingSection = filmHtml.match(/<section[^>]*class="[^"]*rating[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
      if (ratingSection) {
        const sectionMatch = ratingSection[1].match(/(\d{1,3})%/);
        patterns.rating_section = sectionMatch ? sectionMatch[1] : null;
        patterns.rating_section_preview = ratingSection[1].substring(0, 300);
      }

      // Pattern 5: film-header section
      const headerMatch = filmHtml.match(/<header[^>]*class="[^"]*film-header[^"]*"[^>]*>([\s\S]*?)<\/header>/i);
      if (headerMatch) {
        const percentMatch = headerMatch[1].match(/(\d{2,3})%/);
        patterns.film_header = percentMatch ? percentMatch[1] : null;
        patterns.film_header_preview = headerMatch[1].substring(0, 300);
      }

      // Pattern 6: origin section
      const originMatch = filmHtml.match(/<div[^>]*class="[^"]*origin[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (originMatch) {
        const percentMatch = originMatch[1].match(/(\d{2,3})%/);
        patterns.origin_section = percentMatch ? percentMatch[1] : null;
        patterns.origin_section_preview = originMatch[1].substring(0, 300);
      }

      // Find all percentages
      const allPercents = filmHtml.match(/(\d{1,3})%/g);
      patterns.all_percentages = allPercents ? allPercents.slice(0, 20) : []; // First 20

      // Determine final rating (first valid pattern wins)
      const finalRating = patterns.film_rating_average ||
                         patterns.film_header ||
                         patterns.rating_generic ||
                         patterns.data_rating ||
                         patterns.rating_section ||
                         patterns.origin_section ||
                         null;

      debug.step2_film_page.rating_patterns = patterns;
      debug.step2_film_page.final_rating = finalRating;
      debug.step2_film_page.is_valid = finalRating && parseInt(finalRating) >= 10 && parseInt(finalRating) <= 100;
    }

    // Return debug info
    return new Response(JSON.stringify(debug, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
