const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { badRequest, notFound, forbidden } = require('../lib/http-error');
const v = require('../lib/validate');
const perm = require('../lib/permissions');

const router = express.Router();
router.use(authMiddleware);

router.get('/', asyncHandler(async (req, res) => {
  const result = await db.execute({
    sql: `SELECT g.*, gm.role,
            (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count,
            (SELECT COUNT(*) FROM recipes WHERE group_id = g.id AND is_private = 0) AS recipe_count
          FROM groups_ g
          JOIN group_members gm ON g.id = gm.group_id
          WHERE gm.user_id = ?
          ORDER BY g.name COLLATE NOCASE`,
    args: [req.user.id],
  });
  res.json(result.rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const name = v.str(req.body?.name, 'Nome do grupo', { required: true, max: 80 });
  const description = v.str(req.body?.description, 'Descrição', { max: 300 });

  const groupId = uuidv4();
  await db.execute({
    sql: 'INSERT INTO groups_ (id, name, description, created_by) VALUES (?, ?, ?, ?)',
    args: [groupId, name, description, req.user.id],
  });
  await db.execute({
    sql: 'INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)',
    args: [uuidv4(), groupId, req.user.id, 'owner'],
  });

  res.status(201).json({ id: groupId, name, description, created_by: req.user.id });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  await perm.assertGroupMember(req.params.id, req.user.id);

  const group = await db.execute({
    sql: 'SELECT * FROM groups_ WHERE id = ?',
    args: [req.params.id],
  });
  if (group.rows.length === 0) throw notFound('Grupo não encontrado');

  const members = await db.execute({
    sql: `SELECT u.id, u.name, u.username, gm.role, gm.joined_at
          FROM group_members gm
          JOIN users u ON gm.user_id = u.id
          WHERE gm.group_id = ?
          ORDER BY gm.role = 'owner' DESC, gm.joined_at`,
    args: [req.params.id],
  });

  const me = members.rows.find(m => m.id === req.user.id);
  res.json({ ...group.rows[0], members: members.rows, myRole: me.role });
}));

router.post('/:id/members', asyncHandler(async (req, res) => {
  await perm.assertGroupOwner(req.params.id, req.user.id);
  const username = v.str(req.body?.username, 'Usuário', { required: true, max: 30 });

  const user = await db.execute({
    sql: 'SELECT id FROM users WHERE username = ?',
    args: [username],
  });
  if (user.rows.length === 0) throw notFound('Usuário não encontrado');

  const userId = user.rows[0].id;
  if (await perm.isGroupMember(req.params.id, userId)) {
    throw badRequest('Este usuário já é membro do grupo');
  }

  await db.execute({
    sql: 'INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)',
    args: [uuidv4(), req.params.id, userId, 'member'],
  });

  res.status(201).json({ message: 'Membro adicionado com sucesso' });
}));

router.delete('/:id/members/:userId', asyncHandler(async (req, res) => {
  await perm.assertGroupOwner(req.params.id, req.user.id);

  const target = await db.execute({
    sql: 'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
    args: [req.params.id, req.params.userId],
  });
  if (target.rows.length === 0) throw notFound('Este usuário não é membro do grupo');
  // Sem isso, o dono consegue remover a si mesmo e o grupo fica órfão — ninguém
  // mais pode adicionar membros ou apagá-lo.
  if (target.rows[0].role === 'owner') {
    throw forbidden('O dono do grupo não pode ser removido');
  }

  await db.execute({
    sql: 'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
    args: [req.params.id, req.params.userId],
  });

  res.json({ message: 'Membro removido com sucesso' });
}));

module.exports = router;
