class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const badRequest = msg => new HttpError(400, msg);
const unauthorized = msg => new HttpError(401, msg || 'Não autenticado');
const forbidden = msg => new HttpError(403, msg || 'Acesso negado');
const notFound = msg => new HttpError(404, msg || 'Não encontrado');

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound };
