/**
 * Newsletter Subscribe V2 - Double Opt-In (Cloudflare Pages Function)
 * Adds email to Resend Audience as UNSUBSCRIBED and sends confirmation email
 *
 * NOTE: This is V2 with Double Opt-In. Original newsletter-subscribe.js remains unchanged.
 * To activate this version, update frontend to call /api/newsletter-subscribe-v2
 */

import { encrypt } from '../_lib/crypto.js';
import { generateConfirmationHTML, generateConfirmationText } from '../_lib/confirmation-email-template.js';

// CORS headers
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Pages Function handler - exports onRequest for /api/newsletter-subscribe-v2
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

    if (!env.SECRET_PASSPHRASE) {
      console.error('SECRET_PASSPHRASE is missing!');
      return new Response(JSON.stringify({
        error: 'Secret passphrase not configured'
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

    // Step 1: Add contact to Resend Audience as UNSUBSCRIBED
    const resendUrl = `https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`;

    const resendResponse = await fetch(resendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        unsubscribed: true  // ← CRITICAL: Start as unsubscribed for Double Opt-In
      })
    });

    const resendData = await resendResponse.json();

    // Handle errors (except duplicate)
    if (!resendResponse.ok) {
      console.error('Resend API error:', resendData);

      // Handle duplicate email - still send confirmation
      if (resendData.message && resendData.message.includes('already exists')) {
        console.log(`Contact already exists: ${email}, sending confirmation email anyway`);
      } else {
        return new Response(JSON.stringify({
          error: resendData.message || 'Failed to add contact'
        }), {
          status: resendResponse.status,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders()
          }
        });
      }
    }

    // Step 2: Generate encrypted token (email:timestamp)
    const tokenData = `${email}:${Date.now()}`;
    const encryptedToken = await encrypt(tokenData, env.SECRET_PASSPHRASE);

    // Step 3: Build confirmation URL
    const confirmationUrl = `https://www.topflix.cz/api/newsletter-confirm?token=${encodeURIComponent(encryptedToken)}`;

    // Step 4: Send confirmation email
    const confirmEmailUrl = 'https://api.resend.com/emails';

    const confirmEmailResponse = await fetch(confirmEmailUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Topflix <newsletter@topflix.cz>',
        to: [email],
        reply_to: 'noreply@topflix.cz',
        subject: 'Potvrďte přihlášení k newsletteru Topflix',
        html: generateConfirmationHTML(confirmationUrl, email),
        text: generateConfirmationText(confirmationUrl, email)
      })
    });

    const confirmEmailData = await confirmEmailResponse.json();

    if (!confirmEmailResponse.ok) {
      console.error('Failed to send confirmation email:', confirmEmailData);
      return new Response(JSON.stringify({
        error: 'Failed to send confirmation email'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Success
    console.log(`Confirmation email sent to: ${email}, Email ID: ${confirmEmailData.id}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Confirmation email sent. Please check your inbox and confirm your subscription.',
      email_id: confirmEmailData.id
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  } catch (error) {
    console.error('Error in newsletter-subscribe-v2 function:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error',
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
