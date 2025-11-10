# Newsletter Setup - Topflix

Tento dokument popisuje, jak nastavit týdenní newsletter pro Topflix.

## Přehled

Newsletter systém:
- Odebírá se jednoduchým formulářem v patičce každé stránky
- Obsahuje doporučené filmy a seriály s hodnocením ≥70%
- Odesílá se automaticky každou středu v 15:00 UTC (16:00 CET)
- Používá Resend.com Broadcast API
- Unsubscribe je automaticky zpracován Resendem

## 1. Nastavení Resend.com

### 1.1 Účet a API klíč

1. Přihlaš se na [resend.com](https://resend.com)
2. Jdi do **API Keys** a vytvoř nový klíč
3. Zkopíruj API klíč (začíná `re_...`)

### 1.2 Ověření domény

1. Jdi do **Domains** a přidej doménu `topflix.cz`
2. Přidej DNS záznamy pro ověření:
   - TXT záznam pro ověření domény
   - MX, TXT, CNAME záznamy pro email delivery
3. Počkej na ověření (může trvat několik minut až hodin)

### 1.3 Audience (už máš vytvořené)

- **Audience ID**: `f94a01b3-8be8-451b-b797-1c20b8530d72`
- **Segment**: Topflix

## 2. Nastavení Environment Variables v Cloudflare

Jdi do Cloudflare Dashboard:
1. **Pages** → Tvůj projekt **Topflix**
2. **Settings** → **Environment variables**
3. Přidej tyto proměnné:

### Pro Production:

```
RESEND_API_KEY = re_tvuj_api_klic_zde
RESEND_AUDIENCE_ID = f94a01b3-8be8-451b-b797-1c20b8530d72
TMDB_API_KEY = (už máš nastavené)
```

### Pro Preview (volitelně, stejné hodnoty):

```
RESEND_API_KEY = re_tvuj_api_klic_zde
RESEND_AUDIENCE_ID = f94a01b3-8be8-451b-b797-1c20b8530d72
TMDB_API_KEY = (už máš nastavené)
```

**DŮLEŽITÉ:** Po přidání proměnných je nutné **redeploy** projektu!

## 3. Nastavení Cron Triggeru (Automatické odesílání)

**✅ UŽ NASTAVENO!** Cron trigger je aktivní a běží automaticky.

### Co bylo provedeno:

Cloudflare Pages nepodporují cron triggers přímo, proto byl vytvořen samostatný **Cloudflare Worker** který:
- Běží na: `https://topflix-newsletter-cron.zandl.workers.dev`
- Spouští se každou středu v 15:00 UTC (cron: `0 15 * * 3`)
- Volá endpoint: `https://www.topflix.cz/api/newsletter-send`

**Worker je již deploynutý a aktivní!**

### Jak zkontrolovat, že funguje:

1. Jdi do [Cloudflare Dashboard](https://dash.cloudflare.com)
2. **Workers & Pages** → **topflix-newsletter-cron**
3. V **Metrics** uvidíš kdy Worker naposledy běžel
4. V **Logs** (Real-time) uvidíš výstupy z posledního spuštění

### Architektura:

```
Cron Trigger (každá středa 15:00 UTC)
         ↓
Cloudflare Worker (topflix-newsletter-cron)
         ↓
POST → https://www.topflix.cz/api/newsletter-send
         ↓
Resend Broadcast API → Email všem subscriber-ům
```

### Cron Expression vysvětlení

`0 15 * * 3` znamená:
- `0` - 0. minuta
- `15` - 15. hodina (UTC)
- `*` - každý den v měsíci
- `*` - každý měsíc
- `3` - středa (0 = neděle, 3 = středa)

**Poznámka:** 15:00 UTC = 16:00 CET (v zimě) / 17:00 CEST (v létě)

## 4. Testování

### 4.1 Test subscribe formuláře

1. Otevři stránku [www.topflix.cz](https://www.topflix.cz)
2. Scrolluj dolů na konec stránky
3. Zadej email a klikni na "Odebírat"
4. Měl by se zobrazit úspěšný message

Zkontroluj v Resend Dashboard → Audiences → Topflix, zda se email přidal.

### 4.2 Náhled newsletteru

Otevři v browseru:
```
https://www.topflix.cz/api/newsletter-preview
```

Zobrazí se HTML náhled aktuálního newsletteru s doporučeným obsahem.

### 4.3 Test odeslání emailu

Použij cURL nebo Postman:

```bash
curl -X POST https://www.topflix.cz/api/newsletter-test \
  -H "Content-Type: application/json" \
  -d '{"email": "tvuj@email.cz"}'
```

Na zadaný email přijde testovací newsletter.

### 4.4 Manuální odeslání broadcast

Pro okamžité odeslání newsletteru všem subscriber-ům:

```bash
curl -X POST https://www.topflix.cz/api/newsletter-send
```

**POZOR:** Toto odešle newsletter VŠEM subscriber-ům! Používej opatrně.

## 5. API Endpointy

### `/api/newsletter-subscribe` (POST)
Přidá email do audience.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully subscribed",
  "contact_id": "xxx"
}
```

### `/api/newsletter-preview` (GET)
Vrátí HTML náhled newsletteru.

### `/api/newsletter-test` (POST)
Odešle testovací email.

**Request:**
```json
{
  "email": "test@example.com"
}
```

### `/api/newsletter-send` (POST)
Manuálně odešle broadcast všem subscriber-ům.

## 6. Monitoring

### Cloudflare Logs

Sleduj logy v Cloudflare Dashboard:
- **Pages** → Tvůj projekt → **Functions** → **Real-time logs**

### Resend Dashboard

Sleduj delivery metriky:
- **Broadcasts** - seznam odeslaných broadcast emailů
- **Emails** - individuální emaily a jejich status
- **Audiences** - počet subscriber-ů

## 7. Časté problémy

### Newsletter se neposílá

1. Zkontroluj, že cron trigger je správně nastavený
2. Zkontroluj environment variables (RESEND_API_KEY, RESEND_AUDIENCE_ID, TMDB_API_KEY)
3. Zkontroluj Cloudflare Functions logs pro chybové zprávy

### Email nedorazil

1. Zkontroluj Resend Dashboard → Emails, zda email byl odeslán
2. Zkontroluj SPAM složku
3. Zkontroluj, že doména `topflix.cz` je ověřená v Resend

### Formulář nefunguje

1. Otevři Browser Console (F12) a hledej chybové zprávy
2. Zkontroluj Network tab, zda request na `/api/newsletter-subscribe` byl úspěšný
3. Zkontroluj environment variables

## 8. Úpravy obsahu

Pokud chceš upravit obsah nebo design newsletteru, uprav:

- **Logika generování**: `/functions/_lib/newsletter-generator.js`
- **HTML šablona**: funkce `generateNewsletterHTML()` v newsletter-generator.js
- **Text verze**: funkce `generateNewsletterText()` v newsletter-generator.js

Po úpravě je nutné **redeploy** projektu.

## 9. Bezpečnost

- API klíče jsou uloženy jako environment variables v Cloudflare (šifrované)
- Subscribe endpoint má validaci emailu
- CORS je nastavený pro všechny originy (můžeš omezit na topflix.cz)
- Unsubscribe je automaticky zpracován Resendem přes `{{{RESEND_UNSUBSCRIBE_URL}}}`

## 10. Náklady

### Resend Pro tarif:
- 50,000 emailů/měsíc: $20/měsíc
- Každý další email: $0.0004

**Odhad:**
- 100 subscriber-ů × 4 středy = 400 emailů/měsíc = $0
- 1,000 subscriber-ů × 4 středy = 4,000 emailů/měsíc = $0
- 10,000 subscriber-ů × 4 středy = 40,000 emailů/měsíc = $0

Newsletter je zdarma až do 50,000 emailů/měsíc, což odpovídá ~12,500 subscriber-ům.

---

Vytvořeno pro Topflix | Aktualizováno: 10. listopad 2025
