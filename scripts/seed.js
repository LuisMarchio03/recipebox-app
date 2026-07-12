require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db, initDB } = require('../db');

async function getOrCreateUser(username, password, name) {
  const existing = await db.execute({
    sql: 'SELECT id FROM users WHERE username = ?',
    args: [username],
  });
  if (existing.rows.length > 0) {
    console.log(`Usuário já existe: ${username}`);
    return existing.rows[0].id;
  }
  const id = uuidv4();
  const hash = await bcrypt.hash(password, 10);
  await db.execute({
    sql: 'INSERT INTO users (id, username, password_hash, name) VALUES (?, ?, ?, ?)',
    args: [id, username, hash, name],
  });
  console.log(`Usuário criado: ${username} (senha: ${password})`);
  return id;
}

async function seed() {
  await initDB();

  const users = [
    { username: 'admin', password: '123456', name: 'Admin' },
    { username: 'maria', password: '123456', name: 'Maria' },
    { username: 'joao', password: '123456', name: 'João' },
  ];

  const userIds = [];
  for (const u of users) {
    const id = await getOrCreateUser(u.username, u.password, u.name);
    userIds.push(id);
  }

  const existingGroup = await db.execute({
    sql: 'SELECT id FROM groups_ WHERE name = ?',
    args: ['Família Silva'],
  });

  let groupId;
  if (existingGroup.rows.length > 0) {
    groupId = existingGroup.rows[0].id;
    console.log('Grupo "Família Silva" já existe');
  } else {
    groupId = uuidv4();
    await db.execute({
      sql: 'INSERT INTO groups_ (id, name, description, created_by) VALUES (?, ?, ?, ?)',
      args: [groupId, 'Família Silva', 'Grupo da família para compartilhar receitas', userIds[0]],
    });
    console.log('Grupo "Família Silva" criado');
  }

  for (const uid of userIds) {
    const member = await db.execute({
      sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      args: [groupId, uid],
    });
    if (member.rows.length === 0) {
      await db.execute({
        sql: 'INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)',
        args: [uuidv4(), groupId, uid, uid === userIds[0] ? 'owner' : 'member'],
      });
      console.log(`  Membro ${uid === userIds[0] ? 'dono' : 'membro'} adicionado ao grupo`);
    }
  }

  const recipesData = [
    {
      title: 'Bolo de Cenoura',
      description: 'Bolo fofinho com cobertura de chocolate',
      ingredients: '3 cenouras médias raladas\n4 ovos\n1 xícara de óleo\n2 xícaras de açúcar\n2 xícaras de farinha de trigo\n1 colher de sopa de fermento em pó\n\nCobertura:\n4 colheres de sopa de chocolate em pó\n4 colheres de sopa de açúcar\n2 colheres de sopa de manteiga\n2 colheres de sopa de leite',
      instructions: 'Bata no liquidificador as cenouras, os ovos e o óleo até homogeneizar.\nAcrescente o açúcar e bata por mais 2 minutos.\nDespeje em uma tigela e adicione a farinha peneirada com o fermento, misturando delicadamente.\nDespeje em forma untada e enfarinhada.\nAsse em forno preaquecido a 180°C por 40 minutos.\nPara a cobertura, misture todos os ingredientes em uma panela e leve ao fogo baixo, mexendo até ferver. Despeje sobre o bolo ainda quente.',
      prep_time: 20, cook_time: 40, servings: 12, category: 'Bolos',
      group_id: groupId, is_private: 0, user_id: userIds[0],
    },
    {
      title: 'Feijoada',
      description: 'Feijoada completa tradicional',
      ingredients: '500g de feijão preto\n200g de carne seca\n200g de costelinha defumada\n200g de lombo defumado\n2 lingüiças calabresa\n2 lingüiças paio\n4 dentes de alho\n2 cebolas\n4 folhas de louro\nSal e pimenta a gosto',
      instructions: 'Deixe o feijão de molho de véspera.\nCozinhe o feijão na panela de pressão com as folhas de louro por 25 minutos.\nEm outra panela, refogue o alho e a cebola no azeite.\nAdicione as carnes cortadas em pedaços e refogue bem.\nJunte o feijão cozido com o caldo e deixe ferver por mais 20 minutos.\nAcerte o sal e sirva com arroz, couve refogada e farofa.',
      prep_time: 30, cook_time: 60, servings: 8, category: 'Carnes',
      group_id: groupId, is_private: 0, user_id: userIds[0],
    },
    {
      title: 'Pudim de Leite',
      description: 'Pudim tradicional cremoso',
      ingredients: '1 lata de leite condensado\n1 lata de leite (use a lata de leite condensado como medida)\n3 ovos inteiros\n1 xícara de açúcar (para a calda)',
      instructions: 'Derreta o açúcar em uma forma de pudim até formar um caramelo dourado, espalhando nas laterais.\nBata no liquidificador o leite condensado, o leite e os ovos.\nDespeje na forma caramelizada.\nCozinhe em banho-maria no forno a 180°C por 1 hora.\nDeixe esfriar e leve à geladeira por 4 horas antes de desenformar.',
      prep_time: 15, cook_time: 60, servings: 10, category: 'Sobremesas',
      is_private: 1, user_id: userIds[1], group_id: null,
    },
  ];

  for (const r of recipesData) {
    const existing = await db.execute({
      sql: 'SELECT id FROM recipes WHERE title = ? AND user_id = ?',
      args: [r.title, r.user_id],
    });
    if (existing.rows.length > 0) {
      console.log(`Receita já existe: ${r.title}`);
      continue;
    }
    const id = uuidv4();
    await db.execute({
      sql: `INSERT INTO recipes (id, title, description, ingredients, instructions, prep_time, cook_time, servings, category, user_id, group_id, is_private)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, r.title, r.description, r.ingredients, r.instructions, r.prep_time, r.cook_time, r.servings, r.category, r.user_id, r.group_id, r.is_private],
    });
    console.log(`Receita criada: ${r.title}`);
  }

  console.log('\n✅ Seed concluído!');
  console.log('Usuários: admin/123456, maria/123456, joao/123456');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
