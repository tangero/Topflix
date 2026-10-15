/**
 * Párování názvů z Netflix Top 10 na TMDB.
 */

import { extractProviders, extractSeriesExtras } from './tmdb.js';
import { shortlistByTitle, pickBestMatch } from './netflix-top10.js';

/**
 * Najde titul z Netflix Top 10 na TMDB a vrátí jeho údaje v češtině.
 * @returns {Promise<Object|null>}
 */
export async function matchNetflixTitle(title, type, apiKey) {
  try {
    const searchType = type === 'movie' ? 'movie' : 'tv';

    // Step 1: Netflix uvádí anglické názvy, hledáme proto v en-US a bez roku.
    // Top 10 v ČR je plná starého katalogu (Shrek, Ted), rok vydání tedy nic neříká.
    const queries = [title];
    if (title.startsWith('The ')) queries.push(title.substring(4));

    let candidates = [];
    for (const query of queries) {
      const searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-US`;
      const searchData = await fetch(searchUrl).then(r => r.json()).catch(() => ({}));
      candidates = searchData.results || [];
      if (candidates.length > 0) break;
    }

    if (candidates.length === 0) {
      return null;
    }

    // Step 2: U nejlepších shod podle názvu ověříme, jestli běží na Netflixu v ČR.
    const shortlist = shortlistByTitle(title, candidates, 3);
    const detailed = await Promise.all(shortlist.map(async (candidate) => {
      const url = `https://api.themoviedb.org/3/${searchType}/${candidate.id}?api_key=${apiKey}&language=cs-CZ&append_to_response=external_ids,watch/providers`;
      const details = await fetch(url).then(r => r.json()).catch(() => null);
      if (!details || !details.id) return null;
      const providers = extractProviders(details['watch/providers']);
      return { ...candidate, details, providers, on_netflix_cz: providers.includes('netflix') };
    }));

    const best = pickBestMatch(title, detailed.filter(Boolean));
    if (!best) {
      return null;
    }

    const tmdbId = best.id;
    const details = best.details;

    // Build TMDB URL
    const tmdbUrl = `https://www.themoviedb.org/${searchType}/${tmdbId}`;

    // Get genres (first 3)
    const genres = details.genres
      ?.map(g => g.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ') || 'N/A';

    // Get production countries (first 2, convert to friendly names)
    const countries = details.production_countries
      ?.slice(0, 2)
      .map(c => c.name)
      .filter(Boolean) || [];

    // Get origin country codes (different for movies vs series)
    // Movies: extract ISO codes from production_countries
    // Series: use origin_country directly
    const originCountry = type === 'movie'
      ? (details.production_countries?.map(c => c.iso_3166_1).filter(Boolean) || [])
      : (details.origin_country || []);

    // Extract IMDb ID from external_ids
    const imdbId = details.external_ids?.imdb_id || null;

    const providers = best.providers;

    // Base result object
    const result = {
      tmdb_id: tmdbId,
      tmdb_url: tmdbUrl,
      title_original: details.original_title || details.original_name,
      title_cz: details.title || details.name,
      year: (details.release_date || details.first_air_date || '').substring(0, 4),
      genre: genres,
      tmdb_rating: details.vote_average ? parseFloat(details.vote_average.toFixed(1)) : null,
      description: details.overview || 'Popis není k dispozici.',
      poster_url: details.poster_path
        ? `https://image.tmdb.org/t/p/w300${details.poster_path}`
        : null,
      countries: countries,
      origin_country: originCountry,
      imdb_id: imdbId,
      providers: providers
    };

    // Add type-specific fields
    if (type === 'movie') {
      result.runtime = details.runtime || null; // minutes
    } else if (type === 'series') {
      result.number_of_seasons = details.number_of_seasons || null;
      result.number_of_episodes = details.number_of_episodes || null;
      Object.assign(result, extractSeriesExtras(details));
    }

    return result;
  } catch (error) {
    console.error('Error fetching TMDB data:', error);
    return null;
  }
}
