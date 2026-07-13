const config = require('./config');
const { initDB } = require('./db');
const { createApp } = require('./app');

async function main() {
  await initDB();
  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`RecipeBox rodando em http://localhost:${config.PORT}`);
    if (!config.INVITE_CODE) {
      console.log('Cadastro desativado (defina INVITE_CODE para liberar).');
    }
  });
}

main().catch(err => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
