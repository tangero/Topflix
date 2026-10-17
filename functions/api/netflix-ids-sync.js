/**
 * Netflix ID Sync - admin endpoint (Cloudflare Pages)
 * Jedna dávka dohledání Netflix ID na Wikidatech pro tituly z archivu
 * a katalogu. Volá se opakovaně, dokud remaining není 0.
 *
 * POST /api/netflix-ids-sync?limit=300
 */

import { requireAdminAuth, safeErrorResponse } from '../_lib/auth.js';
import { syncNetflixIdsStep } from '../_lib/netflix-ids.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authError = requireAdminAuth(request, env);
  if (authError) return authError;
  if (!env.DB) return json({ error: 'Server configuration error' }, 500);

  try {
    const url = new URL(request.url);
    // Rozsah 1 až 600: SQLite bere záporný LIMIT jako „bez omezení“.
    const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit') || '300', 10) || 300, 600));
    return json(await syncNetflixIdsStep(env.DB, { limit }));
  } catch (error) {
    return safeErrorResponse(error, {});
  }
}
