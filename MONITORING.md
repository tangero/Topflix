# 📊 Topflix Monitoring & Maintenance Guide

Tento dokument popisuje jak zajistit pravidelnou aktualizaci dat a monitorování systému.

## 🔄 Automatické aktualizace dat

### GitHub Actions (PRIMÁRNÍ METODA)

Automatické denní aktualizace probíhají přes GitHub Actions:

**Konfigurace**: `.github/workflows/daily-data-refresh.yml`

**Čas spuštění**: Každý den v 06:00 UTC (08:00 CET)

**Co dělá**:
1. Volá `/api/top10` pro aktualizaci Netflix TOP10
2. Volá `/api/netflix-new` pro aktualizaci nového obsahu
3. Ověřuje health check
4. Selhání notifikuje (v logs)

**Manuální spuštění**:
```bash
# V GitHub UI:
Actions → Daily Data Refresh → Run workflow
```

**Monitoring**:
- GitHub Actions záložka v repository
- Email notifikace při selhání (nastavit v Settings → Notifications)

---

## 🚨 Monitoring & Alerting

### 1. UptimeRobot Setup

Doporučené monitory:

#### Monitor #1: Hlavní stránka
```
Name: Topflix - Web
URL: https://www.topflix.cz/
Type: HTTP(s)
Interval: 5 minutes
Alert: When down
```

#### Monitor #2: Health Check (Data)
```
Name: Topflix - Data Health
URL: https://www.topflix.cz/api/health?check=data
Type: HTTP(s) with Keyword
Keyword: "status":"healthy"
Interval: 10 minutes
Alert: When keyword missing (= degraded or unhealthy)
```

**Jak nastavit**:
1. Jdi na https://uptimerobot.com
2. Zaregistruj se (zdarma)
3. Add New Monitor
4. Vyplň data výše
5. Přidej svůj email do Alert Contacts

**Co monitoruje**:
- ✅ Web je dostupný
- ✅ Data nejsou starší než 48 hodin
- ✅ Databáze má min. 50 záznamů
- ✅ API endpoints fungují

---

### 2. Health Check Endpoint

**URL**: `https://www.topflix.cz/api/health`

**Query parametry**:
- `?check=system` - pouze systém (DB, KV, API)
- `?check=data` - pouze data collection
- `?check=newsletter` - pouze newsletter

**Status kódy**:
- `200` - healthy nebo degraded (varování)
- `503` - unhealthy (kritický problém)

**Example response**:
```json
{
  "status": "healthy",
  "checks": {
    "data_collection": {
      "status": "healthy",
      "total_records": 432,
      "age_hours": 2.5,
      "last_top10_update": "2025-11-14T06:00:00Z"
    }
  }
}
```

**Kritéria degraded**:
- Data starší než 48 hodin
- Méně než 50 záznamů v databázi
- Newsletter neodeslán >7 dní

---

## 🛠️ Manuální aktualizace

Pokud potřebuješ aktualizovat data ručně:

### Způsob 1: Přes browser/curl

```bash
# TOP10 data
curl "https://www.topflix.cz/api/top10" -H "Cache-Control: no-cache"

# Netflix New data
curl "https://www.topflix.cz/api/netflix-new" -H "Cache-Control: no-cache"
```

### Způsob 2: Přes GitHub Actions

1. Jdi do GitHub repository
2. Actions → Daily Data Refresh
3. Run workflow → Run workflow

### Způsob 3: Smazat cache a reload

```bash
# Smazat TOP10 cache
npx wrangler kv key delete "netflix_top10_movies_v5" \
  --namespace-id 1844bf2efc7d41b89ddb224d7eab20d4 --remote

npx wrangler kv key delete "netflix_top10_series_v5" \
  --namespace-id 1844bf2efc7d41b89ddb224d7eab20d4 --remote

# Potom načti nová data
curl "https://www.topflix.cz/api/top10"
```

---

## 📅 Maintenance Checklist

### Denně (automaticky)
- ✅ GitHub Actions spustí aktualizaci v 06:00 UTC
- ✅ UptimeRobot kontroluje health každých 10 minut

### Týdně (manuálně)
- [ ] Zkontroluj GitHub Actions logs (že neprobíhají chyby)
- [ ] Zkontroluj UptimeRobot dashboard (že není down)
- [ ] Zkontroluj health check: https://www.topflix.cz/api/health

### Měsíčně
- [ ] Zkontroluj růst databáze (`/api/stats`)
- [ ] Zkontroluj cache hit rate (Cloudflare Analytics)
- [ ] Review newsletter subscribers count

---

## 🐛 Troubleshooting

### Problém: Data jsou stará (>48h)

**Příznaky**:
- Health check vrací "degraded"
- Titulní stránka zobrazuje staré datum

**Řešení**:
1. Zkontroluj GitHub Actions logs
2. Zkontroluj zda workflow proběhl (Actions → Daily Data Refresh)
3. Pokud ne, spusť manuálně: Run workflow
4. Pokud ano ale selhal, check logs pro error

**Prevence**:
- Nastav email notifikace v GitHub (Settings → Notifications)
- Nastav UptimeRobot monitor pro health check

---

### Problém: GitHub Actions selhává

**Možné příčiny**:
- Netflix API timeout
- TMDB API rate limit
- Cloudflare deployment issue

**Řešení**:
1. Check workflow logs v GitHub Actions
2. Test API ručně: `curl https://www.topflix.cz/api/top10`
3. Check Cloudflare dashboard pro errors
4. Re-run workflow manually

---

### Problém: UptimeRobot posílá false alerts

**Řešení**:
1. Zkontroluj že keyword match je správný: `"status":"healthy"`
2. Zkontroluj že URL je správná
3. Změn interval na 15 minut místo 5 (méně false positives)

---

## 📞 Emergency Contacts

**Když všechno selže**:
1. Smaž kompletní KV cache:
   ```bash
   npx wrangler kv key list --namespace-id 1844bf2efc7d41b89ddb224d7eab20d4 --remote | \
     jq -r '.[].name' | xargs -I {} npx wrangler kv key delete {} \
     --namespace-id 1844bf2efc7d41b89ddb224d7eab20d4 --remote
   ```

2. Restart Cloudflare Pages deployment:
   - Jdi do Cloudflare Dashboard
   - Pages → topflix → Deployments
   - Retry latest deployment

3. Re-deploy from scratch:
   ```bash
   git push --force origin main
   ```

---

## 📈 Metrics to Watch

| Metrika | Threshold | Action |
|---------|-----------|--------|
| Data age | >48h | Alert + manual refresh |
| Database size | <50 records | Alert + investigate |
| API response time | >5s | Check Cloudflare logs |
| Cache hit rate | <80% | Review cache strategy |
| Health check uptime | <99% | Investigate issues |

---

## 🎯 Success Criteria

✅ **Data jsou vždy fresh** (<48h old)
✅ **Žádné downtime** (99.9% uptime)
✅ **Automatické recovery** (GitHub Actions + UptimeRobot)
✅ **Fast response** (<2s average)
✅ **Proactive alerts** (před critical failures)
