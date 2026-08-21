import { PROJECT75_USER_DATA_SCHEMA } from '../db/schema';
import { validateAppData } from '../src/lib/appDataIntegrity';
import type { AppData } from '../src/types/models';

export interface D1Result {
  meta?: { changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface DataRow {
  payload: string;
  schema_version: number;
  revision: number;
  updated_at: string;
}

export interface StoredSnapshot {
  data: AppData | null;
  revision: number;
  updatedAt: string | null;
}

export class DataConflictError extends Error {
  constructor(public snapshot: StoredSnapshot) {
    super('A newer synchronized revision exists.');
  }
}

export async function ensureDataSchema(db: D1Database) {
  await db.prepare(PROJECT75_USER_DATA_SCHEMA).run();
}

export async function readUserData(db: D1Database, userId: string): Promise<StoredSnapshot> {
  await ensureDataSchema(db);
  const row = await db.prepare('SELECT payload, schema_version, revision, updated_at FROM project75_user_data WHERE user_id = ? LIMIT 1').bind(userId).first<DataRow>();
  if (!row) return { data: null, revision: 0, updatedAt: null };
  let data: unknown;
  try { data = JSON.parse(row.payload); } catch { throw new Error('Stored data is invalid.'); }
  const validation = validateAppData(data);
  if (!validation.valid) throw new Error('Stored data failed validation.');
  return { data: data as AppData, revision: row.revision, updatedAt: row.updated_at };
}

export async function writeUserData(
  db: D1Database,
  userId: string,
  data: AppData,
  baseRevision: number,
  clientMutationId: string,
): Promise<StoredSnapshot> {
  await ensureDataSchema(db);
  const validation = validateAppData(data);
  if (!validation.valid) throw new TypeError(validation.errors[0] ?? 'Invalid application data.');
  const payload = JSON.stringify(data);
  const updatedAt = new Date().toISOString();
  if (baseRevision === 0) {
    const inserted = await db.prepare('INSERT OR IGNORE INTO project75_user_data (user_id, payload, schema_version, revision, updated_at, client_mutation_id) VALUES (?, ?, ?, 1, ?, ?)')
      .bind(userId, payload, data.version, updatedAt, clientMutationId).run();
    if ((inserted.meta?.changes ?? 0) === 1) return { data, revision: 1, updatedAt };
  } else {
    const nextRevision = baseRevision + 1;
    const updated = await db.prepare('UPDATE project75_user_data SET payload = ?, schema_version = ?, revision = ?, updated_at = ?, client_mutation_id = ? WHERE user_id = ? AND revision = ?')
      .bind(payload, data.version, nextRevision, updatedAt, clientMutationId, userId, baseRevision).run();
    if ((updated.meta?.changes ?? 0) === 1) return { data, revision: nextRevision, updatedAt };
  }
  throw new DataConflictError(await readUserData(db, userId));
}
