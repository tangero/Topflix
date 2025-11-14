# Monitoring Scripts pro Topflix.cz

Tento adresář obsahuje skripty pro monitoring stavu aplikace a stáří dat.

## 📁 Obsah

- `check-data-age.js` - Kontrola stáří dat a alerting
- `logs/` - Logy z monitoringu (gitignored)
- `uptimerobot-setup.md` - Návod na nastavení UptimeRobot
- `dashboard.md` - Monitoring dashboard a metriky

## 🚀 Použití

### Data Age Check

Základní kontrola:
```bash
node monitoring/check-data-age.js
```

S logováním:
```bash
node monitoring/check-data-age.js --log
```

S email alertem:
```bash
RESEND_API_KEY=re_xxx ALERT_EMAIL=your@email.com \
  node monitoring/check-data-age.js --alert --log
```

### Exit kódy

- `0` - OK (data fresh)
- `1` - WARNING nebo CRITICAL (data stará nebo error)

## 📊 Thresholdy

- **OK**: Data <48h stará ✅
- **WARNING**: Data 48-72h stará ⚠️
- **CRITICAL**: Data >72h stará 🚨

## 🔔 Alerting

### Email Alerts

Vyžaduje environment variables:
- `RESEND_API_KEY` - Resend API klíč
- `ALERT_EMAIL` - Email pro alerty

### GitHub Actions

Automatické alerty přes GitHub Actions:
- Každou hodinu: health check
- Post-cron (úterý 10:30 UTC): verifikace že cron proběhl
- Při failure: email + GitHub Issue

## 📈 Monitoring Strategie

### 1. UptimeRobot (External)
- 5 min interval pro critical endpointy
- 15 min interval pro data freshness
- Email + SMS alerty

### 2. GitHub Actions (Scheduled)
- Hourly health checks
- Post-cron verification
- Daily integration tests

### 3. Custom Scripts (On-Demand)
- Data age check
- Historical logging
- Custom reporting

## 🔧 Setup

### 1. Nainstaluj dependencies
```bash
npm install
```

### 2. Nastav environment variables
```bash
cp .env.example .env
# Vyplň RESEND_API_KEY a ALERT_EMAIL
```

### 3. Nastav GitHub Secrets
```
RESEND_API_KEY=re_xxx
ALERT_EMAIL=your@email.com
CODECOV_TOKEN=xxx (optional)
```

### 4. Nastav UptimeRobot
Viz: `monitoring/uptimerobot-setup.md`

## 📝 Logs

Logy jsou ukládány do `monitoring/logs/data-age.log`:
```json
{"timestamp":"2025-11-14T12:00:00.000Z","level":"ok","ageHours":24,"status":"healthy","totalRecords":150,"issues":[]}
{"timestamp":"2025-11-14T13:00:00.000Z","level":"warning","ageHours":50,"status":"degraded","totalRecords":150,"issues":["Data is 50 hours old (>48h)"]}
```

### Analýza logů

Posledních 10 záznamů:
```bash
tail -10 monitoring/logs/data-age.log | jq
```

Jen warnings a critical:
```bash
grep -E '"level":"(warning|critical)"' monitoring/logs/data-age.log | jq
```

Průměrné stáří dat za poslední den:
```bash
tail -24 monitoring/logs/data-age.log | jq '.ageHours' | awk '{sum+=$1; count++} END {print sum/count}'
```

## 🎯 Best Practices

1. **Pravidelné kontroly** - minimálně každou hodinu
2. **Post-cron verification** - vždy po cron běhu (úterý 10:30 UTC)
3. **Multiple monitors** - UptimeRobot + GitHub Actions + custom
4. **Log retention** - uchovávej logy minimálně 30 dní
5. **Alert fatigue** - rozumné thresholdy (48h warning, 72h critical)

## 🚨 Troubleshooting

### Data jsou stará
1. Zkontroluj Cloudflare Workers dashboard
2. Verifikuj cron schedule: `wrangler deployments list topflix-cron`
3. Zkontroluj logy: `wrangler tail topflix-cron`
4. Manuální refresh: `curl -H "Cache-Control: no-cache" https://www.topflix.cz/api/top10`

### Cron neběží
1. Verify worker existuje: `wrangler whoami`
2. Redeploy: `npm run deploy:cron`
3. Zkontroluj cron expression: `0 10 * * 2`

### Monitoring nefunguje
1. Zkontroluj GitHub Actions logs
2. Verify RESEND_API_KEY
3. Zkontroluj UptimeRobot dashboard
4. Test skripty lokálně

## 📚 Reference

- [UptimeRobot API](https://uptimerobot.com/api/)
- [GitHub Actions](https://docs.github.com/actions)
- [Resend Emails](https://resend.com/docs)
- [Cloudflare Workers Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
