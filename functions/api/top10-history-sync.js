/**
 * Top 10 History Sync - admin endpoint (Cloudflare Pages)
 * Doplní archiv o historii české Netflix Top 10 od roku 2021.
 *
 * POST /api/top10-history-sync?action=load              uloží týdny z TSV (rychlé, bez TMDB)
 * POST /api/top10-history-sync?action=map&limit=25      napáruje další dávku názvů
 * POST /api/top10-history-sync?action=mismatches        vypíše chybně napárované řádky archivu
 * POST /api/top10-history-sync?action=cleanup&confirm=1 smaže je
 */

import { requireAdminAuth, safeErrorResponse } from '../_lib/auth.js';
import { createDatabase } from '../_lib/database.js';
import {
  loadTop10Weeks,
  mapTop10Step,
  findMismatchedContent,
  deleteMismatchedContent
} from '../_lib/top10-history.js';

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

  if (!env.DB || !env.TMDB_API_KEY) {
    return json({ error: 'Server configuration error' }, 500);
  }

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'map';

    if (action === 'load') {
      return json(await loadTop10Weeks(env.DB));
    }

    if (action === 'map') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '25', 10) || 25, 40);
      const result = await mapTop10Step(env, { limit });
      if (result.mapped > 0) {
        // Archiv se změnil: zneplatnit cache seznamů.
        await createDatabase(env)._invalidateListCaches();
      }
      return json(result);
    }

    if (action === 'mismatches' || action === 'cleanup') {
      const found = await findMismatchedContent(env.DB);
      if (action === 'cleanup' && found.ready && url.searchParams.get('confirm') === '1') {
        const deleted = await deleteMismatchedContent(env.DB, found.items);
        await createDatabase(env)._invalidateListCaches();
        return json({ deleted, items: found.items });
      }
      return json(found);
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    return safeErrorResponse(error);
  }
}
