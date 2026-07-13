const { createClient } = require('@libsql/client');
const config = require('./config');

const db = createClient({
  url: config.DATABASE_URL,
  authToken: config.TURSO_AUTH_TOKEN,
});

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS groups_ (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS group_members (
    id TEXT PRIMARY KEY,
    group_id TEXT REFERENCES groups_(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    joined_at TEXT DEFAULT (datetime('now')),
    UNIQUE(group_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    ingredients TEXT NOT NULL,
    instructions TEXT NOT NULL,
    prep_time INTEGER DEFAULT 0,
    cook_time INTEGER DEFAULT 0,
    servings INTEGER DEFAULT 1,
    category TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    user_id TEXT REFERENCES users(id),
    group_id TEXT REFERENCES groups_(id) ON DELETE CASCADE,
    is_private INTEGER DEFAULT 0,
    difficulty TEXT DEFAULT 'Médio',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  // Fotos ficam fora de `recipes` de propósito: se morassem na linha da receita,
  // toda listagem arrastaria os BLOBs junto. A listagem só pergunta has_image.
  `CREATE TABLE IF NOT EXISTS recipe_images (
    recipe_id TEXT PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
    thumb BLOB NOT NULL,
    full BLOB NOT NULL,
    mime TEXT NOT NULL DEFAULT 'image/webp',
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_recipes_user ON recipes(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_recipes_group ON recipes(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_recipes_created ON recipes(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_members_user ON group_members(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_members_group ON group_members(group_id)`,
];

async function initDB() {
  for (const stmt of SCHEMA) {
    await db.execute(stmt);
  }
}

module.exports = { db, initDB };
