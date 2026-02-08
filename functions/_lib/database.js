/**
 * Topflix Database Access Layer
 * Provides optimized access to D1 database with KV caching
 */

export class TopflixDatabase {
  constructor(db, kv) {
    this.db = db;
    this.kv = kv;
  }

  /**
   * Batch upsert content items (movies/series)
   * Uses INSERT OR REPLACE for efficient upserts
   * @param {Array} items - Array of content items
   * @returns {Promise<Object>} Result with counts
   */
  async upsertContentBatch(items) {
    if (!items || items.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    const batch = [];
    const currentDate = new Date().toISOString().split('T')[0];

    for (const item of items) {
      // Calculate quality tier from avg_rating
      let qualityTier = 'below_average';
      if (item.avg_rating >= 80) qualityTier = 'excellent';
      else if (item.avg_rating >= 70) qualityTier = 'good';
      else if (item.avg_rating >= 50) qualityTier = 'average';
      else if (item.avg_rating < 50 && item.avg_rating >= 30) qualityTier = 'below_average';
      else qualityTier = 'poor';

      // Detect regional content (Asian/Latin American)
      const isRegional = this._isRegionalContent(item.origin_country, item.title_original);

      batch.push({
        stmt: `
          INSERT INTO content (
            tmdb_id, type, title, title_original, year, genre,
            avg_rating, tmdb_rating, csfd_rating, quality_tier,
            poster_url, description, runtime,
            number_of_seasons, number_of_episodes,
            origin_country, is_regional,
            first_seen, last_seen, appearances, last_rank, last_source,
            tmdb_url, imdb_id, imdb_rating, rotten_tomatoes_rating,
            metacritic_rating, streaming_providers, updated_at
          ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
            ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, 1, ?20, ?21, ?22,
            ?23, ?24, ?25, ?26, ?27, unixepoch()
          )
          ON CONFLICT(tmdb_id, type) DO UPDATE SET
            title = excluded.title,
            title_original = excluded.title_original,
            year = excluded.year,
            genre = excluded.genre,
            avg_rating = excluded.avg_rating,
            tmdb_rating = excluded.tmdb_rating,
            csfd_rating = excluded.csfd_rating,
            quality_tier = excluded.quality_tier,
            poster_url = excluded.poster_url,
            description = excluded.description,
            runtime = excluded.runtime,
            number_of_seasons = excluded.number_of_seasons,
            number_of_episodes = excluded.number_of_episodes,
            origin_country = excluded.origin_country,
            is_regional = excluded.is_regional,
            last_seen = excluded.last_seen,
            appearances = CASE
              WHEN last_seen < ?19 THEN appearances + 1
              ELSE appearances
            END,
            last_rank = excluded.last_rank,
            last_source = excluded.last_source,
            tmdb_url = excluded.tmdb_url,
            imdb_id = COALESCE(excluded.imdb_id, imdb_id),
            imdb_rating = COALESCE(excluded.imdb_rating, imdb_rating),
            rotten_tomatoes_rating = COALESCE(excluded.rotten_tomatoes_rating, rotten_tomatoes_rating),
            metacritic_rating = COALESCE(excluded.metacritic_rating, metacritic_rating),
            streaming_providers = COALESCE(excluded.streaming_providers, streaming_providers),
            updated_at = unixepoch()
        `,
        params: [
          item.tmdb_id,                    // ?1
          item.type,                       // ?2
          item.title,                      // ?3
          item.title_original || null,     // ?4
          item.year || null,               // ?5
          item.genre || null,              // ?6
          item.avg_rating || null,         // ?7
          item.tmdb_rating || null,        // ?8
          item.csfd_rating || null,        // ?9
          qualityTier,                     // ?10
          item.poster_url || null,         // ?11
          item.description || null,        // ?12
          item.runtime || null,            // ?13
          item.number_of_seasons || null,  // ?14
          item.number_of_episodes || null, // ?15
          JSON.stringify(item.origin_country || []), // ?16
          isRegional ? 1 : 0,              // ?17
          currentDate,                     // ?18 first_seen (used in conflict check)
          currentDate,                     // ?19 last_seen
          item.rank || null,               // ?20
          item.source || 'top10',          // ?21
          item.tmdb_url || null,           // ?22
          item.imdb_id || null,            // ?23
          item.imdb_rating || null,        // ?24
          item.rotten_tomatoes_rating || null, // ?25
          item.metacritic_rating || null,  // ?26
          JSON.stringify(item.providers || []) // ?27
        ]
      });

      // Also insert into appearance_history (ignore duplicates for same day+source)
      batch.push({
        stmt: `
          INSERT OR IGNORE INTO appearance_history (
            tmdb_id, type, date, source, rank, rating
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        `,
        params: [
          item.tmdb_id,
          item.type,
          currentDate,
          item.source || 'top10',
          item.rank || null,
          item.avg_rating || 0
        ]
      });
    }

    try {
      // Convert batch to prepared statements
      const statements = batch.map(item =>
        this.db.prepare(item.stmt).bind(...item.params)
      );

      const result = await this.db.batch(statements);

      // Invalidate relevant caches
      await this._invalidateListCaches();

      return {
        inserted: items.length,
        updated: result.length,
        success: true
      };
    } catch (error) {
      console.error('Batch upsert failed:', error);
      throw error;
    }
  }

  /**
   * Get quality content (avg_rating >= 70%)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Quality content items
   */
  async getQualityContent(options = {}) {
    const {
      limit = 100,
      offset = 0,
      type = null,
      minRating = 70,
      excludeRegional = false,
      orderBy = 'rating' // 'rating' | 'recent' | 'popular'
    } = options;

    // Try cache first
    const cacheKey = `quality:${type}:${minRating}:${excludeRegional}:${orderBy}:${limit}:${offset}`;
    const cached = await this._getFromCache(cacheKey);
    if (cached) return cached;

    // Build query with explicit columns (avoid SELECT *)
    let query = `
      SELECT tmdb_id, type, title, title_original, year, genre,
             avg_rating, tmdb_rating, quality_tier, poster_url, description,
             runtime, number_of_seasons, number_of_episodes,
             origin_country, is_regional, first_seen, last_seen,
             appearances, last_rank, last_source, tmdb_url,
             imdb_id, imdb_rating, rotten_tomatoes_rating,
             metacritic_rating, streaming_providers
      FROM content
      WHERE avg_rating >= ?1
    `;
    const params = [minRating];

    if (type) {
      query += ' AND type = ?2';
      params.push(type);
    }

    if (excludeRegional) {
      query += ` AND is_regional = 0`;
    }

    // Order by
    switch (orderBy) {
      case 'recent':
        query += ' ORDER BY first_seen DESC, avg_rating DESC';
        break;
      case 'popular':
        query += ' ORDER BY appearances DESC, avg_rating DESC';
        break;
      case 'rating':
      default:
        query += ' ORDER BY avg_rating DESC, last_seen DESC';
    }

    query += ` LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`;
    params.push(limit, offset);

    try {
      const result = await this.db.prepare(query).bind(...params).all();
      const items = this._parseContentResults(result.results || []);

      // Cache for 1 hour
      await this._setCache(cacheKey, items, 3600);

      return items;
    } catch (error) {
      console.error('Failed to get quality content:', error);
      return [];
    }
  }

  /**
   * Get best all-time content (highly rated + multiple appearances)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Best content items
   */
  async getBestAllTime(options = {}) {
    const {
      limit = 50,
      type = null,
      minRating = 80,
      minAppearances = 1,
      excludeRegional = false
    } = options;

    const cacheKey = `best:${type}:${minRating}:${minAppearances}:${excludeRegional}:${limit}`;
    const cached = await this._getFromCache(cacheKey);
    if (cached) return cached;

    let query = `
      SELECT tmdb_id, type, title, title_original, year, genre,
             avg_rating, tmdb_rating, quality_tier, poster_url, description,
             runtime, number_of_seasons, number_of_episodes,
             origin_country, is_regional, first_seen, last_seen,
             appearances, last_rank, last_source, tmdb_url,
             imdb_id, imdb_rating, rotten_tomatoes_rating,
             metacritic_rating, streaming_providers
      FROM content
      WHERE avg_rating >= ?1 AND appearances >= ?2
    `;
    const params = [minRating, minAppearances];

    if (type) {
      query += ' AND type = ?3';
      params.push(type);
    }

    if (excludeRegional) {
      query += ' AND is_regional = 0';
    }

    query += ' ORDER BY avg_rating DESC, appearances DESC';
    query += ` LIMIT ?${params.length + 1}`;
    params.push(limit);

    try {
      const result = await this.db.prepare(query).bind(...params).all();
      const items = this._parseContentResults(result.results || []);

      // Cache for 6 hours (best content changes slowly)
      await this._setCache(cacheKey, items, 21600);

      return items;
    } catch (error) {
      console.error('Failed to get best content:', error);
      return [];
    }
  }

  /**
   * Get recent quality additions (first_seen in last N days)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Recent quality content
   */
  async getRecentQuality(options = {}) {
    const {
      limit = 50,
      type = null,
      days = 30,
      minRating = 70,
      excludeRegional = false
    } = options;

    const cacheKey = `recent:${type}:${days}:${minRating}:${excludeRegional}:${limit}`;
    const cached = await this._getFromCache(cacheKey);
    if (cached) return cached;

    let query = `
      SELECT tmdb_id, type, title, title_original, year, genre,
             avg_rating, tmdb_rating, quality_tier, poster_url, description,
             runtime, number_of_seasons, number_of_episodes,
             origin_country, is_regional, first_seen, last_seen,
             appearances, last_rank, last_source, tmdb_url,
             imdb_id, imdb_rating, rotten_tomatoes_rating,
             metacritic_rating, streaming_providers
      FROM content
      WHERE avg_rating >= ?1
        AND first_seen >= date('now', '-' || ?2 || ' days')
    `;
    const params = [minRating, days];

    if (type) {
      query += ' AND type = ?3';
      params.push(type);
    }

    if (excludeRegional) {
      query += ' AND is_regional = 0';
    }

    query += ' ORDER BY first_seen DESC, avg_rating DESC';
    query += ` LIMIT ?${params.length + 1}`;
    params.push(limit);

    try {
      const result = await this.db.prepare(query).bind(...params).all();
      const items = this._parseContentResults(result.results || []);

      // Cache for 1 hour
      await this._setCache(cacheKey, items, 3600);

      return items;
    } catch (error) {
      console.error('Failed to get recent quality:', error);
      return [];
    }
  }

  /**
   * Get content by TMDB ID
   * @param {number} tmdbId - TMDB ID
   * @param {string} type - 'movie' or 'series'
   * @returns {Promise<Object|null>} Content item or null
   */
  async getContentById(tmdbId, type) {
    const cacheKey = `content:${tmdbId}:${type}`;
    const cached = await this._getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const result = await this.db
        .prepare(`SELECT tmdb_id, type, title, title_original, year, genre,
             avg_rating, tmdb_rating, quality_tier, poster_url, description,
             runtime, number_of_seasons, number_of_episodes,
             origin_country, is_regional, first_seen, last_seen,
             appearances, last_rank, last_source, tmdb_url
      FROM content WHERE tmdb_id = ?1 AND type = ?2`)
        .bind(tmdbId, type)
        .first();

      if (!result) return null;

      const item = this._parseContentItem(result);

      // Cache for 1 hour
      await this._setCache(cacheKey, item, 3600);

      return item;
    } catch (error) {
      console.error('Failed to get content by ID:', error);
      return null;
    }
  }

