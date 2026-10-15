/**
 * Netflix Catalog Sync - admin endpoint (Cloudflare Pages)
 * Jeden krok synchronizace katalogu Netflixu v ČR. Cron ho volá opakovaně,
 * dokud nevrátí done: true, a pak doplní detaily k přírůstkům.
 *
 * POST /api/netflix-catalog-sync?type=movie&pages=40
 * POST /api/netflix-catalog-sync?action=enrich&limit=20
 * POST /api/netflix-catalog-sync?type=series&restart=1   (začít znovu od první stránky)
 */

import { requireAdminAuth, safeErrorResponse } from '../_lib/auth.js';
import { syncCatalogStep, enrichAddedStep } from '../_lib/netflix-catalog.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const authError = requireAdminAuth(request, env);
  if (authError) return authError;

  if (!env.DB || !env.TOPFLIX_KV || !env.TMDB_API_KEY) {
    return json({ error: 'Server configuration error' }, 500);
  }

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'sync';

    if (action === 'enrich') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 40);
      const result = await enrichAddedStep(env, { limit });
      // Bez toho by návštěva mezi synchronizací a doplněním nakešovala přírůstky bez hodnocení.
      if (result.enriched > 0) await env.TOPFLIX_KV.delete('netflix_added_v1');
      return json(result);
    }

    const type = url.searchParams.get('type');
    if (!['movie', 'series'].includes(type)) {
      return json({ error: 'type must be movie or series' }, 400);
    }
    const pages = Math.min(parseInt(url.searchParams.get('pages') || '40', 10) || 40, 80);
    const restart = url.searchParams.get('restart') === '1';
    const state = await syncCatalogStep(env, { type, pages, restart });

    if (state.done && !state.skipped) {
      // Nová data v katalogu: veřejný seznam přírůstků přestane platit.
      await env.TOPFLIX_KV.delete('netflix_added_v1');
    }
    return json(state);
  } catch (error) {
    return safeErrorResponse(error);
  }
}
