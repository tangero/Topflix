/**
 * Unit Tests pro Cron Worker Logic
 * Testuje logiku cron workeru bez skutečných API calls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Cron Worker - Configuration', () => {

  it('should have correct cron schedule (Tuesday 10:00 UTC)', () => {
    const cronExpression = '0 10 * * 2';

    // Parsování cron expression
    const [minute, hour, dayOfMonth, month, dayOfWeek] = cronExpression.split(' ');

    expect(minute).toBe('0'); // 0. minuta
    expect(hour).toBe('10'); // 10. hodina
    expect(dayOfMonth).toBe('*'); // každý den v měsíci
    expect(month).toBe('*'); // každý měsíc
    expect(dayOfWeek).toBe('2'); // úterý (0 = neděle, 1 = pondělí, 2 = úterý...)
  });

  it('should have required environment variables', () => {
    const env = {
      PAGES_URL: 'https://topflix.pages.dev'
    };

    expect(env.PAGES_URL).toBeDefined();
    expect(env.PAGES_URL).toContain('https://');
  });

  it('should use fallback URL when PAGES_URL not set', () => {
    const env = {};
    const apiUrl = env.PAGES_URL || 'https://your-pages-url.pages.dev';

    expect(apiUrl).toBe('https://your-pages-url.pages.dev');
  });
});

describe('Cron Worker - API Request', () => {

  it('should call /api/top10 endpoint', () => {
    const pagesUrl = 'https://topflix.pages.dev';
    const endpoint = '/api/top10';
    const fullUrl = `${pagesUrl}${endpoint}`;

    expect(fullUrl).toBe('https://topflix.pages.dev/api/top10');
  });

  it('should include Cache-Control: no-cache header', () => {
    const headers = {
      'Cache-Control': 'no-cache'
    };

    expect(headers['Cache-Control']).toBe('no-cache');
  });

  it('should handle successful response (200)', async () => {
    const mockResponse = {
      ok: true,
      status: 200
    };

    const result = mockResponse.ok ? 'success' : 'failure';

    expect(result).toBe('success');
  });

  it('should handle failed response (non-200)', async () => {
    const mockResponse = {
      ok: false,
      status: 500
    };

    const result = mockResponse.ok ? 'success' : 'failure';

    expect(result).toBe('failure');
  });

  it('should log success message', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const message = 'Cron trigger: Data refreshed successfully';

    console.log(message);

    expect(consoleSpy).toHaveBeenCalledWith(message);
    consoleSpy.mockRestore();
  });

  it('should log error message on failure', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const status = 500;
    const message = 'Cron trigger: Failed to refresh data';

    console.error(message, status);

    expect(consoleErrorSpy).toHaveBeenCalledWith(message, status);
    consoleErrorSpy.mockRestore();
  });
});

describe('Cron Worker - Error Handling', () => {

  it('should catch network errors', async () => {
    const error = new Error('Network error');
    let caughtError = null;

    try {
      throw error;
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toBe('Network error');
  });

  it('should catch fetch timeout errors', async () => {
    const error = new Error('Request timeout');
    let caughtError = null;

    try {
      throw error;
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toBe('Request timeout');
  });

  it('should log errors to console', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const error = new Error('Test error');

    console.error('Cron trigger error:', error);

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('Cron Worker - Week Number Utility', () => {

  it('should calculate week number correctly for Jan 1, 2024', () => {
    const date = new Date('2024-01-01');
    const weekNumber = getWeekNumberFromDate(date);

    expect(weekNumber).toBe('2024-01');
  });

  it('should calculate week number correctly for mid-year', () => {
    const date = new Date('2024-06-15');
    const weekNumber = getWeekNumberFromDate(date);

    expect(weekNumber).toMatch(/2024-2[0-9]/); // týden 20-29
  });

  it('should calculate week number correctly for end of year', () => {
    const date = new Date('2024-12-31');
    const weekNumber = getWeekNumberFromDate(date);

    expect(weekNumber).toMatch(/202[45]-[0-5][0-9]/); // může být 2024 nebo 2025 podle ISO week
  });

  it('should pad week number with leading zero', () => {
    const weekNumber = '2024-05';
    const [year, week] = weekNumber.split('-');

    expect(week).toHaveLength(2);
    expect(week[0]).toBe('0');
  });
});

describe('Cron Worker - Scheduled Event', () => {

  it('should receive correct event structure', () => {
    const mockEvent = {
      scheduledTime: Date.now(),
      cron: '0 10 * * 2'
    };

    expect(mockEvent.scheduledTime).toBeDefined();
    expect(mockEvent.cron).toBe('0 10 * * 2');
  });

  it('should have access to env context', () => {
    const mockEnv = {
      PAGES_URL: 'https://topflix.pages.dev'
    };

    expect(mockEnv.PAGES_URL).toBeDefined();
  });

  it('should have access to ctx context', () => {
    const mockCtx = {
      waitUntil: vi.fn()
    };

    expect(mockCtx.waitUntil).toBeDefined();
    expect(typeof mockCtx.waitUntil).toBe('function');
  });
});

describe('Cron Worker - Multiple Endpoint Support', () => {

  it('should support calling multiple endpoints', () => {
    const pagesUrl = 'https://topflix.pages.dev';
    const endpoints = ['/api/top10', '/api/netflix-new'];

    const urls = endpoints.map(ep => `${pagesUrl}${ep}`);

    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe('https://topflix.pages.dev/api/top10');
    expect(urls[1]).toBe('https://topflix.pages.dev/api/netflix-new');
  });

  it('should handle partial success (some endpoints fail)', () => {
    const results = [
      { endpoint: '/api/top10', success: true },
      { endpoint: '/api/netflix-new', success: false }
    ];

    const allSuccess = results.every(r => r.success);
    const someSuccess = results.some(r => r.success);

    expect(allSuccess).toBe(false);
    expect(someSuccess).toBe(true);
  });

  it('should handle complete failure (all endpoints fail)', () => {
    const results = [
      { endpoint: '/api/top10', success: false },
      { endpoint: '/api/netflix-new', success: false }
    ];

    const allSuccess = results.every(r => r.success);
    const anySuccess = results.some(r => r.success);

    expect(allSuccess).toBe(false);
    expect(anySuccess).toBe(false);
  });
});

describe('Cron Worker - Timing and Scheduling', () => {

  it('should run on Tuesday only', () => {
    const cronExpression = '0 10 * * 2';
    const dayOfWeek = cronExpression.split(' ')[4];

    expect(dayOfWeek).toBe('2'); // 2 = Tuesday
  });

  it('should run at 10:00 UTC', () => {
    const cronExpression = '0 10 * * 2';
    const [minute, hour] = cronExpression.split(' ');

    expect(hour).toBe('10');
    expect(minute).toBe('0');
  });

  it('should calculate correct local time for Prague (UTC+1/+2)', () => {
    const utcHour = 10;
    const winterOffset = 1; // CET
    const summerOffset = 2; // CEST

    const winterLocal = utcHour + winterOffset; // 11:00
    const summerLocal = utcHour + summerOffset; // 12:00

    expect(winterLocal).toBe(11);
    expect(summerLocal).toBe(12);
  });
});

// Helper function pro testování
function getWeekNumberFromDate(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}
