# Testování Topflix.cz

Komplexní testovací suite pro Topflix.cz - Netflix TOP10 aplikaci.

## 📁 Struktura

```
tests/
├── unit/                       # Unit testy (mock dependencies)
│   ├── health-check.test.js   # Health check logika
│   └── cron-logic.test.js     # Cron worker logika
├── integration/                # Integration testy (skutečné HTTP)
│   ├── health-endpoint.test.js # Health endpoint
│   └── api-endpoints.test.js   # Všechny API endpointy
├── e2e/                        # E2E testy (production)
│   └── data-freshness.test.js  # Data freshness monitoring
└── README.md                   # Tento soubor
```

## 🚀 Quick Start

### Instalace

```bash
npm install
```

### Spuštění testů

```bash
# Všechny testy
npm test

# Unit testy
npm run test:unit

# Integration testy
npm run test:integration

# E2E testy (proti produkci)
npm run test:e2e

# Všechny testy s coverage
npm run test:coverage

# Watch mode (pro vývoj)
npm run test:watch
```

## 📊 Test Coverage

Cílové pokrytí:
- **Celkem**: >70%
- **Functions**: >70%
- **Branches**: >70%
- **Lines**: >70%

Zobrazit coverage report:
```bash
npm run test:coverage
open coverage/index.html
```

## 🧪 Unit Tests

**Účel**: Testují izolovanou logiku bez externích závislostí

**Co testují:**
- Health check kalkulace (age_hours, status logic)
- Cron worker konfigurace
- Data validace
- Error handling
- Status code mapping

**Charakteristika:**
- ✅ Velmi rychlé (<100ms)
- ✅ Mock všechny dependencies
- ✅ Spouští se při každém commitu
- ✅ Deterministické

**Příklad spuštění:**
```bash
npm run test:unit

# Jen health check testy
npm run test:unit tests/unit/health-check.test.js

# Watch mode
npm run test:watch
```

### Coverage

```bash
npm run test:unit -- --coverage
```

## 🔗 Integration Tests

**Účel**: Testují HTTP endpointy s reálnými requests

**Co testují:**
- `/api/health` endpoint (všechny varianty)
- `/api/top10` endpoint
- `/api/netflix-new` endpoint
- `/api/archive` endpoint
- `/api/stats` endpoint
- CORS headers
- Response structure
- Error handling

**Charakteristika:**
- ⚡ Středně rychlé (1-5s)
- 🌐 Skutečné HTTP calls
- 🎯 Testují proti staging/production
- 📝 Validují API contracts

**Příklad spuštění:**
```bash
npm run test:integration

# Proti lokálnímu dev serveru
TEST_BASE_URL=http://localhost:8788 npm run test:integration

# Proti staging
TEST_BASE_URL=https://staging.topflix.cz npm run test:integration
```

### Environment Variables

```bash
# Base URL pro testy (default: https://www.topflix.cz)
export TEST_BASE_URL=https://www.topflix.cz
```

## 🌍 E2E Tests

**Účel**: Production monitoring a data freshness validation

**Co testují:**
- Data age <72h (critical)
- Data age <48h (warning)
- Overall health status
- System health (DB, KV, APIs)
- Response performance
- Data consistency

**Charakteristika:**
- 🐌 Pomalejší (3-10s)
- 🌍 Běží proti produkci
- 🔔 Generují alerty při failure
- ⏰ Scheduled runs (hourly, post-cron)

**Příklad spuštění:**
```bash
npm run test:e2e

# S detailním output
npm run test:e2e -- --reporter=verbose
```

### Scheduled Runs

E2E testy běží automaticky přes GitHub Actions:
- **Každou hodinu** - health check
- **Úterý 10:30 UTC** - post-cron verification (kritický!)
- **Denně 6:00 UTC** - complete integration test suite

## 🎯 Test Scénáře

### Scénář 1: Health Check Validace

```bash
# Unit test - logika
npm run test:unit tests/unit/health-check.test.js

# Integration test - HTTP endpoint
npm run test:integration tests/integration/health-endpoint.test.js

# E2E test - production data
npm run test:e2e tests/e2e/data-freshness.test.js
```

### Scénář 2: Data Freshness

```bash
# Kontrola stáří dat
node monitoring/check-data-age.js

# E2E test
npm run test:e2e tests/e2e/data-freshness.test.js
```

### Scénář 3: API Validace

```bash
# Integration testy pro všechny endpointy
npm run test:integration tests/integration/api-endpoints.test.js
```

## 🔧 Configuration

### vitest.config.js

```javascript
{
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      lines: 70,
      functions: 70,
      branches: 70
    }
  }
}
```

### package.json scripts