  /**
   * Get appearance history for a content item
   * @param {number} tmdbId - TMDB ID
   * @param {string} type - Content type
   * @param {number} limit - Max history entries
   * @returns {Promise<Array>} History entries
   */
  async getAppearanceHistory(tmdbId, type, limit = 50) {
    try {
      const result = await this.db
        .prepare(`
          SELECT tmdb_id, type, date, source, rank, rating FROM appearance_history
          WHERE tmdb_id = ?1 AND type = ?2
          ORDER BY date DESC
          LIMIT ?3
        `)
        .bind(tmdbId, type, limit)
        .all();

      return result.results || [];
    } catch (error) {
      console.error('Failed to get appearance history:', error);
      return [];
    }
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>} Database stats
   */
  async getStats() {
    const cacheKey = 'stats:overview';
    const cached = await this._getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const queries = [
        this.db.prepare('SELECT COUNT(*) as total FROM content').first(),
        this.db.prepare('SELECT COUNT(*) as count FROM content WHERE type = "movie"').first(),
        this.db.prepare('SELECT COUNT(*) as count FROM content WHERE type = "series"').first(),
        this.db.prepare('SELECT COUNT(*) as count FROM content WHERE avg_rating >= 70').first(),
        this.db.prepare('SELECT COUNT(*) as count FROM content WHERE avg_rating >= 80').first(),
        this.db.prepare('SELECT AVG(avg_rating) as avg FROM content WHERE avg_rating IS NOT NULL').first()
      ];

      const [total, movies, series, quality, excellent, avgRating] = await Promise.all(queries);

      const stats = {
        total: total.total || 0,
        movies: movies.count || 0,
        series: series.count || 0,
        quality: quality.count || 0,
        excellent: excellent.count || 0,
        avgRating: Math.round(avgRating.avg || 0)
      };

      // Cache for 5 minutes
      await this._setCache(cacheKey, stats, 300);

      return stats;
    } catch (error) {
      console.error('Failed to get stats:', error);
      return {
        total: 0,
        movies: 0,
        series: 0,
        quality: 0,
        excellent: 0,
        avgRating: 0
      };
    }
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  /**
   * Detect if content is regional (Asian/Latin American)
   * @private
   */
  _isRegionalContent(originCountry, titleOriginal) {
    const regionalCountries = [
      'KR', 'JP', 'CN', 'TW', 'TH', 'IN', 'ID', 'VN', 'PH', // Asian
      'MX', 'BR', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC' // Latin American
    ];

    // Check origin country
    if (Array.isArray(originCountry)) {
      if (originCountry.some(c => regionalCountries.includes(c))) {
        return true;
      }
    }

    // Check if title uses non-Latin characters (Korean, Japanese, Chinese)
    if (titleOriginal) {
      const hasAsianChars = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(titleOriginal);
      if (hasAsianChars) return true;
    }

    return false;
  }

