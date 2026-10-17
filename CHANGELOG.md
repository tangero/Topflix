# Changelog

All notable changes to Topflix will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.14.2] - 2026-10-17

### Added
- Ikona webu: monogram „T“ písmem Fraunces na barvě akcentu. `favicon.ico` (16, 32, 48 px), `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` a `site.webmanifest` s `theme-color`

## [1.14.1] - 2026-10-17

### Fixed
- Stránky titulů, `/sitemap.xml` a přesměrování `/detail` odpovídaly na HEAD stavem 404, funkce obsluhovaly jen GET

## [1.14.0] - 2026-10-17

### Added
- Stránky titulů vykreslené na serveru: `/film/<slug>-<tmdb_id>` a `/serial/<slug>-<tmdb_id>` s vlastním titulkem, popisem, kanonickou adresou, náhledem pro sdílení (plakát) a strukturovanými daty Movie / TVSeries
- `/sitemap.xml` se stránkami webu a všemi hodnocenými tituly, `robots.txt`
- `404.html` s `noindex` pro neexistující adresy

### Changed
- Odkazy z titulky, seznamů, archivu a podobných titulů vedou na nové adresy titulů. Staré `detail.html?id=…` trvale přesměrují (301), adresa s jiným názvem také
- Strukturovaná data detailu už neobsahují `aggregateRating` s vymyšleným počtem hodnocení
- Tituly, které jen přibyly do katalogu a nemají hodnocení, mají `noindex` a v sitemapě nejsou

### Fixed
- „Kopírovat odkaz“ a „Zpět“ na detailu blokovala CSP (inline `onclick` a `javascript:`)
- Neexistující adresy vracely titulku se stavem 200
- `/unsubscribe` z hlavičky `List-Unsubscribe` přesměruje na odhlašovací formulář

### Technical
- `public/title-url.js` (slug a adresa titulu, sdílí prohlížeč i Pages Functions), `public/detail-view.js` (vykreslení detailu, ES modul pro obě strany), `functions/_lib/title-page.js` (HTMLRewriter nad šablonou `detail.html`)
- Testy `tests/node/title-pages.test.mjs`

## [1.13.0] - 2026-10-16

### Added
- Týdenní newsletter má mezi filmy a seriály reklamu označenou „Reklama“: workshop, akci, reklamní text nebo banner z vibecoding.cz, stejně jako na webu

### Fixed
- Cloudflare Web Analytics neodesílal data: CSP neobsahovala `https://cloudflareinsights.com` v `connect-src`

### Technical
- `fetchNewsletterPromo`, `normalizePromo`, `formatPromoHtml` a `formatPromoText` v `newsletter-generator.js`. Odkaz vede přes `clickUrl` s `site=topflix&surface=newsletter`. Když API do 3 s neodpoví, newsletter odejde bez reklamy
- Testy `tests/node/newsletter-promo.test.mjs`

## [1.12.0] - 2026-10-16

### Added
- Patička na všech stránkách odkazuje na další projekty: Přijímačky na střední školu, AI ve firmách a Workshopy pro AI vývojáře
- Reklamní zóna se štítkem „Reklama“ na stránkách Dnes, Filmy, Seriály, Archiv a Detail. Obsah (workshopy, akce, reklamní texty a bannery) vybírá propagační systém vibecoding.cz, stejně jako na marigold.cz

### Changed
- Nová patička: další projekty ve třech sloupcích (na mobilu pod sebou), pod nimi zdroje dat a verze
- Stránka newsletteru má stejný vzhled jako titulka: nadpis, krátký popis, formulář hned nahoře a odhlášení dole
- Filmy, Seriály, Newsletter, Nápověda a Changelog jsou vycentrované ve stejné šířce jako titulka
- Logo a nápis Topflix vedou na všech stránkách na úvod
- Newsletter má nahoře tituly z české Top 10 v pořadí žebříčku, pak novinky podle hodnocení

