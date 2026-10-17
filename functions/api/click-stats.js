/**
 * GET /api/click-stats?days=14 (admin): souhrn kliků na „Pustit“.
 */

import { requireAdminAuth, safeErrorResponse } from '../_lib/auth.js';
import { clickStats } from '../_lib/watch-clicks.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const authError = requireAdminAuth(request, env);
  if (authError) return authError;
  if (!env.DB) return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500 });
  try {
    const days = Math.max(1, Math.min(Number.parseInt(new URL(request.url).searchParams.get('days') || '14', 10) || 14, 90));
    return new Response(JSON.stringify(await clickStats(env.DB, days), null, 2), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return safeErrorResponse(error, {});
  }
}
