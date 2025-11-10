/**
 * Newsletter Confirmation - Double Opt-In Verification (Cloudflare Pages Function)
 * Verifies encrypted token and activates subscription
 */

import { decrypt } from '../_lib/crypto.js';

// Pages Function handler - exports onRequest for /api/newsletter-confirm
export async function onRequest(context) {
  const { request, env } = context;

  // Only allow GET (confirmation links from email)
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Check for required environment variables
    if (!env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY is missing!');
      return redirectToConfirmPage('error', 'Configuration error');
    }

    if (!env.RESEND_AUDIENCE_ID) {
      console.error('RESEND_AUDIENCE_ID is missing!');
      return redirectToConfirmPage('error', 'Configuration error');
    }

    if (!env.SECRET_PASSPHRASE) {
      console.error('SECRET_PASSPHRASE is missing!');
      return redirectToConfirmPage('error', 'Configuration error');
    }

    // Extract token from URL
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      console.error('No token provided');
      return redirectToConfirmPage('error', 'Token is missing');
    }

    // Step 1: Decrypt token
    let decrypted;
    try {
      decrypted = await decrypt(token, env.SECRET_PASSPHRASE);
    } catch (error) {
      console.error('Failed to decrypt token:', error);
      return redirectToConfirmPage('error', 'Invalid or corrupted token');
    }

    // Step 2: Parse token (format: "email:timestamp")
    const parts = decrypted.split(':');
    if (parts.length !== 2) {
      console.error('Invalid token format');
      return redirectToConfirmPage('error', 'Invalid token format');
    }

    const [email, timestampStr] = parts;
    const timestamp = parseInt(timestampStr);

    if (isNaN(timestamp)) {
      console.error('Invalid timestamp in token');
      return redirectToConfirmPage('error', 'Invalid token');
    }

    // Step 3: Check expiration (24 hours)
    const now = Date.now();
    const age = now - timestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    if (age > maxAge) {
      console.log(`Token expired for ${email}. Age: ${Math.round(age / 1000 / 60)} minutes`);
      return redirectToConfirmPage('expired', encodeURIComponent(email));
    }

    // Step 4: Activate subscription (set unsubscribed: false)
    const resendUrl = `https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts/${encodeURIComponent(email)}`;

    const resendResponse = await fetch(resendUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        unsubscribed: false  // ← ACTIVATE subscription
      })
    });

    if (!resendResponse.ok) {
      const resendData = await resendResponse.json();
      console.error('Failed to activate subscription:', resendData);

      // Handle 404 - contact not found
      if (resendResponse.status === 404) {
        return redirectToConfirmPage('notfound', encodeURIComponent(email));
      }

      return redirectToConfirmPage('error', 'Failed to activate subscription');
    }

    // Success!
    console.log(`Subscription activated for: ${email}`);
    return redirectToConfirmPage('success', encodeURIComponent(email));

  } catch (error) {
    console.error('Error in newsletter-confirm function:', error);
    return redirectToConfirmPage('error', 'Internal server error');
  }
}

/**
 * Redirect to confirmation page with status
 * @param {string} status - success, error, expired, notfound
 * @param {string} message - Optional message or email
 * @returns {Response} Redirect response
 */
function redirectToConfirmPage(status, message = '') {
  const baseUrl = 'https://www.topflix.cz/newsletter/confirm.html';
  const url = `${baseUrl}?status=${status}${message ? `&message=${message}` : ''}`;

  return Response.redirect(url, 302);
}
