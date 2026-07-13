import { API } from '../api.js';
import { state } from '../state.js';
import { showPage, navigate } from '../router.js';
import { escapeHtml, toast, skeletonCards, emptyState, difficultyStars, formatMinutes } from '../ui.js';

const $ = selector => document.querySelector(selector);

/**
 * As fotos só são buscadas quando o card entra na tela. Numa lista de 80
 * receitas, carregar tudo de uma vez torraria a franquia de dados de quem abre
 * o app no 4G — e a maioria dos cards nunca chega a ser vista.
 */
const imageObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const el = entry.target;
    imageObserver.unobserve(el);
    API.loadImage(el.dataset.recipeImage, 'thumb')
      .then(url => {
        el.style.backgroundImage = `url("${url}")`;
        el.classList.add('loaded');
      })
      .catch(() => el.remove());
  }
}, { rootMargin: '200px' });

export function recipeCard(recipe) {
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);

  return `
    <article class="recipe-card" data-action="abrir-receita" data-id="${escapeHtml(recipe.id)}" tabindex="0" role="link">
      ${recipe.has_image ? `<div class="card-photo" data-recipe-image="${escapeHtml(recipe.id)}"></div>` : ''}
      <div class="card-body">
        <div class="meta">
          ${recipe.category ? `<span class="category">${escapeHtml(recipe.category)}</span>` : ''}
          ${recipe.is_private ? '<span class="badge badge-private">🔒 Privada</span>' : ''}
          ${recipe.group_id ? '<span class="badge badge-group">👥 Grupo</span>' : ''}
          ${difficultyStars(recipe.difficulty)}
        </div>
        <h3>${escapeHtml(recipe.title)}</h3>
        ${recipe.description ? `<p class="description">${escapeHtml(recipe.description)}</p>` : ''}
        <div class="card-footer">
          ${totalTime ? `<span title="Tempo total">⏱ ${escapeHtml(formatMinutes(totalTime))}</span>` : ''}
          <span title="Porções">🍽 ${escapeHtml(String(recipe.servings || 1))}</span>
        </div>
      </div>
    </article>
  `;
}

export function observeCardImages(container) {
  container.querySelectorAll('[data-recipe-image]').forEach(el => imageObserver.observe(el));
}

export async function showDashboard() {
  showPage('page-dashboard');
  syncFilterControls();
  await loadRecipes();
  loadCategories();
}

async function loadRecipes() {
  const container = $('#recipe-list');
  container.innerHTML = skeletonCards(3);

  const { tab, q, category, sort } = state.filters;
  try {
    state.recipes = await API.getRecipes({
      type: tab === 'all' ? '' : tab,
      q,
      category,
      sort,
    });
    renderRecipeList();
  } catch (err) {
    toast(err.message, 'error');
    container.innerHTML = emptyState('⚠️', 'Não foi possível carregar', err.message);
  }
}

function renderRecipeList() {
  const container = $('#recipe-list');
  const { recipes } = state;
  const { q, category } = state.filters;

  if (!recipes.length) {
    container.innerHTML = q || category
      ? emptyState('🔍', 'Nenhum resultado', 'Tente outra busca ou limpe os filtros.')
      : emptyState('🍳', 'Nenhuma receita ainda', 'Toque no + para adicionar a primeira.');
    return;
  }

  $('#result-count').textContent =
    recipes.length === 1 ? '1 receita' : `${recipes.length} receitas`;

  container.innerHTML = recipes.map(recipeCard).join('');
  observeCardImages(container);
}

async function loadCategories() {
  try {
    state.categories = await API.getCategories();
  } catch {
    state.categories = [];
  }

  const select = $('#filter-category');
  const current = state.filters.category;
  select.innerHTML =
    '<option value="">Todas as categorias</option>' +
    state.categories
      .map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join('');
  select.value = current;
}

function syncFilterControls() {
  $('#search-input').value = state.filters.q;
  $('#filter-sort').value = state.filters.sort;
  $('#filter-category').value = state.filters.category;
  $('#search-clear').classList.toggle('visible', Boolean(state.filters.q));

  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === state.filters.tab);
    tab.setAttribute('aria-selected', String(tab.dataset.tab === state.filters.tab));
  });
}

export function initDashboard() {
  let debounce = null;

  $('#search-input')?.addEventListener('input', event => {
    // A busca agora vai ao servidor (e cobre ingredientes), então o debounce
    // deixa de ser cosmético: sem ele, é uma consulta por tecla digitada.
    clearTimeout(debounce);
    const value = event.target.value;
    $('#search-clear').classList.toggle('visible', Boolean(value));
    debounce = setTimeout(() => {
      state.filters.q = value.trim();
      loadRecipes();
    }, 300);
  });

  $('#search-clear')?.addEventListener('click', () => {
    state.filters.q = '';
    $('#search-input').value = '';
    $('#search-clear').classList.remove('visible');
    $('#search-input').focus();
    loadRecipes();
  });

  $('#filter-category')?.addEventListener('change', event => {
    state.filters.category = event.target.value;
    loadRecipes();
  });

  $('#filter-sort')?.addEventListener('change', event => {
    state.filters.sort = event.target.value;
    loadRecipes();
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.filters.tab = tab.dataset.tab;
      syncFilterControls();
      loadRecipes();
    });
  });

  $('#btn-add-recipe')?.addEventListener('click', () => navigate('recipe/new'));

  // Cards são <article>, não <a>: sem isso quem navega por teclado não abre a receita.
  $('#recipe-list')?.addEventListener('keydown', event => {
    const card = event.target.closest('.recipe-card[data-id]');
    if (card && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      navigate(`recipe/${card.dataset.id}`);
    }
  });
}
