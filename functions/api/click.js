/**
 * POST /api/click: klik na „Pustit“ z webu (navigator.sendBeacon).
 * Odpovídá vždy 204, aby měření nikdy nerozbilo stránku.
 */

import { normalizeClick, recordClick } from '../_lib/watch-clicks.js';

const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return done();
  try {
    const raw = await request.text();
    if (raw.length > 1000) return done();
    const click = normalizeClick(JSON.parse(raw));
    if (click) context.waitUntil(recordClick(env.DB, click).catch((error) => console.warn('click not stored:', error.message)));
  } catch (error) {
    // neplatné tělo požadavku ignorujeme
  }
  return done();
}
