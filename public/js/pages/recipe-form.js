import { API } from '../api.js';
import { showPage, navigate } from '../router.js';
import { escapeHtml, toast } from '../ui.js';
import { processImage } from '../lib/image.js';

const $ = selector => document.querySelector(selector);

let editingId = null;
let pendingImage = null;   // { thumb, full } aguardando o salvamento da receita
let imageRemoved = false;

/* ===== Editor de linhas (ingredientes e passos) ===== */

function moveRow(row, offset) {
  const container = row.parentNode;
  if (offset === -1 && row.previousElementSibling) {
    container.insertBefore(row, row.previousElementSibling);
  } else if (offset === 1 && row.nextElementSibling) {
    container.insertBefore(row.nextElementSibling, row);
  }
}

function addRow(containerId, value = '') {
  const container = document.getElementById(containerId);
  const isIngredient = containerId === 'ingredients-rows';
  const isSection = !isIngredient && value.startsWith('# ');

  const row = document.createElement('div');
  row.className = 'item-row' + (isSection ? ' section-row' : '');

  const moveButtons = `
    <span class="move-btns">
      <button type="button" class="btn-move-up" tabindex="-1" aria-label="Mover para cima">▲</button>
      <button type="button" class="btn-move-down" tabindex="-1" aria-label="Mover para baixo">▼</button>
    </span>
  `;
  const removeButton = '<button type="button" class="btn-remove-item" tabindex="-1" aria-label="Remover">✕</button>';

  if (isIngredient) {
    const sep = value.indexOf(' | ');
    const quantity = sep > 0 ? value.slice(0, sep) : '';
    const name = sep > 0 ? value.slice(sep + 3) : value;
    row.innerHTML = `
      ${moveButtons}
      <input type="text" class="item-qty" value="${escapeHtml(quantity)}" placeholder="2 xícaras" aria-label="Quantidade">
      <input type="text" class="item-input" value="${escapeHtml(name)}" placeholder="farinha de trigo" aria-label="Ingrediente">
      ${removeButton}
    `;
  } else if (isSection) {
    row.innerHTML = `
      ${moveButtons}
      <span class="section-marker" aria-hidden="true">#</span>
      <input type="text" class="item-input section-input" value="${escapeHtml(value.slice(2))}" placeholder="Nome da seção (ex: Cobertura)" aria-label="Seção">
      ${removeButton}
    `;
  } else {
    row.innerHTML = `
      ${moveButtons}
      <input type="text" class="item-input" value="${escapeHtml(value)}" placeholder="Misture os ingredientes secos..." aria-label="Passo">
      ${removeButton}
    `;
  }

  row.querySelector('.btn-move-up').addEventListener('click', () => moveRow(row, -1));
  row.querySelector('.btn-move-down').addEventListener('click', () => moveRow(row, 1));
  row.querySelector('.btn-remove-item').addEventListener('click', () => row.remove());

  container.appendChild(row);
  if (!value || value === '# ') row.querySelector('input').focus();
}

function fillRows(containerId, text) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const lines = String(text || '').split('\n').filter(l => l.trim());
  if (!lines.length) lines.push('');
  lines.forEach(line => addRow(containerId, line));
}

function collectRows(containerId) {
  const isIngredient = containerId === 'ingredients-rows';

  return Array.from(document.querySelectorAll(`#${containerId} .item-row`))
    .map(row => {
      const value = row.querySelector('.item-input').value.trim();
      if (!value) return '';
      if (isIngredient) {
        const quantity = row.querySelector('.item-qty').value.trim();
        return quantity ? `${quantity} | ${value}` : value;
      }
      return row.classList.contains('section-row') ? `# ${value}` : value;
    })
    .filter(Boolean);
}

/* ===== Foto ===== */

function renderImagePreview(url) {
  const preview = $('#image-preview');
  if (url) {
    preview.style.backgroundImage = `url("${url}")`;
    preview.classList.add('has-image');
  } else {
    preview.style.backgroundImage = '';
    preview.classList.remove('has-image');
  }
  $('#btn-remove-image').hidden = !url;
}

async function handleImagePick(file) {
  if (!file) return;
  const label = $('#image-status');
  label.textContent = 'Processando...';

  try {
    pendingImage = await processImage(file);
    imageRemoved = false;
    renderImagePreview(pendingImage.thumb);
    const kb = Math.round((pendingImage.full.length * 0.75) / 1024);
    label.textContent = `Pronta (~${kb} KB após otimização)`;
  } catch (err) {
    label.textContent = '';
    toast(err.message, 'error');
  }
}

/* ===== Tela ===== */

