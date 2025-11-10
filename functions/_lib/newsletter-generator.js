/**
 * Newsletter Generator - Shared Library
 * Fetches data and generates HTML email for weekly newsletter
 */

// Import the data fetching functions (they're exported from API files)
import { fetchAndEnrichData } from '../api/top10.js';
import { fetchNetflixNew } from '../api/netflix-new.js';

/**
 * Fetch all data needed for newsletter
 */
export async function fetchNewsletterData(apiKey) {
  try {
    // Fetch both Top 10 and New content in parallel
    const [top10Data, newData] = await Promise.all([
      fetchAndEnrichData(apiKey),
      fetchNetflixNew(apiKey)
    ]);

    // Filter for recommended content (≥70%)
    const recommendedMovies = [];
    const recommendedSeries = [];

    // Use Maps to deduplicate by tmdb_id (prefer Top 10 over New)
    const moviesMap = new Map();
    const seriesMap = new Map();

    // From Top 10 (add first - higher priority)
    if (top10Data.movies) {
      top10Data.movies.forEach(movie => {
        if (movie.avg_rating >= 70 && movie.tmdb_id) {
          moviesMap.set(movie.tmdb_id, {
            ...movie,
            source: 'top10'
          });
        }
      });
    }

    if (top10Data.series) {
      top10Data.series.forEach(series => {
        if (series.avg_rating >= 70 && series.tmdb_id) {
          seriesMap.set(series.tmdb_id, {
            ...series,
            source: 'top10'
          });
        }
      });
    }

    // From New content (only if not already in Top 10)
    if (newData.movies) {
      newData.movies.forEach(movie => {
        if (movie.avg_rating >= 70 && movie.tmdb_id && !moviesMap.has(movie.tmdb_id)) {
          moviesMap.set(movie.tmdb_id, {
            ...movie,
            source: 'new'
          });
        }
      });
    }

    if (newData.series) {
      newData.series.forEach(series => {
        if (series.avg_rating >= 70 && series.tmdb_id && !seriesMap.has(series.tmdb_id)) {
          seriesMap.set(series.tmdb_id, {
            ...series,
            source: 'new'
          });
        }
      });
    }

    // Convert Maps to arrays
    recommendedMovies.push(...moviesMap.values());
    recommendedSeries.push(...seriesMap.values());

    // Sort by rating (best first)
    recommendedMovies.sort((a, b) => b.avg_rating - a.avg_rating);
    recommendedSeries.sort((a, b) => b.avg_rating - a.avg_rating);

    // Helper: Check if content is Asian or Latin American
    function isAsianOrLatinAmerican(item) {
      if (!item.origin_country || item.origin_country.length === 0) return false;

      const asianCountries = ['JP', 'KR', 'CN', 'TW', 'HK', 'TH', 'ID', 'IN', 'PH', 'VN', 'MY', 'SG'];
      const latinAmericanCountries = ['BR', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY'];

      return item.origin_country.some(country =>
        asianCountries.includes(country) || latinAmericanCountries.includes(country)
      );
    }

    // Split movies into main and regional
    const mainMovies = recommendedMovies.filter(m => !isAsianOrLatinAmerican(m));
    const regionalMovies = recommendedMovies.filter(m => isAsianOrLatinAmerican(m));

    // Split series into main and regional
    const mainSeries = recommendedSeries.filter(s => !isAsianOrLatinAmerican(s));
    const regionalSeries = recommendedSeries.filter(s => isAsianOrLatinAmerican(s));

    return {
      movies: mainMovies,
      series: mainSeries,
      regionalMovies: regionalMovies,
      regionalSeries: regionalSeries,
      top10Data,
      newData
    };
  } catch (error) {
    console.error('Error fetching newsletter data:', error);
    throw error;
  }
}

/**
 * Generate HTML email template
 */
export function generateNewsletterHTML(data) {
  const { movies, series, regionalMovies, regionalSeries } = data;

  // Helper: Get quality emoji
  function getQualityEmoji(rating) {
    if (rating >= 80) return '💣';
    if (rating >= 70) return '✅';
    return '👍';
  }

  // Helper: Format movie card
  function formatMovieCard(movie) {
    const sourceLabel = movie.source === 'top10' ? 'Top 10' : 'Nově na Netflix';
    const rankInfo = movie.rank ? `#${movie.rank} v Top 10` : sourceLabel;

    return `
      <tr>
        <td style="padding: 20px 0; border-bottom: 1px solid #e0e0e0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="100" valign="top">
                ${movie.poster_url
                  ? `<img src="${movie.poster_url}" alt="${movie.title}" width="100" height="150" style="border-radius: 5px; display: block;">`
                  : '<div style="width: 100px; height: 150px; background: #f0f0f0; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 32px;">🎬</div>'
                }
              </td>
              <td width="20"></td>
              <td valign="top">
                <h3 style="margin: 0 0 5px 0; font-size: 18px; color: #141414;">
                  ${movie.title || movie.title_original}
                </h3>
                ${movie.title_original && movie.title !== movie.title_original
                  ? `<p style="margin: 0 0 10px 0; font-size: 14px; color: #666; font-style: italic;">${movie.title_original}</p>`
                  : ''
                }
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">
                  ${getQualityEmoji(movie.avg_rating)} <strong>${movie.avg_rating}%</strong> • ${rankInfo}
                </p>
                ${movie.year ? `<p style="margin: 0 0 5px 0; font-size: 14px; color: #666;">📅 ${movie.year}</p>` : ''}
                ${movie.genre ? `<p style="margin: 0 0 5px 0; font-size: 14px; color: #666;">🎭 ${movie.genre}</p>` : ''}
                ${movie.runtime ? `<p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">⏱️ ${formatRuntime(movie.runtime)}</p>` : ''}
                ${movie.description
                  ? `<p style="margin: 0; font-size: 14px; color: #333; line-height: 1.5;">${movie.description.substring(0, 150)}${movie.description.length > 150 ? '...' : ''}</p>`
                  : ''
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Helper: Format series card
  function formatSeriesCard(series) {
    const sourceLabel = series.source === 'top10' ? 'Top 10' : 'Nově na Netflix';
    const rankInfo = series.rank ? `#${series.rank} v Top 10` : sourceLabel;

    const seasonInfo = [];
    if (series.number_of_seasons) {
      const seasonLabel = series.number_of_seasons === 1 ? 'řada' :
                         series.number_of_seasons <= 4 ? 'řady' : 'řad';
      seasonInfo.push(`${series.number_of_seasons} ${seasonLabel}`);
    }
    if (series.number_of_episodes) {
      seasonInfo.push(`${series.number_of_episodes} epizod`);
    }

    return `
      <tr>
        <td style="padding: 20px 0; border-bottom: 1px solid #e0e0e0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="100" valign="top">
                ${series.poster_url
                  ? `<img src="${series.poster_url}" alt="${series.title}" width="100" height="150" style="border-radius: 5px; display: block;">`
                  : '<div style="width: 100px; height: 150px; background: #f0f0f0; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 32px;">📺</div>'
                }
              </td>
              <td width="20"></td>
              <td valign="top">
                <h3 style="margin: 0 0 5px 0; font-size: 18px; color: #141414;">
                  ${series.title || series.title_original}
                </h3>
                ${series.title_original && series.title !== series.title_original
                  ? `<p style="margin: 0 0 10px 0; font-size: 14px; color: #666; font-style: italic;">${series.title_original}</p>`
                  : ''
                }
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">
                  ${getQualityEmoji(series.avg_rating)} <strong>${series.avg_rating}%</strong> • ${rankInfo}
                </p>
                ${series.year ? `<p style="margin: 0 0 5px 0; font-size: 14px; color: #666;">📅 ${series.year}</p>` : ''}
                ${series.genre ? `<p style="margin: 0 0 5px 0; font-size: 14px; color: #666;">🎭 ${series.genre}</p>` : ''}
                ${seasonInfo.length > 0 ? `<p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">📺 ${seasonInfo.join(', ')}</p>` : ''}
                ${series.description
                  ? `<p style="margin: 0; font-size: 14px; color: #333; line-height: 1.5;">${series.description.substring(0, 150)}${series.description.length > 150 ? '...' : ''}</p>`
                  : ''
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Helper: Format runtime
  function formatRuntime(minutes) {
    if (!minutes) return '';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}min`;
    if (hours > 0) return `${hours}h`;
    return `${mins}min`;
  }

  // Generate email HTML
  const html = `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Topflix - Týdenní výběr</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="padding: 30px; text-align: center; border-bottom: 2px solid #e50914;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <img src="https://www.topflix.cz/patrick-avatar.jpg" alt="Patrick" width="80" height="80" style="border-radius: 50%; display: inline-block; vertical-align: middle; margin-bottom: 10px;">
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 style="margin: 0; color: #e50914; font-size: 28px;">Topflix</h1>
                    <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;">Co stojí za to vidět tento týden na Netflixu</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Movies Section -->
          ${movies.length > 0 ? `
          <tr>
            <td style="padding: 30px 30px 10px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #141414; font-size: 22px; border-bottom: 2px solid #e50914; padding-bottom: 10px;">
                🎬 Doporučené filmy
              </h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${movies.slice(0, 8).map(movie => formatMovieCard(movie)).join('')}
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Series Section -->
          ${series.length > 0 ? `
          <tr>
            <td style="padding: 30px 30px 10px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #141414; font-size: 22px; border-bottom: 2px solid #e50914; padding-bottom: 10px;">
                📺 Doporučené seriály
              </h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${series.slice(0, 8).map(series => formatSeriesCard(series)).join('')}
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Regional Content Section (Asian & Latin American) -->
          ${(regionalMovies.length > 0 || regionalSeries.length > 0) ? `
          <tr>
            <td style="padding: 30px 30px 10px 30px; background-color: #f9f9f9;">
              <h2 style="margin: 0 0 20px 0; color: #141414; font-size: 22px; border-bottom: 2px solid #e50914; padding-bottom: 10px;">
                🌏 Jihoamerická a asijská tvorba
              </h2>
            </td>
          </tr>
          ` : ''}

          ${regionalMovies.length > 0 ? `
          <tr>
            <td style="padding: 0 30px; background-color: #f9f9f9;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${regionalMovies.slice(0, 6).map(movie => formatMovieCard(movie)).join('')}
              </table>
            </td>
          </tr>
          ` : ''}

          ${regionalSeries.length > 0 ? `
          <tr>
            <td style="padding: 0 30px 30px 30px; background-color: #f9f9f9;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${regionalSeries.slice(0, 6).map(series => formatSeriesCard(series)).join('')}
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- CTA Button -->
          <tr>
            <td style="padding: 30px; text-align: center; background-color: #f9f9f9; border-top: 1px solid #e0e0e0;">
              <a href="https://www.topflix.cz" style="display: inline-block; padding: 15px 40px; background-color: #e50914; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                Zobrazit více na Topflix.cz
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; text-align: center; background-color: #f9f9f9; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 10px 0; font-size: 12px; color: #999;">
                Data z TMDB | Netflix Top 10
              </p>
              <p style="margin: 0; font-size: 12px; color: #999;">
                <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color: #999; text-decoration: underline;">Odhlásit z odběru newsletteru</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return html;
}

/**
 * Generate plain text version
 */
export function generateNewsletterText(data) {
  const { movies, series, regionalMovies, regionalSeries } = data;

  let text = `TOPFLIX - TÝDENNÍ VÝBĚR\n`;
  text += `Co stojí za to vidět tento týden\n\n`;

  if (movies.length > 0) {
    text += `🎬 DOPORUČENÉ FILMY\n`;
    text += `${'='.repeat(50)}\n\n`;

    movies.slice(0, 8).forEach(movie => {
      const sourceLabel = movie.source === 'top10' ? 'Top 10' : 'Nově na Netflix';
      const rankInfo = movie.rank ? `#${movie.rank} v Top 10` : sourceLabel;

      text += `${movie.title || movie.title_original}\n`;
      if (movie.title_original && movie.title !== movie.title_original) {
        text += `${movie.title_original}\n`;
      }
      text += `⭐ ${movie.avg_rating}% • ${rankInfo}\n`;
      if (movie.year) text += `📅 ${movie.year}\n`;
      if (movie.genre) text += `🎭 ${movie.genre}\n`;
      if (movie.description) text += `\n${movie.description.substring(0, 150)}${movie.description.length > 150 ? '...' : ''}\n`;
      text += `\n`;
    });
  }

  if (series.length > 0) {
    text += `\n📺 DOPORUČENÉ SERIÁLY\n`;
    text += `${'='.repeat(50)}\n\n`;

    series.slice(0, 8).forEach(s => {
      const sourceLabel = s.source === 'top10' ? 'Top 10' : 'Nově na Netflix';
      const rankInfo = s.rank ? `#${s.rank} v Top 10` : sourceLabel;

      text += `${s.title || s.title_original}\n`;
      if (s.title_original && s.title !== s.title_original) {
        text += `${s.title_original}\n`;
      }
      text += `⭐ ${s.avg_rating}% • ${rankInfo}\n`;
      if (s.year) text += `📅 ${s.year}\n`;
      if (s.genre) text += `🎭 ${s.genre}\n`;
      if (s.description) text += `\n${s.description.substring(0, 150)}${s.description.length > 150 ? '...' : ''}\n`;
      text += `\n`;
    });
  }

  // Regional content section
  if (regionalMovies.length > 0 || regionalSeries.length > 0) {
    text += `\n🌏 JIHOAMERICKÁ A ASIJSKÁ TVORBA\n`;
    text += `${'='.repeat(50)}\n\n`;

    regionalMovies.slice(0, 6).forEach(movie => {
      const sourceLabel = movie.source === 'top10' ? 'Top 10' : 'Nově na Netflix';
      const rankInfo = movie.rank ? `#${movie.rank} v Top 10` : sourceLabel;

      text += `${movie.title || movie.title_original}\n`;
      if (movie.title_original && movie.title !== movie.title_original) {
        text += `${movie.title_original}\n`;
      }
      text += `⭐ ${movie.avg_rating}% • ${rankInfo}\n`;
      if (movie.year) text += `📅 ${movie.year}\n`;
      if (movie.genre) text += `🎭 ${movie.genre}\n`;
      if (movie.description) text += `\n${movie.description.substring(0, 150)}${movie.description.length > 150 ? '...' : ''}\n`;
      text += `\n`;
    });

    regionalSeries.slice(0, 6).forEach(s => {
      const sourceLabel = s.source === 'top10' ? 'Top 10' : 'Nově na Netflix';
      const rankInfo = s.rank ? `#${s.rank} v Top 10` : sourceLabel;

      text += `${s.title || s.title_original}\n`;
      if (s.title_original && s.title !== s.title_original) {
        text += `${s.title_original}\n`;
      }
      text += `⭐ ${s.avg_rating}% • ${rankInfo}\n`;
      if (s.year) text += `📅 ${s.year}\n`;
      if (s.genre) text += `🎭 ${s.genre}\n`;
      if (s.description) text += `\n${s.description.substring(0, 150)}${s.description.length > 150 ? '...' : ''}\n`;
      text += `\n`;
    });
  }

  text += `\nZobrazit více na: https://www.topflix.cz\n\n`;
  text += `---\n`;
  text += `Data z TMDB | Netflix Top 10\n`;

  return text;
}

/**
 * Generate dynamic subject line with top-rated titles
 */
export function generateNewsletterSubject(data) {
  const { movies, series } = data;

  // Get top movie (highest rated, non-regional)
  const topMovie = movies.length > 0 ? movies[0] : null;

  // Get top series (highest rated, non-regional)
  const topSeries = series.length > 0 ? series[0] : null;

  // Build subject line
  if (topMovie && topSeries) {
    return `Stojí za vidění: ${topMovie.title} a ${topSeries.title}`;
  } else if (topMovie) {
    return `Stojí za vidění: ${topMovie.title}`;
  } else if (topSeries) {
    return `Stojí za vidění: ${topSeries.title}`;
  } else {
    return 'Topflix - Týdenní výběr na Netflix';
  }
}
