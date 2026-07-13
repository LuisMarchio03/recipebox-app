const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  app, request, resetDatabase, createUser, createRecipe, createGroup, auth,
} = require('./helpers');

describe('Busca e filtros', () => {
  let alice;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser('alice');

    await createRecipe(alice, {
      title: 'Bolo de Cenoura',
      category: 'Bolos',
      ingredients: '2 xícaras | farinha\n3 un | cenoura',
      instructions: 'Bata tudo\nAsse por 40 minutos',
      prep_time: 20, cook_time: 40,
    });
    await createRecipe(alice, {
      title: 'Frango Assado',
      category: 'Carnes',
      ingredients: '1 kg | frango\n4 dentes | alho',
      instructions: 'Tempere\nAsse',
      prep_time: 10, cook_time: 60,
    });
    await createRecipe(alice, {
      title: 'Salada Rápida',
      category: 'Saladas',
      ingredients: 'alface\ntomate',
      instructions: 'Misture',
      prep_time: 5, cook_time: 0,
    });
  });

  const list = params => auth(request(app).get(`/api/recipes?${params}`), alice);

  test('a busca encontra por ingrediente, não só por título', async () => {
    // Era a falha mais visível da busca antiga: procurar "alho" não achava a
    // receita que leva alho, porque só título/descrição/categoria eram olhados.
    const res = await list('q=alho');

    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].title, 'Frango Assado');
  });

  test('a busca ignora maiúsculas e acentos digitados no título', async () => {
    const res = await list('q=BOLO');
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].title, 'Bolo de Cenoura');
  });

  test('o curinga % do LIKE é escapado e não casa com tudo', async () => {
    // Sem escapar, "%" viraria "buscar qualquer coisa" e devolveria as 3
    // receitas — dando a impressão de que a busca ignorou o termo.
    const res = await list('q=%25');
    assert.equal(res.body.length, 0);
  });

  test('o filtro de categoria restringe o resultado', async () => {
    const res = await list('category=Carnes');
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].title, 'Frango Assado');
  });

  test('ordenar por tempo traz a receita mais rápida primeiro', async () => {
    const res = await list('sort=time');
    assert.equal(res.body[0].title, 'Salada Rápida');
  });

  test('ordenar por título usa ordem alfabética', async () => {
    const res = await list('sort=title');
    assert.deepEqual(res.body.map(r => r.title), ['Bolo de Cenoura', 'Frango Assado', 'Salada Rápida']);
  });

  test('sort desconhecido cai no padrão em vez de quebrar a query', async () => {
    const res = await list('sort=; DROP TABLE recipes');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 3);
  });

  test('as categorias listadas alimentam o filtro', async () => {
    const res = await auth(request(app).get('/api/recipes/categories'), alice);
    assert.deepEqual(res.body, ['Bolos', 'Carnes', 'Saladas']);
  });

  test('a aba "Todas" mostra também as minhas receitas privadas', async () => {
    await createRecipe(alice, { title: 'Meu Segredo', is_private: true });

    const res = await list('');
    const titles = res.body.map(r => r.title);

    // Comportamento novo e deliberado: antes "Todas" escondia as próprias
    // receitas privadas, o que fazia a aba não mostrar todas.
    assert.ok(titles.includes('Meu Segredo'));
    assert.equal(res.body.length, 4);
  });
});

describe('Validação de receita', () => {
  let alice;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser('alice');
  });

  test('receita sem título é recusada', async () => {
    const res = await auth(request(app).post('/api/recipes'), alice)
      .send({ ingredients: 'x', instructions: 'y' });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /[Tt]ítulo/);
  });

  test('dificuldade inválida é recusada em vez de virar lixo no banco', async () => {
    const res = await auth(request(app).post('/api/recipes'), alice)
      .send({ title: 'X', ingredients: 'a', instructions: 'b', difficulty: 'Impossível' });

    assert.equal(res.status, 400);
  });

  test('porções negativas são recusadas', async () => {
    const res = await auth(request(app).post('/api/recipes'), alice)
      .send({ title: 'X', ingredients: 'a', instructions: 'b', servings: -5 });

    assert.equal(res.status, 400);
  });
});

describe('Fotos', () => {
  let alice, bob, recipe;

  // 1x1 WebP válido, gerado com `cwebp`. Serve para exercitar a validação de
  // assinatura sem depender de nenhuma biblioteca de imagem.
  const WEBP_1PX =
    'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
  const dataUrl = `data:image/webp;base64,${WEBP_1PX}`;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser('alice');
    bob = await createUser('bob');
    recipe = await createRecipe(alice);
  });

  test('o dono salva e recupera a foto', async () => {
    const put = await auth(request(app).put(`/api/recipes/${recipe.id}/image`), alice)
      .send({ thumb: dataUrl, full: dataUrl });
    assert.equal(put.status, 200);

    const get = await auth(request(app).get(`/api/recipes/${recipe.id}/image`), alice);
    assert.equal(get.status, 200);
    assert.equal(get.headers['content-type'], 'image/webp');
    assert.ok(get.headers.etag, 'o ETag permite ao navegador cachear a foto');

    const detail = await auth(request(app).get(`/api/recipes/${recipe.id}`), alice);
    assert.equal(detail.body.has_image, 1);
  });

  test('a listagem sinaliza has_image sem carregar o binário', async () => {
    await auth(request(app).put(`/api/recipes/${recipe.id}/image`), alice)
      .send({ thumb: dataUrl, full: dataUrl });

    const res = await auth(request(app).get('/api/recipes'), alice);
    assert.equal(res.body[0].has_image, 1);
    assert.equal(res.body[0].thumb, undefined, 'o BLOB não pode vir junto na listagem');
  });

  test('conteúdo que não é imagem é rejeitado mesmo declarando ser', async () => {
    // Assinatura confere o conteúdo real. Sem isso, um script entra no banco só
    // por vir rotulado como `data:image/webp`.
    const fake = 'data:image/webp;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');

    const res = await auth(request(app).put(`/api/recipes/${recipe.id}/image`), alice)
      .send({ thumb: fake, full: fake });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /imagem/i);
  });

  test('não posso pôr foto na receita de outra pessoa', async () => {
    const res = await auth(request(app).put(`/api/recipes/${recipe.id}/image`), bob)
      .send({ thumb: dataUrl, full: dataUrl });

    assert.equal(res.status, 403);
  });

  test('excluir a receita apaga a foto junto', async () => {
    await auth(request(app).put(`/api/recipes/${recipe.id}/image`), alice)
      .send({ thumb: dataUrl, full: dataUrl });
    await auth(request(app).delete(`/api/recipes/${recipe.id}`), alice);

    const { db } = require('./helpers');
    const rows = await db.execute({
      sql: 'SELECT 1 FROM recipe_images WHERE recipe_id = ?',
      args: [recipe.id],
    });
    assert.equal(rows.rows.length, 0, 'a foto ficaria órfã no banco para sempre');
  });
});
