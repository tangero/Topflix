/**
 * Netflix Top 10 - čtení oficiálních TSV souborů z Netflix Tudum
 * a párování názvů z Top 10 na TMDB.
 */

// Netflix přesunul data z top10.netflix.com na Tudum, stará adresa jen přesměrovává.
const TSV_URLS = {
  countries: [
    'https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv',
    'https://top10.netflix.com/data/all-weeks-countries.tsv'
  ]
};

export const COUNTRY_ISO = 'CZ';

async function fetchFirstOk(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.text();
      lastError = new Error(`HTTP ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Netflix TSV unavailable');
}

export async function fetchCountriesTsv() {
  return fetchFirstOk(TSV_URLS.countries);
}

/**
 * Rozparsuje TSV a vrátí řádky jedné země.
 * @returns {Array<{week, category, rank, title, season_title, weeks_in_top10}>}
 */
export function parseCountryRows(text, iso = COUNTRY_ISO) {
  const lines = text.split('\n');
  const headers = lines[0].trim().split('\t');
  const col = (name) => headers.indexOf(name);
  const idx = {
    iso: col('country_iso2'),
    country: col('country_name'),
    week: col('week'),
    category: col('category'),
    rank: col('weekly_rank'),
    title: col('show_title'),
    season: col('season_title'),
    weeks: col('cumulative_weeks_in_top_10')
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].replace(/\r$/, '').split('\t');
    if (values.length < 5) continue;
    const matchesIso = idx.iso >= 0
      ? values[idx.iso] === iso
      : ['Czech Republic', 'Czechia'].includes(values[idx.country]);
    if (!matchesIso) continue;

    const season = idx.season >= 0 ? values[idx.season] : '';
    const weeks = idx.weeks >= 0 ? parseInt(values[idx.weeks], 10) : NaN;
    rows.push({
      week: values[idx.week],
      category: values[idx.category],
      rank: parseInt(values[idx.rank], 10),
      title: values[idx.title],
      season_title: season && season !== 'N/A' ? season : null,
      weeks_in_top10: Number.isFinite(weeks) ? weeks : null
    });
  }
  return rows;
}

/**
 * "The Gentlemen: Season 2" -> { season_number: 2, limited: false }
 * "East of Eden: Limited Series" -> { season_number: null, limited: true }
 */
export function parseSeason(seasonTitle) {
  if (!seasonTitle) return { season_number: null, limited: false };
  const limited = /limited series|miniseries/i.test(seasonTitle);
  const match = seasonTitle.match(/(?:season|series|part|volume|vol\.?)\s*(\d+)\s*$/i);
  return {
    season_number: match ? parseInt(match[1], 10) : null,
    limited
  };
}

/**
 * Poslední týden Top 10 s kontextem: kolik týdnů se titul drží a jaké měl
 * pořadí v předchozím týdnu.
 */
export function buildLatestWeek(rows) {
  const weeks = [...new Set(rows.map((row) => row.week))].sort();
  const latestWeek = weeks[weeks.length - 1] || '';
  const previousWeek = weeks[weeks.length - 2] || '';

  const previousRank = new Map();
  rows
    .filter((row) => row.week === previousWeek)
    .forEach((row) => previousRank.set(`${row.category}|${row.title}`, row.rank));

  const decorate = (row) => {
    const prev = previousRank.get(`${row.category}|${row.title}`) ?? null;
    const season = parseSeason(row.season_title);
    return {
      rank: row.rank,
      title: row.title,
      season_title: row.season_title,
      season_number: season.season_number,
      limited_series: season.limited,
      weeks_in_top10: row.weeks_in_top10,
      prev_rank: prev,
      is_new_entry: row.weeks_in_top10 === 1 || (row.weeks_in_top10 == null && prev == null)
    };
  };

  const latest = rows.filter((row) => row.week === latestWeek);
  const byCategory = (category) => latest
    .filter((row) => row.category === category)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 10)
    .map(decorate);

  return {
    week: latestWeek,
    previous_week: previousWeek || null,
    movies: byCategory('Films'),
    series: byCategory('TV')
  };
}

// ---------------------------------------------------------------------------
// Párování na TMDB
// ---------------------------------------------------------------------------

export function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|a|an) /, '')
    .trim();
}

/**
 * Skóre kandidáta z TMDB vůči názvu z Netflix Top 10.
 * Rozhoduje shoda názvu, pak dostupnost na Netflixu v ČR, nakonec popularita.
 * Na roku vydání nezáleží: Top 10 je plná starého katalogu.
 */
export function scoreCandidate(netflixTitle, candidate) {
  const target = normalizeTitle(netflixTitle);
  const names = [candidate.title, candidate.name, candidate.original_title, candidate.original_name]
    .filter(Boolean)
    .map(normalizeTitle);

  let score = 0;
  if (names.includes(target)) score += 100;
  else if (names.some((name) => name.startsWith(`${target} `) || target.startsWith(`${name} `))) score += 25;

  if (candidate.on_netflix_cz === true) score += 60;
  else if (candidate.on_netflix_cz === false) score -= 20;

  const popularity = Number(candidate.popularity) || 0;
  score += Math.min(15, Math.log10(1 + popularity) * 6);
  const votes = Number(candidate.vote_count) || 0;
  score += Math.min(10, Math.log10(1 + votes) * 3);
  return score;
}

export function pickBestMatch(netflixTitle, candidates) {
  if (!candidates || candidates.length === 0) return null;
  let best = null;
  let bestScore = -Infinity;
  candidates.forEach((candidate, index) => {
    // Pořadí z vyhledávání TMDB je slabý signál, ale při shodě rozhodne.
    const score = scoreCandidate(netflixTitle, candidate) - index * 0.5;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });
  return best;
}

/**
 * Kandidáti k ověření přes watch/providers. Když má stejný název víc titulů
 * (Second Chances, The Mummy), ověříme jich až pět, jinak tři nejlepší.
 */
export function shortlistByTitle(netflixTitle, candidates, size = 3) {
  const target = normalizeTitle(netflixTitle);
  const scored = candidates
    .map((candidate, index) => ({ candidate, score: scoreCandidate(netflixTitle, candidate) - index * 0.5 }))
    .sort((a, b) => b.score - a.score);
  const exact = scored.filter(({ candidate }) =>
    [candidate.title, candidate.name, candidate.original_title, candidate.original_name]
      .filter(Boolean)
      .some((name) => normalizeTitle(name) === target)
  ).length;
  return scored
    .slice(0, Math.max(size, Math.min(5, exact)))
    .map((entry) => entry.candidate);
}
