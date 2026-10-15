/**
 * Topflix - Cron Worker for scheduled updates
 * Runs on Tuesday and Friday at 07:00 UTC (09:00 CEST / 08:00 CET), see wrangler-cron.toml.
 *
 * Updates:
 * - Netflix TOP10 (movies + series)
 * - Netflix New content (last 6 months)
 * - Netflix CZ catalog snapshot (what was added and removed)
 * - Netflix Top 10 history backfill (a few batches per run)
 *
 * Catalog and history endpoints need ADMIN_API_KEY (wrangler secret put ADMIN_API_KEY).
 */

const CATALOG_MAX_STEPS = 15;   // 15 x 40 stránek = celý katalog jednoho typu
const ENRICH_MAX_STEPS = 5;     // 5 x 20 přírůstků
const HISTORY_MAX_STEPS = 6;    // 6 x 25 názvů z historie Top 10

async function adminPost(apiUrl, env, path) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      'User-Agent': 'Topflix-Cron/1.1'
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${data.error || ''}`.trim());
  return data;
}

async function syncCatalog(apiUrl, env) {
  const summary = {};
  for (const type of ['movie', 'series']) {
    let state = null;
    for (let step = 0; step < CATALOG_MAX_STEPS; step++) {
      state = await adminPost(apiUrl, env, `/api/netflix-catalog-sync?type=${type}&pages=40`);
      if (state.done) break;
    }
    summary[type] = { done: !!state?.done, seen: state?.seen, added: state?.added, removed: state?.removed, baseline: state?.baseline };
  }
  let enrich = null;
  for (let step = 0; step < ENRICH_MAX_STEPS; step++) {
    enrich = await adminPost(apiUrl, env, '/api/netflix-catalog-sync?action=enrich&limit=20');
    if (!enrich.remaining) break;
  }
  summary.enrich_remaining = enrich?.remaining ?? null;
  return summary;
}

async function backfillHistory(apiUrl, env) {
  const loaded = await adminPost(apiUrl, env, '/api/top10-history-sync?action=load');
  let mapped = 0;
  let remaining = null;
  for (let step = 0; step < HISTORY_MAX_STEPS; step++) {
    const result = await adminPost(apiUrl, env, '/api/top10-history-sync?action=map&limit=25');
    mapped += result.mapped || 0;
    remaining = result.remaining;
    if (!remaining) break;
  }
  return { weeks: loaded.weeks, mapped, remaining };
}

export default {
  // Cron trigger handler (Tuesday and Friday at 07:00 UTC)
  async scheduled(event, env, ctx) {
    const startTime = Date.now();
    const results = {
      top10: null,
      netflix_new: null,
      catalog: null,
      history: null,
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

      // 3. Katalog Netflixu v ČR a 4. historie Top 10 (potřebují admin klíč)
      if (!env.ADMIN_API_KEY) {
        results.errors.push('ADMIN_API_KEY missing: catalog sync and history backfill skipped');
        console.error('❌ ADMIN_API_KEY missing on cron worker');
      } else {
        try {
          results.catalog = await syncCatalog(apiUrl, env);
          console.log('✅ Catalog:', JSON.stringify(results.catalog));
        } catch (error) {
          results.errors.push(`Catalog error: ${error.message}`);
          console.error('❌ Catalog error:', error);
        }
        try {
          results.history = await backfillHistory(apiUrl, env);
          console.log('✅ History:', JSON.stringify(results.history));
        } catch (error) {
          results.errors.push(`History error: ${error.message}`);
          console.error('❌ History error:', error);
        }
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
