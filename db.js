const { createClient } = require('@libsql/client');
require('dotenv').config();

const db = createClient({
  url: process.env.DATABASE_URL || 'file:./data.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDB() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS groups_ (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT REFERENCES groups_(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(group_id, user_id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recipes (
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
    )
  `);

  console.log('Banco de dados inicializado com sucesso!');
}

module.exports = { db, initDB };
