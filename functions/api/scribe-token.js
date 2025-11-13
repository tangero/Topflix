/**
 * Cloudflare Pages Function - ElevenLabs Scribe Token Generator
 *
 * This endpoint generates single-use tokens for ElevenLabs ScribeRealtime v2 API.
 * It keeps the API key secure on the server side.
 *
 * Endpoint: /api/scribe-token
 */

export async function onRequest(context) {
    const { request, env } = context;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: getCORSHeaders()
        });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({
            error: 'Method not allowed'
        }), {
            status: 405,
            headers: {
                'Content-Type': 'application/json',
                ...getCORSHeaders()
            }
        });
    }

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

            // Check for specific error codes
            if (elevenLabsResponse.status === 401) {
                return new Response(JSON.stringify({
                    error: 'Invalid API key'
                }), {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        ...getCORSHeaders()
                    }
                });
            }

            if (elevenLabsResponse.status === 429) {
                return new Response(JSON.stringify({
                    error: 'Rate limit exceeded'
                }), {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        ...getCORSHeaders()
                    }
                });
            }

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
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
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
