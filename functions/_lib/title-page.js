/**
 * Stránka titulu vykreslená na serveru: /film/<slug>-<id> a /serial/<slug>-<id>.
 *
 * Vezme statickou šablonu detail.html, doplní do ní titulek, popis, náhled
 * pro sdílení, kanonickou adresu, strukturovaná data a hotový obsah detailu.
 * Vyhledávač i náhled při sdílení tak vidí konkrétní titul bez JavaScriptu.
 */

import '../../public/title-url.js';
import { renderDetailHtml, buildMeta, buildJsonLd, escapeHtml, SITE_URL } from '../../public/detail-view.js';
import { createDatabase } from './database.js';
import { getCatalogItem } from '../api/detail.js';

const { titlePath, parseId } = globalThis.TopflixUrl;

const TYPE_BY_SECTION = { film: 'movie', serial: 'series' };

class SetContent {
  constructor(value) { this.value = value; }
  element(el) { el.setInnerContent(this.value); }
}

class SetAttr {
  constructor(name, value) { this.name = name; this.value = value; }
  element(el) { el.setAttribute(this.name, this.value); }
}

async function loadTemplate(env, requestUrl) {
  // /detail, ne /detail.html: na .html odpoví Pages přesměrováním na hezkou adresu.
  const response = await env.ASSETS.fetch(new URL('/detail', requestUrl));
  if (!response.ok) throw new Error(`detail template ${response.status}`);
  return response;
}

async function notFound(env, request) {
  const response = await env.ASSETS.fetch(new URL('/404.html', request.url));
  return new Response(response.body, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
  });
}

export async function loadTitle(env, tmdbId, type) {
  const db = createDatabase(env);
  const item = await db.getContentByIdFull(tmdbId, type) || await getCatalogItem(env.DB, tmdbId, type);
  if (!item) return null;
  const [history, similar] = await Promise.all([
    db.getAppearanceHistory(tmdbId, type, 20),
    db.getSimilarContent(item, 6)
  ]);
  return { item, history, similar };
}

export async function renderTitlePage(context, section) {
  const { request, env, params } = context;
  const type = TYPE_BY_SECTION[section];
  const tmdbId = parseId(params.slug);
  if (!type || !tmdbId || !env.DB) return notFound(env, request);

  const data = await loadTitle(env, tmdbId, type);
  if (!data) return notFound(env, request);

  const { item, history, similar } = data;
  const path = titlePath(item);
  const url = new URL(request.url);
  if (url.pathname !== path) {
    return Response.redirect(`${url.origin}${path}`, 301);
  }

  const canonical = SITE_URL + path;
  const meta = buildMeta(item, canonical);
  const content = renderDetailHtml(item, history, similar, { shareUrl: canonical, titlePath });
  // Titul, který zatím jen přibyl do katalogu, nemá hodnocení: stránka slouží
  // návštěvníkům, do vyhledávačů ji nedáváme.
  const indexable = item.last_source !== 'netflix_catalog';
  const isSeries = item.type === 'series';

  const head = `
    <link rel="canonical" href="${escapeHtml(canonical)}">
    ${indexable ? '' : '<meta name="robots" content="noindex">'}
    <script type="application/ld+json">${buildJsonLd(item, canonical)}</script>`;

  const template = await loadTemplate(env, request.url);
  const rewritten = new HTMLRewriter()
    .on('title#pageTitle', new SetContent(meta.title))
    .on('meta#metaDescription', new SetAttr('content', meta.description))
    .on('meta#ogType', new SetAttr('content', isSeries ? 'video.tv_show' : 'video.movie'))
    .on('meta#ogUrl', new SetAttr('content', canonical))
    .on('meta#ogTitle', new SetAttr('content', meta.title))
    .on('meta#ogDescription', new SetAttr('content', meta.description))
    .on('meta#ogImage', new SetAttr('content', meta.image))
    .on('meta#twTitle', new SetAttr('content', meta.title))
    .on('meta#twDescription', new SetAttr('content', meta.description))
    .on('meta#twImage', new SetAttr('content', meta.image))
    .on('head', { element(el) { el.append(head, { html: true }); } })
    .on('a#backLink', {
      element(el) {
        el.setAttribute('href', isSeries ? '/serials' : '/filmy');
        el.setInnerContent(isSeries ? '← Všechny seriály' : '← Všechny filmy');
      }
    })
    .on('div#loading', new SetAttr('class', 'loading hidden'))
    .on('div#detailContent', {
      element(el) {
        el.setAttribute('class', 'detail-container');
        el.setAttribute('data-prerendered', '1');
        el.setInnerContent(content, { html: true });
      }
    })
    .transform(template);

  const headers = new Headers(rewritten.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  // ETag šablony neodpovídá obsahu s daty titulu
  headers.delete('ETag');
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
  return new Response(rewritten.body, { status: 200, headers });
}
