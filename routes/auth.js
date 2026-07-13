const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const { db } = require('../db');
const config = require('../config');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { badRequest, unauthorized, notFound, forbidden } = require('../lib/http-error');
const v = require('../lib/validate');

/**
 * Compara segredos sem vazar o conteúdo pelo tempo de resposta. Um `===` sai
 * na primeira diferença, o que permite descobrir o código de convite
 * caractere a caractere. O hash garante buffers do mesmo tamanho.
 */
function secretEquals(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, name: user.name },
    config.JWT_SECRET,
    { expiresIn: config.TOKEN_TTL }
  );
}

module.exports = function authRoutes({ loginLimiter, registerLimiter }) {
  const router = express.Router();

  router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      throw badRequest('Usuário e senha obrigatórios');
    }

    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [String(username)],
    });

    // Mesma mensagem para usuário inexistente e senha errada: distinguir os dois
    // entrega ao atacante a lista de usuários válidos.
    const invalid = unauthorized('Usuário ou senha inválidos');

    if (result.rows.length === 0) throw invalid;
    const user = result.rows[0];
    if (!(await bcrypt.compare(String(password), user.password_hash))) throw invalid;

    res.json({
      token: signToken(user),
      user: { id: user.id, username: user.username, name: user.name },
    });
  }));

  router.post('/register', registerLimiter, asyncHandler(async (req, res) => {
    const { invite_code: inviteCode } = req.body || {};
    if (!inviteCode) throw forbidden('Código de convite inválido');

    let inviteId = null;
    const invite = await db.execute({
      sql: 'SELECT * FROM invites WHERE code = ? AND used_by IS NULL',
      args: [inviteCode],
    });
    if (invite.rows.length > 0) {
      inviteId = invite.rows[0].id;
    } else if (inviteCode !== config.INVITE_CODE) {
      throw forbidden('Código de convite inválido ou já utilizado');
    }

    const username = v.username(req.body.username);
    const password = v.password(req.body.password);
    const name = v.str(req.body.name, 'Nome', { required: true, max: 80 });

    const existing = await db.execute({
      sql: 'SELECT 1 FROM users WHERE username = ?',
      args: [username],
    });
    if (existing.rows.length > 0) {
      throw badRequest('Este usuário já está em uso');
    }

    const id = uuidv4();
    const hash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
    await db.execute({
      sql: 'INSERT INTO users (id, username, password_hash, name) VALUES (?, ?, ?, ?)',
      args: [id, username, hash, name],
    });

    const user = { id, username, name };
    if (inviteId) {
      await db.execute({
        sql: 'UPDATE invites SET used_by = ?, used_at = datetime(\'now\') WHERE id = ?',
        args: [id, inviteId],
      });
    }
    res.status(201).json({ token: signToken(user), user });
  }));

  router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
    const result = await db.execute({
      sql: 'SELECT id, username, name, created_at FROM users WHERE id = ?',
      args: [req.user.id],
    });
    if (result.rows.length === 0) throw notFound('Usuário não encontrado');
    res.json(result.rows[0]);
  }));

  router.get('/config', (req, res) => {
    res.json({ registration_enabled: true });
  });

  return router;
};
