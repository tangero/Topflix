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

  if (!title) {
    return new Response(JSON.stringify({
      error: 'Missing title parameter',
      usage: '/api/debug-csfd?title=Název filmu'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const debug = {
      step1_search: {},
      step2_film_page: {}
    };

    // STEP 1: Search
    await sleep(2000);

    const searchUrl = `https://www.csfd.cz/hledat/?q=${encodeURIComponent(title)}`;
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

      // Extract film URL
      const urlMatch = articleHtml.match(/href="(\/film\/[^"]+|\/serial\/[^"]+)"/i);
      debug.step1_search.extracted_url = urlMatch ? `https://www.csfd.cz${urlMatch[1]}` : null;

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

      // Find all percentages
      const allPercents = filmHtml.match(/(\d{1,3})%/g);
      patterns.all_percentages = allPercents ? allPercents.slice(0, 20) : []; // First 20

      debug.step2_film_page.rating_patterns = patterns;
    }

    // Return debug info
    return new Response(JSON.stringify({
      title,
      debug
    }, null, 2), {
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
