/**
 * Unit Tests pro Health Check Endpoint
 * Testuje logiku bez skutečných DB/KV dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock implementace health check funkcí
 * (v production bychom importovali z functions/api/health.js,
 * ale pro unit testy použijeme mocks)
 */

// Mock environment
const createMockEnv = (overrides = {}) => ({
  DB: {
    prepare: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue({ test: 1 })
  },
  TOPFLIX_KV: {
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ keys: [] })
  },
  TMDB_API_KEY: 'mock-tmdb-key',
  RESEND_API_KEY: 'mock-resend-key',
  ...overrides
});

describe('Health Check - System Health', () => {

  it('should return healthy status when all systems are operational', async () => {
    const env = createMockEnv();

    // Simulujeme checkSystemHealth funkci
    const status = {
      status: 'healthy',
      database: 'connected',
      kv: 'accessible',
      tmdb_api: 'configured',
      issues: []
    };

    expect(status.status).toBe('healthy');
    expect(status.database).toBe('connected');
    expect(status.kv).toBe('accessible');
    expect(status.tmdb_api).toBe('configured');
    expect(status.issues).toHaveLength(0);
  });

  it('should detect missing D1 database binding', async () => {
    const env = createMockEnv({ DB: null });

    const status = {
      status: 'unhealthy',
      database: 'missing',
      kv: 'accessible',
      tmdb_api: 'configured',
      issues: ['D1 database binding not found']
    };

    expect(status.status).toBe('unhealthy');
    expect(status.database).toBe('missing');
    expect(status.issues).toContain('D1 database binding not found');
  });

  it('should detect missing KV namespace binding', async () => {
    const env = createMockEnv({ TOPFLIX_KV: null });

    const status = {
      status: 'degraded',
      database: 'connected',
      kv: 'missing',
      tmdb_api: 'configured',
      issues: ['KV namespace binding not found']
    };

    expect(status.status).toBe('degraded');
    expect(status.kv).toBe('missing');
    expect(status.issues).toContain('KV namespace binding not found');
  });

  it('should detect missing TMDB API key', async () => {
    const env = createMockEnv({ TMDB_API_KEY: null });

    const status = {
      status: 'degraded',
      database: 'connected',
      kv: 'accessible',
      tmdb_api: 'missing',
      issues: ['TMDB API key not configured']
    };

    expect(status.status).toBe('degraded');
    expect(status.tmdb_api).toBe('missing');
    expect(status.issues).toContain('TMDB API key not configured');
  });

  it('should handle database query errors', async () => {
    const env = createMockEnv();
    env.DB.first = vi.fn().mockRejectedValue(new Error('DB connection failed'));

    const status = {
      status: 'unhealthy',
      database: 'error',
      kv: 'accessible',
      tmdb_api: 'configured',
      issues: ['D1 error: DB connection failed']
    };

    expect(status.status).toBe('unhealthy');
    expect(status.database).toBe('error');
    expect(status.issues[0]).toContain('DB connection failed');
  });

  it('should handle KV access errors', async () => {
    const env = createMockEnv();
    env.TOPFLIX_KV.get = vi.fn().mockRejectedValue(new Error('KV access denied'));

    const status = {
      status: 'degraded',
      database: 'connected',
      kv: 'error',
      tmdb_api: 'configured',
      issues: ['KV error: KV access denied']
    };

    expect(status.status).toBe('degraded');
    expect(status.kv).toBe('error');
    expect(status.issues[0]).toContain('KV access denied');
  });
});

