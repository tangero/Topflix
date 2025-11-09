/**
 * Topflix - Cron Worker for scheduled updates
 * This worker runs every Tuesday at 10:00 UTC to refresh the data
 */

import { fetchAndEnrichData, getWeekNumber } from '../functions/api/top10.js';

// Helper: Get week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

export default {
  // Cron trigger handler (runs every Tuesday at 10:00 UTC)
  async scheduled(event, env, ctx) {
    try {
      console.log('Cron trigger: Refreshing Netflix Top 10 data');

      // Make a request to the Pages Function to trigger data refresh
      // This will bypass cache and fetch fresh data
      const apiUrl = env.PAGES_URL || 'https://your-pages-url.pages.dev';

      const response = await fetch(`${apiUrl}/api/top10`, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (response.ok) {
        console.log('Cron trigger: Data refreshed successfully');
      } else {
        console.error('Cron trigger: Failed to refresh data', response.status);
      }
    } catch (error) {
      console.error('Cron trigger error:', error);
    }
  }
};
