import test from 'node:test';
import assert from 'node:assert/strict';

import '../../public/title-url.js';
import { renderDetailHtml, buildMeta, buildJsonLd } from '../../public/detail-view.js';
import { buildSitemap } from '../../functions/sitemap.xml.js';

const { slugify, titlePath, parseId } = globalThis.TopflixUrl;

const shrek = {
  tmdb_id: 808,
  type: 'movie',
  title: 'Shrek',
  title_original: 'Shrek',
  year: 2001,
  genre: 'Animovaný, Komedie',
  avg_rating: 82,
  runtime: 90,
  description: 'Zelený zlobr zachraňuje princeznu.',
  poster_url: 'https://image.tmdb.org/t/p/w300/abc.jpg',
  tmdb_url: 'https://www.themoviedb.org/movie/808',
  imdb_id: 'tt0126029',
  streaming_providers: ['netflix']
};

test('slugify strips Czech diacritics and punctuation', () => {
  assert.equal(slugify('Na východ od ráje'), 'na-vychod-od-raje');
  assert.equal(slugify("Schumacher ’94: Zrození legendy"), 'schumacher-94-zrozeni-legendy');
  assert.equal(slugify('Příliš žluťoučký kůň'), 'prilis-zlutoucky-kun');
  assert.equal(slugify('  --  '), '');
});

test('long titles are cut at a word boundary', () => {
  const slug = slugify('slovo '.repeat(40));
  assert.ok(slug.length <= 80);
  assert.ok(!slug.endsWith('-'));
});

test('titlePath builds /film and /serial paths and falls back for non-Latin titles', () => {
  assert.equal(titlePath(shrek), '/film/shrek-808');
  assert.equal(titlePath({ tmdb_id: 258165, type: 'series', title: 'Na východ od ráje' }), '/serial/na-vychod-od-raje-258165');
  assert.equal(titlePath({ tmdb_id: 5, type: 'series', title: '포핸즈', title_original: 'Four Hands' }), '/serial/four-hands-5');
  assert.equal(titlePath({ tmdb_id: 6, type: 'movie', title: '포핸즈', title_original: '포핸즈' }), '/film/titul-6');
  assert.equal(titlePath({ tmdb_id: 7, type: 'person', title: 'x' }), '');
});

test('parseId reads the trailing TMDB id', () => {
  assert.equal(parseId('shrek-808'), 808);
  assert.equal(parseId('schumacher-94-zrozeni-legendy-1752355'), 1752355);
  assert.equal(parseId('shrek'), null);
  assert.equal(parseId(''), null);
});

test('JSON-LD has no aggregateRating and cannot close the script tag', () => {
  const ld = buildJsonLd({ ...shrek, description: 'a </script><script>alert(1)</script>' }, 'https://www.topflix.cz/film/shrek-808');
  const data = JSON.parse(ld);
  assert.equal(data['@type'], 'Movie');
  assert.equal(data.aggregateRating, undefined);
  assert.deepEqual(data.sameAs, ['https://www.themoviedb.org/movie/808', 'https://www.imdb.com/title/tt0126029/']);
  assert.equal(data.duration, 'PT90M');
  assert.doesNotMatch(ld, /<\/script>/i);
});

test('meta title names the title, type and rating', () => {
  const meta = buildMeta(shrek, 'https://www.topflix.cz/film/shrek-808');
  assert.equal(meta.title, 'Shrek (2001): film na Netflixu, hodnocení 82 % | Topflix');
  assert.equal(meta.image, 'https://image.tmdb.org/t/p/w500/abc.jpg');
  assert.ok(meta.description.length <= 160);
});

test('rendered detail escapes data and links similar titles to their pages', () => {
  const html = renderDetailHtml(
    { ...shrek, title: '<b>Shrek</b>' },
    [{ source: 'top10', rank: 3, date: '2026-10-05' }, { source: 'netflix_new', date: '2026-10-01' }],
    [{ tmdb_id: 809, type: 'movie', title: 'Shrek 2', year: 2004, avg_rating: 75 }],
    { shareUrl: 'https://www.topflix.cz/film/shrek-808', titlePath }
  );
  assert.doesNotMatch(html, /<b>Shrek<\/b>/);
  assert.match(html, /&lt;b&gt;Shrek&lt;\/b&gt;/);
  assert.match(html, /href="\/film\/shrek-2-809"/);
  assert.match(html, /3\. místo · 5\. 10\. 2026/);
  assert.match(html, /data-share-url="https:\/\/www\.topflix\.cz\/film\/shrek-808"/);
  assert.doesNotMatch(html, /onclick/);
});

test('sitemap lists static pages and title pages', () => {
  const xml = buildSitemap([
    { tmdb_id: 808, type: 'movie', title: 'Shrek', updated_at: 1792000000 },
    { tmdb_id: 258165, type: 'series', title: 'Na východ od ráje', updated_at: null }
  ], '2026-10-17');
  assert.match(xml, /^<\?xml version="1.0"/);
  assert.match(xml, /<loc>https:\/\/www\.topflix\.cz\/<\/loc><lastmod>2026-10-17<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/www\.topflix\.cz\/film\/shrek-808<\/loc><lastmod>2026-10-14<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/www\.topflix\.cz\/serial\/na-vychod-od-raje-258165<\/loc><\/url>/);
});