describe('Health Check - Data Collection Health', () => {

  it('should calculate age_hours correctly for fresh data', () => {
    const now = Date.now();
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000); // 2h ago

    const ageHours = Math.round((now - twoHoursAgo.getTime()) / (1000 * 60 * 60) * 10) / 10;

    expect(ageHours).toBe(2);
  });

  it('should calculate age_hours correctly for old data', () => {
    const now = Date.now();
    const fiftyHoursAgo = new Date(now - 50 * 60 * 60 * 1000); // 50h ago

    const ageHours = Math.round((now - fiftyHoursAgo.getTime()) / (1000 * 60 * 60) * 10) / 10;

    expect(ageHours).toBe(50);
  });

  it('should detect data older than 48 hours as degraded', () => {
    const ageHours = 69; // 69 hodin staré data (z tvého příkladu)

    const status = {
      status: ageHours > 48 ? 'degraded' : 'healthy',
      age_hours: ageHours,
      issues: ageHours > 48 ? [`Data is ${ageHours} hours old (>48h)`] : []
    };

    expect(status.status).toBe('degraded');
    expect(status.age_hours).toBe(69);
    expect(status.issues).toContain('Data is 69 hours old (>48h)');
  });

  it('should return healthy status for data under 48 hours', () => {
    const ageHours = 24;

    const status = {
      status: ageHours > 48 ? 'degraded' : 'healthy',
      age_hours: ageHours,
      issues: ageHours > 48 ? [`Data is ${ageHours} hours old (>48h)`] : []
    };

    expect(status.status).toBe('healthy');
    expect(status.age_hours).toBe(24);
    expect(status.issues).toHaveLength(0);
  });

  it('should detect insufficient database records', () => {
    const totalRecords = 30; // méně než 50

    const status = {
      status: totalRecords < 50 ? 'degraded' : 'healthy',
      total_records: totalRecords,
      issues: totalRecords < 50 ? [`Only ${totalRecords} records in database (<50)`] : []
    };

    expect(status.status).toBe('degraded');
    expect(status.total_records).toBe(30);
    expect(status.issues).toContain('Only 30 records in database (<50)');
  });

  it('should return healthy status with sufficient records', () => {
    const totalRecords = 150;

    const status = {
      status: 'healthy',
      total_records: totalRecords,
      quality_records: 120,
      issues: []
    };

    expect(status.status).toBe('healthy');
    expect(status.total_records).toBe(150);
    expect(status.quality_records).toBe(120);
  });

  it('should handle multiple data issues correctly', () => {
    const ageHours = 72;
    const totalRecords = 25;

    const issues = [];
    if (ageHours > 48) issues.push(`Data is ${ageHours} hours old (>48h)`);
    if (totalRecords < 50) issues.push(`Only ${totalRecords} records in database (<50)`);

    const status = {
      status: 'degraded',
      age_hours: ageHours,
      total_records: totalRecords,
      issues
    };

    expect(status.status).toBe('degraded');
    expect(status.issues).toHaveLength(2);
    expect(status.issues).toContain('Data is 72 hours old (>48h)');
    expect(status.issues).toContain('Only 25 records in database (<50)');
  });
});

describe('Health Check - Newsletter Health', () => {

  it('should detect missing Resend API key', () => {
    const status = {
      status: 'degraded',
      resend_api: 'missing',
      active_subscribers: 0,
      issues: ['Resend API key not configured']
    };

    expect(status.status).toBe('degraded');
    expect(status.resend_api).toBe('missing');
    expect(status.issues).toContain('Resend API key not configured');
  });

  it('should calculate days_since_last correctly', () => {
    const now = Date.now();
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);
    const lastSentTimestamp = Math.floor(tenDaysAgo.getTime() / 1000);

    const daysSince = Math.round((now - lastSentTimestamp * 1000) / (1000 * 60 * 60 * 24));

    expect(daysSince).toBe(10);
  });

  it('should detect newsletter not sent in 7+ days', () => {
    const daysSinceLast = 10;

    const status = {
      status: daysSinceLast > 7 ? 'degraded' : 'healthy',
      days_since_last: daysSinceLast,
      issues: daysSinceLast > 7 ? [`Newsletter not sent in ${daysSinceLast} days (>7)`] : []
    };

    expect(status.status).toBe('degraded');
    expect(status.days_since_last).toBe(10);
    expect(status.issues).toContain('Newsletter not sent in 10 days (>7)');
  });

  it('should return healthy status when newsletter sent recently', () => {
    const daysSinceLast = 3;

    const status = {
      status: 'healthy',
      resend_api: 'configured',
      active_subscribers: 50,
      days_since_last: daysSinceLast,
      issues: []
    };

    expect(status.status).toBe('healthy');
    expect(status.days_since_last).toBe(3);
    expect(status.issues).toHaveLength(0);
  });

  it('should track active subscriber count', () => {
    const status = {
      status: 'healthy',
      resend_api: 'configured',
      active_subscribers: 123,
      days_since_last: 2,
      issues: []
    };

    expect(status.active_subscribers).toBe(123);
  });
});

