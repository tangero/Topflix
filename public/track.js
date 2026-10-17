/**
 * Měření kliků na „Pustit“. Při kliknutí na odkaz s data-watch odešle
 * stránku, sekci, typ odkazu (přímý / vyhledávání), službu a titul.
 * Bez cookies a bez identifikace návštěvníka, na serveru se ukládají
 * jen denní součty. Odkaz se otevře hned, beacon na odpověď nečeká.
 */
(function () {
    'use strict';

    function pageOf(pathname) {
        if (pathname === '/' || pathname === '/index' || pathname === '/index.html') return 'dnes';
        if (/^\/(film|serial)\//.test(pathname) || pathname.indexOf('/detail') === 0) return 'detail';
        if (pathname.indexOf('/filmy') === 0) return 'filmy';
        if (pathname.indexOf('/serials') === 0) return 'serialy';
        if (pathname.indexOf('/archive') === 0) return 'archiv';
        return null;
    }

    function send(link) {
        var page = pageOf(window.location.pathname);
        if (!page || !navigator.sendBeacon) return;
        var area = link.closest('[data-track]');
        var title = String(link.dataset.title || '').split(':');
        var payload = JSON.stringify({
            page: page,
            section: area ? area.dataset.track : 'jine',
            watch: link.dataset.watch,
            provider: link.dataset.provider,
            type: title[0],
            tmdb_id: title[1]
        });
        try {
            navigator.sendBeacon('/api/click', new Blob([payload], { type: 'application/json' }));
        } catch (error) { /* měření nesmí rozbít odkaz */ }
    }

    // auxclick: prostřední tlačítko myši (otevření v nové kartě)
    ['click', 'auxclick'].forEach(function (eventName) {
        document.addEventListener(eventName, function (event) {
            if (eventName === 'auxclick' && event.button !== 1) return;
            var link = event.target.closest && event.target.closest('a[data-watch]');
            if (link) send(link);
        }, true);
    });
})();
