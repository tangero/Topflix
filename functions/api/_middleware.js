/**
 * Doplní netflix_id k titulům v odpovědích API, ze kterých web staví tlačítka
 * „Pustit“. ID se čtou z D1 jedním dotazem. Chybějící se dohledají na
 * Wikidatech na pozadí, takže odpověď nečeká a další požadavek je už má.
 */

import { collectTitles, attachNetflixIds, refreshNetflixIds } from '../_lib/netflix-ids.js';

const ENRICHED = new Set([
  '/api/top10',
  '/api/netflix-new',
  '/api/netflix-added',
  '/api/archive',
  '/api/hidden-gems',
  '/api/best',
  '/api/search',
  '/api/detail'
]);
// Na pozadí najednou nanejvýš tolik titulů, ať jeden požadavek nezatíží Wikidata.
const BACKGROUND_LIMIT = 150;

export async function onRequest(context) {
  const response = await context.next();
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method !== 'GET' || !env.DB || !ENRICHED.has(url.pathname) || response.status !== 200
      || !(response.headers.get('Content-Type') || '').includes('application/json')) {
    return response;
  }

  try {
    const data = await response.clone().json();
    const titles = collectTitles(data);
    if (!titles.length) return response;

    const stale = await attachNetflixIds(env.DB, titles);
    if (stale.length) {
      context.waitUntil(
        refreshNetflixIds(env.DB, stale.slice(0, BACKGROUND_LIMIT))
          .catch((error) => console.warn('Netflix ID refresh failed:', error.message))
      );
    }

    const headers = new Headers(response.headers);
    headers.delete('Content-Length');
    return new Response(JSON.stringify(data), { status: response.status, headers });
  } catch (error) {
    // Odpověď API se nesmí rozbít kvůli doplňkům
    console.warn('Netflix ID enrichment skipped:', error.message);
    return response;
  }
}
