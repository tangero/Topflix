/**
 * Best API - Cloudflare Pages Function
 * Returns best all-time content from D1 database (highly rated + multiple appearances)
 */

import { createDatabase } from '../_lib/database.js';

// CORS headers
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Pages Function handler - exports onRequest for /api/best
export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: getCorsHeaders()
    });
  }

  try {
    // Check for required bindings
    if (!env.DB) {
      return new Response(JSON.stringify({
        error: 'Database not configured',
        details: 'D1 database binding is missing'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Parse query parameters
    const url = new URL(request.url);
    const type = url.searchParams.get('type'); // 'movie', 'series', or null (both)
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const minRating = parseInt(url.searchParams.get('minRating') || '80');
    const minAppearances = parseInt(url.searchParams.get('minAppearances') || '1');
    const excludeRegional = url.searchParams.get('excludeRegional') === 'true';

    // Validate parameters
    if (limit < 1 || limit > 200) {
      return new Response(JSON.stringify({
        error: 'Invalid limit parameter',
        details: 'Limit must be between 1 and 200'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    if (type && !['movie', 'series'].includes(type)) {
      return new Response(JSON.stringify({
        error: 'Invalid type parameter',
        details: 'Type must be "movie" or "series"'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        }
      });
    }

    // Get data from database
    const db = createDatabase(env);
    const content = await db.getBestAllTime({
      limit,
      type,
      minRating,
      minAppearances,
      excludeRegional
    });

    // Get database stats for metadata
    const stats = await db.getStats();

    // Build response
    const response = {
      meta: {
        count: content.length,
        limit,
        minRating,
        minAppearances,
        type: type || 'all',
        excludeRegional,
        total_excellent: stats.excellent
      },
      data: content,
      updated: new Date().toISOString().split('T')[0]
    };

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  } catch (error) {
    console.error('Error in best endpoint:', error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  }
}
