/**
 * Reklamní zóna Topflixu.
 *
 * Obsah vybírá sdílený propagační systém vibecoding.cz (stejně jako na
 * marigold.cz a prijimackynaskolu.cz): /api/active-promotion vrátí jednu
 * váženě vylosovanou položku, nebo null.
 *
 * Použití:
 *   <aside class="ad-zone" data-promo-surface="homepage" aria-label="Reklama" hidden>
 *     <p class="ad-zone-label">Reklama</p>
 *     <div class="ad-zone-slot"></div>
 *   </aside>
 *   <script src="promo-banner.js" defer></script>
 *
 * data-promo-surface: homepage | other (plocha pro promo statistiky)
 *
 * Zóna zůstane skrytá, dokud nepřijde obsah. Když API vrátí null nebo selže,
 * zmizí celá, včetně štítku „Reklama“.
 */
(function () {
    'use strict';

    var ORIGIN = 'https://www.vibecoding.cz';
    var SITE = 'topflix';
    var MONTHS = ['ledna', 'února', 'března', 'dubna', 'května', 'června',
        'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];

    var zone = document.querySelector('.ad-zone');
    if (!zone) return;
    var slot = zone.querySelector('.ad-zone-slot');
    if (!slot) return;
    var surface = zone.getAttribute('data-promo-surface') || 'other';

    // Data z API jdou do innerHTML, proto se escapuje všechno interpolované.
    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function safeUrl(value) {
        var url = String(value || '');
        return /^https:\/\//i.test(url) ? url : '';
    }

    // Obrázek reklamy chodí jako relativní cesta na vibecoding.cz.
    function safeImageUrl(value) {
        var url = String(value || '');
        if (url.indexOf('..') >= 0 || url.indexOf('//') >= 0 || url.indexOf('\\') >= 0) return '';
        if (/^\/promo-media\/[A-Za-z0-9][A-Za-z0-9_-]{2,80}(\?v=\d+)?$/.test(url)) return ORIGIN + url;
        if (/^\/images\/[A-Za-z0-9._\/-]+\.(jpe?g|png|webp|gif)(\?v=\d+)?$/i.test(url)) return ORIGIN + url;
        return '';
    }

    function czDate(iso, withYear) {
        var parts = String(iso || '').split('-');
        if (parts.length !== 3) return '';
        var text = parseInt(parts[2], 10) + '. ' + MONTHS[parseInt(parts[1], 10) - 1];
        return withYear ? text + ' ' + parts[0] : text;
    }

    function withSite(url) {
        try {
            var parsed = new URL(url);
            parsed.searchParams.set('site', SITE);
            parsed.searchParams.set('surface', surface);
            return parsed.toString();
        } catch (error) {
            return url;
        }
    }

    function eventLink(item) {
        if (item.clickUrl) return withSite(item.clickUrl);
        if (!item.slug) return '';
        return ORIGIN + '/akce/' + encodeURIComponent(item.slug) +
            '/?utm_source=topflix&utm_medium=web&utm_campaign=event-promo';
    }

    // Imprese se zapíše, až je banner aspoň z poloviny vidět.
    function trackImpression(item) {
        if (!item.impressionUrl) return;
        var sent = false;
        function send() {
            if (sent) return;
            sent = true;
            try {
                var url = new URL(item.impressionUrl, ORIGIN);
                url.searchParams.set('site', SITE);
                url.searchParams.set('surface', surface);
                url.searchParams.set('view_id', window.crypto && crypto.randomUUID
                    ? crypto.randomUUID()
                    : Date.now() + '-' + Math.random().toString(36).slice(2));
                if (navigator.sendBeacon) navigator.sendBeacon(url.toString());
                else fetch(url.toString(), { method: 'POST', keepalive: true, mode: 'no-cors' }).catch(function () {});
            } catch (error) { /* měření nesmí rozbít stránku */ }
        }
        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(function (entries) {
                if (entries.some(function (entry) { return entry.isIntersecting && entry.intersectionRatio >= 0.5; })) {
                    observer.disconnect();
                    send();
                }
            }, { threshold: [0.5] });
            observer.observe(slot);
        } else {
            send();
        }
    }

    function linkAttrs(item) {
        return ' target="_blank" rel="noopener' + (item.isAd ? ' sponsored' : '') + '"';
    }

    function renderAd(item) {
        var href = safeUrl(item.clickUrl ? withSite(item.clickUrl) : item.externalUrl);
        if (!href) return '';
        var image = safeImageUrl(item.imageUrl);
        if (image) {
            return '<a class="promo-image" href="' + esc(href) + '"' + linkAttrs(item) + '>' +
                '<img src="' + esc(image) + '" alt="' + esc(item.imageAlt || item.title) + '" width="1456" height="624" loading="lazy" decoding="async">' +
                '</a>';
        }
        return '<a class="promo-card" href="' + esc(href) + '"' + linkAttrs(item) + '>' +
            '<span class="promo-copy">' +
                '<span class="promo-badge">' + esc(item.badgeLabel || 'Tip') + '</span>' +
                '<span class="promo-title">' + esc(item.title) + '</span>' +
                (item.bannerDescription ? '<span class="promo-desc">' + esc(item.bannerDescription) + '</span>' : '') +
                (item.highlight ? '<span class="promo-highlight">' + esc(item.highlight) + '</span>' : '') +
            '</span>' +
            '<span class="promo-cta">' + esc(item.ctaLabel || 'Více') + '</span>' +
            '</a>';
    }

    function renderEvent(item) {
        var href = safeUrl(eventLink(item));
        if (!href || !item.date) return '';
        var city = item.city || (item.location ? String(item.location).split(',').slice(-1)[0].trim() : '');
        var when = czDate(item.date, true);
        if (item.dateVariants && item.dateVariants.length > 1) when += ' a další termíny';
        var meta = when + (city ? ' · ' + city : '');

        var early = '';
        if (item.isPaid && item.earlyBirdPrice && item.earlyBirdDeadline) {
            var deadline = new Date(item.earlyBirdDeadline + 'T23:59:59');
            if (new Date() <= deadline) early = 'Early bird do ' + czDate(item.earlyBirdDeadline, false);
        }

        var badge = item.isPaid ? 'Workshop' : (item.isOwn ? 'Akce' : 'Přednáška');
        var title = item.isOwn || !item.talkTitle ? item.title : item.title + ': ' + item.talkTitle;

        return '<a class="promo-card' + (item.isPaid ? ' promo-card--workshop' : '') + '" href="' + esc(href) + '"' + linkAttrs(item) + '>' +
            '<span class="promo-copy">' +
                '<span class="promo-badge">' + esc(badge) + '</span>' +
                '<span class="promo-title">' + esc(title) + '</span>' +
                '<span class="promo-meta">' + esc(meta) + '</span>' +
                (item.bannerDescription ? '<span class="promo-desc">' + esc(item.bannerDescription) + '</span>' : '') +
                (early ? '<span class="promo-highlight">' + esc(early) + '</span>' : '') +
            '</span>' +
            '<span class="promo-cta">Detaily</span>' +
            '</a>';
    }

    fetch(ORIGIN + '/api/active-promotion', { credentials: 'omit' })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (item) {
            if (!item) return;
            var html = item.isAd ? renderAd(item) : renderEvent(item);
            if (!html) return;
            slot.innerHTML = html;
            zone.hidden = false;
            trackImpression(item);
        })
        .catch(function () { /* bez reklamy zůstane zóna skrytá */ });
})();
