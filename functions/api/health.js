/**
 * Health Check Endpoint
 * Monitors system health, data collection, and newsletter status
 * For use with UptimeRobot and monitoring services
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
  const status = {
    status: 'healthy',
    total_records: 0,
    quality_records: 0,
    last_top10_update: null,
    last_netflix_new_update: null,
    age_hours: null,
    issues: []
  };

  try {
    // Get database stats
    const db = createDatabase(env);
    const stats = await db.getStats();
    status.total_records = stats.total || 0;
    status.quality_records = stats.quality || 0;

    // Check cache ages to determine last update
    if (env.TOPFLIX_KV) {
      try {
        // Check TOP10 cache
        const kvList = await env.TOPFLIX_KV.list({ prefix: 'netflix_top10_' });
        if (kvList.keys && kvList.keys.length > 0) {
          const top10Key = kvList.keys[0];
          if (top10Key.expiration) {
            const expirationDate = new Date(top10Key.expiration * 1000);
            const createdDate = new Date(expirationDate.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days TTL
            status.last_top10_update = createdDate.toISOString();
          }
        }

        // Check Netflix New cache
        const newList = await env.TOPFLIX_KV.list({ prefix: 'netflix_new_' });
        if (newList.keys && newList.keys.length > 0) {
          const newKey = newList.keys[0];
          if (newKey.expiration) {
            const expirationDate = new Date(newKey.expiration * 1000);
            const createdDate = new Date(expirationDate.getTime() - (24 * 60 * 60 * 1000)); // 1 day TTL
            status.last_netflix_new_update = createdDate.toISOString();
          }
        }

        // Calculate age of oldest update
        const updates = [status.last_top10_update, status.last_netflix_new_update].filter(Boolean);
        if (updates.length > 0) {
          const oldestUpdate = new Date(Math.min(...updates.map(d => new Date(d))));
          status.age_hours = Math.round((Date.now() - oldestUpdate.getTime()) / (1000 * 60 * 60) * 10) / 10;
        }
      } catch (kvError) {
        console.error('KV cache check error:', kvError);
      }
    }

    // Warn if data is too old
    if (status.age_hours && status.age_hours > 48) {
      status.status = 'degraded';
      status.issues.push(`Data is ${status.age_hours} hours old (>48h)`);
    }

    // Warn if too few records
    if (status.total_records < 50) {
      status.status = 'degraded';
      status.issues.push(`Only ${status.total_records} records in database (<50)`);
    }

  } catch (error) {
    status.status = 'unhealthy';
    status.issues.push(`Data check error: ${error.message}`);
  }

  return status;
}

/**
 * Check newsletter health
 */
async function checkNewsletterHealth(env) {
  const status = {
    status: 'healthy',
    resend_api: 'unknown',
    active_subscribers: 0,
    last_sent: null,
    days_since_last: null,
    issues: []
  };

  try {
    // Check Resend API key
    status.resend_api = env.RESEND_API_KEY ? 'configured' : 'missing';
    if (!env.RESEND_API_KEY) {
      status.issues.push('Resend API key not configured');
      status.status = 'degraded';
    }

    // Get subscriber count from D1
    if (env.DB) {
      try {
        const subResult = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM newsletter_subscribers WHERE confirmed = 1'
        ).first();
        status.active_subscribers = subResult?.count || 0;
      } catch (dbError) {
        console.error('Subscriber count error:', dbError);
      }

      // Get last newsletter send time
      try {
        const lastSent = await env.DB.prepare(
          'SELECT created_at FROM newsletter_log ORDER BY created_at DESC LIMIT 1'
        ).first();

        if (lastSent && lastSent.created_at) {
          status.last_sent = new Date(lastSent.created_at * 1000).toISOString();
          const daysSince = Math.round((Date.now() - lastSent.created_at * 1000) / (1000 * 60 * 60 * 24));
          status.days_since_last = daysSince;

          // Warn if newsletter not sent in 7+ days
          if (daysSince > 7) {
            status.status = 'degraded';
            status.issues.push(`Newsletter not sent in ${daysSince} days (>7)`);
          }
        } else {
          status.issues.push('No newsletter send history found');
        }
      } catch (dbError) {
        console.error('Newsletter log error:', dbError);
      }
    }

  } catch (error) {
    status.status = 'unhealthy';
    status.issues.push(`Newsletter check error: ${error.message}`);
  }

  return status;
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
      health.checks.newsletter = await checkNewsletterHealth(env);
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
