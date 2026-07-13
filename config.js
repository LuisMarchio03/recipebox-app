require('dotenv').config();

const errors = [];

const JWT_SECRET = process.env.JWT_SECRET || '';
if (JWT_SECRET.length < 32) {
  errors.push(
    'JWT_SECRET ausente ou muito curto (mínimo 32 caracteres).\n' +
    '  Gere um com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"'
  );
}
if (/mude-em-producao|seu-segredo-aqui/i.test(JWT_SECRET)) {
  errors.push('JWT_SECRET ainda é o valor de exemplo do .env.example. Gere um segredo real.');
}

if (errors.length) {
  console.error('\nConfiguração inválida — o servidor não vai subir:\n');
  errors.forEach(e => console.error('  • ' + e));
  console.error('\nVeja o .env.example para a lista completa de variáveis.\n');
  process.exit(1);
}

const INVITE_CODE = process.env.INVITE_CODE || '';

module.exports = {
  JWT_SECRET,
  INVITE_CODE,
  PORT: parseInt(process.env.PORT, 10) || 3000,
  DATABASE_URL: process.env.DATABASE_URL || 'file:./data.db',
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
  // Vazio = mesma origem apenas. O front é servido pelo próprio Express,
  // então CORS só é necessário se você hospedar o front separado.
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
  TOKEN_TTL: '7d',
  BCRYPT_ROUNDS: 12,
  // Limites de imagem — o cliente redimensiona antes de enviar, então isso é
  // o teto de sanidade, não o tamanho esperado.
  IMAGE_MAX_BYTES: { thumb: 80 * 1024, full: 500 * 1024 },
  UPLOAD_MAX_BYTES: 5 * 1024 * 1024,
};