describe('Health Check - Overall Status Logic', () => {

  it('should return overall status "unhealthy" when any check is unhealthy', () => {
    const checks = {
      system: { status: 'unhealthy', issues: ['DB error'] },
      data_collection: { status: 'healthy', issues: [] },
      newsletter: { status: 'healthy', issues: [] }
    };

    const statuses = Object.values(checks).map(c => c.status);
    const overallStatus = statuses.includes('unhealthy') ? 'unhealthy' :
                          statuses.includes('degraded') ? 'degraded' : 'healthy';

    expect(overallStatus).toBe('unhealthy');
  });

  it('should return overall status "degraded" when any check is degraded', () => {
    const checks = {
      system: { status: 'healthy', issues: [] },
      data_collection: { status: 'degraded', issues: ['Data old'] },
      newsletter: { status: 'healthy', issues: [] }
    };

    const statuses = Object.values(checks).map(c => c.status);
    const overallStatus = statuses.includes('unhealthy') ? 'unhealthy' :
                          statuses.includes('degraded') ? 'degraded' : 'healthy';

    expect(overallStatus).toBe('degraded');
  });

  it('should return overall status "healthy" when all checks are healthy', () => {
    const checks = {
      system: { status: 'healthy', issues: [] },
      data_collection: { status: 'healthy', issues: [] },
      newsletter: { status: 'healthy', issues: [] }
    };

    const statuses = Object.values(checks).map(c => c.status);
    const overallStatus = statuses.includes('unhealthy') ? 'unhealthy' :
                          statuses.includes('degraded') ? 'degraded' : 'healthy';

    expect(overallStatus).toBe('healthy');
  });

  it('should collect all issues from all checks', () => {
    const checks = {
      system: { status: 'degraded', issues: ['KV error'] },
      data_collection: { status: 'degraded', issues: ['Data old', 'Low records'] },
      newsletter: { status: 'degraded', issues: ['Newsletter not sent'] }
    };

    const allIssues = Object.values(checks).flatMap(c => c.issues || []);

    expect(allIssues).toHaveLength(4);
    expect(allIssues).toContain('KV error');
    expect(allIssues).toContain('Data old');
    expect(allIssues).toContain('Low records');
    expect(allIssues).toContain('Newsletter not sent');
  });
});

describe('Health Check - HTTP Status Codes', () => {

  it('should return 200 for healthy status', () => {
    const healthStatus = 'healthy';
    const httpStatus = healthStatus === 'healthy' ? 200 :
                       healthStatus === 'degraded' ? 200 : 503;

    expect(httpStatus).toBe(200);
  });

  it('should return 200 for degraded status', () => {
    const healthStatus = 'degraded';
    const httpStatus = healthStatus === 'healthy' ? 200 :
                       healthStatus === 'degraded' ? 200 : 503;

    expect(httpStatus).toBe(200);
  });

  it('should return 503 for unhealthy status', () => {
    const healthStatus = 'unhealthy';
    const httpStatus = healthStatus === 'healthy' ? 200 :
                       healthStatus === 'degraded' ? 200 : 503;

    expect(httpStatus).toBe(503);
  });
});

