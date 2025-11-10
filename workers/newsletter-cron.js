/**
 * Cloudflare Worker - Newsletter Cron Trigger
 * This Worker runs every Wednesday at 15:00 UTC and triggers the newsletter broadcast
 *
 * Why a separate Worker?
 * - Cloudflare Pages Functions don't support cron triggers directly
 * - Workers with scheduled handlers can use cron triggers
 * - This Worker simply calls our Pages Function endpoint
 */

export default {
  async scheduled(event, env, ctx) {
    console.log('Newsletter cron trigger fired at:', new Date().toISOString());

    try {
      // Call the newsletter-send endpoint on our Pages site
      const response = await fetch('https://www.topflix.cz/api/newsletter-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Topflix-Newsletter-Cron/1.0'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Newsletter send failed:', response.status, data);
        throw new Error(`Newsletter send failed: ${data.error || 'Unknown error'}`);
      }

      // Success
      console.log('Newsletter broadcast sent successfully!');
      console.log('Broadcast ID:', data.broadcast_id);
      console.log('Movies:', data.stats?.movies_count || 0);
      console.log('Series:', data.stats?.series_count || 0);

    } catch (error) {
      console.error('Error in newsletter cron job:', error);
      // Re-throw to mark the cron job as failed in Cloudflare
      throw error;
    }
  },

  // Optional: Handle HTTP requests (for testing)
  async fetch(request, env, ctx) {
    return new Response(JSON.stringify({
      message: 'Newsletter Cron Worker',
      note: 'This worker runs on schedule: Every Wednesday at 15:00 UTC',
      cron: '0 15 * * 3',
      endpoint: 'https://www.topflix.cz/api/newsletter-send'
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
