const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { group_id, type } = req.query;
    let sql, args;

    if (group_id) {
      const isMember = await db.execute({
        sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
        args: [group_id, req.user.id],
      });
      if (isMember.rows.length === 0) {
        return res.status(403).json({ error: 'Você não é membro deste grupo' });
      }
      sql = 'SELECT * FROM recipes WHERE group_id = ? ORDER BY created_at DESC';
      args = [group_id];
    } else if (type === 'private') {
      sql = 'SELECT * FROM recipes WHERE user_id = ? AND is_private = 1 ORDER BY created_at DESC';
      args = [req.user.id];
    } else if (type === 'group') {
      sql = `
        SELECT DISTINCT r.* FROM recipes r
        JOIN group_members gm ON r.group_id = gm.group_id
        WHERE gm.user_id = ? AND r.is_private = 0
        ORDER BY r.created_at DESC
      `;
      args = [req.user.id];
    } else {
      sql = `
        SELECT * FROM recipes WHERE user_id = ? AND is_private = 0
        UNION
        SELECT DISTINCT r.* FROM recipes r
        JOIN group_members gm ON r.group_id = gm.group_id
        WHERE gm.user_id = ? AND r.is_private = 0
        ORDER BY created_at DESC
      `;
      args = [req.user.id, req.user.id];
    }

    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar receitas' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM recipes WHERE id = ?',
      args: [req.params.id],
    });
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Receita não encontrada' });
    }

    const recipe = result.rows[0];
    if (recipe.is_private && recipe.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    if (recipe.group_id) {
      const member = await db.execute({
        sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
        args: [recipe.group_id, req.user.id],
      });
      if (member.rows.length === 0 && recipe.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
    }

    res.json(recipe);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar receita' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, description, ingredients, instructions, prep_time, cook_time, servings, category, image_url, group_id, is_private, difficulty } = req.body;

    if (!title || !ingredients || !instructions) {
      return res.status(400).json({ error: 'Título, ingredientes e instruções são obrigatórios' });
    }

    if (group_id) {
      const member = await db.execute({
        sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
        args: [group_id, req.user.id],
      });
      if (member.rows.length === 0) {
        return res.status(403).json({ error: 'Você não é membro deste grupo' });
      }
    }

    const id = uuidv4();
    await db.execute({
      sql: `INSERT INTO recipes (id, title, description, ingredients, instructions, prep_time, cook_time, servings, category, image_url, user_id, group_id, is_private, difficulty)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, title, description || '', ingredients, instructions, prep_time || 0, cook_time || 0, servings || 1, category || '', image_url || '', req.user.id, group_id || null, is_private ? 1 : 0, difficulty || 'Médio'],
    });

    const result = await db.execute({
      sql: 'SELECT * FROM recipes WHERE id = ?',
      args: [id],
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar receita' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await db.execute({
      sql: 'SELECT * FROM recipes WHERE id = ?',
      args: [req.params.id],
    });
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Receita não encontrada' });
    }
    if (existing.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Você não pode editar esta receita' });
    }

    const { title, description, ingredients, instructions, prep_time, cook_time, servings, category, image_url, group_id, is_private, difficulty } = req.body;

    await db.execute({
      sql: `UPDATE recipes SET title=?, description=?, ingredients=?, instructions=?, prep_time=?, cook_time=?, servings=?, category=?, image_url=?, group_id=?, is_private=?, difficulty=?, updated_at=datetime('now') WHERE id=?`,
      args: [
        title || existing.rows[0].title,
        description !== undefined ? description : existing.rows[0].description,
        ingredients || existing.rows[0].ingredients,
        instructions || existing.rows[0].instructions,
        prep_time !== undefined ? prep_time : existing.rows[0].prep_time,
        cook_time !== undefined ? cook_time : existing.rows[0].cook_time,
        servings !== undefined ? servings : existing.rows[0].servings,
        category !== undefined ? category : existing.rows[0].category,
        image_url !== undefined ? image_url : existing.rows[0].image_url,
        group_id !== undefined ? group_id : existing.rows[0].group_id,
        is_private !== undefined ? (is_private ? 1 : 0) : existing.rows[0].is_private,
        difficulty || existing.rows[0].difficulty || 'Médio',
        req.params.id,
      ],
    });

    const updated = await db.execute({
      sql: 'SELECT * FROM recipes WHERE id = ?',
      args: [req.params.id],
    });
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar receita' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await db.execute({
      sql: 'SELECT * FROM recipes WHERE id = ?',
      args: [req.params.id],
    });
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Receita não encontrada' });
    }
    if (existing.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Você não pode excluir esta receita' });
    }

    await db.execute({
      sql: 'DELETE FROM recipes WHERE id = ?',
      args: [req.params.id],
    });
    res.json({ message: 'Receita excluída com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir receita' });
  }
});

module.exports = router;
