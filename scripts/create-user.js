require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db, initDB } = require('../db');

async function main() {
  await initDB();
  const username = 'LuisMarchio03';
  const password = 'RecipesLuisMarchio0303';
  const existing = await db.execute({
    sql: 'SELECT id FROM users WHERE username = ?',
    args: [username],
  });
  if (existing.rows.length > 0) {
    console.log(`Usuário já existe: ${username}`);
  } else {
    const id = uuidv4();
    const hash = await bcrypt.hash(password, 10);
    await db.execute({
      sql: 'INSERT INTO users (id, username, password_hash, name) VALUES (?, ?, ?, ?)',
      args: [id, username, hash, username],
    });
    console.log(`Usuário criado: ${username}`);
  }
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
