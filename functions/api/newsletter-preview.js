/**
 * Newsletter Preview - API Function (Cloudflare Pages)
 * Generates and returns newsletter HTML for preview
 * PROTECTED: Requires ADMIN_API_KEY Bearer token
 */

import { fetchNewsletterData, generateNewsletterHTML } from '../_lib/newsletter-generator.js';
import { requireAdminAuth, getRestrictedCorsHeaders, safeErrorResponse } from '../_lib/auth.js';

// Pages Function handler - exports onRequest for /api/newsletter-preview
export async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = getRestrictedCorsHeaders(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Require admin authentication
  const authError = requireAdminAuth(request, env);
  if (authError) return authError;

  try {
    if (!env.TMDB_API_KEY) {
      console.error('TMDB_API_KEY is missing');
      return new Response(JSON.stringify({
        error: 'Server configuration error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Fetch newsletter data
    console.log('Fetching newsletter data for preview...');
    const data = await fetchNewsletterData(env.TMDB_API_KEY);

    console.log(`Preview: Found ${data.movies.length} movies and ${data.series.length} series with >=70% rating`);

    // Generate HTML
    const html = generateNewsletterHTML(data);

    // Return HTML for preview
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        ...corsHeaders
      }
    });
  } catch (error) {
    return safeErrorResponse(error, corsHeaders);
  }
}
