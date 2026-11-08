import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchNewsletterData,
  fetchNewsletterPromo,
  fetchNewsletterTips,
  formatTipsHtml,
  formatTipsText,
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

test('image ad gets an absolute vibecoding.cz image and is labelled as Naše akce', () => {
  const promo = normalizePromo(imageAd);
  assert.equal(promo.image, 'https://www.vibecoding.cz/promo-media/promo_abc?v=123');
  const html = formatPromoHtml(promo);
  assert.match(html, />Naše akce</);
  assert.doesNotMatch(html, /Reklama/);
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
  assert.match(text, /NAŠE AKCE/);
  assert.doesNotMatch(text, /REKLAMA/);
  assert.match(text, /site=topflix&surface=newsletter/);
  assert.doesNotMatch(generateNewsletterHTML({ ...emptyData, promo: null }), /Naše akce/);
});

test('promo request identifies Topflix, so exclusive slots apply', async () => {
  let seen;
  const promo = await fetchNewsletterPromo(async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify(imageAd));
  });
  assert.equal(seen.url, 'https://www.vibecoding.cz/api/active-promotion');
  assert.equal(seen.init.headers.Origin, 'https://www.topflix.cz');
  assert.equal(promo.title, imageAd.title);
});

test('a failed promo request gives null, the newsletter still goes out', async () => {
  assert.equal(await fetchNewsletterPromo(async () => { throw new DOMException('late', 'TimeoutError'); }), null);
  assert.equal(await fetchNewsletterPromo(async () => new Response('x', { status: 500 })), null);
  assert.equal(await fetchNewsletterPromo(async () => new Response('null')), null);
});

test('promo and event tips finish before the title fetches start, so it cannot be queued behind them', async () => {
  const realFetch = globalThis.fetch;
  const log = [];
  globalThis.fetch = async (url) => {
    const isPromo = /\/api\/(active-promotion|event-tips)/.test(String(url));
    log.push(`start:${isPromo ? 'promo' : 'other'}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (isPromo) log.push('end:promo');
    return new Response(JSON.stringify(isPromo ? imageAd : {}));
  };
  try {
    await fetchNewsletterData('k', 'k').catch(() => {});
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.ok(log.includes('start:other'));
  assert.ok(log.indexOf('start:other') > log.lastIndexOf('end:promo'), `promo and tips first: ${log.join(',')}`);
});

test('event tips: nearest workshop and Setkání from vibecoding.cz, foreign links dropped', async () => {
  let seen;
  const tips = await fetchNewsletterTips(async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ items: [
      { kind: 'workshop', label: 'Workshop', title: 'Claude Code <pro> pokročilé', meta: 'úterý 10. 11. 2026 v 15:00 · Praha', url: 'https://www.vibecoding.cz/akce/cc/2026-11-10/?utm_source=email&utm_medium=aviza&utm_campaign=vsuvka-topflix' },
      { kind: 'setkani', label: 'Setkání', title: 'Talks', meta: '', url: 'https://evil.example/x' },
    ] }));
  });
  assert.equal(seen.url, 'https://www.vibecoding.cz/api/event-tips?source=topflix');
  assert.equal(tips.length, 1);
  const html = formatTipsHtml(tips);
  assert.match(html, /Akce Vibecodingu/);
  assert.match(html, /Claude Code &lt;pro&gt; pokročilé/);
  assert.match(html, /utm_campaign=vsuvka-topflix/);
  assert.match(formatTipsText(tips), /^\nAKCE VIBECODINGU\n-+\nWorkshop: Claude Code <pro> pokročilé\n/);
  assert.deepEqual(await fetchNewsletterTips(async () => { throw new Error('down'); }), []);
  assert.deepEqual(await fetchNewsletterTips(async () => new Response('x', { status: 500 })), []);
  assert.equal(formatTipsHtml([]), '');
});

test('event tips replace an event promo, a paid ad slot stays', () => {
  const tip = [{ label: 'Workshop', title: 'W', meta: '', subtitle: '', url: 'https://www.vibecoding.cz/akce/w/' }];
  const htmlEvent = generateNewsletterHTML({ movies: [], series: [], regionalMovies: [], regionalSeries: [], promo: null, eventTips: tip });
  assert.match(htmlEvent, /Akce Vibecodingu/);
  assert.equal(normalizePromo(imageAd).isAd, true);
  assert.equal(normalizePromo(workshop).isAd, undefined);
});
