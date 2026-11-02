import { PROJECT73_SCHEMA_STATEMENTS } from '../../db/schema';
import type { D1Database } from '../dataStore';
import type { ShoppingPlan } from '../../src/types/shopping';

let schemaReady: WeakSet<object> = new WeakSet();

export async function ensureProject73Schema(db: D1Database) {
  if (schemaReady.has(db as object)) return;
  for (const statement of PROJECT73_SCHEMA_STATEMENTS) await db.prepare(statement).run();
  schemaReady.add(db as object);
}

export function resetSchemaCache() {
  schemaReady = new WeakSet();
}

export interface IntegrationRow {
  user_id: string;
  provider: 'picnic';
  status: 'pending_2fa' | 'connected' | 'expired';
  encrypted_auth_key: string | null;
  key_iv: string | null;
  device_id: string;
  country_code: string;
  checkout_enabled: number;
  connected_at: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getIntegration(db: D1Database, userId: string) {
  await ensureProject73Schema(db);
  return db.prepare('SELECT * FROM project73_integrations WHERE user_id = ? AND provider = ? LIMIT 1').bind(userId, 'picnic').first<IntegrationRow>();
}

export async function saveIntegration(db: D1Database, row: Omit<IntegrationRow, 'created_at' | 'updated_at'> & { created_at?: string }) {
  await ensureProject73Schema(db);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO project73_integrations (user_id, provider, status, encrypted_auth_key, key_iv, device_id, country_code, checkout_enabled, connected_at, last_checked_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, provider) DO UPDATE SET status = excluded.status, encrypted_auth_key = excluded.encrypted_auth_key, key_iv = excluded.key_iv,
      device_id = excluded.device_id, country_code = excluded.country_code, checkout_enabled = excluded.checkout_enabled, connected_at = excluded.connected_at,
      last_checked_at = excluded.last_checked_at, updated_at = excluded.updated_at`)
    .bind(row.user_id, row.provider, row.status, row.encrypted_auth_key, row.key_iv, row.device_id, row.country_code, row.checkout_enabled, row.connected_at, row.last_checked_at, row.created_at ?? now, now)
    .run();
}

export async function updateIntegrationFields(db: D1Database, userId: string, fields: Partial<Pick<IntegrationRow, 'status' | 'checkout_enabled' | 'last_checked_at'>>) {
  await ensureProject73Schema(db);
  const entries = Object.entries(fields);
  if (!entries.length) return;
  const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
  await db.prepare(`UPDATE project73_integrations SET ${assignments}, updated_at = ? WHERE user_id = ? AND provider = 'picnic'`).bind(...entries.map(([, value]) => value), new Date().toISOString(), userId).run();
}

export async function deleteIntegration(db: D1Database, userId: string) {
  await ensureProject73Schema(db);
  await db.prepare('DELETE FROM project73_integrations WHERE user_id = ?').bind(userId).run();
}

export async function saveShoppingPlan(db: D1Database, userId: string, plan: ShoppingPlan) {
  await ensureProject73Schema(db);
  await db.prepare(`INSERT INTO project73_shopping_plans (id, user_id, meal_plan_id, source, version, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET version = excluded.version, payload = excluded.payload, updated_at = excluded.updated_at WHERE project73_shopping_plans.user_id = excluded.user_id`)
    .bind(plan.id, userId, plan.mealPlanId, plan.source, plan.version, JSON.stringify(plan), plan.createdAt, plan.updatedAt)
    .run();
  // Keep the last 20 plans per user.
  await db.prepare(`DELETE FROM project73_shopping_plans WHERE user_id = ? AND id NOT IN (SELECT id FROM project73_shopping_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 20)`).bind(userId, userId).run();
}

export async function getShoppingPlan(db: D1Database, userId: string, id: string): Promise<ShoppingPlan | null> {
  await ensureProject73Schema(db);
  const row = await db.prepare('SELECT payload FROM project73_shopping_plans WHERE id = ? AND user_id = ? LIMIT 1').bind(id, userId).first<{ payload: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as ShoppingPlan;
  } catch {
    return null;
  }
}

export async function latestShoppingPlan(db: D1Database, userId: string): Promise<ShoppingPlan | null> {
  await ensureProject73Schema(db);
  const row = await db.prepare('SELECT payload FROM project73_shopping_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(userId).first<{ payload: string }>();
  return row ? JSON.parse(row.payload) as ShoppingPlan : null;
}

export interface SyncOperationRow {
  id: string;
  user_id: string;
  shopping_plan_id: string;
  idempotency_key: string;
  status: 'in_progress' | 'completed' | 'failed';
  operations: string;
  result: string | null;
  created_at: string;
  completed_at: string | null;
}

/** Claims an idempotency key. Returns null when it was claimed now, or the existing row. */
export async function claimSyncOperation(db: D1Database, row: Pick<SyncOperationRow, 'id' | 'user_id' | 'shopping_plan_id' | 'idempotency_key' | 'operations'>) {
  await ensureProject73Schema(db);
  const now = new Date().toISOString();
  const inserted = await db.prepare(`INSERT OR IGNORE INTO project73_cart_sync_operations (id, user_id, shopping_plan_id, idempotency_key, status, operations, created_at) VALUES (?, ?, ?, ?, 'in_progress', ?, ?)`)
    .bind(row.id, row.user_id, row.shopping_plan_id, row.idempotency_key, row.operations, now).run();
  if ((inserted.meta?.changes ?? 0) === 1) return null;
  return db.prepare('SELECT * FROM project73_cart_sync_operations WHERE user_id = ? AND idempotency_key = ? LIMIT 1').bind(row.user_id, row.idempotency_key).first<SyncOperationRow>();
}

export async function finishSyncOperation(db: D1Database, id: string, status: 'completed' | 'failed', result: unknown) {
  await db.prepare('UPDATE project73_cart_sync_operations SET status = ?, result = ?, completed_at = ? WHERE id = ?').bind(status, JSON.stringify(result), new Date().toISOString(), id).run();
}

export async function hasRunningSync(db: D1Database, userId: string) {
  await ensureProject73Schema(db);
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const row = await db.prepare(`SELECT id FROM project73_cart_sync_operations WHERE user_id = ? AND status = 'in_progress' AND created_at > ? LIMIT 1`).bind(userId, cutoff).first<{ id: string }>();
  return Boolean(row);
}

export type OrderStatus = 'started' | 'payment_pending' | 'confirming' | 'confirmed' | 'failed' | 'cancelled' | 'price_changed';

export interface OrderAttemptRow {
  id: string;
  user_id: string;
  shopping_plan_id: string;
  idempotency_key: string;
  status: OrderStatus;
  picnic_order_id: string | null;
  transaction_id: string | null;
  reviewed_total_cents: number;
  picnic_total_cents: number | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
}

export async function claimOrderAttempt(db: D1Database, row: Pick<OrderAttemptRow, 'id' | 'user_id' | 'shopping_plan_id' | 'idempotency_key' | 'reviewed_total_cents'>) {
  await ensureProject73Schema(db);
  const now = new Date().toISOString();
  const inserted = await db.prepare(`INSERT OR IGNORE INTO project73_order_attempts (id, user_id, shopping_plan_id, idempotency_key, status, reviewed_total_cents, created_at, updated_at) VALUES (?, ?, ?, ?, 'started', ?, ?, ?)`)
    .bind(row.id, row.user_id, row.shopping_plan_id, row.idempotency_key, row.reviewed_total_cents, now, now).run();
  if ((inserted.meta?.changes ?? 0) === 1) return null;
  return db.prepare('SELECT * FROM project73_order_attempts WHERE user_id = ? AND idempotency_key = ? LIMIT 1').bind(row.user_id, row.idempotency_key).first<OrderAttemptRow>();
}

export async function getOrderAttempt(db: D1Database, userId: string, id: string) {
  await ensureProject73Schema(db);
  return db.prepare('SELECT * FROM project73_order_attempts WHERE id = ? AND user_id = ? LIMIT 1').bind(id, userId).first<OrderAttemptRow>();
}

export async function activeOrderAttempt(db: D1Database, userId: string, exceptId?: string) {
  await ensureProject73Schema(db);
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  return db.prepare(`SELECT * FROM project73_order_attempts WHERE user_id = ? AND status IN ('started', 'payment_pending', 'confirming') AND updated_at > ? AND id != ? ORDER BY created_at DESC LIMIT 1`)
    .bind(userId, cutoff, exceptId ?? '').first<OrderAttemptRow>();
}

/** Compare-and-set status transition; returns true when this caller performed the transition. */
export async function transitionOrderAttempt(db: D1Database, id: string, from: OrderStatus[], to: OrderStatus, fields: Partial<Pick<OrderAttemptRow, 'picnic_order_id' | 'transaction_id' | 'picnic_total_cents' | 'error_code' | 'confirmed_at'>> = {}) {
  const entries = Object.entries(fields);
  const assignments = entries.map(([key]) => `, ${key} = ?`).join('');
  const placeholders = from.map(() => '?').join(', ');
  const result = await db.prepare(`UPDATE project73_order_attempts SET status = ?, updated_at = ?${assignments} WHERE id = ? AND status IN (${placeholders})`)
    .bind(to, new Date().toISOString(), ...entries.map(([, value]) => value), id, ...from).run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function readCache<T>(db: D1Database, key: string, maxAgeMs: number): Promise<{ value: T; retrievedAt: string } | null> {
  await ensureProject73Schema(db);
  const row = await db.prepare('SELECT payload, retrieved_at FROM project73_product_cache WHERE cache_key = ? LIMIT 1').bind(key).first<{ payload: string; retrieved_at: string }>();
  if (!row || Date.now() - Date.parse(row.retrieved_at) > maxAgeMs) return null;
  try {
    return { value: JSON.parse(row.payload) as T, retrievedAt: row.retrieved_at };
  } catch {
    return null;
  }
}

export async function writeCache(db: D1Database, key: string, value: unknown) {
  await ensureProject73Schema(db);
  await db.prepare('INSERT INTO project73_product_cache (cache_key, payload, retrieved_at) VALUES (?, ?, ?) ON CONFLICT (cache_key) DO UPDATE SET payload = excluded.payload, retrieved_at = excluded.retrieved_at')
    .bind(key, JSON.stringify(value), new Date().toISOString()).run();
}

/** Removes every Project 73 server record for a user (integration, plans, operations, orders, caches). */
export async function deleteProject73UserData(db: D1Database, userId: string, cachePrefix: string) {
  await ensureProject73Schema(db);
  for (const table of ['project73_integrations', 'project73_shopping_plans', 'project73_cart_sync_operations', 'project73_order_attempts']) {
    await db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId).run();
  }
  await db.prepare('DELETE FROM project73_product_cache WHERE cache_key LIKE ?').bind(`${cachePrefix}%`).run();
}
