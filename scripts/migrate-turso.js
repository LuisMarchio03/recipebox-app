const { createClient } = require('@libsql/client');
require('dotenv').config();

const OLD_URL = process.env.OLD_DATABASE_URL;
const OLD_TOKEN = process.env.OLD_TURSO_AUTH_TOKEN;
const NEW_URL = process.env.NEW_DATABASE_URL;
const NEW_TOKEN = process.env.NEW_TURSO_AUTH_TOKEN;

async function migrate() {
  console.log('Connecting to old database...');
  const oldDb = createClient({ url: OLD_URL, authToken: OLD_TOKEN });
  const newDb = createClient({ url: NEW_URL, authToken: NEW_TOKEN });

  // Get all tables (specific order to respect foreign keys)
  const tables = await oldDb.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY CASE name WHEN 'users' THEN 1 WHEN 'groups_' THEN 2 WHEN 'group_members' THEN 3 WHEN 'recipes' THEN 4 ELSE 5 END"
  );

  for (const row of tables.rows) {
    const table = row.name;
    console.log(`Migrating table: ${table}`);

    // Get schema
    const schema = await oldDb.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`);
    if (schema.rows[0] && schema.rows[0].sql) {
      await newDb.execute(schema.rows[0].sql);
      console.log(`  Created table: ${table}`);
    }

    // Get indexes
    const indexes = await oldDb.execute(
      `SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='${table}' AND sql IS NOT NULL`
    );
    for (const idx of indexes.rows) {
      if (idx.sql) {
        await newDb.execute(idx.sql);
        console.log(`  Created index on: ${table}`);
      }
    }

    // Get data
    const data = await oldDb.execute(`SELECT * FROM "${table}"`);
    if (data.rows.length === 0) continue;

    const columns = data.columns;
    const placeholders = columns.map(() => '?').join(',');
    const colNames = columns.map(c => `"${c}"`).join(',');

    const stmt = `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders})`;

    for (const row of data.rows) {
      const values = columns.map(c => row[c]);
      try {
        await newDb.execute({ sql: stmt, args: values });
      } catch (err) {
        console.error(`  Error inserting into ${table}: ${err.message}`);
      }
    }
    console.log(`  Inserted ${data.rows.length} rows into ${table}`);
  }

  console.log('Migration complete!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
