/**
 * E2E Tests pro Data Freshness Monitoring
 * Kontroluje stáří dat v produkci
 */

import { describe, it, expect } from 'vitest';

const PRODUCTION_URL = 'https://www.topflix.cz';
const MAX_DATA_AGE_HOURS = 72; // Critical threshold
const WARN_DATA_AGE_HOURS = 48; // Warning threshold

describe('E2E - Data Freshness Monitoring', () => {

  describe('Critical Data Age Check', () => {

    it('should have data younger than 72 hours (CRITICAL)', async () => {
      const response = await fetch(`${PRODUCTION_URL}/api/health?check=data`);
      const data = await response.json();

      const ageHours = data.checks.data_collection.age_hours;

      if (ageHours !== null) {
        expect(ageHours).toBeLessThan(MAX_DATA_AGE_HOURS);

        if (ageHours >= MAX_DATA_AGE_HOURS) {
          console.error(`CRITICAL: Data is ${ageHours} hours old (threshold: ${MAX_DATA_AGE_HOURS}h)`);
          console.error('Last TOP10 update:', data.checks.data_collection.last_top10_update);
          console.error('Last Netflix New update:', data.checks.data_collection.last_netflix_new_update);
        }
      }
    }, { timeout: 10000 });

    it('should warn when data is older than 48 hours', async () => {
      const response = await fetch(`${PRODUCTION_URL}/api/health?check=data`);
      const data = await response.json();

      const ageHours = data.checks.data_collection.age_hours;

      if (ageHours !== null && ageHours > WARN_DATA_AGE_HOURS) {
        console.warn(`WARNING: Data is ${ageHours} hours old (threshold: ${WARN_DATA_AGE_HOURS}h)`);
        console.warn('Status:', data.checks.data_collection.status);
        console.warn('Issues:', data.checks.data_collection.issues);

        // Není hard failure, jen warning
        expect(ageHours).toBeLessThan(MAX_DATA_AGE_HOURS);
      }
    }, { timeout: 10000 });
  });

  describe('Data Collection Status', () => {

    it('should not be in unhealthy state', async () => {
      const response = await fetch(`${PRODUCTION_URL}/api/health?check=data`);
      const data = await response.json();

      expect(data.checks.data_collection.status).not.toBe('unhealthy');

      if (data.checks.data_collection.status === 'unhealthy') {
        console.error('UNHEALTHY STATE DETECTED');
        console.error('Issues:', data.checks.data_collection.issues);
      }
    });

    it('should have sufficient database records', async () => {
      const response = await fetch(`${PRODUCTION_URL}/api/health?check=data`);
      const data = await response.json();

      expect(data.checks.data_collection.total_records).toBeGreaterThan(50);

      if (data.checks.data_collection.total_records < 50) {
        console.warn(`Low record count: ${data.checks.data_collection.total_records}`);
      }
    });

    it('should have quality records', async () => {
      const response = await fetch(`${PRODUCTION_URL}/api/health?check=data`);
      const data = await response.json();

      expect(data.checks.data_collection.quality_records).toBeGreaterThan(0);
    });

    it('should have last update timestamps', async () => {
      const response = await fetch(`${PRODUCTION_URL}/api/health?check=data`);
      const data = await response.json();

      const hasTop10 = data.checks.data_collection.last_top10_update !== null;
      const hasNetflixNew = data.checks.data_collection.last_netflix_new_update !== null;

      expect(hasTop10 || hasNetflixNew).toBe(true);

      if (!hasTop10) {
        console.warn('No TOP10 update timestamp found');
      }
      if (!hasNetflixNew) {
        console.warn('No Netflix New update timestamp found');
      }
    });
  });

  describe('Overall Health Status', () => {

    it('should not have unhealthy overall status', async () => {
      const response = await fetch(`${PRODUCTION_URL}/api/health`);
      const data = await response.json();

      expect(data.status).not.toBe('unhealthy');

      if (data.status === 'unhealthy') {
        console.error('SYSTEM UNHEALTHY');
        console.error('Issues:', data.issues);
        console.error('Checks:', JSON.stringify(data.checks, null, 2));
      }
    });

    it('should log warning when degraded', async () => {
      const response = await fetch(`${PRODUCTION_URL}/api/health`);
      const data = await response.json();

      if (data.status === 'degraded') {
        console.warn('SYSTEM DEGRADED');
        console.warn('Issues:', data.issues);

        // Degraded není failure, ale logujeme
        data.issues.forEach(issue => {
          console.warn(`- ${issue}`);
        });
      }

      // Degraded je OK, jen unhealthy je failure
      expect(['healthy', 'degraded']).toContain(data.status);
    });

    it('should have no critical system issues', async () => {
      const response = await fetch(`${PRODUCTION_URL}/api/health?check=system`);
      const data = await response.json();

      const system = data.checks.system;

      // Database musí fungovat
      expect(system.database).not.toBe('error');
      expect(system.database).not.toBe('missing');

      // TMDB API key musí být nakonfigurován
      expect(system.tmdb_api).toBe('configured');
    });
  });

  describe('Response Performance', () => {

    it('should respond to health check within 1 second', async () => {
      const startTime = Date.now();
      const response = await fetch(`${PRODUCTION_URL}/api/health?check=data`);
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(1000);

      if (duration > 500) {
        console.warn(`Slow response: ${duration}ms`);
      }
    });

    it('should respond to TOP10 API within 3 seconds', async () => {
      const startTime = Date.now();
      const response = await fetch(`${PRODUCTION_URL}/api/top10`);
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(3000);

      if (duration > 2000) {
        console.warn(`Slow TOP10 API: ${duration}ms`);
      }
    });
  });

  describe('Data Consistency', () => {

    it('should have consistent data across API calls', async () => {
      const healthResponse = await fetch(`${PRODUCTION_URL}/api/health?check=data`);
      const healthData = await healthResponse.json();

      const top10Response = await fetch(`${PRODUCTION_URL}/api/top10`);
      const top10Data = await top10Response.json();

      // Pokud health říká že máme data, TOP10 API by měl vrátit data
      if (healthData.checks.data_collection.total_records > 0) {
        expect(top10Data.films.length + top10Data.series.length).toBeGreaterThan(0);
      }
    });

    it('should have valid TOP10 data structure', async () => {
      const response = await fetch(`${PRODUCTION_URL}/api/top10`);
      const data = await response.json();

      expect(data.films).toBeDefined();
      expect(data.series).toBeDefined();
      expect(Array.isArray(data.films)).toBe(true);
      expect(Array.isArray(data.series)).toBe(true);
    });
  });
});