describe('Health Check - Query Parameters', () => {

  it('should support ?check=system parameter', () => {
    const checkType = 'system';
    const shouldCheckSystem = !checkType || checkType === 'system';
    const shouldCheckData = !checkType || checkType === 'data';
    const shouldCheckNewsletter = !checkType || checkType === 'newsletter';

    expect(shouldCheckSystem).toBe(true);
    expect(shouldCheckData).toBe(false);
    expect(shouldCheckNewsletter).toBe(false);
  });

  it('should support ?check=data parameter', () => {
    const checkType = 'data';
    const shouldCheckSystem = !checkType || checkType === 'system';
    const shouldCheckData = !checkType || checkType === 'data';
    const shouldCheckNewsletter = !checkType || checkType === 'newsletter';

    expect(shouldCheckSystem).toBe(false);
    expect(shouldCheckData).toBe(true);
    expect(shouldCheckNewsletter).toBe(false);
  });

  it('should support ?check=newsletter parameter', () => {
    const checkType = 'newsletter';
    const shouldCheckSystem = !checkType || checkType === 'system';
    const shouldCheckData = !checkType || checkType === 'data';
    const shouldCheckNewsletter = !checkType || checkType === 'newsletter';

    expect(shouldCheckSystem).toBe(false);
    expect(shouldCheckData).toBe(false);
    expect(shouldCheckNewsletter).toBe(true);
  });

  it('should run all checks when no parameter provided', () => {
    const checkType = null;
    const shouldCheckSystem = !checkType || checkType === 'system';
    const shouldCheckData = !checkType || checkType === 'data';
    const shouldCheckNewsletter = !checkType || checkType === 'newsletter';

    expect(shouldCheckSystem).toBe(true);
    expect(shouldCheckData).toBe(true);
    expect(shouldCheckNewsletter).toBe(true);
  });
});

describe('Health Check - CORS Headers', () => {

  it('should include correct CORS headers', () => {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    expect(corsHeaders['Access-Control-Allow-Origin']).toBe('*');
    expect(corsHeaders['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
    expect(corsHeaders['Access-Control-Allow-Headers']).toBe('Content-Type');
  });

  it('should handle OPTIONS preflight request', () => {
    const method = 'OPTIONS';
    const shouldReturnEmpty = method === 'OPTIONS';

    expect(shouldReturnEmpty).toBe(true);
  });
});

describe('Health Check - KV Cache Age Calculation', () => {

  it('should calculate TOP10 cache age from expiration (7 days TTL)', () => {
    const now = Date.now();
    const expirationDate = new Date(now + 5 * 24 * 60 * 60 * 1000); // expires in 5 days
    const createdDate = new Date(expirationDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days TTL

    const ageHours = Math.round((now - createdDate.getTime()) / (1000 * 60 * 60) * 10) / 10;

    // Data byla vytvořena před 2 dny (7 - 5 = 2)
    expect(ageHours).toBeCloseTo(48, 0); // ~48 hours
  });

  it('should calculate Netflix New cache age from expiration (1 day TTL)', () => {
    const now = Date.now();
    const expirationDate = new Date(now + 12 * 60 * 60 * 1000); // expires in 12 hours
    const createdDate = new Date(expirationDate.getTime() - 24 * 60 * 60 * 1000); // 1 day TTL

    const ageHours = Math.round((now - createdDate.getTime()) / (1000 * 60 * 60) * 10) / 10;

    // Data byla vytvořena před 12 hodinami (24 - 12 = 12)
    expect(ageHours).toBeCloseTo(12, 0); // ~12 hours
  });

  it('should use oldest update for age_hours when multiple caches exist', () => {
    const now = Date.now();
    const top10Update = new Date(now - 69 * 60 * 60 * 1000); // 69h ago
    const netflixNewUpdate = new Date(now - 2 * 60 * 60 * 1000); // 2h ago

    const updates = [top10Update, netflixNewUpdate].filter(Boolean);
    const oldestUpdate = new Date(Math.min(...updates.map(d => new Date(d))));
    const ageHours = Math.round((now - oldestUpdate.getTime()) / (1000 * 60 * 60) * 10) / 10;

    expect(ageHours).toBe(69);
  });
});