### Fixed
- Newsletter označoval jako „Nově na Netflix“ i tituly z Disney+, Apple TV+, Prime a SkyShowtime
- Hodnocení v newsletteru se počítalo jen z TMDB, takže nesedělo s webem
- Po přihlášení k newsletteru stránka žádala potvrzení e-mailem, které se neposílá
- Potvrzovací stránka newsletteru vkládala text z adresy bez ošetření (HTML injection)
- Patička newsletteru odkazovala na ČSFD, odkaz na verzi byl modrý
- `newsletter.js` padal na stránkách bez formuláře (changelog)

### Technical
- `public/promo-banner.js` čte `https://www.vibecoding.cz/api/active-promotion`, kliky měří přes `clickUrl` a imprese beaconem po 50% viditelnosti (`site=topflix`). Bez odpovědi zůstane zóna skrytá
- CSP v `_headers` povoluje `https://www.vibecoding.cz` v `connect-src` a `img-src`
- `fetchNewsletterData(apiKey, omdbApiKey)`; volající endpointy předávají `OMDB_API_KEY`

## [1.11.1] - 2026-10-16

### Fixed
- Po aktualizaci se nová titulka zobrazovala bez stylů, protože prohlížeč držel starou verzi `style.css` a skriptů

### Technical
- Odkazy na CSS a JS ve všech stránkách nesou `?v=<verze>`, aby nové vydání obešlo mezipaměť prohlížeče (max-age 4 h)

## [1.11.0] - 2026-10-15

### Added
- Nová titulka „Dnes“: jeden tip na večer s důvodem „proč“, alternativy podle situace, česká Top 10 s kontextem, nově přidané tituly a premiéry nad 70 %
- Volba „Kolik máte času“: film do 100 minut, film na celý večer, seriál na víkend, seriál na dlouho
- Tlačítka „Už jsem viděl“ a „Nezajímá mě“ schovají titul z výběru, skryté tituly jdou vrátit
- „Nově přidáno na Netflix“: co přibylo do českého katalogu za posledních 30 dní, včetně starších titulů, a co z něj zmizelo. Katalog se kontroluje dvakrát týdně.
- Stránka seriálů má vlastní „Seriál na dnešek“ s volbou na víkend, na dlouho, nová řada a krátké díly
- Archiv lze doplnit o českou Top 10 od července 2021 a filtrovat jen na to, co je teď na Netflixu
- Detail ukáže i titul, který zatím jen přibyl do katalogu, a týdny v Top 10 s umístěním

### Changed
- Netflix je hlavní osa: výběr i seznamy začínají u Netflixu, další služby si návštěvník přidá sám
- Katalog filmů se přesunul na /filmy.html, navigace je Dnes · Filmy · Seriály · Archiv · Newsletter
- Archiv používá stejné řádky jako zbytek webu, bez emoji nadpisů a vložených stylů
- „Méně známé, výborně hodnocené“ vyžaduje hodnocení aspoň ze dvou zdrojů, takže zmizí tituly se 100 % od pár hlasujících
- Nápověda popisuje současné hodnocení ze čtyř zdrojů místo ČSFD
- Původní landing page prototypu je na /prototyp

### Fixed
- Cron se spouštěl v pondělí a čtvrtek místo v úterý a pátek (Cloudflare počítá 1 = neděle), pondělní běh tak stahoval minulou Top 10
- Top 10 se kešovala podle týdne, takže nová úterní Top 10 se mohla objevit až další pondělí. Klíč je teď denní a do archivu se týden zapíše jen jednou.
- Písma Fraunces a Outfit se na webu nenačítala, protože bezpečnostní hlavička blokuje Google Fonts. Nově jsou u stránky.
- Newsletter chodí v úterý, texty na webu slibovaly středu
- Výchozí filtr Netflix neschová tituly z Top 10, u kterých TMDB službu ještě nezná

