/**
 * Topflix - Cron Worker for scheduled updates
 * This worker runs DAILY at 06:00 UTC (08:00 CET) to refresh all data
 *
 * Updates:
 * - Netflix TOP10 (movies + series)
 * - Netflix New content (last 6 months)
 */

export default {
  // Cron trigger handler (runs daily at 06:00 UTC)
  async scheduled(event, env, ctx) {
    const startTime = Date.now();
    const results = {
      top10: null,
      netflix_new: null,
      errors: []
    };

    try {
      console.log('🕐 Cron trigger started:', new Date().toISOString());

      const apiUrl = env.PAGES_URL || 'https://www.topflix.cz';

      // 1. Refresh TOP10 data (movies + series)
      console.log('📊 Refreshing TOP10 data...');
      try {
        const top10Response = await fetch(`${apiUrl}/api/top10`, {
          headers: {
            'Cache-Control': 'no-cache',
            'X-Cron-Trigger': 'true'
          }
        });

        if (top10Response.ok) {
          const top10Data = await top10Response.json();
          results.top10 = {
            success: true,
            movies: top10Data.movies?.length || 0,
            series: top10Data.series?.length || 0,
            updated: top10Data.updated
          };
          console.log(`✅ TOP10: ${results.top10.movies} movies, ${results.top10.series} series`);
        } else {
          results.top10 = { success: false, status: top10Response.status };
          results.errors.push(`TOP10 API failed: ${top10Response.status}`);
          console.error('❌ TOP10 API failed:', top10Response.status);
        }
      } catch (error) {
        results.top10 = { success: false, error: error.message };
        results.errors.push(`TOP10 error: ${error.message}`);
        console.error('❌ TOP10 error:', error);
      }

      // 2. Refresh Netflix New data
      console.log('🆕 Refreshing Netflix New data...');
      try {
        const newResponse = await fetch(`${apiUrl}/api/netflix-new`, {
          headers: {
            'Cache-Control': 'no-cache',
            'X-Cron-Trigger': 'true'
          }
        });

        if (newResponse.ok) {
          const newData = await newResponse.json();
          results.netflix_new = {
            success: true,
            movies: newData.movies?.length || 0,
            series: newData.series?.length || 0,
            updated: newData.updated
          };
          console.log(`✅ Netflix New: ${results.netflix_new.movies} movies, ${results.netflix_new.series} series`);
        } else {
          results.netflix_new = { success: false, status: newResponse.status };
          results.errors.push(`Netflix New API failed: ${newResponse.status}`);
          console.error('❌ Netflix New API failed:', newResponse.status);
        }
      } catch (error) {
        results.netflix_new = { success: false, error: error.message };
        results.errors.push(`Netflix New error: ${error.message}`);
        console.error('❌ Netflix New error:', error);
      }

      // Summary
      const duration = Date.now() - startTime;
      console.log(`⏱️  Cron completed in ${duration}ms`);
      console.log('📝 Results:', JSON.stringify(results, null, 2));

      if (results.errors.length === 0) {
        console.log('✅ All data refreshed successfully');
      } else {
        console.error('⚠️  Some updates failed:', results.errors);
      }

    } catch (error) {
      console.error('💥 Cron trigger fatal error:', error);
      results.errors.push(`Fatal error: ${error.message}`);
    }

    return results;
  }
};
