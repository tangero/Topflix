/**
 * Newsletter Send (Manual Trigger) - API Function (Cloudflare Pages)
 * Sends newsletter broadcast to all subscribers via Resend
 */

import { fetchNewsletterData, generateNewsletterHTML, generateNewsletterText } from '../_lib/newsletter-generator.js';

// CORS headers
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Pages Function handler - exports onRequest for /api/newsletter-send
export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: getCorsHeaders()
    });
  }

  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  }

  try {
    // Check for required environment variables
    if (!env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY is missing!');
      return new Response(JSON.stringify({
        error: 'Resend API key not configured'
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
        error: 'TMDB API key not configured'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    if (!env.RESEND_AUDIENCE_ID) {
      console.error('RESEND_AUDIENCE_ID is missing!');
      return new Response(JSON.stringify({
        error: 'Resend Audience ID not configured'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Fetch newsletter data
    console.log('Fetching newsletter data for broadcast...');
    const data = await fetchNewsletterData(env.TMDB_API_KEY);

    console.log(`Broadcast: Found ${data.movies.length} movies and ${data.series.length} series with ≥70% rating`);

    // Check if we have content to send
    if (data.movies.length === 0 && data.series.length === 0) {
      console.warn('No recommended content found (≥70% rating). Skipping broadcast.');
      return new Response(JSON.stringify({
        success: false,
        message: 'No recommended content found to send',
        stats: {
          movies_count: 0,
          series_count: 0
        }
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Generate HTML and text versions
    const htmlContent = generateNewsletterHTML(data);
    const textContent = generateNewsletterText(data);

    // Send broadcast via Resend Broadcast API
    const resendUrl = 'https://api.resend.com/broadcasts';

    const resendResponse = await fetch(resendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audience_id: env.RESEND_AUDIENCE_ID,
        from: 'Topflix <newsletter@topflix.cz>',
        reply_to: 'noreply@topflix.cz',
        subject: 'Topflix - Týdenní výběr na Netflix',
        html: htmlContent,
        text: textContent,
        headers: {
          'List-Unsubscribe': '<https://www.topflix.cz/unsubscribe>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'List-ID': '"Topflix Newsletter" <newsletter.topflix.cz>',
          'Precedence': 'bulk',
          'X-Auto-Response-Suppress': 'All'
        }
      })
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend Broadcast API error:', resendData);
      return new Response(JSON.stringify({
        error: resendData.message || 'Failed to send broadcast'
      }), {
        status: resendResponse.status,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Success
    console.log(`Broadcast sent successfully. Broadcast ID: ${resendData.id}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Newsletter broadcast sent successfully',
      broadcast_id: resendData.id,
      stats: {
        movies_count: data.movies.length,
        series_count: data.series.length
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  } catch (error) {
    console.error('Error in newsletter-send function:', error);
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
