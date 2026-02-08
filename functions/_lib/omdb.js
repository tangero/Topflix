/**
 * OMDb API Integration
 * Fetches IMDb, Rotten Tomatoes, and Metacritic ratings
 * Free tier: 1,000 requests/day
 */

/**
 * Fetch ratings from OMDb API by IMDb ID
 * @param {string} imdbId - IMDb ID (e.g. "tt1234567")
 * @param {string} apiKey - OMDb API key
 * @returns {Promise<Object|null>} Ratings object or null
 */
export async function getOMDbRatings(imdbId, apiKey) {
  if (!imdbId || !apiKey) return null;

  try {
    const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Response === 'False') {
      return null;
    }

    // Extract ratings from Ratings array
    const ratings = {};

    // IMDb rating (0-10 scale)
    if (data.imdbRating && data.imdbRating !== 'N/A') {
      ratings.imdb_rating = parseFloat(data.imdbRating);
    }

    // Parse Ratings array for RT and Metacritic
    if (Array.isArray(data.Ratings)) {
      for (const r of data.Ratings) {
        if (r.Source === 'Rotten Tomatoes' && r.Value) {
          const pct = parseInt(r.Value);
          if (!isNaN(pct)) ratings.rotten_tomatoes_rating = pct;
        }
        if (r.Source === 'Metacritic' && r.Value) {
          const score = parseInt(r.Value);
          if (!isNaN(score)) ratings.metacritic_rating = score;
        }
      }
    }

    // Fallback: Metacritic from top-level field
    if (!ratings.metacritic_rating && data.Metascore && data.Metascore !== 'N/A') {
      ratings.metacritic_rating = parseInt(data.Metascore);
    }

    return Object.keys(ratings).length > 0 ? ratings : null;
  } catch (error) {
    console.error(`OMDb error for ${imdbId}:`, error);
    return null;
  }
}

/**
 * Batch enrich items with OMDb ratings
 * Processes in batches to respect rate limits
 * @param {Array} items - Content items with imdb_id field
 * @param {string} apiKey - OMDb API key
 * @param {number} batchSize - Concurrent requests per batch
 * @returns {Promise<Array>} Items enriched with ratings
 */
export async function enrichWithOMDbRatings(items, apiKey, batchSize = 5) {
  if (!apiKey || !items || items.length === 0) return items;

  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const enriched = await Promise.all(
      batch.map(async (item) => {
        if (!item.imdb_id) return item;

        const ratings = await getOMDbRatings(item.imdb_id, apiKey);
        if (!ratings) return item;

        return {
          ...item,
          imdb_rating: ratings.imdb_rating || item.imdb_rating || null,
          rotten_tomatoes_rating: ratings.rotten_tomatoes_rating || null,
          metacritic_rating: ratings.metacritic_rating || null
        };
      })
    );
    results.push(...enriched);
  }

  return results;
}
