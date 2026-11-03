CREATE TABLE IF NOT EXISTS project75_progress_photos (
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
);
CREATE INDEX IF NOT EXISTS idx_project75_progress_photos_user_date
  ON project75_progress_photos (user_id, photo_date DESC, created_at DESC);
