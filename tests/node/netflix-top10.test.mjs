// Čtení Netflix Top 10 a párování názvů na TMDB. Spouští: npm run test:data
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseCountryRows, buildLatestWeek, parseSeason, pickBestMatch, shortlistByTitle
} from '../../functions/_lib/netflix-top10.js';

const tsv = fs.readFileSync(new URL('./fixtures/top10-cz.tsv', import.meta.url), 'utf8');

test('poslední týden má kontext: týdny v Top 10, předchozí pořadí, řada', () => {
  const latest = buildLatestWeek(parseCountryRows(tsv));
  assert.equal(latest.week, '2026-10-04');
  assert.equal(latest.previous_week, '2026-09-27');
  assert.equal(latest.movies.length, 10);
  const shrek = latest.movies.find((m) => m.title === 'Shrek');
  assert.equal(shrek.weeks_in_top10, 17);
  assert.equal(shrek.prev_rank, 7);
  const widower = latest.movies.find((m) => m.rank === 3);
  assert.equal(widower.is_new_entry, true);
  const gentlemen = latest.series.find((s) => s.title === 'The Gentlemen');
  assert.equal(gentlemen.season_number, 2);
  assert.equal(latest.series.find((s) => s.title === 'East of Eden').limited_series, true);
});

test('parseSeason', () => {
  assert.deepEqual(parseSeason('The Gentlemen: Season 2'), { season_number: 2, limited: false });
  assert.deepEqual(parseSeason('East of Eden: Limited Series'), { season_number: null, limited: true });
  assert.deepEqual(parseSeason(null), { season_number: null, limited: false });
});

const c = (id, title, extra = {}) => ({ id, title, original_title: title, popularity: 10, vote_count: 100, ...extra });

test('starý katalog se nezamění za novější titul s podobným názvem', () => {
  const cases = [
    ['Ted', [c(1, 'Ted Bunny', { popularity: 40, vote_count: 3 }), c(2, 'Ted', { popularity: 30, vote_count: 14000 })], 2],
    ['Ted 2', [c(3, 'Tractor Ted Big Machines 2', { popularity: 1 }), c(4, 'Ted 2', { popularity: 20, vote_count: 9000 })], 4],
    ['Shrek', [c(5, 'Shreklife', { popularity: 60, vote_count: 2 }), c(6, 'Shrek', { popularity: 50, vote_count: 18000 })], 6],
    ['The Mummy', [
      c(7, "Lee Cronin's The Mummy", { popularity: 200, on_netflix_cz: false }),
      c(8, 'The Mummy', { popularity: 30, vote_count: 9000, on_netflix_cz: false }),
      c(9, 'The Mummy', { popularity: 25, vote_count: 7000, on_netflix_cz: true })
    ], 9],
    ['Second Chances', [c(10, 'Second Chances', { popularity: 3, vote_count: 0, on_netflix_cz: false }), c(11, 'Second Chances', { popularity: 2, vote_count: 5, on_netflix_cz: true })], 11],
    ["The Widower: 'Til Death Do Us Part", [c(12, 'The Widower: ‘Til Death Do Us Part', { on_netflix_cz: true })], 12]
  ];
  for (const [title, candidates, expected] of cases) {
    assert.equal(pickBestMatch(title, candidates).id, expected, title);
  }
});

test('víc stejných názvů: ověří se až pět kandidátů', () => {
  const many = Array.from({ length: 7 }, (_, i) => c(100 + i, 'Second Chances', { popularity: 10 - i }));
  assert.equal(shortlistByTitle('Second Chances', many).length, 5);
  assert.equal(shortlistByTitle('Ted', [c(1, 'Ted Bunny'), c(2, 'Ted')]).length, 2);
});
