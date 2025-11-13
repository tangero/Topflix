/**
 * Cloudflare Worker - ElevenLabs Scribe Token Proxy
 *
 * This worker generates single-use tokens for ElevenLabs ScribeRealtime v2 API.
 * It keeps the API key secure on the server side.
 */

export default {
    async fetch(request, env) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return handleCORS();
        }

        const url = new URL(request.url);

        // Token generation endpoint
        if (url.pathname === '/api/scribe-token' && request.method === 'GET') {
            return handleTokenRequest(env);
        }

        // Health check endpoint
        if (url.pathname === '/health' && request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok' }), {
                headers: {
                    'Content-Type': 'application/json',
                    ...getCORSHeaders()
                }
            });
        }

        // 404 for unknown routes
        return new Response('Not Found', {
            status: 404,
            headers: getCORSHeaders()
        });
    }
};

/**
 * Handle token generation request
 */
async function handleTokenRequest(env) {
    try {
        // Check if API key is configured
        if (!env.ELEVENLABS_API_KEY) {
            console.error('ELEVENLABS_API_KEY not configured');
            return new Response(JSON.stringify({
                error: 'Service not configured'
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    ...getCORSHeaders()
                }
            });
        }

        // Request single-use token from ElevenLabs
        const elevenLabsResponse = await fetch(
            'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
            {
                method: 'POST',
                headers: {
                    'xi-api-key': env.ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!elevenLabsResponse.ok) {
            const errorText = await elevenLabsResponse.text();
            console.error('ElevenLabs API error:', elevenLabsResponse.status, errorText);

            // Don't expose internal errors to client
            return new Response(JSON.stringify({
                error: 'Failed to generate token'
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    ...getCORSHeaders()
                }
            });
        }

        const data = await elevenLabsResponse.json();

        // Return token to client
        return new Response(JSON.stringify({
            token: data.token
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                ...getCORSHeaders()
            }
        });

    } catch (error) {
        console.error('Error handling token request:', error);

        return new Response(JSON.stringify({
            error: 'Internal server error'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...getCORSHeaders()
            }
        });
    }
}

/**
 * Get CORS headers
 */
function getCORSHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
    };
}

/**
 * Handle CORS preflight requests
 */
function handleCORS() {
    return new Response(null, {
        status: 204,
        headers: getCORSHeaders()
    });
}
