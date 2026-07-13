const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorized } = require('../lib/http-error');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(unauthorized('Token não fornecido'));
  }

  try {
    req.user = jwt.verify(header.slice(7), config.JWT_SECRET);
    next();
  } catch {
    next(unauthorized('Token inválido ou expirado'));
  }
}

module.exports = { authMiddleware };
