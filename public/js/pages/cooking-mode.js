import { API } from '../api.js';
import { loadProgress, saveProgress } from '../state.js';
import { showPage, navigate } from '../router.js';
import { escapeHtml, toast } from '../ui.js';
import { parseIngredients, parseInstructions, countCheckedSteps } from '../lib/recipe-format.js';
import { wakeLock } from '../lib/wake-lock.js';
import { createTimer, detectDuration, formatDuration } from '../lib/timer.js';

const $ = selector => document.querySelector(selector);

let timer = null;
let activeRecipeId = null;

export async function showCookingMode({ id }) {
  showPage('page-cooking');

  let recipe;
  try {
    recipe = await API.getRecipe(id);
  } catch (err) {
    toast(err.message, 'error');
    navigate('dashboard');
    return;
  }

  activeRecipeId = recipe.id;
  render(recipe);

  const locked = await wakeLock.enable();
  $('#cook-wakelock').textContent = locked
    ? '💡 A tela vai ficar acesa'
    : '⚠️ Seu navegador não mantém a tela acesa';
}

/** Chamado pelo router ao sair da rota — o wake lock não pode vazar para outras telas. */
export async function leaveCookingMode() {
  timer?.cancel();
  timer = null;
  activeRecipeId = null;
  await wakeLock.disable();
}

function render(recipe) {
  const ingredients = parseIngredients(recipe.ingredients);
  const { sections, totalSteps } = parseInstructions(recipe.instructions);
  const progress = loadProgress(recipe.id);
  const done = countCheckedSteps(progress, totalSteps);

  let stepNumber = 0;
  const steps = sections.map(section => {
    if (section.title) stepNumber = 0;
    const header = section.title
      ? `<h2 class="cook-section">${escapeHtml(section.title)}</h2>`
      : '';

    const body = section.steps.map(step => {
      stepNumber++;
      const checked = progress[`inst-${step.index}`];
      const seconds = detectDuration(step.text);

      return `
        <div class="cook-step${checked ? ' done' : ''}" data-step="${step.index}">
          <label class="cook-step-main">
            <input type="checkbox" data-idx="${step.index}"${checked ? ' checked' : ''}>
            <span class="cook-step-num" aria-hidden="true">${stepNumber}</span>
            <span class="cook-step-text">${escapeHtml(step.text)}</span>
          </label>
          ${seconds ? `
            <button class="cook-timer-btn" data-action="iniciar-timer"
                    data-seconds="${seconds}" data-label="Passo ${stepNumber}">
              ⏱ ${escapeHtml(formatDuration(seconds))}
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

    return header + body;
  }).join('');

  $('#page-cooking').innerHTML = `
    <div class="cook-header">
      <button class="btn-icon" data-action="sair-cozinha" aria-label="Sair do modo cozinha">✕</button>
      <div>
        <h1>${escapeHtml(recipe.title)}</h1>
        <span id="cook-wakelock" class="cook-hint"></span>
      </div>
    </div>

    <div class="cook-progress">
      <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-fill" style="width:${totalSteps ? (done / totalSteps) * 100 : 0}%"></div>
      </div>
      <span class="progress-text">${done}/${totalSteps}</span>
    </div>

    <details class="cook-ingredients"${done === 0 ? ' open' : ''}>
      <summary>📝 Ingredientes (${ingredients.length})</summary>
      <ul>
        ${ingredients.map(item => `
          <li>
            ${item.quantity ? `<strong>${escapeHtml(item.quantity)}</strong> ` : ''}${escapeHtml(item.name)}
          </li>
        `).join('')}
      </ul>
    </details>

    <div class="cook-steps">${steps}</div>

    <div id="cook-timer" class="cook-timer" hidden>
      <span class="cook-timer-label"></span>
      <span class="cook-timer-remaining"></span>
      <button class="btn btn-secondary btn-sm" data-action="cancelar-timer">Cancelar</button>
    </div>
  `;

  bindSteps(recipe.id, totalSteps);
}

function bindSteps(recipeId, totalSteps) {
  $('#page-cooking').addEventListener('change', event => {
    const checkbox = event.target;
    if (checkbox.type !== 'checkbox') return;

    const progress = loadProgress(recipeId);
    progress[`inst-${checkbox.dataset.idx}`] = checkbox.checked;
    saveProgress(recipeId, progress);

    checkbox.closest('.cook-step').classList.toggle('done', checkbox.checked);

    const done = countCheckedSteps(loadProgress(recipeId), totalSteps);
    const pct = totalSteps ? Math.round((done / totalSteps) * 100) : 0;
    $('#page-cooking .progress-fill').style.width = `${pct}%`;
    $('#page-cooking .progress-text').textContent = `${done}/${totalSteps}`;
    $('#page-cooking .progress-bar').setAttribute('aria-valuenow', String(pct));

    if (done === totalSteps && totalSteps > 0) {
      toast('Receita concluída! Bom apetite 🎉', 'success');
    }
  });
}

/* ===== Cronômetro ===== */

function ensureTimer() {
  if (timer) return timer;

  const panel = $('#cook-timer');
  timer = createTimer({
    onTick: (remaining, label) => {
      panel.hidden = false;
      panel.querySelector('.cook-timer-label').textContent = label;
      panel.querySelector('.cook-timer-remaining').textContent = formatDuration(remaining);
    },
    onFinish: label => {
      panel.hidden = true;
      toast(`${label}: tempo esgotado!`, 'warning');
    },
  });
  return timer;
}

export const cookingActions = {
  'sair-cozinha': () => {
    navigate(activeRecipeId ? `recipe/${activeRecipeId}` : 'dashboard');
  },

  'iniciar-timer': ({ seconds, label }) => {
    ensureTimer().start(Number(seconds), label);
    toast(`Cronômetro de ${formatDuration(Number(seconds))} iniciado`, 'info');
  },

  'cancelar-timer': () => {
    timer?.cancel();
    $('#cook-timer').hidden = true;
  },
};
