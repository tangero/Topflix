/**
 * Health Check Endpoint
 * Monitors system health, data collection, and newsletter status
 * For use with UptimeRobot and monitoring services
 */

import { evaluateData, loadDataInputs, loadNewsletterInputs, evaluateNewsletter } from '../_lib/health-checks.js';

// CORS headers
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * Check system health (DB, KV, API keys)
 */
async function checkSystemHealth(env) {
  const status = {
    status: 'healthy',
    database: 'unknown',
    kv: 'unknown',
    tmdb_api: 'unknown',
    issues: []
  };

  // Check D1 Database
  try {
    if (!env.DB) {
      status.database = 'missing';
      status.issues.push('D1 database binding not found');
      status.status = 'unhealthy';
    } else {
      const result = await env.DB.prepare('SELECT 1 as test').first();
      status.database = result ? 'connected' : 'error';
      if (!result) {
        status.issues.push('D1 database query failed');
        status.status = 'degraded';
      }
    }
  } catch (error) {
    status.database = 'error';
    status.issues.push(`D1 error: ${error.message}`);
    status.status = 'unhealthy';
  }

  // Check KV
  try {
    if (!env.TOPFLIX_KV) {
      status.kv = 'missing';
      status.issues.push('KV namespace binding not found');
      status.status = 'degraded';
    } else {
      await env.TOPFLIX_KV.get('health_check_test');
      status.kv = 'accessible';
    }
  } catch (error) {
    status.kv = 'error';
    status.issues.push(`KV error: ${error.message}`);
    status.status = 'degraded';
  }

  // Check TMDB API key
  status.tmdb_api = env.TMDB_API_KEY ? 'configured' : 'missing';
  if (!env.TMDB_API_KEY) {
    status.issues.push('TMDB API key not configured');
    status.status = 'degraded';
  }

  return status;
}

/**
 * Check data collection health
 */
async function checkDataCollectionHealth(env) {
  try {
    if (!env.DB) throw new Error('D1 database binding not found');
    return evaluateData(await loadDataInputs(env));
  } catch (error) {
    return { status: 'unhealthy', issues: [`Data check error: ${error.message}`] };
  }
}

/**
 * Check newsletter health (Resend). Veřejně jen stav a datum poslední
 * rozesílky, správce vidí i počet odběratelů a obsah poslední rozesílky.
 */
async function checkNewsletterHealth(env, admin) {
  if (!env.RESEND_API_KEY) return evaluateNewsletter(env, {}, { admin });
  const cacheKey = 'health_newsletter_v1';
  let inputs = null;
  if (!admin && env.TOPFLIX_KV) {
    try { inputs = await env.TOPFLIX_KV.get(cacheKey, 'json'); } catch (error) { inputs = null; }
  }
  if (!inputs) {
    inputs = await loadNewsletterInputs(env, { admin });
    if (!admin && env.TOPFLIX_KV && !inputs.error) {
      // Selhání mezipaměti nesmí zahodit už zjištěný výsledek
      try {
        await env.TOPFLIX_KV.put(cacheKey, JSON.stringify(inputs), { expirationTtl: 1800 });
      } catch (error) {
        console.warn('Health cache write failed:', error.message);
      }
    }
  }
  return evaluateNewsletter(env, inputs, { admin });
}

/**
 * Main health check handler
 */
export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: getCorsHeaders()
    });
  }

  try {
    const url = new URL(request.url);
    const checkType = url.searchParams.get('check'); // 'system', 'data', 'newsletter', or null (all)
    const admin = Boolean(env.ADMIN_API_KEY) && request.headers.get('Authorization') === `Bearer ${env.ADMIN_API_KEY}`;

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {}
    };

    // Run requested checks
    if (!checkType || checkType === 'system') {
      health.checks.system = await checkSystemHealth(env);
    }

    if (!checkType || checkType === 'data') {
      health.checks.data_collection = await checkDataCollectionHealth(env);
    }

    if (!checkType || checkType === 'newsletter') {
      health.checks.newsletter = await checkNewsletterHealth(env, admin);
    }

    // Determine overall status
    const statuses = Object.values(health.checks).map(c => c.status);
    if (statuses.includes('unhealthy')) {
      health.status = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      health.status = 'degraded';
    }

    // Collect all issues
    health.issues = Object.values(health.checks)
      .flatMap(c => c.issues || []);

    // Return appropriate HTTP status
    const httpStatus = health.status === 'healthy' ? 200 :
                       health.status === 'degraded' ? 200 : 503;

    return new Response(JSON.stringify(health, null, 2), {
      status: httpStatus,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...getCorsHeaders()
      }
    });

  } catch (error) {
    console.error('Health check error:', error.message, error.stack);
    return new Response(JSON.stringify({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Internal server error'
    }, null, 2), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      }
    });
  }
}
