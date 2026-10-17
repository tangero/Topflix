/**
 * Stará adresa detailu: /detail?id=808&type=movie (i /detail.html?…, Pages
 * ji přesměruje sem). Trvale přesměruje na stránku titulu /film/…, /serial/….
 */

import '../public/title-url.js';
import { loadTitle } from './_lib/title-page.js';

const { titlePath } = globalThis.TopflixUrl;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const tmdbId = parseInt(url.searchParams.get('id'), 10);
  const type = url.searchParams.get('type');

  if (!tmdbId || !['movie', 'series'].includes(type) || !env.DB) {
    return Response.redirect(`${url.origin}/`, 301);
  }

  const data = await loadTitle(env, tmdbId, type);
  if (!data) return Response.redirect(`${url.origin}/`, 301);
  return Response.redirect(`${url.origin}${titlePath(data.item)}`, 301);
}

// HEAD (kontroly odkazů, některé nástroje SEO) dostane stejnou odpověď bez těla.
export { onRequestGet as onRequestHead };
