/**
 * Newsletter Unsubscribe - API Function (Cloudflare Pages)
 * Removes email from Resend Audience
 */

// CORS headers
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Pages Function handler - exports onRequest for /api/newsletter-unsubscribe
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

    // Validate email format (basic)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({
        error: 'Invalid email format'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Remove contact from Resend Audience using email
    // Resend API: DELETE /audiences/{audience_id}/contacts/{email}
    const resendUrl = `https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts/${encodeURIComponent(email)}`;

    const resendResponse = await fetch(resendUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`
      }
    });

    // Resend returns 200 with { deleted: true } on success
    if (resendResponse.ok) {
      const resendData = await resendResponse.json();
      console.log(`Unsubscribed: ${email}`);

      return new Response(JSON.stringify({
        success: true,
        message: 'Successfully unsubscribed'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Handle 404 - email not found in audience
    if (resendResponse.status === 404) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Email was not found in the subscriber list'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Handle other errors
    let resendData;
    try {
      resendData = await resendResponse.json();
    } catch (e) {
      resendData = { message: 'Unknown error' };
    }

    console.error('Resend API error:', resendData);

    return new Response(JSON.stringify({
      error: resendData.message || 'Failed to unsubscribe'
    }), {
      status: resendResponse.status,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  } catch (error) {
    console.error('Error in newsletter-unsubscribe function:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  }
}
