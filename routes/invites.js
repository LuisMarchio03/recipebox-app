const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { badRequest, notFound, forbidden } = require('../lib/http-error');

const router = express.Router();
router.use(authMiddleware);

router.get('/', asyncHandler(async (req, res) => {
  const result = await db.execute({
    sql: `SELECT i.id, i.code, i.created_at,
            i.used_by, i.used_at,
            u.name AS used_by_name
          FROM invites i
          LEFT JOIN users u ON i.used_by = u.id
          WHERE i.created_by = ?
          ORDER BY i.created_at DESC`,
    args: [req.user.id],
  });
  res.json(result.rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const id = uuidv4();
  const code = crypto.randomBytes(4).toString('hex');

  await db.execute({
    sql: 'INSERT INTO invites (id, code, created_by) VALUES (?, ?, ?)',
    args: [id, code, req.user.id],
  });

  res.status(201).json({ id, code });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const invite = await db.execute({
    sql: 'SELECT * FROM invites WHERE id = ? AND created_by = ?',
    args: [req.params.id, req.user.id],
  });
  if (invite.rows.length === 0) throw notFound('Convite não encontrado');

  await db.execute({
    sql: 'DELETE FROM invites WHERE id = ?',
    args: [req.params.id],
  });

  res.json({ message: 'Convite removido' });
}));

module.exports = router;