describe('E2E - Alert Scenarios', () => {

  it('should detect if data is extremely old (>96h)', async () => {
    const response = await fetch(`${PRODUCTION_URL}/api/health?check=data`);
    const data = await response.json();

    const ageHours = data.checks.data_collection.age_hours;

    if (ageHours !== null && ageHours > 96) {
      console.error('🚨 CRITICAL ALERT: Data is extremely old');
      console.error(`Age: ${ageHours} hours`);
      console.error('This indicates cron has not run for 4+ days');
      console.error('Action required: Check Cloudflare Workers dashboard');

      // Hard failure pro extremely old data
      expect(ageHours).toBeLessThan(96);
    }
  });

  it('should detect if cron last ran >7 days ago', async () => {
    const response = await fetch(`${PRODUCTION_URL}/api/health?check=data`);
    const data = await response.json();

    const ageHours = data.checks.data_collection.age_hours;

    if (ageHours !== null && ageHours > 168) { // 7 days
      console.error('🚨 CRITICAL: Cron has not run for >7 days');
      console.error(`Age: ${ageHours} hours (${Math.round(ageHours / 24)} days)`);

      // Velmi vážný problém
      expect(ageHours).toBeLessThan(168);
    }
  });

  it('should verify Tuesday cron execution (run on Tuesday 10:30 UTC)', async () => {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 2 = Tuesday
    const hour = now.getUTCHours();

    // Tento test by měl běžet jen v úterý mezi 10:30-11:30 UTC
    const isTuesdayPostCron = dayOfWeek === 2 && hour >= 10 && hour < 12;

    if (isTuesdayPostCron) {
      const response = await fetch(`${PRODUCTION_URL}/api/health?check=data`);
      const data = await response.json();

      const ageHours = data.checks.data_collection.age_hours;

      console.log(`Post-cron verification (Tuesday ${hour}:XX UTC)`);
      console.log(`Data age: ${ageHours} hours`);

      // Data by měla být fresh (< 2h)
      if (ageHours !== null) {
        expect(ageHours).toBeLessThan(2);

        if (ageHours > 2) {
          console.error('🚨 CRON FAILURE: Data not refreshed after scheduled run');
        }
      }
    } else {
      console.log('Skipping post-cron verification (not Tuesday post-cron time)');
    }
  }, { timeout: 10000 });
});

describe('E2E - Historical Data Tracking', () => {

  it('should log data age for monitoring', async () => {
    const response = await fetch(`${PRODUCTION_URL}/api/health?check=data`);
    const data = await response.json();

    console.log('=== Data Freshness Report ===');
    console.log('Timestamp:', data.timestamp);
    console.log('Age (hours):', data.checks.data_collection.age_hours);
    console.log('Total records:', data.checks.data_collection.total_records);
    console.log('Quality records:', data.checks.data_collection.quality_records);
    console.log('Status:', data.checks.data_collection.status);
    console.log('Issues:', data.checks.data_collection.issues);
    console.log('Last TOP10 update:', data.checks.data_collection.last_top10_update);
    console.log('Last Netflix New update:', data.checks.data_collection.last_netflix_new_update);
    console.log('============================');

    // Vždy úspěch - jen logování
    expect(true).toBe(true);
  });
});
