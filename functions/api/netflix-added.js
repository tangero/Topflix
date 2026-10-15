/**
 * Netflix Added - API Function (Cloudflare Pages)
 * Co v posledních týdnech přibylo do katalogu Netflixu v ČR a co z něj zmizelo.
 * Data jsou z porovnání týdenních snímků katalogu (viz netflix-catalog-sync).
 */

import { getPublicCorsHeaders, safeErrorResponse } from '../_lib/auth.js';
import { getCatalogChanges } from '../_lib/netflix-catalog.js';

const CACHE_KEY = 'netflix_added_v1';

export async function onRequest(context) {
  const { request, env } = context;
  const cors = getPublicCorsHeaders();

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  const headers = { 'Content-Type': 'application/json', ...cors };

  if (!env.DB) {
    return new Response(JSON.stringify({ comparable: false, added: [], removed: [] }), { headers });
  }

  try {
    if (env.TOPFLIX_KV) {
      const cached = await env.TOPFLIX_KV.get(CACHE_KEY);
      if (cached) return new Response(cached, { headers });
    }

    const data = await getCatalogChanges(env.DB, { days: 30, limit: 60 });
    const body = JSON.stringify({ updated: new Date().toISOString().split('T')[0], ...data });

    if (env.TOPFLIX_KV) {
      await env.TOPFLIX_KV.put(CACHE_KEY, body, { expirationTtl: 3600 });
    }
    return new Response(body, { headers });
  } catch (error) {
    // Bez migrace 0004 tabulka neexistuje. Stránka pak ukáže, že přírůstky ještě sledujeme.
    if (/no such table/i.test(error.message || '')) {
      return new Response(JSON.stringify({ comparable: false, added: [], removed: [] }), { headers });
    }
    return safeErrorResponse(error, cors);
  }
}
