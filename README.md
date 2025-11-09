# 🎬 Topflix

Netflix Top 10 s hodnocením pro ČR - týdenní přehled filmů a seriálů s hodnocením z TMDB a ČSFD.

![Topflix Preview](https://via.placeholder.com/800x400/141414/e50914?text=Topflix)

## 📋 Přehled

Topflix je webová aplikace, která zobrazuje aktuální Netflix Top 10 filmy a seriály pro český trh, obohacené o hodnocení z mezinárodních (TMDB) a českých (ČSFD) databází. Aplikace pomáhá uživatelům identifikovat kvalitní obsah pomocí barevného označení a filtrování.

### Klíčové funkce

- ✅ **Netflix Top 10** filmy a seriály pro ČR
- ⭐ **Hodnocení z TMDB a ČSFD** pro každý titul
- 🎨 **Barevné indikátory kvality** (zelená/žlutá/červená)
- 📱 **Mobile-first responsive design**
- 🌙 **Dark mode** (výchozí) a světlý režim
- 🔍 **Filtry a řazení** (filmy/seriály, podle hodnocení)
- 💾 **Automatická aktualizace** každé úterý
- ⚡ **Rychlé načítání** s cachováním

## 🏗️ Architektura

### Backend
- **Cloudflare Workers** - API endpoint a automatická aktualizace
- **Cloudflare KV** - ukládání dat s 7denním TTL
- **Cron Triggers** - automatické updaty každé úterý v 10:00 UTC

### Frontend
- **Vanilla JavaScript** - bez framework závislostí
- **Cloudflare Pages** - hosting statických souborů
- **LocalStorage** - klientské cachování

### Datové zdroje
- **Netflix Top 10** - `https://top10.netflix.com`
- **TMDB API** - hodnocení, metadata, postery
- **ČSFD** - české hodnocení (scraping)

## 🚀 Nasazení

### Předpoklady

- Node.js 18+
- npm nebo yarn
- Cloudflare účet (free tier postačuje)
- TMDB API klíč (zdarma na [themoviedb.org](https://www.themoviedb.org/settings/api))

### Krok 1: Instalace závislostí

```bash
npm install
```

### Krok 2: Získání TMDB API klíče

1. Registrujte se na [TMDB](https://www.themoviedb.org/signup)
2. Přejděte do Settings → API
3. Vytvořte nový API klíč (Developer)
4. Zkopírujte klíč

### Krok 3: Vytvoření KV namespace

```bash
# Přihlášení do Cloudflare
npx wrangler login

# Vytvoření KV namespace
npx wrangler kv:namespace create "TOPFLIX_KV"

# Pro preview (development)
npx wrangler kv:namespace create "TOPFLIX_KV" --preview
```

Zkopírujte vygenerované ID a aktualizujte `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "TOPFLIX_KV", id = "YOUR_NAMESPACE_ID", preview_id = "YOUR_PREVIEW_ID" }
]
```

### Krok 4: Nastavení proměnných prostředí

Vytvořte soubor `.dev.vars` pro lokální vývoj:

```bash
TMDB_API_KEY=your_tmdb_api_key_here
```

Pro produkci nastavte tajemství:

```bash
npx wrangler secret put TMDB_API_KEY
# Zadejte váš TMDB API klíč
```

### Krok 5: Lokální vývoj a testování

```bash
# Spuštění lokálního dev serveru
npm run dev
```

Otevřete http://localhost:8787/api/top10 pro testování API.

### Krok 6: Deploy Worker

```bash
# Deploy API Worker
npm run deploy
```

Po deployi dostanete URL vašeho Workeru, např. `https://topflix-api.your-subdomain.workers.dev`

### Krok 7: Aktualizace frontend API endpointu

V souboru `public/app.js` aktualizujte API endpoint:

```javascript
const API_ENDPOINT = 'https://topflix-api.your-subdomain.workers.dev/api/top10';
```

Nebo pokud budete používat Cloudflare Pages s Worker routing, můžete nechat:

```javascript
const API_ENDPOINT = '/api/top10';
```

### Krok 8: Deploy Frontend (Cloudflare Pages)

#### Manuální deployment

```bash
npm run deploy:pages
```

#### Automatický deployment (doporučeno)

1. Přejděte do [Cloudflare Dashboard → Pages](https://dash.cloudflare.com/?to=/:account/pages)
2. Klikněte na "Create a project"
3. Připojte váš Git repozitář
4. Nastavte build configuration:
   - **Build command**: (ponechte prázdné)
   - **Build output directory**: `public`
   - **Root directory**: `/`
5. Klikněte na "Save and Deploy"

### Krok 9: Nastavení Worker Routes (volitelné)

Pro propojení Pages a Worker na stejné doméně:

1. V Cloudflare Pages → Settings → Functions
2. Přidejte Worker route: `/api/*` → `topflix-api`

## 🔧 Konfigurace

### wrangler.toml

```toml
name = "topflix-api"
main = "workers/api.js"
compatibility_date = "2024-01-01"

# KV namespace
kv_namespaces = [
  { binding = "TOPFLIX_KV", id = "YOUR_KV_ID", preview_id = "YOUR_PREVIEW_ID" }
]

# Cron trigger (každé úterý v 10:00 UTC)
[triggers]
crons = ["0 10 * * 2"]

# Custom domain (volitelné)
[env.production]
routes = [
  { pattern = "topflix.yourdomain.com/api/*", zone_name = "yourdomain.com" }
]
```

### Úprava frekvence aktualizace

Cron trigger lze upravit v `wrangler.toml`:

```toml
# Každý den v 10:00 UTC
crons = ["0 10 * * *"]

# Každý pondělí a pátek v 08:00 UTC
crons = ["0 8 * * 1,5"]
```

## 📊 Monitoring a údržba

### Zobrazení KV dat

```bash
# Výpis všech klíčů
npx wrangler kv:key list --namespace-id=YOUR_NAMESPACE_ID

# Zobrazení konkrétní hodnoty
npx wrangler kv:key get "netflix_top10_cz_2024-45" --namespace-id=YOUR_NAMESPACE_ID
```

### Manuální trigger cron jobu

```bash
# Trigger cron job pro aktualizaci dat
npx wrangler dev --test-scheduled
```

### Sledování logů

```bash
# Real-time logy z Worker
npx wrangler tail
```

### Metriky a analytics

1. Cloudflare Dashboard → Workers & Pages → topflix-api
2. Sledujte:
   - Request count
   - Error rate
   - CPU time
   - KV operations

## 🛠️ Vývoj

### Struktura projektu

```
topflix/
├── workers/
│   └── api.js              # Cloudflare Worker API
├── public/
│   ├── index.html          # Hlavní HTML
│   ├── style.css           # Styly
│   └── app.js              # Frontend JavaScript
├── wrangler.toml           # Cloudflare konfigurace
├── package.json            # NPM konfigurace
└── README.md               # Dokumentace
```

### Lokální testování

```bash
# Start dev server
npm run dev

# Test API endpoint
curl http://localhost:8787/api/top10

# Test s cachováním
curl -H "Cache-Control: no-cache" http://localhost:8787/api/top10
```

### Debug

Přidejte console.log do `workers/api.js` a sledujte pomocí `wrangler tail`.

## 🎨 Customizace

### Změna barev

Upravte CSS proměnné v `public/style.css`:

```css
:root {
    --bg-primary: #141414;
    --accent: #e50914;        /* Hlavní barva */
    --quality-green: #46d369;
    --quality-yellow: #ffd700;
    --quality-red: #ff4444;
}
```

### Úprava hodnocení prahů

V `workers/api.js`, funkce `enrichTitle()`:

```javascript
let quality = 'yellow';
if (avgRating >= 75) quality = 'green';  // Zvýšení prahu
else if (avgRating < 40) quality = 'red'; // Snížení prahu
```

## 📝 Limitace Cloudflare Free Tier

- **Workers**: 100,000 requests/den ✅
- **KV Storage**: 1 GB, 100,000 reads/den ✅
- **KV Writes**: 1,000/den ✅
- **Cron Triggers**: 3 triggery ✅
- **Pages**: Unlimited requests ✅

Topflix je navržen tak, aby fungoval komfortně v rámci free tier limitů.

## 🐛 Řešení problémů

### API vrací prázdná data

1. Zkontrolujte TMDB API klíč: `npx wrangler secret list`
2. Ověřte KV namespace ID v `wrangler.toml`
3. Zkontrolujte logy: `npx wrangler tail`

### ČSFD scraping nefunguje

ČSFD může blokovat požadavky. Řešení:
- Přidejte delší delay mezi požadavky (zvyšte `sleep(2000)` na `sleep(5000)`)
- Ověřte, že User-Agent je nastaven správně
- V produkci může být potřeba používat proxy

### Cron job neběží

1. Ověřte, že cron trigger je definován v `wrangler.toml`
2. Zkontrolujte v Dashboard → Workers → Triggers
3. Testujte lokálně: `npx wrangler dev --test-scheduled`

### Data se neaktualizují

1. Vymažte KV cache: `npx wrangler kv:key delete "netflix_top10_cz_2024-XX"`
2. Vymažte browser cache: localStorage
3. Zkontrolujte, zda cron job běží

## 🤝 Přispívání

1. Fork repozitář
2. Vytvořte feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit změny (`git commit -m 'Add some AmazingFeature'`)
4. Push do branch (`git push origin feature/AmazingFeature`)
5. Otevřete Pull Request

## 📄 Licence

MIT License - viz [LICENSE](LICENSE)

## 🙏 Poděkování

- **Netflix** za veřejná Top 10 data
- **TMDB** za API a metadata
- **ČSFD** za české hodnocení
- **Cloudflare** za skvělou free tier infrastrukturu

## 📧 Kontakt

Pro otázky a návrhy otevřete issue na GitHubu.

---

**Vytvořeno s ❤️ pro milovníky dobrých filmů a seriálů**
