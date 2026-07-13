const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  app, request, resetDatabase, createUser, createRecipe, createGroup, auth,
} = require('./helpers');

/**
 * Estes testes cobrem a fronteira de autorização — o que um usuário consegue
 * fazer com os dados de outro. Dois deles falham no código anterior a esta
 * refatoração; estão marcados abaixo.
 */

describe('Autorização', () => {
  let alice, bob;

  before(resetDatabase);

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser('alice');
    bob = await createUser('bob');
  });

  test('não posso editar a receita de outra pessoa', async () => {
    const recipe = await createRecipe(alice);

    const res = await auth(request(app).put(`/api/recipes/${recipe.id}`), bob)
      .send({ title: 'Sequestrada', ingredients: 'x', instructions: 'y' });

    assert.equal(res.status, 403);
  });

  test('não posso excluir a receita de outra pessoa', async () => {
    const recipe = await createRecipe(alice);
    const res = await auth(request(app).delete(`/api/recipes/${recipe.id}`), bob);
    assert.equal(res.status, 403);
  });

  // REGRESSÃO: no código antigo o POST validava o grupo de destino e o PUT não.
  // Bob criava uma receita pessoal e, na edição, movia-a para o grupo da Alice.
  test('não posso mover uma receita para um grupo do qual não sou membro', async () => {
    const group = await createGroup(alice, 'Só da Alice');
    const recipe = await createRecipe(bob);

    const res = await auth(request(app).put(`/api/recipes/${recipe.id}`), bob).send({
      title: recipe.title,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      group_id: group.id,
    });

    assert.equal(res.status, 403);

    // E a receita não pode ter entrado no grupo apesar do erro.
    const listed = await auth(request(app).get(`/api/recipes?group_id=${group.id}`), alice);
    assert.equal(listed.body.length, 0);
  });

  test('não posso criar uma receita direto em grupo alheio', async () => {
    const group = await createGroup(alice);

    const res = await auth(request(app).post('/api/recipes'), bob).send({
      title: 'Intrusa',
      ingredients: 'x',
      instructions: 'y',
      group_id: group.id,
    });

    assert.equal(res.status, 403);
  });

  test('receita privada não vaza para os outros membros do grupo', async () => {
    const group = await createGroup(alice);
    await auth(request(app).post(`/api/groups/${group.id}/members`), alice)
      .send({ username: 'bob' });

    const secret = await createRecipe(alice, {
      title: 'Segredo da vovó',
      is_private: true,
      group_id: group.id,
    });

    const direct = await auth(request(app).get(`/api/recipes/${secret.id}`), bob);
    assert.equal(direct.status, 403);

    const listed = await auth(request(app).get(`/api/recipes?group_id=${group.id}`), bob);
    assert.equal(listed.body.length, 0, 'a receita privada não deve aparecer na listagem do grupo');
  });

  test('não posso listar receitas de um grupo do qual não sou membro', async () => {
    const group = await createGroup(alice);
    const res = await auth(request(app).get(`/api/recipes?group_id=${group.id}`), bob);
    assert.equal(res.status, 403);
  });

  test('só o dono adiciona membros', async () => {
    const group = await createGroup(alice);
    await auth(request(app).post(`/api/groups/${group.id}/members`), alice)
      .send({ username: 'bob' });

    const carol = await createUser('carol');
    const res = await auth(request(app).post(`/api/groups/${group.id}/members`), bob)
      .send({ username: carol.username });

    assert.equal(res.status, 403);
  });

  test('o dono do grupo não pode ser removido (o grupo ficaria órfão)', async () => {
    const group = await createGroup(alice);
    const res = await auth(request(app).delete(`/api/groups/${group.id}/members/${alice.id}`), alice);
    assert.equal(res.status, 403);
  });

  test('exportar o Word de uma receita privada alheia é bloqueado', async () => {
    const secret = await createRecipe(alice, { is_private: true });
    const res = await auth(request(app).get(`/api/export/word/${secret.id}`), bob);
    assert.equal(res.status, 403);
  });

  test('sem token, a API recusa', async () => {
    const res = await request(app).get('/api/recipes');
    assert.equal(res.status, 401);
  });

  test('token forjado com outro segredo é recusado', async () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ id: alice.id, username: 'alice' }, 'segredo-errado-mas-longo-o-suficiente');

    const res = await request(app)
      .get('/api/recipes')
      .set('Authorization', `Bearer ${forged}`);

    assert.equal(res.status, 401);
  });
});
