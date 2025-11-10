# Instrukce pro práci na projektu Topflix

## Changelog a verzování

### Povinná aktualizace po každé dokončené funkci

Po dokončení **každé nové funkce, opravy nebo změny** je nutné:

1. **Aktualizovat verzi** podle sémantického verzování (viz níže)
2. **Aktualizovat CHANGELOG.md** se strukturovanými informacemi o změnách
3. **Aktualizovat číslo verze** ve všech HTML footerech (`public/*.html`)
4. **Aktualizovat číslo verze** v `public/changelog.html`

### Sémantické verzování (Semantic Versioning)

Používáme formát **X.Y.Z** (Major.Minor.Patch):

#### Kdy zvýšit MAJOR verzi (X.0.0)
- Zásadní změny v architektuře nebo funkcionalitě
- Breaking changes - změny nekompatibilní se starší verzí
- Kompletní redesign nebo přepis klíčových částí

**Příklady:**
- Změna z Netflix API na jinou datovou službu
- Kompletní přepis frontendu do jiného frameworku
- Změna datového modelu vyžadující migraci

#### Kdy zvýšit MINOR verzi (x.Y.0)
- Nové funkce přidané zpětně kompatibilním způsobem
- Významné vylepšení existujících funkcí
- Přidání nových stránek nebo sekcí

**Příklady:**
- Přidání newsletter funkcionality
- Implementace Double Opt-In systému
- Přidání automatického režimu tématu
- Zvýšení limitu zobrazených filmů z 20 na 100

#### Kdy zvýšit PATCH verzi (x.y.Z)
- Opravy chyb (bugfixes)
- Drobné úpravy UI/UX
- Optimalizace výkonu
- Aktualizace dokumentace
- Opravy překlepů

**Příklady:**
- Oprava DOM timing issue v newsletteru
- Oprava CSS proměnných pro správné témování
- Oprava DMARC DNS záznamu

### Struktura CHANGELOG.md

CHANGELOG.md používá formát [Keep a Changelog](https://keepachangelog.com/):

```markdown
## [X.Y.Z] - RRRR-MM-DD

### Added
- Nové funkce, které byly přidány

### Changed
- Změny v existující funkcionalitě

### Removed
- Odstraněné funkce nebo elementy

### Fixed
- Opravy chyb

### Technical
- Technické změny (infrastruktura, dependencies, atd.)
```

### Proces aktualizace verze

1. **Rozhodněte o typu změny:**
   - Je to breaking change? → MAJOR
   - Je to nová funkce? → MINOR
   - Je to oprava chyby? → PATCH

2. **Aktualizujte CHANGELOG.md:**
   - Přidejte novou sekci s číslem verze a datem
   - Kategorizujte změny do příslušných sekcí (Added, Changed, Fixed, atd.)
   - Buďte struční, ale jasní

3. **Aktualizujte HTML soubory:**
   - Změňte číslo verze v footerech všech stránek: `index.html`, `serials.html`, `newsletter.html`, `napoveda.html`
   - Aktualizujte číslo verze v `changelog.html` (hlavička a badge)

4. **Commitněte změny:**
   - Commitujte všechny změny společně
   - Použijte popisný commit message

## Příklady aktualizací

### Příklad 1: Nová funkce (MINOR)
```
Před: v1.0.0
Po: v1.1.0

CHANGELOG.md:
## [1.1.0] - 2025-11-10
### Added
- Newsletter page with subscribe/unsubscribe forms
- Double Opt-In system for newsletter
```

### Příklad 2: Oprava chyby (PATCH)
```
Před: v1.1.0
Po: v1.1.1

CHANGELOG.md:
## [1.1.1] - 2025-11-11
### Fixed
- Newsletter form not submitting on mobile devices
- CSS overflow issue on small screens
```

### Příklad 3: Breaking change (MAJOR)
```
Před: v1.1.0
Po: v2.0.0

CHANGELOG.md:
## [2.0.0] - 2025-12-01
### Changed
- Complete rewrite of API layer
- New data structure for content (BREAKING)
```

## Důležité poznámky

- **NIKDY** neskákejte verze (např. z 1.1.0 přímo na 1.3.0)
- **VŽDY** aktualizujte datum v changelogu na aktuální datum
- **VŽDY** dokumentujte všechny viditelné změny pro uživatele
- Technické změny, které nemají vliv na uživatele, můžete vynechat nebo dát do sekce "Technical"