  /**
   * Parse content results from D1
   * @private
   */
  _parseContentResults(results) {
    return results.map(item => this._parseContentItem(item));
  }

  /**
   * Parse single content item
   * @private
   */
  _parseContentItem(item) {
    return {
      ...item,
      origin_country: item.origin_country ? JSON.parse(item.origin_country) : [],
      streaming_providers: item.streaming_providers ? JSON.parse(item.streaming_providers) : [],
      is_regional: item.is_regional === 1
    };
  }

  /**
   * Get current cache version (lazy-loaded, cached per request)
   * @private
   */
  async _getCacheVersion() {
    if (this._cacheVersion !== undefined) return this._cacheVersion;

    try {
      this._cacheVersion = parseInt(await this.kv.get('db:cache_version') || '0');
    } catch {
      this._cacheVersion = 0;
    }
    return this._cacheVersion;
  }

  /**
   * Get from KV cache (versioned)
   * @private
   */
  async _getFromCache(key) {
    if (!this.kv) return null;

    try {
      const version = await this._getCacheVersion();
      const cached = await this.kv.get(`db:v${version}:${key}`, 'json');
      return cached;
    } catch (error) {
      console.error('Cache read error:', error);
      return null;
    }
  }

  /**
   * Set to KV cache (versioned)
   * @private
   */
  async _setCache(key, value, ttl = 3600) {
    if (!this.kv) return;

    try {
      const version = await this._getCacheVersion();
      await this.kv.put(`db:v${version}:${key}`, JSON.stringify(value), {
        expirationTtl: ttl
      });
    } catch (error) {
      console.error('Cache write error:', error);
    }
  }

  /**
   * Invalidate list caches after data updates using versioned cache keys.
   * Bumps a version counter in KV so all old cache keys become stale.
   * @private
   */
  async _invalidateListCaches() {
    if (!this.kv) return;

    try {
      const currentVersion = parseInt(await this.kv.get('db:cache_version') || '0');
      await this.kv.put('db:cache_version', String(currentVersion + 1), {
        expirationTtl: 604800 // 7 days
      });
      this._cacheVersion = currentVersion + 1;
      console.log(`Cache invalidated: version bumped to ${currentVersion + 1}`);
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }
}

/**
 * Factory function to create database instance
 * @param {Object} env - Cloudflare environment bindings
 * @returns {TopflixDatabase} Database instance
 */
export function createDatabase(env) {
  return new TopflixDatabase(env.DB, env.TOPFLIX_KV);
}
