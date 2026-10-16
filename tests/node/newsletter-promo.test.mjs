import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePromo,
  formatPromoHtml,
  formatPromoText,
  generateNewsletterHTML,
  generateNewsletterText
} from '../../functions/_lib/newsletter-generator.js';

const workshop = {
  isAd: false,
  isPaid: true,
  isOwn: true,
  promoKind: 'event_explicit',
  clickUrl: 'https://www.vibecoding.cz/promo/click/event_explicit/evt_1?event_term_id=ed_1',
  title: 'Workshop Claude Code pro pokročilé',
  slug: 'workshop',
  date: '2026-11-10',
  city: 'Praha 10',
  earlyBirdPrice: 3500,
  earlyBirdDeadline: '2026-11-03',
  dateVariants: [{ id: 'ed_1' }, { id: 'ed_2' }],
  bannerDescription: 'Sebezlepšující se smyčky v Claude Code.'
};

const imageAd = {
  isAd: true,
  promoKind: 'slot',
  clickUrl: 'https://www.vibecoding.cz/promo/click/slot/promo_abc',
  title: 'Scribeton: Pecka',
  date: '2026-10-16',
  imageUrl: '/promo-media/promo_abc?v=123',
  imageAlt: 'Scribeton',
  externalUrl: 'https://www.zitraslavni.cz'
};

const emptyData = { movies: [], series: [], regionalMovies: [], regionalSeries: [] };

test('workshop: click link carries site=topflix and surface=newsletter', () => {
  const promo = normalizePromo(workshop, new Date('2026-10-20T10:00:00Z'));
  const url = new URL(promo.url);
  assert.equal(url.pathname, '/promo/click/event_explicit/evt_1');
  assert.equal(url.searchParams.get('event_term_id'), 'ed_1');
  assert.equal(url.searchParams.get('site'), 'topflix');
  assert.equal(url.searchParams.get('surface'), 'newsletter');
  assert.equal(promo.badge, 'Workshop');
  assert.equal(promo.meta, '10. listopadu 2026 a další termíny, Praha 10');
  assert.equal(promo.highlight, 'Early bird do 3. listopadu');
});

test('early bird disappears after its deadline', () => {
  const promo = normalizePromo(workshop, new Date('2026-11-05T10:00:00Z'));
  assert.equal(promo.highlight, '');
});

test('image ad gets an absolute vibecoding.cz image and stays labelled as Reklama', () => {
  const promo = normalizePromo(imageAd);
  assert.equal(promo.image, 'https://www.vibecoding.cz/promo-media/promo_abc?v=123');
  const html = formatPromoHtml(promo);
  assert.match(html, />Reklama</);
  assert.match(html, /src="https:\/\/www\.vibecoding\.cz\/promo-media\/promo_abc\?v=123"/);
});

test('null, empty or unsafe answers produce no block', () => {
  assert.equal(normalizePromo(null), null);
  assert.equal(normalizePromo({ isAd: false }), null);
  assert.equal(normalizePromo({ isAd: true, title: 'x', externalUrl: 'javascript:alert(1)' }), null);
  assert.equal(formatPromoHtml(null), '');
  assert.equal(formatPromoText(null), '');
});

test('API text is escaped in the email HTML', () => {
  const promo = normalizePromo({ ...imageAd, imageUrl: '', title: '<script>x</script>', bannerDescription: '"quoted" & more' });
  const html = formatPromoHtml(promo);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /&quot;quoted&quot; &amp; more/);
});

test('newsletter HTML and text include the promo, and work without it', () => {
  const promo = normalizePromo(workshop, new Date('2026-10-20T10:00:00Z'));
  const html = generateNewsletterHTML({ ...emptyData, promo });
  const text = generateNewsletterText({ ...emptyData, promo });
  assert.match(html, /Workshop Claude Code pro pokročilé/);
  assert.match(text, /REKLAMA/);
  assert.match(text, /site=topflix&surface=newsletter/);
  assert.doesNotMatch(generateNewsletterHTML({ ...emptyData, promo: null }), /Reklama/);
});
