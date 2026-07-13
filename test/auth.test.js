const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { app, buildApp, request, resetDatabase, createUser } = require('./helpers');

describe('Autenticação', () => {
  beforeEach(resetDatabase);

  test('cadastro exige o código de convite correto', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'intruso',
      password: 'senha-longa-o-bastante',
      name: 'Intruso',
      invite_code: 'chute-errado',
    });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /convite/i);
  });

  test('cadastro sem código de convite é recusado', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'intruso',
      password: 'senha-longa-o-bastante',
      name: 'Intruso',
    });

    assert.equal(res.status, 403);
  });

  test('cadastro com o convite correto devolve um token utilizável', async () => {
    const user = await createUser('novato');

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${user.token}`);

    assert.equal(me.status, 200);
    assert.equal(me.body.username, 'novato');
    assert.equal(me.body.password_hash, undefined, 'o hash da senha nunca deve sair na resposta');
  });

  test('senha curta é recusada', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'fraco',
      password: '1234',
      name: 'Fraco',
      invite_code: 'convite-secreto',
    });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /8 caracteres/i);
  });

  test('nome de usuário duplicado é recusado', async () => {
    await createUser('repetido');

    const res = await request(app).post('/api/auth/register').send({
      username: 'repetido',
      password: 'senha-longa-o-bastante',
      name: 'Outro',
      invite_code: 'convite-secreto',
    });

    assert.equal(res.status, 400);
  });

  test('login com senha errada falha e não revela se o usuário existe', async () => {
    await createUser('alice');

    const senhaErrada = await request(app).post('/api/auth/login')
      .send({ username: 'alice', password: 'errada' });
    const usuarioInexistente = await request(app).post('/api/auth/login')
      .send({ username: 'ninguem', password: 'errada' });

    assert.equal(senhaErrada.status, 401);
    assert.equal(usuarioInexistente.status, 401);
    // Mensagens diferentes entregariam a lista de usuários válidos ao atacante.
    assert.equal(senhaErrada.body.error, usuarioInexistente.body.error);
  });

  test('o rate limit bloqueia a força bruta no login', async () => {
    const limited = buildApp({ login: { windowMs: 60000, limit: 3 } });
    await createUser('alvo');

    const attempt = () => request(limited).post('/api/auth/login')
      .send({ username: 'alvo', password: 'chute' });

    assert.equal((await attempt()).status, 401);
    assert.equal((await attempt()).status, 401);
    assert.equal((await attempt()).status, 401);

    const blocked = await attempt();
    assert.equal(blocked.status, 429, 'a quarta tentativa deve ser barrada');
  });
});
