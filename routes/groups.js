const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT g.*, gm.role,
            (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
            FROM groups_ g
            JOIN group_members gm ON g.id = gm.group_id
            WHERE gm.user_id = ?
            ORDER BY g.name`,
      args: [req.user.id],
    });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar grupos' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nome do grupo é obrigatório' });
    }

    const groupId = uuidv4();
    const memberId = uuidv4();

    await db.execute({
      sql: 'INSERT INTO groups_ (id, name, description, created_by) VALUES (?, ?, ?, ?)',
      args: [groupId, name, description || '', req.user.id],
    });

    await db.execute({
      sql: 'INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)',
      args: [memberId, groupId, req.user.id, 'owner'],
    });

    const result = await db.execute({
      sql: 'SELECT * FROM groups_ WHERE id = ?',
      args: [groupId],
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar grupo' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const isMember = await db.execute({
      sql: 'SELECT gm.*, u.name, u.username FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = ? AND gm.user_id = ?',
      args: [req.params.id, req.user.id],
    });
    if (isMember.rows.length === 0) {
      return res.status(403).json({ error: 'Você não é membro deste grupo' });
    }

    const group = await db.execute({
      sql: 'SELECT * FROM groups_ WHERE id = ?',
      args: [req.params.id],
    });

    const members = await db.execute({
      sql: 'SELECT u.id, u.name, u.username, gm.role, gm.joined_at FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = ? ORDER BY gm.joined_at',
      args: [req.params.id],
    });

    res.json({ ...group.rows[0], members: members.rows, myRole: isMember.rows[0].role });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar grupo' });
  }
});

router.post('/:id/members', async (req, res) => {
  try {
    const membership = await db.execute({
      sql: 'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      args: [req.params.id, req.user.id],
    });
    if (membership.rows.length === 0 || membership.rows[0].role !== 'owner') {
      return res.status(403).json({ error: 'Apenas o dono pode adicionar membros' });
    }

    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username é obrigatório' });
    }

    const user = await db.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username],
    });
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const alreadyMember = await db.execute({
      sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      args: [req.params.id, user.rows[0].id],
    });
    if (alreadyMember.rows.length > 0) {
      return res.status(400).json({ error: 'Usuário já é membro do grupo' });
    }

    const memberId = uuidv4();
    await db.execute({
      sql: 'INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)',
      args: [memberId, req.params.id, user.rows[0].id, 'member'],
    });

    res.status(201).json({ message: 'Membro adicionado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao adicionar membro' });
  }
});

router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const membership = await db.execute({
      sql: 'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      args: [req.params.id, req.user.id],
    });
    if (membership.rows.length === 0 || membership.rows[0].role !== 'owner') {
      return res.status(403).json({ error: 'Apenas o dono pode remover membros' });
    }

    await db.execute({
      sql: 'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      args: [req.params.id, req.params.userId],
    });

    res.json({ message: 'Membro removido com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover membro' });
  }
});

module.exports = router;
