import { API } from '../api.js';
import { state, loadProgress, saveProgress, clearProgress } from '../state.js';
import { showPage, navigate } from '../router.js';
import { escapeHtml, toast, skeletonCards, confirmDelete, difficultyStars, formatMinutes } from '../ui.js';
import { parseIngredients, parseInstructions, countCheckedSteps } from '../lib/recipe-format.js';

const $ = selector => document.querySelector(selector);

let currentRecipe = null;

export async function showRecipeDetail({ id }) {
  showPage('page-recipe-detail');
  const container = $('#recipe-detail-content');
  container.innerHTML = skeletonCards(1);

  try {
    currentRecipe = await API.getRecipe(id);
  } catch (err) {
    toast(err.message, 'error');
    navigate('dashboard');
    return;
  }

  render(container, currentRecipe);
  bindChecklist(container, currentRecipe.id);

  if (currentRecipe.has_image) {
    API.loadImage(currentRecipe.id, 'full')
      .then(url => {
        const photo = container.querySelector('.detail-photo');
        if (photo) {
          photo.style.backgroundImage = `url("${url}")`;
          photo.classList.add('loaded');
        }
      })
      .catch(() => container.querySelector('.detail-photo')?.remove());
  }
}

function render(container, recipe) {
  const isOwner = recipe.user_id === state.user.id;
  const ingredientSections = parseIngredients(recipe.ingredients);
  const { sections, totalSteps } = parseInstructions(recipe.instructions);
  const progress = loadProgress(recipe.id);
  const done = countCheckedSteps(progress, totalSteps);
  const pct = totalSteps ? Math.round((done / totalSteps) * 100) : 0;

  let globalIdx = 0;
  const ingredientsHtml = ingredientSections.map(section => {
    const header = section.title
      ? `<h3 class="checklist-section">${escapeHtml(section.title)}</h3>`
      : '';
    const items = section.items.map(item => {
      const idx = globalIdx++;
      const checked = progress[`ing-${idx}`];
      return `
        <label class="checklist-item${checked ? ' checked' : ''}">
          <input type="checkbox" data-kind="ing" data-idx="${idx}"${checked ? ' checked' : ''}>
          <span>
            ${item.quantity ? `<span class="ing-qty">${escapeHtml(item.quantity)}</span> ` : ''}${escapeHtml(item.name)}
          </span>
        </label>
      `;
    }).join('');
    return header + items;
  }).join('');

  let stepNumber = 0;
  const instructionsHtml = sections.map(section => {
    if (section.title) stepNumber = 0;
    const header = section.title
      ? `<h3 class="checklist-section">${escapeHtml(section.title)}</h3>`
      : '';
    const steps = section.steps.map(step => {
      stepNumber++;
      const checked = progress[`inst-${step.index}`];
      return `
        <label class="checklist-item${checked ? ' checked' : ''}">
          <input type="checkbox" data-kind="inst" data-idx="${step.index}"${checked ? ' checked' : ''}>
          <span class="step-num" aria-hidden="true">${stepNumber}.</span>
          <span>${escapeHtml(step.text)}</span>
        </label>
      `;
    }).join('');
    return header + steps;
  }).join('');

  container.innerHTML = `
    ${recipe.has_image ? '<div class="detail-photo"></div>' : ''}

    <h2>${escapeHtml(recipe.title)}</h2>
    ${recipe.description ? `<p class="description">${escapeHtml(recipe.description)}</p>` : ''}

    <div class="badges">
      ${recipe.is_private ? '<span class="badge badge-private">🔒 Privada</span>' : ''}
      ${recipe.group_id ? '<span class="badge badge-group">👥 Compartilhada em grupo</span>' : ''}
    </div>

    <div class="info-grid">
      <div class="info-item"><div class="label">Preparo</div><div class="value">${escapeHtml(formatMinutes(recipe.prep_time))}</div></div>
      <div class="info-item"><div class="label">Cozimento</div><div class="value">${escapeHtml(formatMinutes(recipe.cook_time))}</div></div>
      <div class="info-item"><div class="label">Porções</div><div class="value">${escapeHtml(String(recipe.servings))}</div></div>
      <div class="info-item"><div class="label">Categoria</div><div class="value">${escapeHtml(recipe.category || '—')}</div></div>
      <div class="info-item"><div class="label">Dificuldade</div><div class="value">${difficultyStars(recipe.difficulty)}</div></div>
    </div>

    ${totalSteps ? `
      <button class="btn btn-cook" data-action="modo-cozinha" data-id="${escapeHtml(recipe.id)}">
        👩‍🍳 Modo Cozinha
        <small>Tela sempre acesa, passos grandes e cronômetro</small>
      </button>
    ` : ''}

    <h3 class="section-title">📝 Ingredientes</h3>
    <div class="checklist" data-checklist="ing">
      ${ingredientsHtml}
    </div>

    <h3 class="section-title">👩‍🍳 Modo de Preparo</h3>
    ${totalSteps ? `
      <div class="cooking-tools">
        <div class="progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="progress-text">${done}/${totalSteps} passos</span>
        <button class="btn-reset" data-action="resetar-progresso" data-id="${escapeHtml(recipe.id)}">↺ Resetar</button>
      </div>
    ` : ''}
    <div class="checklist" data-checklist="inst">
      ${instructionsHtml}
    </div>

    <div class="actions">
      ${isOwner ? `
        <button class="btn btn-primary btn-sm" data-action="editar-receita" data-id="${escapeHtml(recipe.id)}">✏️ Editar</button>
        <button class="btn btn-danger btn-sm" data-action="excluir-receita" data-id="${escapeHtml(recipe.id)}">🗑️ Excluir</button>
      ` : ''}
      <button class="btn btn-secondary btn-sm" data-action="imprimir">🖨️ Imprimir</button>
      <button class="btn btn-secondary btn-sm" data-action="compartilhar">📤 Compartilhar</button>
      <button class="btn btn-secondary btn-sm" data-action="exportar-word" data-id="${escapeHtml(recipe.id)}">📄 Word</button>
    </div>
  `;
}

