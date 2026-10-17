/**
 * /sitemap.xml: statické stránky a stránky titulů s hodnocením z tabulky content.
 * Tituly, které jen přibyly do katalogu Netflixu a hodnocení nemají, sem nepatří.
 */

import '../public/title-url.js';
import { SITE_URL } from '../public/detail-view.js';

const { titlePath } = globalThis.TopflixUrl;

const STATIC_PAGES = ['/', '/filmy', '/serials', '/archive', '/newsletter', '/napoveda'];

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, (ch) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  }[ch]));
}

function isoDate(unixSeconds) {
  const n = Number(unixSeconds);
  return n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : null;
}

export function buildSitemap(rows, today) {
  const urls = STATIC_PAGES.map((path) => `  <url><loc>${SITE_URL}${path}</loc><lastmod>${today}</lastmod></url>`);
  for (const row of rows) {
    const path = titlePath(row);
    if (!path) continue;
    const lastmod = isoDate(row.updated_at);
    urls.push(`  <url><loc>${xmlEscape(SITE_URL + path)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export async function onRequestGet({ env }) {
  let rows = [];
  if (env.DB) {
    const result = await env.DB.prepare(`
      SELECT tmdb_id, type, title, title_original, updated_at
      FROM content
      WHERE title IS NOT NULL AND description IS NOT NULL AND description <> ''
      ORDER BY updated_at DESC
    `).all();
    rows = result.results || [];
  }
  return new Response(buildSitemap(rows, new Date().toISOString().slice(0, 10)), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400'
    }
  });
}
