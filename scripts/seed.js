/**
 * Popula o banco com dados de exemplo para desenvolvimento local.
 * As senhas aqui são fracas de propósito — por isso o script se recusa a rodar
 * fora de desenvolvimento.
 *
 *   npm run seed
 */
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const config = require('../config');
const { db, initDB } = require('../db');

if (config.NODE_ENV === 'production') {
  console.error('O seed tem senhas de exemplo e não roda em produção.');
  process.exit(1);
}

async function getOrCreateUser(username, password, name) {
  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] });
  if (existing.rows.length) return existing.rows[0].id;

  const id = uuidv4();
  const hash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
  await db.execute({
    sql: 'INSERT INTO users (id, username, password_hash, name) VALUES (?, ?, ?, ?)',
    args: [id, username, hash, name],
  });
  console.log(`Usuário criado: ${username} / ${password}`);
  return id;
}

async function seed() {
  await initDB();

  const admin = await getOrCreateUser('admin', '123456', 'Admin');
  const maria = await getOrCreateUser('maria', '123456', 'Maria');
  const joao = await getOrCreateUser('joao', '123456', 'João');

  let group = await db.execute({ sql: 'SELECT id FROM groups_ WHERE name = ?', args: ['Família Silva'] });
  let groupId;
  if (group.rows.length) {
    groupId = group.rows[0].id;
  } else {
    groupId = uuidv4();
    await db.execute({
      sql: 'INSERT INTO groups_ (id, name, description, created_by) VALUES (?, ?, ?, ?)',
      args: [groupId, 'Família Silva', 'Receitas de família', admin],
    });
    for (const [uid, role] of [[admin, 'owner'], [maria, 'member'], [joao, 'member']]) {
      await db.execute({
        sql: 'INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)',
        args: [uuidv4(), groupId, uid, role],
      });
    }
    console.log('Grupo "Família Silva" criado');
  }

  // Formato novo: ingredientes com "quantidade | nome" e passos com "# Seção".
  const recipes = [
    {
      title: 'Bolo de Cenoura', description: 'Fofinho, com cobertura de chocolate',
      category: 'Bolos', difficulty: 'Fácil', prep_time: 20, cook_time: 40, servings: 12,
      user_id: admin, group_id: groupId, is_private: 0,
      ingredients: '3 un | cenoura ralada\n4 un | ovos\n1 xícara | óleo\n2 xícaras | açúcar\n2 xícaras | farinha de trigo\n1 colher de sopa | fermento em pó',
      instructions: '# Massa\nBata no liquidificador a cenoura, os ovos e o óleo.\nAcrescente o açúcar e bata mais 2 minutos.\nMisture a farinha peneirada com o fermento delicadamente.\nAsse em forno a 180°C por 40 minutos.\n# Cobertura\nMisture chocolate, açúcar, manteiga e leite numa panela.\nLeve ao fogo até ferver e despeje sobre o bolo quente.',
    },
    {
      title: 'Pudim de Leite', description: 'Cremoso e tradicional',
      category: 'Sobremesas', difficulty: 'Médio', prep_time: 15, cook_time: 60, servings: 10,
      user_id: maria, group_id: null, is_private: 1,
      ingredients: '1 lata | leite condensado\n1 lata | leite\n3 un | ovos\n1 xícara | açúcar para a calda',
      instructions: 'Derreta o açúcar até formar caramelo e forre a forma.\nBata o leite condensado, o leite e os ovos no liquidificador.\nDespeje na forma e asse em banho-maria por 1 hora.\nGele por 4 horas antes de desenformar.',
    },
  ];

  for (const r of recipes) {
    const exists = await db.execute({
      sql: 'SELECT 1 FROM recipes WHERE title = ? AND user_id = ?',
      args: [r.title, r.user_id],
    });
    if (exists.rows.length) continue;

    await db.execute({
      sql: `INSERT INTO recipes
              (id, title, description, ingredients, instructions, prep_time, cook_time,
               servings, category, difficulty, user_id, group_id, is_private)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        uuidv4(), r.title, r.description, r.ingredients, r.instructions,
        r.prep_time, r.cook_time, r.servings, r.category, r.difficulty,
        r.user_id, r.group_id, r.is_private,
      ],
    });
    console.log(`Receita criada: ${r.title}`);
  }

  console.log('\nSeed concluído. Entre com admin / 123456 (grupo "Família Silva").');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
