# Changelog

All notable changes to Topflix will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