### Technical
- Migrace 0004: tabulky netflix_catalog, netflix_catalog_runs, netflix_top10_weeks, netflix_title_map
- Admin endpointy /api/netflix-catalog-sync (synchronizace po krocích, pojistka proti hromadnému mazání) a /api/top10-history-sync (načtení týdnů, párování po dávkách, úklid starého párování); veřejný /api/netflix-added
- Cron worker volá synchronizaci katalogu a historie, potřebuje secret ADMIN_API_KEY
- Skript scripts/backfill-netflix-data.sh pro jednorázové naplnění po migraci
- Sdílené jádro výběru public/dnes-core.js pro titulku a seriály
- Testy datové vrstvy (Top 10, párování, katalog, historie) v tests/node, spouští `npm run test:data` nad SQLite z Node
- Synchronizace katalogu nepočítá úbytky, když má katalog víc než 500 stránek TMDB; po doplnění detailů se maže cache přírůstků

## [1.10.0] - 2026-10-15

### Added
- Funkční náhled nové titulky na /prototyp: jeden tip na večer s důvodem „proč“, alternativy podle situace (film na dnešek, seriál na víkend, do 100 minut, starší titul v Top 10, méně známý klenot), Top 10 na Netflixu s kontextem a novinky nad 70 %
- Top 10 ukazuje, kolikátý týden se titul drží, jestli je nový, stoupá, klesá nebo se vrátil, a kterou řadu seriálu lidé sledují
- U seriálů je vidět, jestli jsou ukončené, a kolik mají dílů a jak dlouhých
- Výběr v náhledu vychází z Netflixu, další služby si návštěvník přidá sám

### Changed
- Původní landing page prototypu je na /prototyp/landing.html

### Fixed
- Párování titulů z Netflix Top 10 na TMDB: starší filmy jako Ted, Ted 2, Shrek nebo Mumie se už nezamění za novější tituly s podobným názvem. Rozhoduje shoda názvu a dostupnost na Netflixu v ČR, ne rok vydání.
- Top 10 se stahuje z nové adresy Netflix Tudum, stará jen přesměrovávala

### Technical
- Sdílené knihovny functions/_lib/netflix-top10.js (čtení TSV, týdny v žebříčku, předchozí pořadí, párování) a functions/_lib/tmdb.js (služby, údaje o seriálech)
- Klíče cache zvýšeny (top10 v5, netflix-new v7)

## [1.9.1] - 2026-10-15

### Fixed
- Prototyp na /prototyp bere písma ze svého adresáře, aby je neseřízla bezpečnostní hlavička stránky

## [1.9.0] - 2026-10-15

### Added
- Prototyp úvodní stránky na /prototyp: večerní výběr v šesti záběrech, odkazy vedou do dnešního seznamu

## [1.8.0] - 2026-10-15

### Added
- Výběr Dnes večer na úvodu: až šest filmů a seriálů nad 70 %, mix toho, co teď táhne Netflix, a novějších titulů
- Tlačítko se službou u každého řádku otevře hledání titulu na té službě

### Changed
- Seznam filmů a seriálů používá krátký řádek místo velké karty s popisem a čtyřmi hodnoceními
- Filtry, hledání a moje služby jsou sbalené, na telefonu je první obrazovka samotný výběr
- Když se divácké a kritické skóre rozejde aspoň o 15 bodů, řádek ukáže obě čísla

### Fixed
- Týdenní newsletter se po sestavení rovnou odešle odběratelům, nečeká jako koncept v Resendu
- Cron se k odeslání přihlásí stejným admin klíčem jako ostatní chráněné endpointy

## [1.7.0] - 2026-02-08

### Added
- Vyhledávání podle názvu: search bar s debounce na stránkách filmů a seriálů, API endpoint /api/search s fulltext vyhledáváním v D1
- Vážený avg_rating z více zdrojů: TMDB 30% + IMDb 30% + RT 25% + MC 15% (sdílená utilita functions/_lib/ratings.js)
- Žánrový filtr: dynamické genre chips na stránkách filmů a seriálů s localStorage persistencí
- Hidden Gems sekce: výjimečně hodnocené tituly (80%+) s nízkým počtem výskytů, API endpoint /api/hidden-gems
- Detail stránka: vlastní stránka detail.html pro každý titul s kompletními hodnoceními, historií v Top 10, podobnými tituly, share tlačítkem a SEO meta tagy
- JSON-LD strukturovaná data (Schema.org Movie/TVSeries/ItemList) pro SEO na všech stránkách
- "Moje služby" preference: uživatel vybere platformy které předplácí, auto-filtrování obsahu, localStorage persistence
- API endpoint /api/detail pro detailní informace o titulu včetně historie a podobných titulů
- Database metody: searchContent, getHiddenGems, getContentByIdFull, getSimilarContent

