/**
 * Newsletter Subscribe - API Function (Cloudflare Pages)
 * Adds email to Resend Audience for weekly newsletter
 */

import { checkRateLimit, getRestrictedCorsHeaders, safeErrorResponse } from '../_lib/auth.js';

// Pages Function handler - exports onRequest for /api/newsletter-subscribe
export async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = getRestrictedCorsHeaders(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    // Rate limiting: max 5 subscribe attempts per IP per hour
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { limited } = await checkRateLimit(env.TOPFLIX_KV, `subscribe:${clientIP}`, 5, 3600);
    if (limited) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Check for required environment variables
    if (!env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID) {
      console.error('Missing required env vars for newsletter-subscribe');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
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
          ...corsHeaders
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
          ...corsHeaders
        }
      });
    }

    // Add contact to Resend Audience
    const resendUrl = `https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`;

    const resendResponse = await fetch(resendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        unsubscribed: false
      })
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend API error:', resendData);

      // Handle duplicate email gracefully
      if (resendData.message && resendData.message.includes('already exists')) {
        return new Response(JSON.stringify({
          success: true,
          message: 'Email is already subscribed',
          contact_id: resendData.id
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      return new Response(JSON.stringify({
        error: resendData.message || 'Failed to subscribe'
      }), {
        status: resendResponse.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Success
    console.log(`Subscribed: ${email}, Contact ID: ${resendData.id}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Successfully subscribed',
      contact_id: resendData.id
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error('Error in newsletter-subscribe function:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}
