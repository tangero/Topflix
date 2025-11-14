# Testovací a Monitoring Strategie pro Topflix.cz

## 🎯 Cíle

1. **Prevence problému se starými daty** - detekce kdy cron selže nebo data jsou stará
2. **Automatická validace** - všechny API endpointy a cron triggery
3. **Kontinuální monitoring** - 24/7 sledování stavu systému
4. **Rychlá detekce problémů** - notifikace do 5 minut od selhání

---

## 🏗️ Architektura Testování

### 1. Pyramid Testování

```
           ┌─────────────┐
          ╱   E2E Tests   ╲
         ╱  (Playwright)   ╲
        ┌───────────────────┐
       ╱  Integration Tests  ╲
      ╱  (Vitest + Miniflare) ╲
     ┌─────────────────────────┐
    ╱      Unit Tests            ╲
   ╱  (Vitest + Mock Objects)     ╲
  └─────────────────────────────────┘
```

### 2. Test Layers

#### Layer 1: Unit Tests (70%)
- Testují jednotlivé funkce a utility
- Mock všechny externí závislosti
- Velmi rychlé (<100ms)
- Spouští se při každém commitu

**Soubory:**
- `tests/unit/health-check.test.js` - health check logika
- `tests/unit/cron-logic.test.js` - cron worker logika
- `tests/unit/data-validation.test.js` - validace dat

#### Layer 2: Integration Tests (20%)
- Testují interakci mezi komponentami
- Používají Miniflare (local Cloudflare runtime)
- Testují DB queries, KV operations, API calls
- Spouští se před deployem

**Soubory:**
- `tests/integration/api-endpoints.test.js` - všechny API endpointy
- `tests/integration/cron-trigger.test.js` - cron → API → DB flow
- `tests/integration/cache-invalidation.test.js` - KV cache behavior

#### Layer 3: E2E Tests (10%)
- Testují production systém
- Používají skutečné API
- Scheduled runs (každou hodinu)

**Soubory:**
- `tests/e2e/health-monitoring.test.js` - health endpoint v produkci
- `tests/e2e/data-freshness.test.js` - kontrola stáří dat

---

## 📦 Test Framework Stack

### Core Testing
- **Vitest** - moderní, rychlý test runner (kompatibilní s Vite/Cloudflare)
- **Miniflare** - local Cloudflare Workers runtime pro integration testy
- **Playwright** - E2E testy + API testing

### Monitoring & Alerting
- **UptimeRobot** - external monitoring (free tier: 50 monitors)
- **GitHub Actions** - scheduled tests
- **Resend** - email notifikace (již máš API key)

### Test Utilities
- **msw** - API mocking
- **@cloudflare/vitest-pool-workers** - Cloudflare-native testing
- **c8** - code coverage

---

## 🧪 Test Scénáře

### 1. Cron Trigger Tests

#### Unit Tests
```javascript
✓ Cron trigger parsuje správný čas (úterý 10:00 UTC)
✓ Cron worker má správné environment variables
✓ Cache-Control header je nastaven na "no-cache"
✓ Error handling při selhání API requestu
```

#### Integration Tests
```javascript
✓ Cron trigger volá /api/top10 endpoint
✓ Cron trigger volá /api/netflix-new endpoint
✓ KV cache se invaliduje po cron běhu
✓ D1 database se aktualizuje novými daty
✓ Health check vrací fresh data po cron běhu
```

#### E2E Tests
```javascript
✓ Scheduled test každé úterý v 10:30 UTC (30 min po cron)
✓ Verifikace že data jsou <1h stará
✓ Verifikace že cache byl invalidován
```

---

### 2. Health Check Tests

#### Unit Tests
```javascript
✓ checkSystemHealth() detekuje chybějící DB binding
✓ checkSystemHealth() detekuje chybějící KV binding
✓ checkSystemHealth() detekuje chybějící TMDB API key
✓ checkDataCollectionHealth() počítá age_hours správně
✓ checkDataCollectionHealth() detekuje stará data (>48h)
✓ checkNewsletterHealth() počítá days_since_last správně
✓ Overall status je "degraded" když některý check selže
✓ Overall status je "unhealthy" když kritický check selže
✓ HTTP status 503 pro "unhealthy", 200 pro "degraded" a "healthy"
```

#### Integration Tests
```javascript
✓ GET /api/health vrací 200 když vše OK
✓ GET /api/health vrací 200 když data jsou stará (degraded)
✓ GET /api/health vrací 503 když DB nefunguje
✓ GET /api/health?check=system vrací jen system health
✓ GET /api/health?check=data vrací jen data collection health
✓ GET /api/health?check=newsletter vrací jen newsletter health
✓ CORS headers jsou správně nastavené
```

