/**
 * Newsletter Test Send - API Function (Cloudflare Pages)
 * Sends a test newsletter email to specified address
 * PROTECTED: Requires ADMIN_API_KEY Bearer token
 */

import { fetchNewsletterData, generateNewsletterHTML, generateNewsletterText, generateNewsletterSubject } from '../_lib/newsletter-generator.js';
import { requireAdminAuth, getRestrictedCorsHeaders, safeErrorResponse } from '../_lib/auth.js';

// Pages Function handler - exports onRequest for /api/newsletter-test
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

  // Require admin authentication
  const authError = requireAdminAuth(request, env);
  if (authError) return authError;

  try {
    // Check for required environment variables
    if (!env.RESEND_API_KEY || !env.TMDB_API_KEY) {
      console.error('Missing required env vars for newsletter-test');
      return new Response(JSON.stringify({
        error: 'Server configuration error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Parse request body
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Fetch newsletter data
    console.log('Fetching newsletter data for test send...');
    const data = await fetchNewsletterData(env.TMDB_API_KEY);

    console.log(`Test: Found ${data.movies.length} movies and ${data.series.length} series with >=70% rating`);

    // Generate HTML, text, and subject
    const htmlContent = generateNewsletterHTML(data);
    const textContent = generateNewsletterText(data);
    const subjectLine = generateNewsletterSubject(data);

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Topflix <newsletter@topflix.cz>',
        to: [email],
        reply_to: 'noreply@topflix.cz',
        subject: subjectLine,
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
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
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
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return safeErrorResponse(error, corsHeaders);
  }
}