### Changed
- avg_rating se nyní počítá jako vážený průměr ze všech dostupných zdrojů (dříve jen TMDB)
- Názvy titulů na kartách jsou nyní klikatelné odkazy na detail stránku
- Přidány search bar, genre filter a moje služby UI do index.html a serials.html
- Hidden Gems sekce přidána na archive stránku
- Funkce getQualityIndicator v netflix-new.js nahrazena sdílenou getQualityTier z ratings.js

## [1.6.0] - 2026-02-08

### Added
- Multi-platform streaming: podpora 6 streamovacích služeb v CZ (Netflix, Disney+, Apple TV+, Prime Video, Max, SkyShowtime)
- OMDb API integrace: hodnocení IMDb, Rotten Tomatoes a Metacritic u každého titulu
- Platform filter: barevné chip tlačítka pro filtrování podle streamovací platformy (s localStorage persistencí)
- Provider badges: barevné štítky u každé karty ukazující dostupnost na platformách
- Multi-source rating zobrazení: TMDB | IMDb | RT | MC inline pod názvem titulu
- Nová sdílená knihovna functions/_lib/omdb.js pro OMDb API volání s batch enrichmentem
- Migrace 0003: nové sloupce imdb_id, imdb_rating, rotten_tomatoes_rating, metacritic_rating, streaming_providers

### Changed
- Discover API nyní hledá přes všech 6 CZ streaming platforem (dříve jen Netflix)
- TMDB detail requesty používají append_to_response=external_ids,watch/providers (1 request místo 3)
- Meta popisy a titulky stránek aktualizovány z "Na co koukat na Netflixu" na "Na co koukat na streamovacích platformách"
- Tab "Nově na Netflix" přejmenován na "Nově na streamech"
- Footer atribuce aktualizována: ČSFD nahrazeno OMDb
- Cache klíče zvýšeny (top10 v4, netflix-new v6) pro invalidaci starých dat

### Technical
- database.js rozšířen o nové sloupce s COALESCE pro zachování existujících hodnot
- Provider extrakce z TMDB watch/providers response pro CZ region (flatrate monetization)
- OMDb enrichment běží paralelně v batch po 5 requestech
- Env proměnná OMDB_API_KEY (volitelná, graceful degradation pokud chybí)

## [1.5.0] - 2026-02-08

### Changed
- TMDB API requesty paralelizovány v netflix-new.js (batch po 10) a top10.js (Promise.all) -- ~5-10s rychlejší API odpověď
- Discovery pages se stahují paralelně místo sekvenčně
- localStorage cache TTL synchronizován s KV: top10=24h, netflix-new=12h (místo 2h/7d)
- Cron job změněn z denního na 2x týdně (úterý+pátek 07:00 UTC) -- Netflix aktualizuje Top 10 v úterý
- GitHub Actions workflow upraven na stejný rozvrh (úterý+pátek)
- SQL queries používají explicitní výčet sloupců místo SELECT *

### Fixed
- Cache invalidace nyní funguje přes versionované klíče v KV (místo prázdné funkce)
- appearance_history deduplikace -- INSERT OR IGNORE zabrání duplicitním záznamům za stejný den

### Technical
- Nová migrace 0002_deduplicate_history.sql -- přidá UNIQUE constraint na (tmdb_id, type, date, source)
- Versionovaný cache systém v database.js (_getCacheVersion, db:cache_version counter v KV)
- Odstraněn zbytečný sleep(100) z discovery page fetche

## [1.4.0] - 2026-02-08

