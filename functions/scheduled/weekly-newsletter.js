/**
 * Weekly Newsletter - Scheduled Cron Job (Cloudflare Pages)
 * Sends newsletter broadcast every Wednesday at 15:00 UTC (16:00 CET)
 */

import { fetchNewsletterData, generateNewsletterHTML, generateNewsletterText } from '../_lib/newsletter-generator.js';

// Scheduled handler - exports onSchedule
export async function onSchedule(context) {
  const { env } = context;

  try {
    console.log('Weekly newsletter cron job triggered');

    // Check for required environment variables
    if (!env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY is missing!');
      throw new Error('Resend API key not configured');
    }

    if (!env.TMDB_API_KEY) {
      console.error('TMDB_API_KEY is missing!');
      throw new Error('TMDB API key not configured');
    }

    if (!env.RESEND_AUDIENCE_ID) {
      console.error('RESEND_AUDIENCE_ID is missing!');
      throw new Error('Resend Audience ID not configured');
    }

    // Fetch newsletter data
    console.log('Fetching newsletter data...');
    const data = await fetchNewsletterData(env.TMDB_API_KEY);

    console.log(`Found ${data.movies.length} movies and ${data.series.length} series with ≥70% rating`);

    // Check if we have content to send
    if (data.movies.length === 0 && data.series.length === 0) {
      console.warn('No recommended content found (≥70% rating). Skipping broadcast.');
      return;
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
        subject: 'Topflix - Týdenní výběr: Co stojí za to vidět',
        html: htmlContent,
        text: textContent
      })
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend Broadcast API error:', resendData);
      throw new Error(`Failed to send broadcast: ${resendData.message}`);
    }

    // Success
    console.log(`Newsletter broadcast sent successfully!`);
    console.log(`Broadcast ID: ${resendData.id}`);
    console.log(`Movies: ${data.movies.length}, Series: ${data.series.length}`);

  } catch (error) {
    console.error('Error in weekly-newsletter cron job:', error);
    // Re-throw to mark the cron job as failed in Cloudflare
    throw error;
  }
}
