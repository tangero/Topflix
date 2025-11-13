# Topflix - Real-time Speech-to-Text Service

## Přehled

Real-time služba pro přepis mluvené řeči v češtině určená především pro neslyšící osoby. Využívá ElevenLabs ScribeRealtime v2 API s ultra-nízkou latencí (~150ms) a vysokou přesností (>95%).

## Funkce

- ✅ **Real-time transkripce** - Okamžitý přepis mluveného slova
- ✅ **Podpora češtiny** - Vysoká přesnost pro český jazyk (WER <5%)
- ✅ **Ultra-nízká latence** - Přepis se zobrazí během ~150ms
- ✅ **Responsivní design** - Funguje na všech zařízeních (desktop, tablet, mobil)
- ✅ **Dark/Light mode** - Podpora světlého a tmavého režimu
- ✅ **Bezpečné** - Audio se nezaznamenává, pouze streamuje

## Technologie

### Frontend
- **HTML5** - Moderní webová struktura
- **CSS3** - Responsivní design s CSS variables
- **JavaScript (ES6+)** - Web Audio API, WebSocket API

### Backend
- **Cloudflare Pages Functions** - Serverless API endpoints
- **ElevenLabs ScribeRealtime v2** - AI model pro speech-to-text
- **WebSocket** - Real-time komunikace

## Architektura

```
┌─────────────┐
│   Browser   │
│  (prepis.html)
└──────┬──────┘
       │
       │ 1. Request Token
       │
       ▼
┌──────────────────────┐
│ Cloudflare Pages     │
│ Function             │
│ /api/scribe-token    │
└──────┬───────────────┘
       │
       │ 2. Generate Token
       │
       ▼
┌──────────────────────┐
│ ElevenLabs API       │
│ /single-use-token    │
└──────┬───────────────┘
       │
       │ 3. Return Token
       │
       ▼
┌─────────────┐
│   Browser   │
│ WebSocket   │
└──────┬──────┘
       │
       │ 4. Connect with Token
       │
       ▼
┌──────────────────────┐
│ ElevenLabs WebSocket │
│ wss://api.elevenlabs.io
│ /v1/scribe           │
└──────────────────────┘
       │
       │ 5. Stream Audio ─────►
       │ ◄───── Return Text
       │
```

## Instalace a konfigurace

### 1. Získání ElevenLabs API klíče

