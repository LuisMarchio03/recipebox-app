#!/usr/bin/env node
/**
 * Cria o primeiro usuário do servidor (depois disso, use o cadastro por convite).
 *
 *   npm run create-user
 *
 * A versão anterior deste script tinha usuário e senha fixos no código-fonte —
 * qualquer um com acesso ao repositório entrava na conta.
 */
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const config = require('../config');
const { db, initDB } = require('../db');
const v = require('../lib/validate');

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  if (hidden) {
    // Impede que a senha fique visível no terminal e no scrollback.
    rl._writeToOutput = function (chunk) {
      if (chunk.includes(question)) rl.output.write(chunk);
    };
  }

  return new Promise(resolve => {
    rl.question(question, answer => {
      if (hidden) rl.output.write('\n');
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  await initDB();

  console.log('\nCriar usuário do RecipeBox\n');

  const username = v.username(await ask('Usuário: '));
  const name = v.str(await ask('Nome completo: '), 'Nome', { required: true, max: 80 });
  const password = v.password(await ask('Senha (mín. 8 caracteres): ', { hidden: true }));
  const confirm = await ask('Confirme a senha: ', { hidden: true });

  if (password !== confirm) {
    console.error('\nAs senhas não conferem.');
    process.exit(1);
  }

  const existing = await db.execute({
    sql: 'SELECT 1 FROM users WHERE username = ?',
    args: [username],
  });
  if (existing.rows.length > 0) {
    console.error(`\nO usuário "${username}" já existe.`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
  await db.execute({
    sql: 'INSERT INTO users (id, username, password_hash, name) VALUES (?, ?, ?, ?)',
    args: [uuidv4(), username, hash, name],
  });

  console.log(`\nUsuário "${username}" criado. Já dá para entrar no app.\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('\n' + (err.message || err));
  process.exit(1);
});
