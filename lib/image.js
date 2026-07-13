const { badRequest } = require('./http-error');
const config = require('./../config');

const DATA_URL = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/;

/**
 * Confere a assinatura real do arquivo em vez de confiar no mime declarado.
 * Sem isso, qualquer coisa (um script, um executável) entra no banco só por
 * vir rotulada como `data:image/webp`.
 */
function sniffMime(buf) {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buf.length >= 8 && buf.toString('hex', 0, 8) === '89504e470d0a1a0a') {
    return 'image/png';
  }
  return null;
}

/**
 * Converte uma data URL vinda do cliente em Buffer validado.
 * `kind` é 'thumb' ou 'full' e define o teto de tamanho.
 */
function decodeImage(dataUrl, kind) {
  if (typeof dataUrl !== 'string') {
    throw badRequest(`Imagem (${kind}) inválida`);
  }

  const match = DATA_URL.exec(dataUrl);
  if (!match) {
    throw badRequest(`Imagem (${kind}) deve ser uma data URL base64 de WebP, JPEG ou PNG`);
  }

  const buf = Buffer.from(match[2], 'base64');
  const max = config.IMAGE_MAX_BYTES[kind];

  if (buf.length === 0) throw badRequest(`Imagem (${kind}) vazia`);
  if (buf.length > max) {
    throw badRequest(`Imagem (${kind}) tem ${Math.round(buf.length / 1024)} KB; o limite é ${Math.round(max / 1024)} KB`);
  }

  const actual = sniffMime(buf);
  if (!actual) {
    throw badRequest(`O conteúdo enviado em (${kind}) não é uma imagem válida`);
  }
  if (actual !== match[1]) {
    throw badRequest(`Imagem (${kind}) declarada como ${match[1]} mas o conteúdo é ${actual}`);
  }

  return { buf, mime: actual };
}

module.exports = { decodeImage, sniffMime };
