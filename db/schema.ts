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
