# Topflix Newsletter Cron Worker

Tento Worker zpracovává automatické odesílání týdenního newsletteru.

## Proč samostatný Worker?

Cloudflare Pages Functions **nepodporují cron triggers** přímo. Pouze Cloudflare Workers mohou používat scheduled handlers s cron triggery.

**Řešení:** Samostatný Worker s cron triggerem, který volá Pages Function endpoint.

## Architektura

```
Cron Trigger (0 15 * * 3)
        ↓
Worker: topflix-newsletter-cron
        ↓
POST: https://www.topflix.cz/api/newsletter-send
        ↓
Pages Function: /functions/api/newsletter-send.js
        ↓
Resend Broadcast API
        ↓
Email všem subscriber-ům
```

## Co dělá tento Worker?

1. Spouští se každou středu v 15:00 UTC (16:00 CET / 17:00 CEST)
2. Volá POST request na `https://www.topflix.cz/api/newsletter-send`
3. Loguje výsledek do Cloudflare Logs

## Deployment

Worker je již deploynutý! Pokud potřebuješ redeploy:

```bash
cd workers
npx wrangler deploy
```

## Monitoring

Zkontroluj běh Worker-a v Cloudflare Dashboard:
1. **Workers & Pages** → **topflix-newsletter-cron**
2. **Metrics** - Kdy naposledy běžel
3. **Logs** - Výstupy z posledního spuštění

## Konfigurace

Cron expression je nastaven v `wrangler.toml`:

```toml
[triggers]
crons = ["0 15 * * 3"]
```

**Poznámka:** Žádné environment variables nejsou potřeba - Worker jen volá endpoint, veškerá logika a credentials jsou v Pages Functions.

## Testing

Worker má také HTTP endpoint pro debugging:

```bash
curl https://topflix-newsletter-cron.zandl.workers.dev
```

Vrátí info o konfiguraci Worker-a.
