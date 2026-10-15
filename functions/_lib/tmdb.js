/**
 * Sdílené pomocné funkce pro odpovědi TMDB.
 */

// Streaming provider IDs and slugs for CZ market
export const PROVIDERS = {
  8:    'netflix',
  337:  'disney',
  350:  'apple',
  119:  'prime',
  1899: 'max',
  1773: 'skyshowtime'
};

export const NETFLIX_PROVIDER_ID = 8;

// Extract provider slugs from TMDB watch/providers response for CZ
export function extractProviders(watchProviders) {
  if (!watchProviders?.results?.CZ) return [];
  const flatrate = watchProviders.results.CZ.flatrate || [];
  return flatrate
    .map(p => PROVIDERS[p.provider_id])
    .filter(Boolean);
}

/**
 * Údaje, podle kterých se rozhoduje u seriálu: jestli je ukončený
 * a jak dlouhý je díl.
 */
export function extractSeriesExtras(details) {
  const status = details.status || '';
  let seriesStatus = null;
  if (/ended|canceled|cancelled/i.test(status)) seriesStatus = 'ended';
  else if (/returning|production|planned|pilot/i.test(status)) seriesStatus = 'ongoing';

  const runTimes = (details.episode_run_time || []).filter((value) => value > 0);
  const episodeRuntime = runTimes.length
    ? Math.round(runTimes.reduce((sum, value) => sum + value, 0) / runTimes.length)
    : (details.last_episode_to_air?.runtime || null);

  return {
    series_status: seriesStatus,
    episode_runtime: episodeRuntime || null,
    last_air_date: details.last_air_date || null
  };
}
