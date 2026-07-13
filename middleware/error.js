const { HttpError } = require('../lib/http-error');
const config = require('../config');

/** Envolve handlers async para que throws virem next(err) em vez de promise rejeitada. */
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars -- Express identifica error handlers pela aridade 4
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo grande demais' });
  }

  // Erro inesperado: registra o detalhe no servidor, devolve genérico ao cliente.
  if (config.NODE_ENV !== 'test') {
    console.error('[erro]', req.method, req.path, err);
  }
  res.status(500).json({ error: 'Erro interno do servidor' });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Rota não encontrada' });
}

module.exports = { asyncHandler, errorHandler, notFoundHandler };