function bindChecklist(container, recipeId) {
  container.addEventListener('change', event => {
    const checkbox = event.target;
    if (checkbox.type !== 'checkbox') return;

    const progress = loadProgress(recipeId);
    progress[`${checkbox.dataset.kind}-${checkbox.dataset.idx}`] = checkbox.checked;
    saveProgress(recipeId, progress);

    checkbox.closest('.checklist-item').classList.toggle('checked', checkbox.checked);
    updateProgressBar(container);
  });
}

function updateProgressBar(container) {
  const steps = container.querySelectorAll('[data-checklist="inst"] input[type="checkbox"]');
  const total = steps.length;
  if (!total) return;

  const done = Array.from(steps).filter(cb => cb.checked).length;
  const pct = Math.round((done / total) * 100);

  const bar = container.querySelector('.progress-bar');
  const fill = container.querySelector('.progress-fill');
  const text = container.querySelector('.progress-text');
  if (fill) fill.style.width = `${pct}%`;
  if (text) text.textContent = `${done}/${total} passos`;
  if (bar) bar.setAttribute('aria-valuenow', String(pct));
}

/* ===== Ações ===== */

export const recipeDetailActions = {
  'abrir-receita': ({ id }) => navigate(`recipe/${id}`),
  'editar-receita': ({ id }) => navigate(`recipe/edit/${id}`),
  'modo-cozinha': ({ id }) => navigate(`cook/${id}`),
  'imprimir': () => window.print(),

  'resetar-progresso': async ({ id }) => {
    clearProgress(id);
    await showRecipeDetail({ id });
    toast('Progresso zerado', 'info');
  },

  'excluir-receita': async ({ id }) => {
    if (!(await confirmDelete())) return;
    try {
      await API.deleteRecipe(id);
      toast('Receita excluída', 'success');
      navigate('dashboard');
    } catch (err) {
      toast(err.message, 'error');
    }
  },

  'exportar-word': async ({ id }) => {
    try {
      await API.downloadWord(id);
    } catch (err) {
      toast(err.message, 'error');
    }
  },

  'compartilhar': async () => {
    if (!currentRecipe) return;
    const payload = {
      title: currentRecipe.title,
      text: currentRecipe.description || currentRecipe.title,
      url: window.location.href,
    };

    if (navigator.share) {
      // AbortError = usuário fechou a folha de compartilhamento. Não é falha.
      try {
        await navigator.share(payload);
      } catch (err) {
        if (err.name !== 'AbortError') toast('Não foi possível compartilhar', 'error');
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      toast('Link copiado!', 'success');
    } catch {
      toast('Não foi possível copiar o link', 'error');
    }
  },
};
