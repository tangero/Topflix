/**
 * Detail API - Cloudflare Pages Function
 * Returns full detail for a single content item with similar titles
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
    const tmdbId = parseInt(url.searchParams.get('id'));
    const type = url.searchParams.get('type');

    if (!tmdbId || !type || !['movie', 'series'].includes(type)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid id/type parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() }
      });
    }

    const db = createDatabase(env);

    // Get full content detail
    const item = await db.getContentByIdFull(tmdbId, type);

    if (!item) {
      return new Response(JSON.stringify({ error: 'Content not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() }
      });
    }

    // Get appearance history
    const history = await db.getAppearanceHistory(tmdbId, type, 20);

    // Get similar content
    const similar = await db.getSimilarContent(item, 6);

    return new Response(JSON.stringify({
      item,
      history,
      similar
    }), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() }
    });
  } catch (error) {
    console.error('Error in detail endpoint:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() }
    });
  }
}
