/**
 * /go/netflix/<netflix_id>?s=newsletter&t=movie-808
 * Započítá klik z newsletteru a přesměruje na titul na Netflixu.
 * Cílová adresa se skládá jen z číselného ID, jinam přesměrovat nejde.
 */

import { normalizeClick, recordClick } from '../../_lib/watch-clicks.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const id = String(params.id || '');
  if (!/^\d{5,12}$/.test(id)) return Response.redirect(new URL('/', request.url).toString(), 302);

  const url = new URL(request.url);
  const [type, tmdb] = String(url.searchParams.get('t') || '').split('-');
  const source = url.searchParams.get('s') === 'newsletter' ? 'newsletter' : null;
  const click = source && normalizeClick({ page: 'newsletter', section: 'newsletter', watch: 'direct', provider: 'netflix', tmdb_id: tmdb, type });
  if (click && env.DB) context.waitUntil(recordClick(env.DB, click).catch(() => {}));

  return new Response(null, {
    status: 302,
    headers: { Location: `https://www.netflix.com/title/${id}`, 'Cache-Control': 'no-store' }
  });
}
