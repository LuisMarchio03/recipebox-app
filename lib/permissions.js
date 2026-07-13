const { db } = require('../db');
const { forbidden, notFound } = require('./http-error');

// Toda checagem de acesso do app passa por aqui. Antes essa lógica estava
// copiada em cada rota, e o PUT /recipes/:id esqueceu de copiar a checagem de
// grupo — o que permitia plantar receita em grupo alheio.

async function isGroupMember(groupId, userId) {
  const r = await db.execute({
    sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
    args: [groupId, userId],
  });
  return r.rows.length > 0;
}

async function assertGroupMember(groupId, userId) {
  if (!(await isGroupMember(groupId, userId))) {
    throw forbidden('Você não é membro deste grupo');
  }
}

async function assertGroupOwner(groupId, userId) {
  const r = await db.execute({
    sql: 'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
    args: [groupId, userId],
  });
  if (r.rows.length === 0 || r.rows[0].role !== 'owner') {
    throw forbidden('Apenas o dono do grupo pode fazer isso');
  }
}

async function getRecipe(recipeId) {
  const r = await db.execute({
    sql: 'SELECT * FROM recipes WHERE id = ?',
    args: [recipeId],
  });
  if (r.rows.length === 0) throw notFound('Receita não encontrada');
  return r.rows[0];
}

/** Receita que o usuário pode LER: própria, ou pública de um grupo dele. */
async function loadRecipeForRead(recipeId, userId) {
  const recipe = await getRecipe(recipeId);
  if (recipe.user_id === userId) return recipe;
  if (recipe.is_private) throw forbidden();
  if (recipe.group_id && (await isGroupMember(recipe.group_id, userId))) return recipe;
  throw forbidden();
}

/** Receita que o usuário pode ESCREVER: apenas as próprias. */
async function loadRecipeForWrite(recipeId, userId) {
  const recipe = await getRecipe(recipeId);
  if (recipe.user_id !== userId) {
    throw forbidden('Você só pode alterar receitas que criou');
  }
  return recipe;
}

/**
 * Valida o grupo de destino de uma receita. Chamado tanto na criação quanto na
 * edição — era a ausência disso na edição que abria o buraco.
 */
async function assertCanPostToGroup(groupId, userId) {
  if (!groupId) return null;
  await assertGroupMember(groupId, userId);
  return groupId;
}

module.exports = {
  isGroupMember,
  assertGroupMember,
  assertGroupOwner,
  getRecipe,
  loadRecipeForRead,
  loadRecipeForWrite,
  assertCanPostToGroup,
};
