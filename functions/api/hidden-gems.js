/**
 * Hidden Gems API - Cloudflare Pages Function
 * Returns high-rated content with low appearances (hidden treasures)
 */

import { createDatabase } from '../_lib/database.js';

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders() });
  }

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() }
      });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const limit = parseInt(url.searchParams.get('limit') || '30');
    const minRating = parseInt(url.searchParams.get('minRating') || '80');
    const maxAppearances = parseInt(url.searchParams.get('maxAppearances') || '2');
    const excludeRegional = url.searchParams.get('excludeRegional') === 'true';

    const db = createDatabase(env);
    const gems = await db.getHiddenGems({
      limit,
      type,
      minRating,
      maxAppearances,
      excludeRegional
    });

    return new Response(JSON.stringify({
      count: gems.length,
      data: gems
    }), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() }
    });
  } catch (error) {
    console.error('Error in hidden-gems endpoint:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() }
    });
  }
}
