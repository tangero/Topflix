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
- **Cloudflare Pages Functions** - API endpoint (`/functions/api/top10.js`)
- **Cloudflare KV** - ukládání dat s 7denním TTL
- **Cron Worker** (volitelný) - automatické updaty každé úterý v 10:00 UTC

### Frontend
- **Vanilla JavaScript** - bez framework závislostí
- **Cloudflare Pages** - hosting statických souborů + API
- **LocalStorage** - klientské cachování

### Datové zdroje
- **Netflix Top 10** - `https://top10.netflix.com`
- **TMDB API** - hodnocení, metadata, postery
- **ČSFD** - české hodnocení (scraping)

## 🚀 Rychlé nasazení na Cloudflare Pages

### Způsob 1: Přes GitHub (doporučeno - automatické deploymenty)

1. **Získejte TMDB API klíč** zdarma na [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)

2. **Připojte repozitář na Cloudflare:**
   - Přejděte na [Cloudflare Dashboard](https://dash.cloudflare.com)
   - **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
   - Vyberte tento repozitář

3. **Build nastavení:**
   ```
   Framework preset:       None
   Build command:          (prázdné)
   Build output directory: public
   ```

4. **Nastavte KV a API klíč:**
   - V Pages projektu: **Settings** → **Functions** → **KV namespace bindings**
     - Vytvořte KV namespace `TOPFLIX_KV` a propojte
   - **Settings** → **Environment variables**
     - Přidejte `TMDB_API_KEY` s vaším TMDB klíčem

5. **Re-deploy** a hotovo! 🎉

📖 **Podrobný krok-za-krokem návod:** [DEPLOYMENT.md](DEPLOYMENT.md)

### Způsob 2: Přes Wrangler CLI

```bash
# 1. Instalace
npm install

# 2. Přihlášení
npx wrangler login

# 3. Vytvoření KV namespace
npx wrangler kv:namespace create "TOPFLIX_KV"

# 4. Deploy Pages
npm run deploy

# 5. (Volitelné) Deploy cron worker pro auto-update
npm run deploy:cron
```

### Lokální vývoj

```bash
# Vytvořte .dev.vars soubor
echo "TMDB_API_KEY=your_key_here" > .dev.vars

# Spusťte dev server
npm run dev
```

Otevřete http://localhost:8788 v prohlížeči.

## 🔧 Konfigurace

### wrangler.toml (pro Pages)

```toml
name = "topflix"
compatibility_date = "2024-01-01"
pages_build_output_dir = "public"

# KV namespace - vytvořte přes dashboard nebo CLI
[[kv_namespaces]]
binding = "TOPFLIX_KV"
id = "your-kv-namespace-id"
```

### wrangler-cron.toml (pro automatické updaty - volitelné)

```toml
name = "topflix-cron"
main = "workers/cron.js"
compatibility_date = "2024-01-01"

# Cron trigger (každé úterý v 10:00 UTC)
[triggers]
crons = ["0 10 * * 2"]

# Vaše Pages URL
[vars]
PAGES_URL = "https://topflix.pages.dev"
```

## 📊 Monitoring a údržba

### Zobrazení KV dat

```bash
# Výpis všech klíčů
npx wrangler kv:key list --namespace-id=YOUR_NAMESPACE_ID

# Zobrazení konkrétní hodnoty
npx wrangler kv:key get "netflix_top10_cz_2024-45" --namespace-id=YOUR_NAMESPACE_ID
```

### Sledování logů

V Cloudflare Dashboard:
1. **Workers & Pages** → **topflix** (váš Pages projekt)
2. **Functions** → **Real-time logs**

### Metriky a analytics

1. Cloudflare Dashboard → Workers & Pages → topflix
2. **Analytics** → sledujte:
   - Request count
   - Error rate
   - Bandwidth

## 🛠️ Vývoj

### Struktura projektu

```
topflix/
├── functions/
│   └── api/
│       └── top10.js        # Pages Function - API endpoint
├── workers/
│   ├── api.js              # Původní Worker (deprecated)
│   └── cron.js             # Cron Worker (volitelný)
├── public/
│   ├── index.html          # Hlavní HTML
│   ├── style.css           # Styly
│   └── app.js              # Frontend JavaScript
├── wrangler.toml           # Pages konfigurace
├── wrangler-cron.toml      # Cron Worker konfigurace (volitelné)
├── package.json            # NPM konfigurace
├── DEPLOYMENT.md           # Podrobný deployment návod
└── README.md               # Dokumentace
```

### Lokální testování

```bash
# Start Pages dev server
npm run dev

# Test API endpoint
curl http://localhost:8788/api/top10

# Test v prohlížeči
open http://localhost:8788
```

### Debug

Sledujte logy v real-time:
1. V Cloudflare Dashboard → Functions → Real-time logs (pro produkci)
2. Při lokálním vývoji vidíte logy přímo v terminálu

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

V `functions/api/top10.js`, funkce `enrichTitle()`:

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