#### E2E Tests (Production)
```javascript
✓ /api/health endpoint odpovídá <500ms
✓ /api/health?check=data detekuje stará data
✓ /api/health vrací validní JSON response
✓ age_hours je <48 hodin (v produkci)
```

---

### 3. API Endpoint Tests

#### Integration Tests
```javascript
// /api/top10
✓ Vrací validní JSON structure
✓ Obsahuje filmy i seriály
✓ Každý item má required fields (title, tmdb, csfd, netflix_url)
✓ Cache header je nastaven správně
✓ KV cache funguje (druhý request je z cache)

// /api/netflix-new
✓ Vrací validní JSON structure
✓ Obsahuje nejnovější Netflix tituly
✓ Každý item má required fields
✓ Data jsou seřazená od nejnovějších

// /api/archive
✓ Vrací historická data
✓ Filtruje podle roku a týdne
✓ Vrací prázdné pole když žádná data

// /api/stats
✓ Vrací statistiky z databáze
✓ Počítá total_records a quality_records správně
```

---

### 4. Data Flow Integration Tests

#### Complete Flow Test
```javascript
✓ [1] Cron trigger se spustí
✓ [2] Volá /api/top10 s Cache-Control: no-cache
✓ [3] API fetchuje data z Netflix
✓ [4] Data se enrichují z TMDB
✓ [5] Data se enrichují z ČSFD
✓ [6] Data se uloží do D1 database
✓ [7] Data se uloží do KV cache
✓ [8] Health check vrací age_hours < 1
✓ [9] Frontend zobrazuje nová data
```

---

## 🚨 Monitoring Strategie

### UptimeRobot Monitors (Free Tier)

#### Monitor 1: Health Check - Overall
- **URL:** `https://www.topflix.cz/api/health`
- **Interval:** 5 minut
- **Alert when:** HTTP status != 200
- **Keyword monitor:** `"status":"healthy"`
- **Email alert:** ANO

#### Monitor 2: Health Check - Data Freshness
- **URL:** `https://www.topflix.cz/api/health?check=data`
- **Interval:** 15 minut
- **Alert when:** obsahuje `"status":"degraded"` nebo `"status":"unhealthy"`
- **Keyword monitor:** `"age_hours"` (ověří že pole existuje)
- **Email alert:** ANO

#### Monitor 3: Health Check - Data Age (Critical)
- **URL:** `https://www.topflix.cz/api/health?check=data`
- **Interval:** 30 minut
- **Alert when:** obsahuje `>48h` nebo `age_hours` >48
- **Custom HTTP header:** žádný
- **Email + SMS alert:** ANO (kritický alert)

#### Monitor 4: TOP10 API Availability
- **URL:** `https://www.topflix.cz/api/top10`
- **Interval:** 5 minut
- **Alert when:** HTTP status != 200 nebo response time >2s
- **Keyword monitor:** `"films"` nebo `"series"`
- **Email alert:** ANO

#### Monitor 5: Netflix New API Availability
- **URL:** `https://www.topflix.cz/api/netflix-new`
- **Interval:** 5 minut
- **Alert when:** HTTP status != 200
- **Email alert:** ANO

#### Monitor 6: Cron Post-Run Verification (Scheduled)
- **URL:** `https://www.topflix.cz/api/health?check=data`
- **Interval:** Pouze úterý 10:30-11:00 UTC (každých 5 min)
- **Alert when:** `age_hours` >1
- **Email alert:** ANO
- **Poznámka:** Ověří že cron skutečně proběhl

---

### GitHub Actions Scheduled Tests

#### Workflow 1: Hourly Health Check
```yaml
schedule:
  - cron: '0 * * * *'  # Každou hodinu
jobs:
  - Spustí E2E test /api/health
  - Verifikuje age_hours <72
  - Fail pokud degraded nebo unhealthy
  - Pošle email při failure
```

#### Workflow 2: Post-Cron Verification
```yaml
schedule:
  - cron: '30 10 * * 2'  # Úterý 10:30 UTC (30 min po cron)
jobs:
  - Spustí E2E test /api/health?check=data
  - Verifikuje age_hours <1 (data musí být fresh)
  - Verifikuje že KV cache je nový
  - CRITICAL FAILURE pokud data jsou stará
  - Pošle email + vytvoří GitHub Issue
```

#### Workflow 3: Daily Integration Tests
```yaml
schedule:
  - cron: '0 6 * * *'  # Denně v 6:00 UTC
jobs:
  - Spustí všechny integration testy
  - Verifikuje všechny API endpointy
  - Coverage report
  - Badge update v README
```

---

### Custom Monitoring Script (Node.js)

#### `/monitoring/check-data-age.js`
- Běží jako GitHub Action nebo lokálně
- Kontroluje `/api/health?check=data`
- Parsuje `age_hours`
- Pošle email přes Resend pokud >48h
- Loguje do souboru pro historii

