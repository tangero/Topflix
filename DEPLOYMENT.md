# 🚀 Topflix - Průvodce nasazením na Cloudflare Pages

Tento návod vás provede **krok za krokem** nasazením Topflix na Cloudflare Pages s využitím GitHub integrace.

## 📋 Co budete potřebovat

- ✅ Cloudflare účet (free tier stačí) - [Registrace](https://dash.cloudflare.com/sign-up)
- ✅ GitHub repozitář s Topflix kódem
- ✅ TMDB API klíč - [Jak získat](#1-získání-tmdb-api-klíče)
- ✅ 10-15 minut času

## 🎯 Způsob nasazení: Cloudflare Pages

Topflix používá **Cloudflare Pages** pro vše:
- 🌐 Frontend (HTML/CSS/JS) - automaticky
- ⚡ Backend API - pomocí Pages Functions (`functions/` adresář)
- 💾 KV storage - pro cachování dat
- 🔄 Cron trigger - volitelný separátní Worker pro auto-update

---

## Krok 1: Získání TMDB API klíče

1. Přejděte na [TMDB](https://www.themoviedb.org/signup) a zaregistrujte se
2. Po přihlášení: **Profil** → **Settings** → **API**
3. Klikněte na **"Create"** nebo **"Request an API Key"**
4. Vyberte **"Developer"**
5. Vyplňte formulář (můžete uvést osobní projekt)
6. Zkopírujte **API Key (v3 auth)** - bude vypadat např. `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

💾 **Uložte si tento klíč** - budete ho potřebovat později!

---

## Krok 2: Připojení GitHub repozitáře k Cloudflare Pages

### A. Přihlášení do Cloudflare

1. Přejděte na [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Přihlaste se (nebo se zaregistrujte)

### B. Vytvoření Pages projektu

1. V levém menu klikněte na **"Workers & Pages"**
2. Klikněte na **"Create application"**
3. Vyberte tab **"Pages"**
4. Klikněte na **"Connect to Git"**

### C. Propojení s GitHub

1. Autorizujte Cloudflare přístup k vašemu GitHub účtu
2. Vyberte repozitář **"Topflix"** (nebo jak jste ho pojmenovali)
3. Klikněte na **"Begin setup"**

### D. Konfigurace build settings

Na stránce **"Set up builds and deployments"**:

| Pole | Hodnota |
|------|---------|
| **Project name** | `topflix` (nebo vlastní název) |
| **Production branch** | `main` nebo `master` |
| **Framework preset** | `None` |
| **Build command** | (nechte prázdné) |
| **Build output directory** | `public` |
| **Root directory** | `/` |

4. Klikněte na **"Save and Deploy"**

⏳ První deployment proběhne, ale **ještě nebude fungovat** - musíte nastavit KV a API klíč!

---

## Krok 3: Vytvoření KV namespace

KV namespace slouží k ukládání dat s cachováním.

### A. Vytvoření přes Cloudflare Dashboard

1. V Cloudflare Dashboard: **Workers & Pages** → **KV**
2. Klikněte **"Create namespace"**
3. **Namespace Name**: `TOPFLIX_KV`
4. Klikněte **"Add"**

💾 **Poznamenejte si Namespace ID** - bude zobrazeno v seznamu (např. `a1b2c3d4e5f6...`)

### B. Alternativa: Vytvoření přes CLI (pokud máte Wrangler)

```bash
npm install
npx wrangler login
npx wrangler kv:namespace create "TOPFLIX_KV"
```

---

## Krok 4: Propojení KV namespace s Pages

1. V Cloudflare Dashboard: **Workers & Pages** → klikněte na váš **"topflix"** projekt
2. Přejděte na **"Settings"** → **"Functions"**
3. Scroll down na sekci **"KV namespace bindings"**
4. Klikněte **"Add binding"**

Vyplňte:
- **Variable name**: `TOPFLIX_KV`
- **KV namespace**: Vyberte `TOPFLIX_KV` ze seznamu

5. Klikněte **"Save"**

---

## Krok 5: Nastavení TMDB API klíče

1. V nastaveních Pages projektu: **Settings** → **Environment variables**
2. Klikněte **"Add variable"**

**Pro Production:**
- **Variable name**: `TMDB_API_KEY`
- **Value**: Vložte váš TMDB API klíč (z Kroku 1)
- **Environment**: Zaškrtněte **Production**

3. Volitelně stejné pro **Preview** (development)
4. Klikněte **"Save"**

---

## Krok 6: Re-deploy po nastavení

Po nastavení KV a API klíče musíte znovu nasadit:

### Způsob A: Přes GitHub (doporučeno)

1. Pushněte jakoukoliv změnu do repozitáře (nebo prázdný commit):
```bash
git commit --allow-empty -m "Trigger redeploy"
git push
```

2. Cloudflare Pages automaticky spustí nový deployment

### Způsob B: Přes Dashboard

1. **Workers & Pages** → váš projekt → **Deployments**
2. Klikněte na tři tečky u posledního deploymentu
3. **"Retry deployment"**

---

## Krok 7: Testování

### A. Najděte URL vašeho Pages projektu

1. V Cloudflare Dashboard: **Workers & Pages** → **topflix**
2. Nahoře uvidíte URL: `https://topflix.pages.dev` (nebo vlastní název)

### B. Otevřete v prohlížeči

1. Přejděte na `https://your-project.pages.dev`
2. Měli byste vidět Topflix homepage

### C. Test API endpointu

Otevřete: `https://your-project.pages.dev/api/top10`

✅ **Úspěch**: Uvidíte JSON s Netflix Top 10 daty
❌ **Chyba**: Pokračujte na [Řešení problémů](#-řešení-problémů)

---

## Krok 8: (Volitelné) Nastavení automatických týdenních updateů

Pro automatické obnovování dat každé úterý v 10:00 UTC:

### Varianta A: Použití Cloudflare Cron Triggers (separátní Worker)

1. V terminálu:
```bash
npm install
npx wrangler login
```

2. Upravte `wrangler-cron.toml`:
```toml
[vars]
PAGES_URL = "https://your-actual-project.pages.dev"
```

3. Deploy cron worker:
```bash
npm run deploy:cron
```

### Varianta B: Použití externího cron servisu

Použijte služby jako:
- [cron-job.org](https://cron-job.org) (zdarma)
- [EasyCron](https://www.easycron.com) (zdarma)

Nastavte HTTP GET request:
- **URL**: `https://your-project.pages.dev/api/top10`
- **Schedule**: Každé úterý v 10:00 UTC
- **Headers**: `Cache-Control: no-cache`

---

## Krok 9: (Volitelné) Vlastní doména

Pokud chcete použít vlastní doménu místo `*.pages.dev`:

1. V Pages projektu: **Custom domains** → **"Set up a custom domain"**
2. Zadejte vaši doménu (např. `topflix.example.com`)
3. Postupujte podle instrukcí pro nastavení DNS

Cloudflare automaticky zajistí SSL certifikát.

---

## ✅ Hotovo!

Vaše aplikace Topflix je nyní nasazena a běží na Cloudflare Pages! 🎉

**Vaše URL**: `https://your-project.pages.dev`

### Co se děje dál?

- 📅 Data se cachují po dobu 7 dní
- 🔄 Každý push do GitHubu spustí nový deployment
- 💰 Vše běží na Cloudflare free tier
- ⚡ Globální CDN pro rychlé načítání

---

## 🐛 Řešení problémů

### Problém: API vrací chybu 500

**Příčina**: Chybí KV binding nebo TMDB API klíč

**Řešení**:
1. Zkontrolujte KV binding: **Settings** → **Functions** → **KV namespace bindings**
2. Zkontrolujte API klíč: **Settings** → **Environment variables**
3. Zkuste re-deploy

### Problém: Prázdná data nebo "Data not found"

**Příčina**: TMDB API klíč je neplatný nebo vypršel

**Řešení**:
1. Ověřte TMDB API klíč na [TMDB Settings](https://www.themoviedb.org/settings/api)
2. Vygenerujte nový klíč pokud je potřeba
3. Aktualizujte v Environment variables
4. Re-deploy

### Problém: ČSFD hodnocení chybí

**Příčina**: ČSFD může blokovat requesty z Cloudflare IP

**Řešení**:
1. To je normální - ČSFD scraping nemusí vždy fungovat
2. Aplikace bude fungovat i bez ČSFD hodnocení
3. Hodnocení bude jen z TMDB

### Problém: Deployment selhává

**Řešení**:
1. Zkontrolujte build logy v Cloudflare Dashboard
2. Ověřte, že **Build output directory** je nastaveno na `public`
3. Zkontrolujte, že složka `public/` obsahuje `index.html`

### Problém: Functions nefungují

**Řešení**:
1. Zkontrolujte, že složka `functions/` je v root repozitáře
2. Ujistěte se, že `functions/api/top10.js` existuje
3. Re-deploy projekt

---

## 📊 Monitoring a údržba

### Zobrazení logů

1. **Workers & Pages** → váš projekt → **Functions**
2. Klikněte na **"View logs"** nebo použijte **Real-time logs**

### Sledování usage

1. **Workers & Pages** → váš projekt → **Analytics**
2. Sledujte:
   - Request count
   - Error rate
   - Bandwidth

### Kontrola KV dat

1. **Workers & Pages** → **KV**
2. Klikněte na **TOPFLIX_KV**
3. Uvidíte uložené klíče (např. `netflix_top10_cz_2024-45`)

---

## 🔄 Aktualizace aplikace

Když budete chtít aktualizovat kód:

1. Proveďte změny v kódu lokálně
2. Commit a push do GitHubu:
```bash
git add .
git commit -m "Update XYZ"
git push
```
3. Cloudflare Pages automaticky nasadí novou verzi!

---

## 🆘 Potřebujete pomoc?

- 📚 [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- 💬 [Cloudflare Community](https://community.cloudflare.com/)
- 🐛 Otevřete issue v GitHub repozitáři

---

**Vytvořeno s ❤️ pro milovníky dobrých filmů a seriálů**
