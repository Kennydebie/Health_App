export const PROJECT75_USER_DATA_SCHEMA = `CREATE TABLE IF NOT EXISTS project75_user_data (
  user_id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  client_mutation_id TEXT
)`;
