/**
 * Topflix - Shared authentication and security helpers
 */

/**
 * Verify admin Bearer token from Authorization header
 * @param {Request} request - Incoming request
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Response|null} Error response if unauthorized, null if OK
 */
export function requireAdminAuth(request, env) {
  const adminKey = env.ADMIN_API_KEY;
  if (!adminKey) {
    console.error('ADMIN_API_KEY is not configured');
    return new Response(JSON.stringify({
      error: 'Server configuration error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${adminKey}`) {
    return new Response(JSON.stringify({
      error: 'Unauthorized'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return null; // Auth OK
}

/**
 * CORS headers for public read-only endpoints
 */
export function getPublicCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * CORS headers for restricted endpoints (only topflix.cz)
 */
export function getRestrictedCorsHeaders(request) {
  const allowedOrigins = ['https://www.topflix.cz', 'https://topflix.cz'];
  const origin = request.headers.get('Origin');
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * Build a safe error response (no stack traces in production)
 */
export function safeErrorResponse(error, corsHeaders = {}) {
  console.error('API Error:', error.message, error.stack);
  return new Response(JSON.stringify({
    error: 'Internal server error'
  }), {
    status: 500,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

/**
 * Rate limiting check using KV store
 * @param {Object} kv - KV namespace binding
 * @param {string} key - Rate limit key (e.g., IP address)
 * @param {number} maxAttempts - Max attempts in window
 * @param {number} windowSeconds - Time window in seconds
 * @returns {Promise<{limited: boolean, remaining: number}>}
 */
export async function checkRateLimit(kv, key, maxAttempts = 5, windowSeconds = 3600) {
  if (!kv) return { limited: false, remaining: maxAttempts };

  const rateLimitKey = `ratelimit:${key}`;
  try {
    const current = await kv.get(rateLimitKey);
    const attempts = current ? parseInt(current) : 0;

    if (attempts >= maxAttempts) {
      return { limited: true, remaining: 0 };
    }

    await kv.put(rateLimitKey, String(attempts + 1), {
      expirationTtl: windowSeconds
    });

    return { limited: false, remaining: maxAttempts - attempts - 1 };
  } catch (error) {
    console.error('Rate limit check error:', error);
    return { limited: false, remaining: maxAttempts };
  }
}
