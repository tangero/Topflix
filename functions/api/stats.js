/**
 * Stats API - Cloudflare Pages Function
 * Returns database statistics
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

// Pages Function handler - exports onRequest for /api/stats
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

    // Get stats from database
    const db = createDatabase(env);
    const stats = await db.getStats();

    // Build response
    const response = {
      stats,
      updated: new Date().toISOString().split('T')[0]
    };

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  } catch (error) {
    console.error('Error in stats endpoint:', error.message, error.stack);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  }
}
