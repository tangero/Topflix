// Minimální náhrada Cloudflare D1 a KV nad vestavěným SQLite (node:sqlite) pro testy.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
export function createD1(migrations) {
  const raw = new DatabaseSync(':memory:');
  for (const f of migrations) raw.exec(fs.readFileSync(f, 'utf8'));
  const wrap = (sql, params = []) => ({
    bind: (...p) => wrap(sql, p),
    first: async () => raw.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: raw.prepare(sql).all(...params) }),
    run: async () => { const r = raw.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; },
    _exec() { return raw.prepare(sql).run(...params); }
  });
  return {
    raw,
    prepare: (sql) => wrap(sql),
    batch: async (stmts) => { raw.exec('BEGIN'); try { const r = stmts.map((s) => s._exec()); raw.exec('COMMIT'); return r; } catch (e) { raw.exec('ROLLBACK'); throw e; } }
  };
}
export function createKV() {
  const m = new Map();
  return { get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => m.set(k, v), delete: async (k) => m.delete(k), m };
}
