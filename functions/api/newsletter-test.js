/**
 * Newsletter Test Send - API Function (Cloudflare Pages)
 * Sends a test newsletter email to specified address
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

// Pages Function handler - exports onRequest for /api/newsletter-test
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

    // Parse request body
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return new Response(JSON.stringify({
        error: 'Email is required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Fetch newsletter data
    console.log('Fetching newsletter data for test send...');
    const data = await fetchNewsletterData(env.TMDB_API_KEY);

    console.log(`Test: Found ${data.movies.length} movies and ${data.series.length} series with ≥70% rating`);

    // Generate HTML and text versions
    const htmlContent = generateNewsletterHTML(data);
    const textContent = generateNewsletterText(data);

    // Send email via Resend
    const resendUrl = 'https://api.resend.com/emails';

    const resendResponse = await fetch(resendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Topflix <newsletter@topflix.cz>',
        to: [email],
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
      console.error('Resend API error:', resendData);
      return new Response(JSON.stringify({
        error: resendData.message || 'Failed to send test email'
      }), {
        status: resendResponse.status,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Success
    console.log(`Test email sent to: ${email}, Email ID: ${resendData.id}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Test email sent successfully',
      email_id: resendData.id,
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
    console.error('Error in newsletter-test function:', error);
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
