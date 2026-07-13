const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { notFound, badRequest } = require('../lib/http-error');
const { decodeImage } = require('../lib/image');
const v = require('../lib/validate');
const perm = require('../lib/permissions');

const router = express.Router();
router.use(authMiddleware);

// Colunas explícitas: `SELECT *` traria ingredientes e modo de preparo inteiros
// quando a listagem só precisa do resumo do card.
const LIST_COLUMNS = `
  r.id, r.title, r.description, r.prep_time, r.cook_time, r.servings,
  r.category, r.difficulty, r.is_private, r.group_id, r.user_id,
  r.created_at, r.updated_at,
  EXISTS(SELECT 1 FROM recipe_images ri WHERE ri.recipe_id = r.id) AS has_image
`;

/**
 * Monta o WHERE de visibilidade. Regra: vejo o que é meu, mais o que é público
 * nos grupos de que participo.
 */
async function visibilityClause({ type, groupId, userId }) {
  if (groupId) {
    await perm.assertGroupMember(groupId, userId);
    // Dentro do grupo, receitas privadas só aparecem para quem as criou.
    return {
      sql: 'r.group_id = ? AND (r.is_private = 0 OR r.user_id = ?)',
      args: [groupId, userId],
    };
  }
  if (type === 'private') {
    return { sql: 'r.user_id = ? AND r.is_private = 1', args: [userId] };
  }
  if (type === 'group') {
    return {
      sql: 'r.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?) AND r.is_private = 0',
      args: [userId],
    };
  }
  // "Todas" agora inclui as próprias receitas privadas. Antes as escondia, o que
  // fazia a aba "Todas" não mostrar todas.
  return {
    sql: `(r.user_id = ?
           OR (r.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)
               AND r.is_private = 0))`,
    args: [userId, userId],
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const { group_id: groupId, type, q, category, sort } = req.query;
  const userId = req.user.id;

  const vis = await visibilityClause({ type, groupId, userId });
  const where = [vis.sql];
  const args = [...vis.args];

  if (q && String(q).trim()) {
    const pattern = v.likePattern(String(q).trim());
    // Ingredientes entram na busca: procurar "alho" e não achar a receita que
    // leva alho era a falha mais óbvia da busca antiga.
    where.push(`(
      LOWER(r.title) LIKE ? ESCAPE '\\'
      OR LOWER(r.description) LIKE ? ESCAPE '\\'
      OR LOWER(r.category) LIKE ? ESCAPE '\\'
      OR LOWER(r.ingredients) LIKE ? ESCAPE '\\'
    )`);
    args.push(pattern, pattern, pattern, pattern);
  }

  if (category && String(category).trim()) {
    where.push('LOWER(r.category) = ?');
    args.push(String(category).trim().toLowerCase());
  }

  const result = await db.execute({
    sql: `SELECT ${LIST_COLUMNS} FROM recipes r
          WHERE ${where.join(' AND ')}
          ORDER BY ${v.sortClause(sort)}
          LIMIT 500`,
    args,
  });

  res.json(result.rows);
}));

/** Alimenta o filtro de categorias do dashboard. Precisa vir antes de /:id. */
router.get('/categories', asyncHandler(async (req, res) => {
  const result = await db.execute({
    sql: `SELECT DISTINCT r.category FROM recipes r
          WHERE r.category != ''
            AND (r.user_id = ?
                 OR (r.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)
                     AND r.is_private = 0))
          ORDER BY r.category COLLATE NOCASE`,
    args: [req.user.id, req.user.id],
  });
  res.json(result.rows.map(r => r.category));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const recipe = await perm.loadRecipeForRead(req.params.id, req.user.id);
  const img = await db.execute({
    sql: 'SELECT 1 FROM recipe_images WHERE recipe_id = ?',
    args: [recipe.id],
  });
  res.json({ ...recipe, has_image: img.rows.length > 0 ? 1 : 0 });
}));

function parseRecipeBody(body) {
  return {
    title: v.str(body.title, 'Título', { required: true, max: 150 }),
    description: v.str(body.description, 'Descrição', { max: 500 }),
    ingredients: v.str(body.ingredients, 'Ingredientes', { required: true, max: 20000 }),
    instructions: v.str(body.instructions, 'Modo de preparo', { required: true, max: 50000 }),
    prep_time: v.int(body.prep_time, 'Tempo de preparo', { max: 10000 }),
    cook_time: v.int(body.cook_time, 'Tempo de cozimento', { max: 10000 }),
    servings: v.int(body.servings, 'Porções', { min: 1, max: 1000, fallback: 1 }),
    category: v.str(body.category, 'Categoria', { max: 60 }),
    difficulty: v.difficulty(body.difficulty),
    is_private: body.is_private ? 1 : 0,
  };
}

