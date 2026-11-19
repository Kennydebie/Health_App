import { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1PreparedStatement } from '../../dataStore';

/** Minimal D1-compatible wrapper around Node's built-in SQLite, for integration tests only. */
export function createSqliteD1(): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  const normalize = (values: unknown[]) => values.map((value) => value === undefined ? null : typeof value === 'boolean' ? Number(value) : value) as Array<string | number | null>;
  return {
    raw: db,
    prepare(query: string): D1PreparedStatement {
      let values: Array<string | number | null> = [];
      const statement: D1PreparedStatement = {
        bind(...next: unknown[]) {
          values = normalize(next);
          return statement;
        },
        async first<T>() {
          return (db.prepare(query).get(...values) as T | undefined) ?? null;
        },
        async run() {
          const result = db.prepare(query).run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
        async all<T>() {
          return { results: db.prepare(query).all(...values) as T[] };
        },
      };
      return statement;
    },
  };
}
