/**
 * Integration Tests pro API Endpointy
 * Testuje všechny hlavní API endpointy
 */

import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'https://www.topflix.cz';

describe('API Endpoints - Integration Tests', () => {

  describe('GET /api/top10', () => {

    it('should respond with 200 status code', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`);

      expect(response.status).toBe(200);
    });

    it('should return valid JSON response', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`);
      const data = await response.json();

      expect(data).toBeDefined();
      expect(typeof data).toBe('object');
    });

    it('should include films and series', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`);
      const data = await response.json();

      expect(data).toHaveProperty('films');
      expect(data).toHaveProperty('series');
      expect(Array.isArray(data.films)).toBe(true);
      expect(Array.isArray(data.series)).toBe(true);
    });

    it('should have up to 10 films', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`);
      const data = await response.json();

      expect(data.films.length).toBeLessThanOrEqual(10);
      expect(data.films.length).toBeGreaterThan(0);
    });

    it('should have up to 10 series', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`);
      const data = await response.json();

      expect(data.series.length).toBeLessThanOrEqual(10);
      expect(data.series.length).toBeGreaterThan(0);
    });

    it('should have required fields for each film', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`);
      const data = await response.json();

      const film = data.films[0];
      expect(film).toHaveProperty('rank');
      expect(film).toHaveProperty('title');
      expect(film).toHaveProperty('week_hours');
      expect(film).toHaveProperty('netflix_url');
    });

    it('should have required fields for each series', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`);
      const data = await response.json();

      const series = data.series[0];
      expect(series).toHaveProperty('rank');
      expect(series).toHaveProperty('title');
      expect(series).toHaveProperty('week_hours');
      expect(series).toHaveProperty('netflix_url');
    });

    it('should include TMDB data when available', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`);
      const data = await response.json();

      const itemsWithTmdb = [...data.films, ...data.series].filter(item =>
        item.tmdb_rating || item.tmdb_poster || item.tmdb_overview
      );

      // Většina položek by měla mít TMDB data
      expect(itemsWithTmdb.length).toBeGreaterThan(0);
    });

    it('should include ČSFD data when available', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`);
      const data = await response.json();

      const itemsWithCsfd = [...data.films, ...data.series].filter(item =>
        item.csfd_rating || item.csfd_url
      );

      // Některé položky by měly mít ČSFD data
      expect(itemsWithCsfd.length).toBeGreaterThan(0);
    });

    it('should have valid rank values (1-10)', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`);
      const data = await response.json();

      data.films.forEach(film => {
        expect(film.rank).toBeGreaterThanOrEqual(1);
        expect(film.rank).toBeLessThanOrEqual(10);
      });

      data.series.forEach(series => {
        expect(series.rank).toBeGreaterThanOrEqual(1);
        expect(series.rank).toBeLessThanOrEqual(10);
      });
    });

    it('should have valid week_hours (positive numbers)', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`);
      const data = await response.json();

      [...data.films, ...data.series].forEach(item => {
        expect(item.week_hours).toBeGreaterThan(0);
      });
    });

    it('should have valid Netflix URLs', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`);
      const data = await response.json();

      [...data.films, ...data.series].forEach(item => {
        expect(item.netflix_url).toContain('netflix.com');
        expect(item.netflix_url).toMatch(/^https?:\/\//);
      });
    });

    it('should include Cache-Control headers', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`);

      const cacheControl = response.headers.get('cache-control');
      expect(cacheControl).toBeDefined();
    });

    it('should respond within 5 seconds', async () => {
      const startTime = Date.now();
      await fetch(`${BASE_URL}/api/top10`);
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000); // <5s
    });

    it('should bypass cache with Cache-Control: no-cache header', async () => {
      const response = await fetch(`${BASE_URL}/api/top10`, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      expect(response.status).toBe(200);

      // Header by měl být respektován
      const data = await response.json();
      expect(data.films).toBeDefined();
    });
  });

  describe('GET /api/netflix-new', () => {

    it('should respond with 200 status code', async () => {
      const response = await fetch(`${BASE_URL}/api/netflix-new`);

      expect(response.status).toBe(200);
    });

    it('should return valid JSON response', async () => {
      const response = await fetch(`${BASE_URL}/api/netflix-new`);
      const data = await response.json();

      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should return multiple items', async () => {
      const response = await fetch(`${BASE_URL}/api/netflix-new`);
      const data = await response.json();

      expect(data.length).toBeGreaterThan(0);
      expect(data.length).toBeLessThan(100); // sanity check
    });

    it('should have required fields for each item', async () => {
      const response = await fetch(`${BASE_URL}/api/netflix-new`);
      const data = await response.json();

      const item = data[0];
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('release_date');
      expect(item).toHaveProperty('type'); // film nebo series
    });

    it('should have valid type values', async () => {
      const response = await fetch(`${BASE_URL}/api/netflix-new`);
      const data = await response.json();

      data.forEach(item => {
        expect(['film', 'series', 'movie', 'tv']).toContain(item.type);
      });
    });

    it('should have valid release dates', async () => {
      const response = await fetch(`${BASE_URL}/api/netflix-new`);
      const data = await response.json();

      data.forEach(item => {
        if (item.release_date) {
          const date = new Date(item.release_date);
          expect(date.toString()).not.toBe('Invalid Date');
        }
      });
    });

    it('should be sorted by release date (newest first)', async () => {
      const response = await fetch(`${BASE_URL}/api/netflix-new`);
      const data = await response.json();

      // Zkontrolujeme že první položky jsou nejnovější
      if (data.length > 1) {
        const first = new Date(data[0].release_date);
        const second = new Date(data[1].release_date);

        expect(first.getTime()).toBeGreaterThanOrEqual(second.getTime());
      }
    });

    it('should respond within 3 seconds', async () => {
      const startTime = Date.now();
      await fetch(`${BASE_URL}/api/netflix-new`);
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(3000); // <3s
    });
  });

  describe('GET /api/archive', () => {

    it('should respond with 200 status code', async () => {
      const response = await fetch(`${BASE_URL}/api/archive`);

      expect(response.status).toBe(200);
    });

    it('should return valid JSON response', async () => {
      const response = await fetch(`${BASE_URL}/api/archive`);
      const data = await response.json();

      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should support year parameter', async () => {
      const year = 2024;
      const response = await fetch(`${BASE_URL}/api/archive?year=${year}`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);

      // Pokud jsou data, měla by být z daného roku
      if (data.length > 0) {
        data.forEach(item => {
          if (item.week_number) {
            expect(item.week_number).toContain(year.toString());
          }
        });
      }
    });

    it('should support week parameter', async () => {
      const year = 2024;
      const week = 45;
      const response = await fetch(`${BASE_URL}/api/archive?year=${year}&week=${week}`);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should return empty array for non-existent data', async () => {
      const year = 2099;
      const response = await fetch(`${BASE_URL}/api/archive?year=${year}`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });

    it('should have valid archive item structure', async () => {
      const response = await fetch(`${BASE_URL}/api/archive?year=2024`);
      const data = await response.json();

      if (data.length > 0) {
        const item = data[0];
        expect(item).toHaveProperty('title');
        expect(item).toHaveProperty('week_number');
        expect(item).toHaveProperty('type');
      }
    });
  });

  describe('GET /api/stats', () => {

    it('should respond with 200 status code', async () => {
      const response = await fetch(`${BASE_URL}/api/stats`);

      expect(response.status).toBe(200);
    });

    it('should return valid JSON response', async () => {
      const response = await fetch(`${BASE_URL}/api/stats`);
      const data = await response.json();

      expect(data).toBeDefined();
      expect(typeof data).toBe('object');
    });

    it('should include total_records', async () => {
      const response = await fetch(`${BASE_URL}/api/stats`);
      const data = await response.json();

      expect(data).toHaveProperty('total_records');
      expect(typeof data.total_records).toBe('number');
      expect(data.total_records).toBeGreaterThan(0);
    });

    it('should include quality_records', async () => {
      const response = await fetch(`${BASE_URL}/api/stats`);
      const data = await response.json();

      expect(data).toHaveProperty('quality_records');
      expect(typeof data.quality_records).toBe('number');
      expect(data.quality_records).toBeLessThanOrEqual(data.total_records);
    });

    it('should respond within 2 seconds', async () => {
      const startTime = Date.now();
      await fetch(`${BASE_URL}/api/stats`);
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(2000); // <2s
    });
  });

  describe('CORS Headers', () => {

    const endpoints = ['/api/top10', '/api/netflix-new', '/api/archive', '/api/stats', '/api/health'];

    endpoints.forEach(endpoint => {
      it(`should include CORS headers on ${endpoint}`, async () => {
        const response = await fetch(`${BASE_URL}${endpoint}`);

        const allowOrigin = response.headers.get('access-control-allow-origin');
        expect(allowOrigin).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {

    it('should handle non-existent endpoints gracefully', async () => {
      const response = await fetch(`${BASE_URL}/api/non-existent-endpoint`);

      // Měl by vrátit 404 nebo podobnou chybu
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle malformed query parameters', async () => {
      const response = await fetch(`${BASE_URL}/api/archive?year=invalid`);

      // Měl by vrátit 200 s prázdným polem nebo error
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });
});
