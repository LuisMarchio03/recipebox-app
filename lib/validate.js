const { badRequest } = require('./http-error');

const DIFFICULTIES = ['Fácil', 'Médio', 'Difícil'];
const SORTS = {
  recent: 'r.created_at DESC',
  title: 'r.title COLLATE NOCASE ASC',
  time: '(COALESCE(r.prep_time,0) + COALESCE(r.cook_time,0)) ASC, r.title COLLATE NOCASE ASC',
};

function str(value, field, { required = false, max = 500, min = 0 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${field} é obrigatório`);
    return '';
  }
  if (typeof value !== 'string') throw badRequest(`${field} deve ser texto`);
  const v = value.trim();
  if (required && !v) throw badRequest(`${field} é obrigatório`);
  if (v.length < min) throw badRequest(`${field} deve ter ao menos ${min} caracteres`);
  if (v.length > max) throw badRequest(`${field} deve ter no máximo ${max} caracteres`);
  return v;
}

function int(value, field, { min = 0, max = 100000, fallback = 0 } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) throw badRequest(`${field} deve ser um número inteiro`);
  if (n < min || n > max) throw badRequest(`${field} deve estar entre ${min} e ${max}`);
  return n;
}

function difficulty(value) {
  if (!value) return 'Médio';
  if (!DIFFICULTIES.includes(value)) {
    throw badRequest(`Dificuldade deve ser uma de: ${DIFFICULTIES.join(', ')}`);
  }
  return value;
}

function sortClause(value) {
  return SORTS[value] || SORTS.recent;
}

function username(value) {
  const v = str(value, 'Usuário', { required: true, max: 30, min: 3 });
  if (!/^[a-zA-Z0-9_.-]+$/.test(v)) {
    throw badRequest('Usuário pode conter apenas letras, números, ponto, hífen e underline');
  }
  return v;
}

function password(value) {
  if (typeof value !== 'string' || value.length < 8) {
    throw badRequest('A senha deve ter ao menos 8 caracteres');
  }
  if (value.length > 200) throw badRequest('Senha longa demais');
  return value;
}

/**
 * Escapa os curingas do LIKE. Sem isso, quem digitasse "%" na busca casaria
 * com todas as receitas, e "_" casaria com qualquer caractere.
 * Usar sempre com ESCAPE '\' na query.
 */
function likePattern(term) {
  const escaped = term.replace(/[\\%_]/g, ch => '\\' + ch);
  return `%${escaped.toLowerCase()}%`;
}

module.exports = {
  DIFFICULTIES,
  str,
  int,
  difficulty,
  sortClause,
  username,
  password,
  likePattern,
};
