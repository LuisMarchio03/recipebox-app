const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const authRoutes = require('./routes/auth');
const recipeRoutes = require('./routes/recipes');
const groupRoutes = require('./routes/groups');
const exportRoutes = require('./routes/export');
const importRoutes = require('./routes/import');
const inviteRoutes = require('./routes/invites');
const { errorHandler, notFoundHandler } = require('./middleware/error');

const DEFAULT_LIMITS = {
  login: { windowMs: 15 * 60 * 1000, limit: 5 },
  register: { windowMs: 60 * 60 * 1000, limit: 3 },
  api: { windowMs: 15 * 60 * 1000, limit: 600 },
};

function limiter({ windowMs, limit }, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: message }),
  });
}

/**
 * Os limites são injetáveis para que os testes possam exercitar tanto o caminho
 * feliz (limite alto) quanto o bloqueio (limite baixo) sem esperar 15 minutos.
 */
function createApp({ rateLimits = DEFAULT_LIMITS } = {}) {
  const app = express();

  // Em serverless o app enxerga o IP do proxy, não o do usuário. Sem isso todo
  // mundo compartilha a mesma cota e um visitante bloqueia todos os outros.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Sem 'unsafe-inline': agora que não há mais `onclick` no HTML, a CSP
        // impede que um XSS futuro consiga executar qualquer coisa.
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // atributos style= no markup
        imgSrc: ["'self'", 'data:', 'blob:'],    // favicon SVG e preview de foto
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(compression());

  // O front é servido pelo próprio Express, então a origem já bate. CORS só é
  // liberado se você hospedar o front em outro domínio e configurar CORS_ORIGIN.
  app.use(cors(config.CORS_ORIGIN ? { origin: config.CORS_ORIGIN.split(',') } : { origin: false }));

  app.use(express.json({ limit: '2mb' }));

  app.use('/api', limiter(rateLimits.api, 'Muitas requisições. Tente novamente em alguns minutos.'));

  app.use('/api/auth', authRoutes({
    loginLimiter: limiter(rateLimits.login, 'Muitas tentativas de login. Tente novamente em 15 minutos.'),
    registerLimiter: limiter(rateLimits.register, 'Muitos cadastros a partir deste dispositivo. Tente mais tarde.'),
  }));
  app.use('/api/recipes', recipeRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/import', importRoutes);
  app.use('/api/invites', inviteRoutes);

  app.use('/api', notFoundHandler);

  app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
      // O service worker não pode ser cacheado, senão o navegador continua
      // servindo o SW antigo e a atualização do app nunca chega.
      if (path.basename(filePath) === 'sw.js') {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));

  // SPA: qualquer rota não-API devolve o index e o roteador do front resolve.
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp, DEFAULT_LIMITS };
