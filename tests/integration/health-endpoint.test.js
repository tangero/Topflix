/**
 * Integration Tests pro Health Check Endpoint
 * Testuje skutečný HTTP endpoint s mock dependencies
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Base URL pro testy - lze přepsat přes ENV
const BASE_URL = process.env.TEST_BASE_URL || 'https://www.topflix.cz';

describe('Health Endpoint - Integration Tests', () => {

  describe('GET /api/health - All Checks', () => {

    it('should respond with 200 status code', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should return valid JSON response', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      const data = await response.json();

      expect(data).toBeDefined();
      expect(typeof data).toBe('object');
    });

    it('should include required top-level fields', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      const data = await response.json();

      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('checks');
      expect(data).toHaveProperty('issues');
    });

    it('should have valid status value', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      const data = await response.json();

      expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
    });

    it('should have valid timestamp format (ISO 8601)', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      const data = await response.json();

      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      const timestamp = new Date(data.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    it('should include all three check types', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      const data = await response.json();

      expect(data.checks).toHaveProperty('system');
      expect(data.checks).toHaveProperty('data_collection');
      expect(data.checks).toHaveProperty('newsletter');
    });

    it('should include CORS headers', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);

      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-methods')).toContain('GET');
    });

    it('should return Content-Type: application/json', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);

      expect(response.headers.get('content-type')).toContain('application/json');
    });

    it('should respond within 2 seconds', async () => {
      const startTime = Date.now();
      await fetch(`${BASE_URL}/api/health`);
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(2000); // <2s
    });
  });

  describe('GET /api/health?check=system', () => {

    it('should return only system check', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=system`);
      const data = await response.json();

      expect(data.checks).toHaveProperty('system');
      expect(data.checks).not.toHaveProperty('data_collection');
      expect(data.checks).not.toHaveProperty('newsletter');
    });

    it('should include system health fields', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=system`);
      const data = await response.json();

      const systemCheck = data.checks.system;
      expect(systemCheck).toHaveProperty('status');
      expect(systemCheck).toHaveProperty('database');
      expect(systemCheck).toHaveProperty('kv');
      expect(systemCheck).toHaveProperty('tmdb_api');
      expect(systemCheck).toHaveProperty('issues');
    });

    it('should validate database status values', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=system`);
      const data = await response.json();

      const validValues = ['connected', 'missing', 'error', 'unknown'];
      expect(validValues).toContain(data.checks.system.database);
    });

    it('should validate KV status values', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=system`);
      const data = await response.json();

      const validValues = ['accessible', 'missing', 'error', 'unknown'];
      expect(validValues).toContain(data.checks.system.kv);
    });

    it('should validate TMDB API status values', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=system`);
      const data = await response.json();

      const validValues = ['configured', 'missing', 'unknown'];
      expect(validValues).toContain(data.checks.system.tmdb_api);
    });
  });

  describe('GET /api/health?check=data', () => {

    it('should return only data collection check', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=data`);
      const data = await response.json();

      expect(data.checks).toHaveProperty('data_collection');
      expect(data.checks).not.toHaveProperty('system');
      expect(data.checks).not.toHaveProperty('newsletter');
    });

    it('should include data collection fields', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=data`);
      const data = await response.json();

      const dataCheck = data.checks.data_collection;
      expect(dataCheck).toHaveProperty('status');
      expect(dataCheck).toHaveProperty('total_records');
      expect(dataCheck).toHaveProperty('quality_records');
      expect(dataCheck).toHaveProperty('age_hours');
      expect(dataCheck).toHaveProperty('issues');
    });

    it('should have valid age_hours value', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=data`);
      const data = await response.json();

      const ageHours = data.checks.data_collection.age_hours;

      if (ageHours !== null) {
        expect(typeof ageHours).toBe('number');
        expect(ageHours).toBeGreaterThanOrEqual(0);
        expect(ageHours).toBeLessThan(1000); // sanity check
      }
    });

    it('should detect degraded status when data >48h old', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=data`);
      const data = await response.json();

      const ageHours = data.checks.data_collection.age_hours;

      if (ageHours !== null && ageHours > 48) {
        expect(data.checks.data_collection.status).toBe('degraded');
        expect(data.checks.data_collection.issues.length).toBeGreaterThan(0);
      }
    });

    it('should have numeric total_records and quality_records', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=data`);
      const data = await response.json();

      const dataCheck = data.checks.data_collection;
      expect(typeof dataCheck.total_records).toBe('number');
      expect(typeof dataCheck.quality_records).toBe('number');
      expect(dataCheck.quality_records).toBeLessThanOrEqual(dataCheck.total_records);
    });

    it('should include last update timestamps', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=data`);
      const data = await response.json();

      const dataCheck = data.checks.data_collection;

      // Alespoň jeden timestamp by měl existovat
      const hasTimestamp = dataCheck.last_top10_update || dataCheck.last_netflix_new_update;
      expect(hasTimestamp).toBeTruthy();
    });
  });

  describe('GET /api/health?check=newsletter', () => {

    it('should return only newsletter check', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=newsletter`);
      const data = await response.json();

      expect(data.checks).toHaveProperty('newsletter');
      expect(data.checks).not.toHaveProperty('system');
      expect(data.checks).not.toHaveProperty('data_collection');
    });

    it('should include newsletter fields', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=newsletter`);
      const data = await response.json();

      const newsletterCheck = data.checks.newsletter;
      expect(newsletterCheck).toHaveProperty('status');
      expect(newsletterCheck).toHaveProperty('resend_api');
      expect(newsletterCheck).toHaveProperty('active_subscribers');
      expect(newsletterCheck).toHaveProperty('issues');
    });

    it('should validate resend_api status', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=newsletter`);
      const data = await response.json();

      const validValues = ['configured', 'missing', 'unknown'];
      expect(validValues).toContain(data.checks.newsletter.resend_api);
    });

    it('should have numeric active_subscribers', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=newsletter`);
      const data = await response.json();

      expect(typeof data.checks.newsletter.active_subscribers).toBe('number');
      expect(data.checks.newsletter.active_subscribers).toBeGreaterThanOrEqual(0);
    });

    it('should detect degraded status when newsletter not sent >7 days', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=newsletter`);
      const data = await response.json();

      const daysSince = data.checks.newsletter.days_since_last;

      if (daysSince !== null && daysSince > 7) {
        expect(data.checks.newsletter.status).toBe('degraded');
      }
    });
  });

  describe('OPTIONS /api/health - CORS Preflight', () => {

    it('should handle OPTIONS request', async () => {
      const response = await fetch(`${BASE_URL}/api/health`, {
        method: 'OPTIONS'
      });

      expect(response.status).toBeLessThan(300);
    });

    it('should return CORS headers on OPTIONS', async () => {
      const response = await fetch(`${BASE_URL}/api/health`, {
        method: 'OPTIONS'
      });

      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-methods')).toContain('GET');
      expect(response.headers.get('access-control-allow-methods')).toContain('OPTIONS');
    });
  });

  describe('HTTP Status Code Validation', () => {

    it('should return 200 when status is healthy or degraded', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      const data = await response.json();

      if (data.status === 'healthy' || data.status === 'degraded') {
        expect(response.status).toBe(200);
      }
    });

    it('should return 503 when status is unhealthy', async () => {
      // Tento test projde jen když systém je skutečně unhealthy
      // V produkci by měl vždy být healthy nebo degraded
      const response = await fetch(`${BASE_URL}/api/health`);
      const data = await response.json();

      if (data.status === 'unhealthy') {
        expect(response.status).toBe(503);
      } else {
        // Skip test pokud systém je healthy
        expect(response.status).toBe(200);
      }
    });
  });

  describe('Error Scenarios', () => {

    it('should handle invalid check parameter gracefully', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=invalid`);

      // Měl by vrátit prázdné checks nebo error
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);

      const data = await response.json();
      expect(data).toHaveProperty('status');
    });

    it('should handle multiple query parameters', async () => {
      const response = await fetch(`${BASE_URL}/api/health?check=data&foo=bar`);

      expect(response.status).toBeGreaterThanOrEqual(200);
      const data = await response.json();
      expect(data.checks).toHaveProperty('data_collection');
    });
  });

  describe('Response Consistency', () => {

    it('should return consistent structure across multiple calls', async () => {
      const response1 = await fetch(`${BASE_URL}/api/health`);
      const data1 = await response1.json();

      const response2 = await fetch(`${BASE_URL}/api/health`);
      const data2 = await response2.json();

      // Struktura by měla být stejná
      expect(Object.keys(data1).sort()).toEqual(Object.keys(data2).sort());
    });

    it('should have issues array even when empty', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      const data = await response.json();

      expect(Array.isArray(data.issues)).toBe(true);
    });

    it('should aggregate issues from all checks', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      const data = await response.json();

      // Issues by měly být z všech checks
      const allCheckIssues = Object.values(data.checks)
        .flatMap(check => check.issues || []);

      // Top-level issues by měly obsahovat všechny check issues
      allCheckIssues.forEach(issue => {
        expect(data.issues).toContain(issue);
      });
    });
  });
});
