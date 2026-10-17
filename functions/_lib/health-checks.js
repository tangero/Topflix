/**
 * Kontroly pro /api/health.
 *
 * Stáří dat se čte z toho, co se skutečně ukládá:
 * - týden české Top 10 z KV klíče top10_db_week (zapisuje top10.js při novém týdnu),
 * - poslední den novinek z appearance_history,
 * - poslední dokončená synchronizace katalogu z netflix_catalog_runs.
 * Odběratelé a rozesílky jsou v Resendu, ne v D1.
 */

const DAY = 24 * 60 * 60 * 1000;

// Netflix zveřejní týden (končí v neděli) v úterý. Mezi dvěma týdny je tak až
// 9 dní. Občas se zpozdí, proto poplach až po 16 dnech.
export const MAX_CHART_WEEK_AGE_DAYS = 16;
export const MAX_NEW_AGE_DAYS = 3;
// Cron běží v úterý a v pátek, nejdelší mezera jsou 4 dny.
export const MAX_CATALOG_AGE_DAYS = 5;
// Newsletter chodí každé úterý.
export const MAX_NEWSLETTER_AGE_DAYS = 8;

const daysBetween = (from, now) => Math.floor((now - from) / DAY);

function parseDate(value) {
  if (!value) return null;
  // Resend vrací "2026-10-16 05:39:08.123+00", Date potřebuje "T"
  const date = new Date(String(value).replace(' ', 'T').replace(/\+00$/, 'Z'));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Vyhodnotí stáří dat. Vstupem jsou hodnoty načtené z D1 a KV. */
export function evaluateData({ chartWeek, lastNew, lastCatalog, totalRecords, qualityRecords }, now = new Date()) {
  const issues = [];
  let status = 'healthy';
  const degrade = (message) => { status = 'degraded'; issues.push(message); };

  const week = parseDate(chartWeek);
  const chartAge = week ? daysBetween(week, now) : null;
  if (!week) degrade('Netflix Top 10 week is unknown');
  else if (chartAge > MAX_CHART_WEEK_AGE_DAYS) degrade(`Netflix Top 10 week ${chartWeek} is ${chartAge} days old (>${MAX_CHART_WEEK_AGE_DAYS})`);

  const fresh = parseDate(lastNew);
  const newAge = fresh ? daysBetween(fresh, now) : null;
  if (!fresh) degrade('No new-on-Netflix data stored yet');
  else if (newAge > MAX_NEW_AGE_DAYS) degrade(`New-on-Netflix data is ${newAge} days old (>${MAX_NEW_AGE_DAYS})`);

  const catalog = parseDate(lastCatalog);
  const catalogAge = catalog ? daysBetween(catalog, now) : null;
  if (!catalog) degrade('Netflix catalog has never been synced');
  else if (catalogAge > MAX_CATALOG_AGE_DAYS) degrade(`Netflix catalog sync is ${catalogAge} days old (>${MAX_CATALOG_AGE_DAYS})`);

  if ((totalRecords || 0) < 50) degrade(`Only ${totalRecords || 0} records in database (<50)`);

  return {
    status,
    total_records: totalRecords || 0,
    quality_records: qualityRecords || 0,
    top10_week: chartWeek || null,
    top10_week_age_days: chartAge,
    last_new_on_netflix: lastNew || null,
    last_catalog_sync: lastCatalog || null,
    issues
  };
}

export async function loadDataInputs(env) {
  const row = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM content) AS total,
      (SELECT COUNT(*) FROM content WHERE avg_rating >= 70) AS quality,
      (SELECT MAX(date) FROM appearance_history WHERE source = 'netflix_new') AS last_new
  `).first();
  let lastCatalog = null;
  try {
    const run = await env.DB.prepare('SELECT MAX(finished_at) AS finished FROM netflix_catalog_runs').first();
    lastCatalog = run?.finished || null;
  } catch (error) {
    // Bez migrace 0004 katalog neexistuje
  }
  const chartWeek = env.TOPFLIX_KV ? await env.TOPFLIX_KV.get('top10_db_week') : null;
  return {
    chartWeek,
    lastNew: row?.last_new || null,
    lastCatalog,
    totalRecords: row?.total || 0,
    qualityRecords: row?.quality || 0
  };
}

async function resendGet(env, path, fetchImpl) {
  const response = await fetchImpl(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw Object.assign(new Error(`Resend ${path.split('?')[0]} ${response.status}`), { status: response.status });
  return response.json();
}

/**
 * Načte z Resendu poslední rozesílku a pro správce i počet odběratelů
 * a to, jestli poslední rozesílka měla textovou verzi.
 */
export async function loadNewsletterInputs(env, { admin = false, fetchImpl = fetch } = {}) {
  const inputs = { lastSent: null, lastBroadcast: null, subscribers: null, error: null };
  try {
    const list = await resendGet(env, '/broadcasts?limit=20', fetchImpl);
    const sent = (list.data || [])
      .filter((b) => b.status === 'sent' && b.sent_at)
      .sort((a, b) => parseDate(b.sent_at) - parseDate(a.sent_at))[0];
    if (sent) {
      inputs.lastSent = sent.sent_at;
      if (admin) {
        const full = await resendGet(env, `/broadcasts/${encodeURIComponent(sent.id)}`, fetchImpl);
        inputs.lastBroadcast = {
          id: sent.id,
          subject: full.subject || null,
          html_length: (full.html || '').length,
          text_length: (full.text || '').length
        };
      }
    }
    if (admin && env.RESEND_AUDIENCE_ID) {
      let count = 0;
      let after = '';
      for (let page = 0; page < 50; page++) {
        const query = `/contacts?segment_id=${encodeURIComponent(env.RESEND_AUDIENCE_ID)}&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`;
        const chunk = await resendGet(env, query, fetchImpl);
        const contacts = chunk.data || [];
        count += contacts.filter((c) => !c.unsubscribed).length;
        if (!chunk.has_more || !contacts.length) break;
        after = contacts[contacts.length - 1].id;
      }
      inputs.subscribers = count;
    }
  } catch (error) {
    inputs.error = error.status === 401 || error.status === 403
      ? 'Resend API key cannot read broadcasts or contacts'
      : error.message;
  }
  return inputs;
}

export function evaluateNewsletter(env, inputs, { admin = false } = {}, now = new Date()) {
  const issues = [];
  let status = 'healthy';
  const degrade = (message) => { status = 'degraded'; issues.push(message); };

  const result = { status, resend_api: env.RESEND_API_KEY ? 'configured' : 'missing', last_sent: null, days_since_last: null, issues };
  if (!env.RESEND_API_KEY) {
    degrade('Resend API key not configured');
    return { ...result, status };
  }
  if (inputs.error) degrade(`Newsletter check failed: ${inputs.error}`);

  const sent = parseDate(inputs.lastSent);
  if (sent) {
    result.last_sent = sent.toISOString();
    result.days_since_last = daysBetween(sent, now);
    if (result.days_since_last > MAX_NEWSLETTER_AGE_DAYS) degrade(`Newsletter not sent in ${result.days_since_last} days (>${MAX_NEWSLETTER_AGE_DAYS})`);
  } else if (!inputs.error) {
    degrade('No sent newsletter found in Resend');
  }

  if (admin) {
    result.active_subscribers = inputs.subscribers;
    result.last_broadcast = inputs.lastBroadcast;
    if (inputs.lastBroadcast && inputs.lastBroadcast.text_length === 0) {
      degrade('Last newsletter was sent without a plain-text version');
    }
  }
  return { ...result, status };
}
