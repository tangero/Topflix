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
    await sleep(2000); // Rate limiting

    const searchUrl = `https://www.csfd.cz/hledat/?q=${encodeURIComponent(title)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'cs,en;q=0.9',
      }
    });

    const html = await response.text();

    // Try all patterns
    const patterns = {
      article: null,
      url: null,
      rating_patterns: {}
    };

    // Find article
    const articleMatch = html.match(/<article[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      const articleHtml = articleMatch[1];
      patterns.article = articleHtml.substring(0, 500); // First 500 chars

      // Try URL extraction
      const urlMatch = articleHtml.match(/href="(\/film\/[^"]+|\/serial\/[^"]+)"/i);
      patterns.url = urlMatch ? `https://www.csfd.cz${urlMatch[1]}` : null;

      // Try all rating patterns
      const pattern1 = articleHtml.match(/<span[^>]*class="[^"]*average[^"]*"[^>]*>(\d+)%<\/span>/i);
      patterns.rating_patterns.average_span = pattern1 ? pattern1[1] : null;

      const pattern2 = articleHtml.match(/rating-(\d+)%/i);
      patterns.rating_patterns.rating_class = pattern2 ? pattern2[1] : null;

      const pattern3 = articleHtml.match(/data-rating="(\d+)"/i);
      patterns.rating_patterns.data_rating = pattern3 ? pattern3[1] : null;

      const pattern4 = articleHtml.match(/(\d{1,3})%/);
      patterns.rating_patterns.any_percent = pattern4 ? pattern4[1] : null;

      // Try to find all percentages
      const allPercents = articleHtml.match(/(\d{1,3})%/g);
      patterns.rating_patterns.all_percentages = allPercents || [];
    }

    // Also check for film card structure
    const filmCardMatch = html.match(/<div[^>]*class="[^"]*film-header[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (filmCardMatch) {
      patterns.film_card = filmCardMatch[1].substring(0, 300);
    }

    // Return debug info
    return new Response(JSON.stringify({
      title,
      search_url: searchUrl,
      patterns,
      html_preview: html.substring(0, 1000),
      html_length: html.length
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
