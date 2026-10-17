/**
 * Adresy stránek titulů: /film/<slug>-<tmdb_id> a /serial/<slug>-<tmdb_id>.
 *
 * Jeden soubor pro prohlížeč (klasický <script>) i pro Pages Functions
 * (import kvůli vedlejšímu efektu), aby web a server tvořily stejné adresy.
 * ID na konci adresy titul jednoznačně určí. Když se název změní,
 * server starou adresu přesměruje na novou.
 */
(function (root) {
    'use strict';

    var SECTION = { movie: 'film', series: 'serial' };
    var MAX_SLUG = 80;

    function slugify(value) {
        var slug = String(value == null ? '' : value)
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        if (slug.length > MAX_SLUG) slug = slug.slice(0, MAX_SLUG).replace(/-+[^-]*$/, '') || slug.slice(0, MAX_SLUG);
        return slug;
    }

    // Korejské nebo tamilské názvy dají prázdný slug, pak přijde na řadu původní název.
    function titleSlug(item) {
        return slugify(item && item.title) || slugify(item && item.title_original) || 'titul';
    }

    function titlePath(item) {
        var section = SECTION[item && item.type];
        var id = parseInt(item && item.tmdb_id, 10);
        if (!section || !id) return '';
        return '/' + section + '/' + titleSlug(item) + '-' + id;
    }

    // "shrek-808" -> 808, jinak null
    function parseId(slugWithId) {
        var match = /-(\d{1,9})$/.exec(String(slugWithId || ''));
        return match ? parseInt(match[1], 10) : null;
    }

    root.TopflixUrl = { slugify: slugify, titleSlug: titleSlug, titlePath: titlePath, parseId: parseId };
})(typeof globalThis !== 'undefined' ? globalThis : this);
