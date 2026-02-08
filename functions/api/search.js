/**
 * Search API - Cloudflare Pages Function
 * Searches content by title in D1 database
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
    const query = url.searchParams.get('q');
    const type = url.searchParams.get('type');
    const limit = parseInt(url.searchParams.get('limit') || '30');

    if (!query || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'Query must be at least 2 characters', data: [] }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() }
      });
    }

    if (type && !['movie', 'series'].includes(type)) {
      return new Response(JSON.stringify({ error: 'Invalid type parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() }
      });
    }

    const db = createDatabase(env);
    const results = await db.searchContent(query, { limit, type });

    return new Response(JSON.stringify({
      query,
      count: results.length,
      data: results
    }), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() }
    });
  } catch (error) {
    console.error('Error in search endpoint:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() }
    });
  }
}