export async function showRecipeForm({ id } = {}) {
  showPage('page-recipe-form');

  editingId = id || null;
  pendingImage = null;
  imageRemoved = false;

  const form = $('#recipe-form');
  form.reset();
  clearErrors();
  renderImagePreview(null);
  $('#image-status').textContent = '';

  $('#form-title').textContent = editingId ? 'Editar Receita' : 'Nova Receita';
  $('#form-submit').textContent = editingId ? 'Salvar' : 'Criar';

  let recipe = null;
  if (editingId) {
    try {
      recipe = await API.getRecipe(editingId);
    } catch (err) {
      toast(err.message, 'error');
      navigate('dashboard');
      return;
    }

    $('#r-title').value = recipe.title;
    $('#r-description').value = recipe.description || '';
    $('#r-prep-time').value = recipe.prep_time || '';
    $('#r-cook-time').value = recipe.cook_time || '';
    $('#r-servings').value = recipe.servings || 1;
    $('#r-category').value = recipe.category || '';
    $('#r-difficulty').value = recipe.difficulty || 'Médio';
    $('#r-private').checked = Boolean(recipe.is_private);

    if (recipe.has_image) {
      API.loadImage(recipe.id, 'thumb').then(renderImagePreview).catch(() => {});
    }
  }

  fillRows('ingredients-rows', recipe?.ingredients);
  fillRows('instructions-rows', recipe?.instructions);

  // Só depois de carregar os grupos dá para selecionar o grupo atual da receita.
  try {
    const groups = await API.getGroups();
    const select = $('#r-group');
    select.innerHTML =
      '<option value="">Nenhum (receita pessoal)</option>' +
      groups.map(g => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join('');
    select.value = recipe?.group_id || '';
  } catch {
    // Sem grupos carregados o formulário ainda funciona para receitas pessoais.
  }
}

function showError(fieldId, message) {
  const group = $(`#${fieldId}`)?.closest('.form-group');
  if (!group) return;
  group.classList.add('error');
  const slot = group.querySelector('.error-msg');
  if (slot) slot.textContent = message;
}

function clearErrors() {
  document.querySelectorAll('.form-group.error').forEach(g => {
    g.classList.remove('error');
    const slot = g.querySelector('.error-msg');
    if (slot) slot.textContent = '';
  });
}

export function initRecipeForm() {
  document.addEventListener('click', event => {
    const addItem = event.target.closest('.btn-add-item');
    if (addItem) return addRow(`${addItem.dataset.editor}-rows`, '');

    const addSection = event.target.closest('.btn-add-section');
    if (addSection) return addRow(`${addSection.dataset.editor}-rows`, '# ');
  });

  $('#r-image')?.addEventListener('change', event => {
    handleImagePick(event.target.files[0]);
    event.target.value = '';
  });

  $('#btn-remove-image')?.addEventListener('click', () => {
    pendingImage = null;
    imageRemoved = true;
    renderImagePreview(null);
    $('#image-status').textContent = 'A foto será removida ao salvar';
  });

  $('#btn-form-cancel')?.addEventListener('click', () => navigate('dashboard'));

  $('#recipe-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    clearErrors();

    const ingredients = collectRows('ingredients-rows').join('\n');
    const instructions = collectRows('instructions-rows').join('\n');
    const title = $('#r-title').value.trim();

    let valid = true;
    if (!title) { showError('r-title', 'O título é obrigatório'); valid = false; }
    if (!ingredients) { showError('r-ingredients-anchor', 'Adicione ao menos um ingrediente'); valid = false; }
    if (!instructions) { showError('r-instructions-anchor', 'Adicione ao menos um passo'); valid = false; }
    if (!valid) {
      document.querySelector('.form-group.error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const payload = {
      title,
      description: $('#r-description').value.trim(),
      ingredients,
      instructions,
      prep_time: parseInt($('#r-prep-time').value, 10) || 0,
      cook_time: parseInt($('#r-cook-time').value, 10) || 0,
      servings: parseInt($('#r-servings').value, 10) || 1,
      category: $('#r-category').value.trim(),
      difficulty: $('#r-difficulty').value,
      is_private: $('#r-private').checked,
      group_id: $('#r-group').value || null,
    };

    const button = $('#form-submit');
    button.disabled = true;

    try {
      const saved = editingId
        ? await API.updateRecipe(editingId, payload)
        : await API.createRecipe(payload);

      // A foto é enviada depois porque numa criação o id da receita só existe
      // agora. Se o upload falhar, a receita já está salva — avisamos sem
      // perder o texto que a pessoa escreveu.
      if (pendingImage) {
        try {
          await API.uploadImage(saved.id, pendingImage);
        } catch (err) {
          toast(`Receita salva, mas a foto falhou: ${err.message}`, 'warning');
          navigate(`recipe/${saved.id}`);
          return;
        }
      } else if (imageRemoved && editingId) {
        await API.deleteImage(editingId).catch(() => {});
      }

      toast(editingId ? 'Receita atualizada!' : 'Receita criada!', 'success');
      navigate(`recipe/${saved.id}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
}
