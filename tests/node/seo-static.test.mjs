import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../../public/${name}`, import.meta.url), 'utf8');

// Longest match wins, Allow beats Disallow on a tie: how Google evaluates robots.txt.
function allowed(path) {
  const rules = read('robots.txt').split('\n')
    .map((line) => line.match(/^(Allow|Disallow):\s*(\S+)/))
    .filter(Boolean)
    .map(([, kind, pattern]) => ({
      kind,
      length: pattern.length,
      regex: new RegExp(`^${pattern.replace(/\$$/, '').replace(/[.*+?^{}()|[\]\\]/g, '\\$&')}${pattern.endsWith('$') ? '$' : ''}`)
    }));
  const hits = rules.filter((rule) => rule.regex.test(path))
    .sort((a, b) => b.length - a.length || (a.kind === 'Allow' ? -1 : 1));
  return !hits.length || hits[0].kind === 'Allow';
}

test('robots.txt opens only the read APIs behind the lists', () => {
  for (const path of ['/api/top10', '/api/top10?x=1', '/api/netflix-new', '/api/netflix-added', '/api/archive?page=2', '/api/hidden-gems?limit=6', '/api/stats']) {
    assert.equal(allowed(path), true, path);
  }
  for (const path of ['/api/top10-history-sync', '/api/newsletter-send', '/api/newsletter-preview', '/api/click-stats', '/go/netflix/1', '/prototyp/x']) {
    assert.equal(allowed(path), false, path);
  }
  assert.equal(allowed('/film/x-1'), true);
});

test('main pages declare their canonical www URL', () => {
  const pages = { 'index.html': '/', 'filmy.html': '/filmy', 'serials.html': '/serials', 'archive.html': '/archive', 'newsletter.html': '/newsletter', 'napoveda.html': '/napoveda', 'changelog.html': '/changelog' };
  for (const [file, path] of Object.entries(pages)) {
    const found = read(file).match(/<link rel="canonical" href="([^"]+)">/g) || [];
    assert.deepEqual(found, [`<link rel="canonical" href="https://www.topflix.cz${path}">`], file);
  }
});

test('list pages keep the error text out of the page text', () => {
  for (const file of ['filmy.html', 'serials.html', 'archive.html']) {
    const html = read(file);
    assert.doesNotMatch(html, />[^<]*nepodařilo načíst[^<]*</, file);
    assert.match(html, /id="error" class="error hidden" role="alert" data-message="[^"]*nepodařilo načíst/, file);
  }
  assert.match(read('style.css'), /\.error\[data-message\]::before\s*\{\s*content: attr\(data-message\);/);
});

test('the logo is not a heading on pages with their own H1', () => {
  assert.doesNotMatch(read('detail.html'), /<h1\b/);
  assert.equal(read('changelog.html').match(/<h1\b/g).length, 1);
});
