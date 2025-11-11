/**
 * Test DB endpoint - for debugging D1 database issues
 */

import { createDatabase } from '../_lib/database.js';

export async function onRequest(context) {
  const { env } = context;

  try {
    // Check if DB binding exists
    if (!env.DB) {
      return new Response(JSON.stringify({
        error: 'DB binding not found',
        env_keys: Object.keys(env)
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create database instance
    const db = createDatabase(env);

    // Test data - one simple movie
    const testData = [{
      tmdb_id: 999999,
      type: 'movie',
      title: 'Test Film',
      title_original: 'Test Film Original',
      year: 2025,
      genre: 'Test',
      avg_rating: 75,
      tmdb_rating: 7.5,
      csfd_rating: null,
      poster_url: 'https://example.com/poster.jpg',
      description: 'This is a test film',
      runtime: 120,
      origin_country: ['US'],
      countries: ['United States'],
      source: 'top10',
      rank: 1,
      tmdb_url: 'https://www.themoviedb.org/movie/999999'
    }];

    // Try to upsert
    const result = await db.upsertContentBatch(testData);

    // Check if it was inserted
    const count = await env.DB.prepare('SELECT COUNT(*) as total FROM content').first();

    return new Response(JSON.stringify({
      success: true,
      upsert_result: result,
      total_records: count.total,
      message: 'Test completed successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack,
      name: error.name
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
