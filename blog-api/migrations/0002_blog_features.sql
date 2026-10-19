ALTER TABLE posts ADD COLUMN password_hash TEXT;
ALTER TABLE posts ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN parent_id TEXT REFERENCES comments(id) ON DELETE SET NULL;
ALTER TABLE categories ADD COLUMN parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS bookmarks (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  visitor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, visitor_hash)
);

CREATE TABLE IF NOT EXISTS page_views (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);

CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