1. Registrujte se na [ElevenLabs](https://elevenlabs.io)
2. Přejděte do [Settings → API Keys](https://elevenlabs.io/app/settings/api-keys)
3. Vytvořte nový API klíč
4. Zkopírujte klíč (zobrazí se pouze jednou!)

### 2. Lokální vývoj

```bash
# 1. Naklonujte repozitář
git clone https://github.com/tangero/topflix.git
cd topflix

# 2. Vytvořte .dev.vars soubor
cp .dev.vars.example .dev.vars

# 3. Přidejte váš ElevenLabs API klíč do .dev.vars
echo "ELEVENLABS_API_KEY=your_api_key_here" >> .dev.vars

# 4. Spusťte lokální development server
npx wrangler pages dev public --port 8788

# 5. Otevřete prohlížeč
# http://localhost:8788/prepis.html
```

### 3. Nasazení na Cloudflare Pages

```bash
# 1. Přihlaste se do Cloudflare
npx wrangler login

# 2. Nastavte environment variable v produkci
npx wrangler pages secret put ELEVENLABS_API_KEY

# 3. Deploy
npx wrangler pages deploy public
```

Nebo použijte Cloudflare Dashboard:
1. Settings → Environment variables
2. Přidejte `ELEVENLABS_API_KEY` s vaším klíčem
3. Deploy bude automaticky aktivován při push do main větve

## Použití

### Webové rozhraní

1. Navštivte [topflix.cz/prepis](https://topflix.cz/prepis)
2. Klikněte na "Spustit nahrávání"
3. Povolte přístup k mikrofonu (pokud se zobrazí dialog)
4. Mluvte do mikrofonu
5. Transkripce se zobrazí v reálném čase
6. Klikněte na "Zastavit" pro ukončení

### API Endpoint

#### GET `/api/scribe-token`

Generuje single-use token pro ElevenLabs WebSocket připojení.

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Response:**
```json
{
  "error": "Failed to generate token"
}
```

**Token vlastnosti:**
- Platnost: 15 minut
- Single-use: Lze použít pouze jednou
- Secure: Nevyžaduje přímý přístup k API klíči na klientovi

## Audio specifikace

- **Format:** PCM 16-bit mono
- **Sample rate:** 16,000 Hz (optimální pro řeč)
- **Encoding:** Base64
- **Buffer size:** 4096 samples (~256ms při 16kHz)

## WebSocket komunikace

### Připojení
```
wss://api.elevenlabs.io/v1/scribe?token={TOKEN}&model_id=scribe_realtime_v2&language=cs
```

### Odesílání audio chunks
```javascript
{
  "audio": "base64_encoded_pcm_audio_data"
}
```

### Příjem transkripce

**Partial (průběžná):**
```javascript
{
  "type": "partial",
  "text": "průběžný přepis..."
}
```

**Final/Committed (finální):**
```javascript
{
  "type": "final",
  "text": "finální přepis věty"
}
```

## Řešení problémů

### "Nepodařilo se získat přístup k mikrofonu"

- **Povolte přístup k mikrofonu** v nastavení prohlížeče
- **HTTPS požadavek** - mikrofon funguje pouze na HTTPS (kromě localhost)
- **Zkontrolujte oprávnění** pro konkrétní stránku

### "Nepodařilo se získat autentizační token"

- **Zkontrolujte API klíč** v environment variables
- **Zkontrolujte připojení** k internetu
- **Ověřte kredit** na ElevenLabs účtu

### "Chyba připojení k službě přepisu"

- **Zkontrolujte token** - může být expirovaný (15 min)
- **Zkontrolujte firewall** - WebSocket spojení na port 443
- **Rate limiting** - zkuste později (ElevenLabs má limity)

### Lokální vývoj nefunguje

```bash
# Zkontrolujte .dev.vars soubor
cat .dev.vars

# Musí obsahovat:
ELEVENLABS_API_KEY=your_actual_api_key

# Restart dev serveru
npx wrangler pages dev public --port 8788
```

## Omezení

### ElevenLabs limity

- **Free tier:** 10,000 znaků/měsíc (~2 hodiny audio)
- **Starter:** 100,000 znaků/měsíc (~20 hodin audio)
- **Professional:** Unlimited

Více informací: [ElevenLabs Pricing](https://elevenlabs.io/pricing)

### Prohlížeče

- ✅ Chrome/Edge 60+
- ✅ Firefox 55+
- ✅ Safari 14+
- ❌ IE 11 (nepodporováno)

## Bezpečnost

- ✅ **API klíč** - Uložen pouze na serveru (Cloudflare)
- ✅ **HTTPS** - Veškerá komunikace šifrována
- ✅ **No recording** - Audio se nezaznamenává
- ✅ **Single-use tokens** - Token platný pouze 15 minut a jen jednou
- ✅ **CORS** - Správně nakonfigurované CORS headers

## Vývoj

### Struktura souborů

```
topflix/
├── public/
│   ├── prepis.html          # Hlavní HTML stránka
│   ├── prepis.js            # JavaScript logika
│   ├── prepis-style.css     # Specifické styly
│   └── style.css            # Sdílené styly
├── functions/
│   └── api/
│       └── scribe-token.js  # Cloudflare Function pro tokeny
├── .dev.vars.example        # Příklad environment variables
├── wrangler.toml            # Cloudflare konfigurace
└── PREPIS_README.md         # Tato dokumentace
```

### Přidání nových funkcí

1. **Podpora více jazyků** - Změnit parametr `language` ve WebSocket URL
2. **Export transkripce** - Přidat tlačítko pro export do TXT/PDF
3. **Historie** - Uložit transkripce do D1 databáze
4. **Sdílení** - Možnost sdílet transkripci přes URL

## Licence

Součást projektu Topflix - MIT License

## Autor

**Marek Prokop (Tangero)**
- GitHub: [@tangero](https://github.com/tangero)
- Web: [topflix.cz](https://topflix.cz)

## Odkazy

- [ElevenLabs Dokumentace](https://elevenlabs.io/docs)
- [Cloudflare Pages](https://pages.cloudflare.com)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
