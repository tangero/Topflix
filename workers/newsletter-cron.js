/**
 * Cloudflare Worker - Newsletter Cron Trigger
 * This Worker runs every Tuesday at 15:00 UTC and triggers the newsletter broadcast.
 * Cloudflare counts weekdays from 1 = Sunday, so cron "3" is Tuesday.
 *
 * Why a separate Worker?
 * - Cloudflare Pages Functions don't support cron triggers directly
 * - Workers with scheduled handlers can use cron triggers
 * - This Worker simply calls our Pages Function endpoint
 */

export default {
  async scheduled(event, env, ctx) {
    console.log('Newsletter cron trigger fired at:', new Date().toISOString());

    if (!env.ADMIN_API_KEY) {
      throw new Error('ADMIN_API_KEY is not configured on the newsletter cron worker');
    }

    try {
      // Call the newsletter-send endpoint on our Pages site.
      // The Pages function requires the same Bearer token as other admin routes.
      const response = await fetch('https://www.topflix.cz/api/newsletter-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
          'User-Agent': 'Topflix-Newsletter-Cron/1.0'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Newsletter send failed:', response.status, data.error || response.status);
        throw new Error(`Newsletter send failed: ${data.error || 'Unknown error'}`);
      }

      if (data.success === false) {
        console.log('Newsletter broadcast skipped:', data.message);
        return;
      }

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
      note: 'This worker runs on schedule: Every Tuesday at 15:00 UTC',
      cron: '0 15 * * 3',
      endpoint: 'https://www.topflix.cz/api/newsletter-send'
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