```json
{
  "test": "vitest run",
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration",
  "test:e2e": "vitest run tests/e2e",
  "test:all": "vitest run --coverage",
  "test:watch": "vitest"
}
```

## 📝 Writing Tests

### Unit Test Template

```javascript
import { describe, it, expect } from 'vitest';

describe('Feature Name', () => {
  it('should do something', () => {
    const result = myFunction();
    expect(result).toBe(expected);
  });
});
```

### Integration Test Template

```javascript
import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'https://www.topflix.cz';

describe('API Endpoint', () => {
  it('should return 200', async () => {
    const response = await fetch(`${BASE_URL}/api/endpoint`);
    expect(response.status).toBe(200);
  });
});
```

### E2E Test Template

```javascript
import { describe, it, expect } from 'vitest';

describe('E2E - Feature', () => {
  it('should verify production behavior', async () => {
    const response = await fetch('https://www.topflix.cz/api/health');
    const data = await response.json();
    expect(data.status).toBe('healthy');
  }, { timeout: 10000 });
});
```

## 🚨 Debugging Failed Tests

### Zobrazit detailní output

```bash
npm test -- --reporter=verbose
```

### Spustit jen jeden test

```bash
npm test -- tests/unit/health-check.test.js
```

### Debug mode

```bash
# Node.js inspector
node --inspect-brk node_modules/.bin/vitest run

# VS Code debugger
# Přidej breakpoint a spusť "Debug Test" v VS Code
```

### Logování

```javascript
it('should log debug info', () => {
  console.log('Debug:', value);
  expect(value).toBe(expected);
});
```

## 🎭 Mocking

### Mock fetch

```javascript
import { vi } from 'vitest';

global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: 'mock' })
  })
);
```

### Mock environment

```javascript
const mockEnv = {
  DB: { prepare: vi.fn() },
  TOPFLIX_KV: { get: vi.fn() },
  TMDB_API_KEY: 'mock-key'
};
```

## 📊 CI/CD Integration

### GitHub Actions

Testy běží automaticky:

**On Push/PR:**
- Unit tests
- Integration tests
- Coverage report

**Scheduled:**
- Hourly E2E tests
- Post-cron verification (úterý 10:30 UTC)
- Daily integration tests (6:00 UTC)

### Workflows

```yaml
# .github/workflows/test.yml
- Unit tests při každém push
- Integration tests před mergem
- Coverage reporting

# .github/workflows/e2e-monitoring.yml
- Hourly health checks
- Post-cron verification
- Email alerts on failure
```

## 🔔 Alerting

### Email Alerts

Při failure E2E testů:
- Email přes Resend API
- GitHub Issue creation
- Workflow summary

### UptimeRobot

External monitoring:
- 5 min interval
- Keyword detection
- SMS alerts (optional)

Viz: `/monitoring/uptimerobot-setup.md`

## 📈 Metrics a KPIs

### Test Metrics

- **Test count**: 50+ tests
- **Coverage**: >70%
- **Execution time**: <30s (unit+integration)
- **Success rate**: >99%

### Production Metrics

- **Uptime**: 99.5% target
- **Data age**: <48h (95% of time)
- **Response time**: <2s (p95)

### Dashboard

Viz metriky:
```bash
# Test coverage
npm run test:coverage

# E2E monitoring logs
cat monitoring/logs/data-age.log | jq

# GitHub Actions
https://github.com/USER/topflix/actions
```

## 🎓 Best Practices

1. **Test Pyramid** - 70% unit, 20% integration, 10% E2E
2. **Fast Feedback** - unit tests <100ms
3. **Isolated Tests** - každý test nezávislý
4. **Descriptive Names** - `should do X when Y`
5. **Arrange-Act-Assert** pattern
6. **Mock External Dependencies** v unit testech
7. **Test Real Behavior** v integration testech
8. **Production Monitoring** přes E2E testy

## 🐛 Common Issues

### Testy failují lokálně

```bash
# Zkontroluj Node.js verzi
node --version  # should be 20+

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Čistý test run
npm test
```

### Integration testy timeout

```bash
# Zvyš timeout
npm test -- --testTimeout=30000

# Nebo v testu:
it('slow test', async () => {
  // test code
}, { timeout: 30000 });
```

### E2E testy failují v produkci

```bash
# Zkontroluj stav produkce
curl https://www.topflix.cz/api/health | jq

# Manuální monitoring
node monitoring/check-data-age.js
```

## 📚 Reference

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://testingjavascript.com/)
- [Cloudflare Workers Testing](https://developers.cloudflare.com/workers/testing/)
- [TESTING_STRATEGY.md](../TESTING_STRATEGY.md)

---

Vytvořil: Claude Code
Datum: 2025-11-14
Verze: 1.0
