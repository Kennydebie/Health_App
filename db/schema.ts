export const PROJECT75_USER_DATA_SCHEMA = `CREATE TABLE IF NOT EXISTS project75_user_data (
  user_id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  client_mutation_id TEXT
)`;

export const PROJECT75_PROGRESS_PHOTOS_SCHEMA = `CREATE TABLE IF NOT EXISTS project75_progress_photos (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  pose TEXT NOT NULL CHECK (pose IN ('front', 'side', 'back')),
  photo_date TEXT NOT NULL,
  body_weight_kg REAL,
  note TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL
)`;

/** Project 73: server-only Picnic integration, shopping plans, cart operations and order attempts. */
export const PROJECT73_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS project73_integrations (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('picnic')),
  status TEXT NOT NULL CHECK (status IN ('pending_2fa', 'connected', 'expired')),
  encrypted_auth_key TEXT,
  key_iv TEXT,
  device_id TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'NL',
  checkout_enabled INTEGER NOT NULL DEFAULT 0,
  connected_at TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider)
)`,
  `CREATE TABLE IF NOT EXISTS project73_shopping_plans (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  meal_plan_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('picnic', 'demo')),
  version INTEGER NOT NULL DEFAULT 1,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_project73_shopping_plans_user ON project73_shopping_plans (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS project73_cart_sync_operations (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  shopping_plan_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
  operations TEXT NOT NULL,
  result TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (user_id, idempotency_key)
)`,
  `CREATE TABLE IF NOT EXISTS project73_order_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  shopping_plan_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'payment_pending', 'confirming', 'confirmed', 'failed', 'cancelled', 'price_changed')),
  picnic_order_id TEXT,
  transaction_id TEXT,
  reviewed_total_cents INTEGER NOT NULL,
  picnic_total_cents INTEGER,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  UNIQUE (user_id, idempotency_key)
)`,
  `CREATE INDEX IF NOT EXISTS idx_project73_order_attempts_user ON project73_order_attempts (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS project73_product_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  retrieved_at TEXT NOT NULL
)`,
];
