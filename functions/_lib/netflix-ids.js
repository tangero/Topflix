/**
 * Netflix ID titulů pro přímé odkazy https://www.netflix.com/title/<id>.
 *
 * Vyhledávání na Netflixu (search?q=) potřebuje přihlášení a na mobilu
 * neotevře aplikaci. Odkaz /title/<id> ano. TMDB ani Top 10 Netflix ID
 * nemají, zdarma je má Wikidata (P1874). Hledá se podle TMDB ID
 * (P4947 film, P4983 seriál), a když tam položka chybí, podle IMDb ID (P345).
 *
 * Výsledky, včetně „nenalezeno“, se ukládají do tabulky netflix_ids,
 * aby se Wikidata neptala při každém požadavku.
 */

const SPARQL_URL = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'Topflix/1.0 (https://www.topflix.cz; newsletter@topflix.cz)';
const BATCH = 100;
// Nenalezené zkusíme znovu za 3 dny: nové tituly dostanou ID na Wikidatech později.
const RETRY_MISSING_MS = 3 * 24 * 60 * 60 * 1000;
const NETFLIX_ID = /^\d{5,12}$/;

const key = (type, tmdbId) => `${type}:${tmdbId}`;

export function netflixTitleUrl(netflixId) {
  return NETFLIX_ID.test(String(netflixId || '')) ? `https://www.netflix.com/title/${netflixId}` : '';
}

/** Projde odpověď API a vrátí všechny objekty, které vypadají jako titul. */
export function collectTitles(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectTitles(item, out);
  } else if (value && typeof value === 'object') {
    if (Number.isInteger(Number(value.tmdb_id)) && Number(value.tmdb_id) > 0
        && (value.type === 'movie' || value.type === 'series')) {
      out.push(value);
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') collectTitles(child, out);
    }
  }
  return out;
}

