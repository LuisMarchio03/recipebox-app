const fs = require('fs');
const os = require('os');
const path = require('path');

// O config e o db leem o ambiente no momento do require, então isso precisa
// acontecer antes de qualquer import do app.
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'recipebox-test-')), 'test.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-aqui';
process.env.INVITE_CODE = 'convite-secreto';

const request = require('supertest');
const { db, initDB } = require('../db');
const { createApp } = require('../app');

// Limites altos por padrão: sem isso, o rate limiter bloquearia a própria
// suíte de testes, que faz dezenas de logins.
const RELAXED = {
  login: { windowMs: 60000, limit: 10000 },
  register: { windowMs: 60000, limit: 10000 },
  api: { windowMs: 60000, limit: 10000 },
};

function buildApp(rateLimits) {
  return createApp({ rateLimits: { ...RELAXED, ...rateLimits } });
}

const app = buildApp();

async function resetDatabase() {
  await initDB();
  for (const table of ['recipe_images', 'recipes', 'group_members', 'groups_', 'users']) {
    await db.execute(`DELETE FROM ${table}`);
  }
}

/** Cria um usuário via API e devolve token + id, pronto para autenticar. */
async function createUser(username, password = 'senha-de-teste') {
  const res = await request(app).post('/api/auth/register').send({
    username,
    password,
    name: username,
    invite_code: 'convite-secreto',
  });
  if (res.status !== 201) {
    throw new Error(`Falha ao criar usuário ${username}: ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token, id: res.body.user.id, username };
}

const auth = (req, user) => req.set('Authorization', `Bearer ${user.token}`);

const RECIPE = {
  title: 'Bolo de Cenoura',
  ingredients: '2 xícaras | farinha\n3 un | cenoura',
  instructions: 'Bata tudo\nAsse por 40 minutos',
};

async function createRecipe(user, overrides = {}) {
  const res = await auth(request(app).post('/api/recipes'), user).send({ ...RECIPE, ...overrides });
  if (res.status !== 201) {
    throw new Error(`Falha ao criar receita: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function createGroup(user, name = 'Família') {
  const res = await auth(request(app).post('/api/groups'), user).send({ name });
  if (res.status !== 201) {
    throw new Error(`Falha ao criar grupo: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

module.exports = {
  app,
  buildApp,
  request,
  db,
  resetDatabase,
  createUser,
  createRecipe,
  createGroup,
  auth,
  RECIPE,
};
