/**
 * Newsletter Preview - API Function (Cloudflare Pages)
 * Generates and returns newsletter HTML for preview
 */

import { fetchNewsletterData, generateNewsletterHTML } from '../_lib/newsletter-generator.js';

// CORS headers
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Pages Function handler - exports onRequest for /api/newsletter-preview
export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: getCorsHeaders()
    });
  }

  try {
    // Check for required environment variables
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

    // Fetch newsletter data
    console.log('Fetching newsletter data for preview...');
    const data = await fetchNewsletterData(env.TMDB_API_KEY);

    console.log(`Preview: Found ${data.movies.length} movies and ${data.series.length} series with ≥70% rating`);

    // Generate HTML
    const html = generateNewsletterHTML(data);

    // Return HTML for preview
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        ...getCorsHeaders()
      }
    });
  } catch (error) {
    console.error('Error in newsletter-preview function:', error);
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