// Wikidata občas odpoví pomalu i na rychlý dotaz, proto jeden opakovaný pokus.
async function sparql(query, fetchImpl, attempts = 2) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetchImpl(`${SPARQL_URL}?format=json&query=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
        signal: AbortSignal.timeout(12000)
      });
      if (response.status === 429 || response.status >= 500) throw new Error(`Wikidata ${response.status}`);
      if (!response.ok) throw Object.assign(new Error(`Wikidata ${response.status}`), { permanent: true });
      const data = await response.json();
      return data.results?.bindings || [];
    } catch (error) {
      if (error.permanent || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

const quoted = (values) => values.map((v) => `"${String(v).replace(/[^0-9A-Za-z]/g, '')}"`).join(' ');

/**
 * Dotaz na Wikidata pro dávku titulů [{ tmdb_id, type, imdb_id? }].
 * Vrátí Map "type:tmdb_id" -> netflix_id.
 */
export async function lookupWikidata(items, fetchImpl = fetch) {
  const found = new Map();
  const movies = items.filter((i) => i.type === 'movie').map((i) => i.tmdb_id);
  const series = items.filter((i) => i.type === 'series').map((i) => i.tmdb_id);
  const parts = [];
  // P1874 musí být uvnitř každé větve. Za UNION ho Wikidata vyhodnotí
  // nad všemi tituly s Netflix ID: 150 titulů pak trvá 56 s místo 0,3 s.
  if (movies.length) parts.push(`{ VALUES ?tmdb { ${quoted(movies)} } ?it wdt:P4947 ?tmdb . ?it wdt:P1874 ?nf . BIND("movie" AS ?kind) }`);
  if (series.length) parts.push(`{ VALUES ?tmdb { ${quoted(series)} } ?it wdt:P4983 ?tmdb . ?it wdt:P1874 ?nf . BIND("series" AS ?kind) }`);
  if (parts.length) {
    const rows = await sparql(`SELECT ?tmdb ?kind ?nf WHERE { ${parts.join(' UNION ')} }`, fetchImpl);
    for (const row of rows) {
      const id = row.nf?.value;
      const k = key(row.kind.value, row.tmdb.value);
      if (NETFLIX_ID.test(id || '') && !found.has(k)) found.set(k, id);
    }
  }

  // Druhý pokus podle IMDb ID pro tituly, které podle TMDB nenašel.
  const byImdb = new Map();
  for (const item of items) {
    if (found.has(key(item.type, item.tmdb_id))) continue;
    if (/^tt\d{5,10}$/.test(item.imdb_id || '')) byImdb.set(item.imdb_id, item);
  }
  if (byImdb.size) {
    const rows = await sparql(`SELECT ?imdb ?nf WHERE { VALUES ?imdb { ${quoted([...byImdb.keys()])} } ?it wdt:P345 ?imdb . ?it wdt:P1874 ?nf . }`, fetchImpl);
    for (const row of rows) {
      const item = byImdb.get(row.imdb.value);
      const id = row.nf?.value;
      if (item && NETFLIX_ID.test(id || '')) {
        const k = key(item.type, item.tmdb_id);
        if (!found.has(k)) found.set(k, id);
      }
    }
  }
  return found;
}

/** Načte uložená ID pro tituly. Vrátí Map "type:tmdb_id" -> { netflix_id, checked_at }. */
export async function readNetflixIds(db, items) {
  const result = new Map();
  const ids = [...new Set(items.map((i) => Number(i.tmdb_id)))];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { results } = await db.prepare(`
      SELECT tmdb_id, type, netflix_id, checked_at FROM netflix_ids
      WHERE tmdb_id IN (SELECT value FROM json_each(?1))
    `).bind(JSON.stringify(chunk)).all();
    for (const row of results || []) result.set(key(row.type, row.tmdb_id), row);
  }
  return result;
}

/** Doplní item.netflix_id do titulů. Vrátí tituly, které je potřeba ověřit na Wikidatech. */
export async function attachNetflixIds(db, items, now = Date.now()) {
  if (!db || !items.length) return [];
  let stored;
  try {
    stored = await readNetflixIds(db, items);
  } catch (error) {
    // Bez migrace 0005 tabulka není: odkazy zůstanou na vyhledávání.
    return [];
  }
  const stale = [];
  const seen = new Set();
  for (const item of items) {
    const k = key(item.type, item.tmdb_id);
    const row = stored.get(k);
    if (row && row.netflix_id) {
      item.netflix_id = row.netflix_id;
    } else if (!seen.has(k) && (!row || now - Date.parse(row.checked_at) > RETRY_MISSING_MS)) {
      seen.add(k);
      stale.push(item);
    }
  }
  return stale;
}

// D1 vrací meta.changes, node:sqlite v testech changes
const changesOf = (result) => Number(result?.meta?.changes ?? result?.changes ?? 0);

/**
 * Zeptá se Wikidat na tituly a uloží výsledek, i „nenalezeno“.
 * Dohledává jen tituly, které si tento běh zarezervoval: souběžný
 * požadavek nebo cron se stejným titulem ho přeskočí.
 */
export async function refreshNetflixIds(db, items, { fetchImpl = fetch, now = new Date() } = {}) {
  let found = 0;
  let checked = 0;
  // Rezervace vyprší za hodinu, aby výpadek Wikidat nezablokoval tituly na dny.
  const claimedAt = new Date(now.getTime() - RETRY_MISSING_MS + 60 * 60 * 1000).toISOString();
  // Zastaralý je titul bez záznamu, nebo nenalezený s kontrolou starší než RETRY_MISSING_MS.
  const staleBefore = new Date(now.getTime() - RETRY_MISSING_MS).toISOString();

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    // Rezervace se zapíše jen u titulu, který je pořád zastaralý. Když ho mezitím
    // zarezervoval jiný běh, UPDATE nic nezmění a titul se přeskočí.
    const claims = await db.batch(batch.map((item) => db.prepare(`
      INSERT INTO netflix_ids (tmdb_id, type, netflix_id, source, checked_at)
      VALUES (?1, ?2, NULL, NULL, ?3)
      ON CONFLICT(tmdb_id, type) DO UPDATE SET checked_at = excluded.checked_at
      WHERE netflix_ids.netflix_id IS NULL AND netflix_ids.checked_at < ?4
    `).bind(Number(item.tmdb_id), item.type, claimedAt, staleBefore)));
    const claimed = batch.filter((item, index) => changesOf(claims[index]) > 0);
    if (!claimed.length) continue;
    checked += claimed.length;

    const ids = await lookupWikidata(claimed, fetchImpl);
    const checkedAt = now.toISOString();
    await db.batch(claimed.map((item) => {
      const netflixId = ids.get(key(item.type, item.tmdb_id)) || null;
      if (netflixId) found += 1;
      return db.prepare(`
        INSERT INTO netflix_ids (tmdb_id, type, netflix_id, source, checked_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(tmdb_id, type) DO UPDATE SET
          netflix_id = COALESCE(excluded.netflix_id, netflix_ids.netflix_id),
          source = COALESCE(excluded.source, netflix_ids.source),
          checked_at = excluded.checked_at
      `).bind(Number(item.tmdb_id), item.type, netflixId, netflixId ? 'wikidata' : null, checkedAt);
    }));
  }
  return { checked, found };
}

/**
 * Dávka pro jednorázové naplnění a cron: tituly z archivu a katalogu, které
 * ID ještě nemají a dlouho se nekontrolovaly. Vrátí počet zbývajících.
 */
export async function syncNetflixIdsStep(db, { limit = 300, fetchImpl = fetch, now = new Date() } = {}) {
  const size = Math.max(1, Math.min(Number.parseInt(limit, 10) || 300, 600));
  const cutoff = new Date(now.getTime() - RETRY_MISSING_MS).toISOString();
  const pending = `
    FROM (
      SELECT tmdb_id, type, imdb_id FROM content
      UNION
      SELECT tmdb_id, type, imdb_id FROM netflix_catalog WHERE removed_at IS NULL
    ) t
    LEFT JOIN netflix_ids n ON n.tmdb_id = t.tmdb_id AND n.type = t.type
    WHERE n.tmdb_id IS NULL OR (n.netflix_id IS NULL AND n.checked_at < ?1)
  `;
  const { results } = await db.prepare(`SELECT t.tmdb_id, t.type, t.imdb_id ${pending} LIMIT ?2`).bind(cutoff, size).all();
  const items = results || [];
  const result = items.length ? await refreshNetflixIds(db, items, { fetchImpl, now }) : { checked: 0, found: 0 };
  const { remaining } = await db.prepare(`SELECT COUNT(*) AS remaining ${pending}`).bind(cutoff).first();
  return { ...result, remaining };
}