### Added
- Autentizační systém pro admin API endpointy (Bearer token via ADMIN_API_KEY)
- Sdílený auth modul `functions/_lib/auth.js` s `requireAdminAuth()`, CORS helpery, `safeErrorResponse()` a `checkRateLimit()`
- Rate limiting na newsletter-subscribe endpointy (5 pokusů/hodinu/IP přes KV)
- Content Security Policy a security headers přes `_headers` soubor (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- XSS sanitizace `escapeHtml()` na všech frontend JS souborech (app.js, serials.js, archive.js)

### Changed
- Admin endpointy (newsletter-send, newsletter-test, newsletter-preview, tmdb-discover, debug-csfd, test-db) nyní vyžadují Bearer token autentizaci
- CORS na citlivých endpointech omezen na `topflix.cz` / `www.topflix.cz` (newsletter-subscribe, newsletter-unsubscribe, newsletter-send, tmdb-discover)
- Veřejné read-only endpointy (stats, archive, best, netflix-new, health, top10) zachovávají wildcard CORS

### Fixed
- Odstraněny stack trace z error responses ve všech API endpointech (top10, netflix-new, stats, archive, best, health, newsletter-subscribe-v2)
- test-db endpoint již nevypisuje `Object.keys(env)` (únik env proměnných)
- newsletter-test endpoint přepsán -- již neumožňuje odesílání na libovolnou adresu bez autorizace
- newsletter-preview a debug-csfd endpointy zabezpečeny admin autentizací

### Technical
- Nový modul `functions/_lib/auth.js` centralizuje auth logiku, CORS konfiguraci a rate limiting
- Rate limiting implementován přes Cloudflare KV s TTL expirací
- CSP povoluje img-src z `image.tmdb.org`, connect-src z `api.themoviedb.org`

## [1.1.0] - 2025-11-10

### Added
- Increased TMDB Discover limit from 20 to 100 items per category
- Netflix New content now displays ~200 titles (100 movies + 100 series)
- Multi-page fetching for TMDB API (up to 5 pages)
- Double Opt-In system for newsletter (not active yet, see DOUBLE-OPT-IN.md)
- Automatic theme mode based on sunrise/sunset in Prague
- Theme cycling: dark → light → auto → dark
- Newsletter page with subscribe and unsubscribe forms
- Confirmation email template for Double Opt-In
- Crypto utility for token encryption/decryption
- Newsletter confirmation page

### Changed
- Rating badge moved from card to poster overlay (top-left position)
- Rating badge positioned above poster edge (top: -0.8rem)
- Default theme changed to 'auto' mode
- Cache version bumped to v4 for Netflix New data

### Removed
- Rank badge (#1, #2, #3...) removed from all cards
- Star icon (⭐) removed from rating display
- Rating now displays as "70% ✅" instead of "⭐ 70% ✅"

### Fixed
- Newsletter subscribe form DOM timing issue (wrapped in DOMContentLoaded)
- TMDB search accuracy with year filtering and validation
- Newsletter duplicate titles (deduplication by tmdb_id)
- Regional content separation (Asian/Latin American to separate section)
- CSS variables in newsletter page for proper theming
- DMARC DNS record syntax (removed "TTL: Auto" from value)

## [1.0.0] - 2025-11-03

### Added
- Initial release of Topflix
- Netflix Top 10 ČR integration (movies + series)
- Netflix New content from TMDB API (last 6 months)
- TMDB and ČSFD ratings display
- Quality indicators (💣 excellent, ✅ good, 👍 average, ⚠️ below-average, ❌ poor)
- Dark/Light theme toggle
- Region filter (hide/show Asian & Latin American content)
- Sort options (rank, rating, recommended)
- Responsive design for mobile and desktop
- KV namespace caching (7-day TTL)
- Weekly newsletter system with Resend API
- Cron trigger for newsletter (Wednesdays 15:00 UTC)
- Dynamic subject line generation
- List-ID and deliverability headers

### Technical
- Cloudflare Pages deployment
- Cloudflare Workers for cron triggers
- TMDB API integration
- Resend API for email delivery
- Netflix Top 10 TSV data scraping