router.post('/', asyncHandler(async (req, res) => {
  const data = parseRecipeBody(req.body || {});
  const groupId = await perm.assertCanPostToGroup(req.body.group_id || null, req.user.id);

  const id = uuidv4();
  await db.execute({
    sql: `INSERT INTO recipes
            (id, title, description, ingredients, instructions, prep_time, cook_time,
             servings, category, user_id, group_id, is_private, difficulty)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, data.title, data.description, data.ingredients, data.instructions,
      data.prep_time, data.cook_time, data.servings, data.category,
      req.user.id, groupId, data.is_private, data.difficulty,
    ],
  });

  res.status(201).json({ ...data, id, user_id: req.user.id, group_id: groupId, has_image: 0 });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  await perm.loadRecipeForWrite(req.params.id, req.user.id);
  const data = parseRecipeBody(req.body || {});

  // Esta linha é o buraco que existia: o POST validava o grupo de destino e o
  // PUT não, então dava para mover uma receita para um grupo alheio via edição.
  const groupId = await perm.assertCanPostToGroup(req.body.group_id || null, req.user.id);

  await db.execute({
    sql: `UPDATE recipes SET
            title=?, description=?, ingredients=?, instructions=?, prep_time=?,
            cook_time=?, servings=?, category=?, group_id=?, is_private=?,
            difficulty=?, updated_at=datetime('now')
          WHERE id=?`,
    args: [
      data.title, data.description, data.ingredients, data.instructions,
      data.prep_time, data.cook_time, data.servings, data.category,
      groupId, data.is_private, data.difficulty, req.params.id,
    ],
  });

  res.json({ ...data, id: req.params.id, user_id: req.user.id, group_id: groupId });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await perm.loadRecipeForWrite(req.params.id, req.user.id);
  // Explícito em vez de confiar no ON DELETE CASCADE: o libSQL fala HTTP e o
  // PRAGMA foreign_keys não é garantido por conexão.
  await db.execute({ sql: 'DELETE FROM recipe_images WHERE recipe_id = ?', args: [req.params.id] });
  await db.execute({ sql: 'DELETE FROM recipes WHERE id = ?', args: [req.params.id] });
  res.json({ message: 'Receita excluída com sucesso' });
}));

/* ===== Fotos ===== */

router.get('/:id/image', asyncHandler(async (req, res) => {
  await perm.loadRecipeForRead(req.params.id, req.user.id);

  const size = req.query.size === 'full' ? 'full' : 'thumb';
  const result = await db.execute({
    sql: `SELECT ${size} AS data, mime FROM recipe_images WHERE recipe_id = ?`,
    args: [req.params.id],
  });
  if (result.rows.length === 0) throw notFound('Esta receita não tem foto');

  const row = result.rows[0];
  const buf = Buffer.from(row.data);
  const etag = `"${crypto.createHash('sha1').update(buf).digest('hex')}"`;

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('Content-Type', row.mime);

  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.send(buf);
}));

router.put('/:id/image', asyncHandler(async (req, res) => {
  await perm.loadRecipeForWrite(req.params.id, req.user.id);

  const { thumb, full } = req.body || {};
  if (!thumb || !full) {
    throw badRequest('Envie as duas versões da imagem (thumb e full)');
  }

  const t = decodeImage(thumb, 'thumb');
  const f = decodeImage(full, 'full');

  await db.execute({
    sql: `INSERT INTO recipe_images (recipe_id, thumb, full, mime, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(recipe_id) DO UPDATE SET
            thumb=excluded.thumb, full=excluded.full,
            mime=excluded.mime, updated_at=excluded.updated_at`,
    args: [req.params.id, t.buf, f.buf, f.mime],
  });

  res.json({ message: 'Foto salva', has_image: 1 });
}));

router.delete('/:id/image', asyncHandler(async (req, res) => {
  await perm.loadRecipeForWrite(req.params.id, req.user.id);
  await db.execute({ sql: 'DELETE FROM recipe_images WHERE recipe_id = ?', args: [req.params.id] });
  res.json({ message: 'Foto removida', has_image: 0 });
}));

module.exports = router;
