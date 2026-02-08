/**
 * Topflix - Rating Calculation Utilities
 * Weighted average from multiple sources: TMDB 30%, IMDb 30%, RT 25%, MC 15%
 */

// Weight configuration for each rating source
const WEIGHTS = {
  tmdb: 0.30,
  imdb: 0.30,
  rt: 0.25,
  mc: 0.15
};

/**
 * Calculate weighted average rating from multiple sources.
 * All ratings are normalized to 0-100 scale.
 * Weights are re-normalized based on available sources.
 *
 * @param {Object} ratings - Rating values
 * @param {number|null} ratings.tmdb_rating - TMDB rating (0-10 scale)
 * @param {number|null} ratings.imdb_rating - IMDb rating (0-10 scale)
 * @param {number|null} ratings.rotten_tomatoes_rating - Rotten Tomatoes (0-100 scale)
 * @param {number|null} ratings.metacritic_rating - Metacritic (0-100 scale)
 * @returns {number|null} Weighted average on 0-100 scale, or null if no ratings
 */
export function calculateWeightedRating(ratings) {
  const sources = [];

  if (ratings.tmdb_rating && ratings.tmdb_rating > 0) {
    sources.push({ value: ratings.tmdb_rating * 10, weight: WEIGHTS.tmdb });
  }

  if (ratings.imdb_rating && ratings.imdb_rating > 0) {
    sources.push({ value: ratings.imdb_rating * 10, weight: WEIGHTS.imdb });
  }

  if (ratings.rotten_tomatoes_rating && ratings.rotten_tomatoes_rating > 0) {
    sources.push({ value: ratings.rotten_tomatoes_rating, weight: WEIGHTS.rt });
  }

  if (ratings.metacritic_rating && ratings.metacritic_rating > 0) {
    sources.push({ value: ratings.metacritic_rating, weight: WEIGHTS.mc });
  }

  if (sources.length === 0) return null;

  // Normalize weights to sum to 1.0
  const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0);
  const weightedSum = sources.reduce((sum, s) => sum + (s.value * s.weight / totalWeight), 0);

  return Math.round(weightedSum);
}

/**
 * Get quality tier string based on rating
 * @param {number|null} avgRating - Rating on 0-100 scale
 * @returns {string} Quality tier
 */
export function getQualityTier(avgRating) {
  if (!avgRating) return 'poor';
  if (avgRating >= 80) return 'excellent';
  if (avgRating >= 70) return 'good';
  if (avgRating >= 60) return 'average';
  if (avgRating >= 50) return 'below-average';
  return 'poor';
}