---

## 📊 Metriky a KPIs

### Data Freshness KPI
- **Target:** 95% času data <48h stará
- **Warning:** data >48h stará
- **Critical:** data >72h stará
- **Measurement:** UptimeRobot + GitHub Actions

### API Availability KPI
- **Target:** 99.5% uptime
- **Warning:** <99% uptime
- **Measurement:** UptimeRobot monitoring

### Cron Success Rate
- **Target:** 100% successful runs
- **Warning:** 1 failed run
- **Critical:** 2+ consecutive failed runs
- **Measurement:** Post-cron verification test

### Response Time KPI
- **Target:** /api/health <500ms (p95)
- **Target:** /api/top10 <2s (p95)
- **Warning:** >2s response time
- **Measurement:** UptimeRobot response time monitoring

---

## 🔧 Implementation Plan

### Phase 1: Foundation (Den 1)
1. ✅ Instalovat Vitest + dependencies
2. ✅ Vytvořit základní test strukturu
3. ✅ Napsat unit testy pro health check
4. ✅ Setup Miniflare pro integration testy

### Phase 2: Core Tests (Den 2)
1. ✅ Integration testy pro všechny API endpointy
2. ✅ Integration testy pro cron trigger
3. ✅ E2E testy pro production health check
4. ✅ Setup CI/CD v GitHub Actions

### Phase 3: Monitoring (Den 3)
1. ✅ Nastavit UptimeRobot monitors
2. ✅ Vytvořit scheduled GitHub Actions
3. ✅ Custom monitoring script
4. ✅ Email alerting přes Resend

### Phase 4: Documentation (Den 4)
1. ✅ Kompletní README pro testy
2. ✅ Monitoring playbook
3. ✅ Incident response guide
4. ✅ Dashboard setup guide

---

## 🚀 Quick Start

### Lokální spuštění testů
```bash
# Instalace
npm install

# Unit tests
npm test

# Integration tests
npm run test:integration

# E2E tests (proti produkci)
npm run test:e2e

# Všechny testy
npm run test:all

# Coverage report
npm run test:coverage
```

### CI/CD
```bash
# Automaticky při push
git push

# Scheduled runs
# - Hourly: každou hodinu
# - Daily: 6:00 UTC
# - Post-cron: úterý 10:30 UTC
```

---

## 📈 Success Metrics

Po implementaci očekávám:

1. **Zero stará data incidents** - žádné situace kdy data >72h bez notifikace
2. **<5 min detection time** - každý problém detekován do 5 minut
3. **100% cron visibility** - vždy víme jestli cron proběhl
4. **Automated alerting** - žádná manuální kontrola potřeba
5. **Test coverage >80%** - kritické cesty pokryté testy

---

## 🔍 Troubleshooting Guide

### Problém: Data jsou stará >48h
**Detection:** UptimeRobot Monitor 3 alert, nebo GitHub Action failure
**Cause:** Cron neproběhl nebo selhal
**Fix:**
1. Zkontroluj `wrangler tail topflix-cron` pro logy
2. Manuálně spusť: `curl -H "Cache-Control: no-cache" https://www.topflix.cz/api/top10`
3. Verifikuj: `curl https://www.topflix.cz/api/health?check=data`
4. Pokud problém přetrvává → zkontroluj Cloudflare Workers dashboard

### Problém: Health check vrací 503
**Detection:** UptimeRobot Monitor 1 alert
**Cause:** DB nebo kritická služba nefunguje
**Fix:**
1. Zkontroluj Cloudflare D1 dashboard
2. Zkontroluj KV namespace
3. Zkontroluj TMDB API key (rate limit?)
4. Zkontroluj logy: `wrangler pages deployment tail`

### Problém: Cron neběží
**Detection:** Post-cron verification test failure (úterý 10:30 UTC)
**Cause:** Worker není nasazený nebo cron trigger nefunguje
**Fix:**
1. `wrangler whoami` - zkontroluj účet
2. `wrangler deployments list` - zkontroluj jestli topflix-cron existuje
3. Znovu nasaď: `npm run deploy:cron`
4. Verifikuj cron schedule: `wrangler deployments list topflix-cron`

---

## 📚 References

- [Vitest Documentation](https://vitest.dev/)
- [Miniflare Documentation](https://miniflare.dev/)
- [Cloudflare Workers Testing](https://developers.cloudflare.com/workers/testing/)
- [UptimeRobot Documentation](https://uptimerobot.com/api/)
- [Playwright API Testing](https://playwright.dev/docs/test-api-testing)

---

Vytvořil: Claude Code
Datum: 2025-11-14
Verze: 1.0
