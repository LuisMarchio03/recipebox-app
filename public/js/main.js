import { API } from './api.js';
import { state, initTheme, toggleTheme, isDarkTheme } from './state.js';
import { route, startRouter, navigate, setRouteChangeHook, currentHash } from './router.js';
import { registerActions, initActionDelegation, toast } from './ui.js';

import {
  initLoginPage, showLogin, showRegister, enterApp,
  renderUserName, rememberDestination,
} from './pages/login.js';
import { initDashboard, showDashboard } from './pages/dashboard.js';
import { showRecipeDetail, recipeDetailActions } from './pages/recipe-detail.js';
import { initRecipeForm, showRecipeForm } from './pages/recipe-form.js';
import { showCookingMode, leaveCookingMode, cookingActions } from './pages/cooking-mode.js';
import { initGroups, showGroups, showGroupDetail, showGroupForm, groupActions } from './pages/groups.js';
import { initInvites, showInvites } from './pages/invites.js';

const $ = selector => document.querySelector(selector);

/* ===== Rotas ===== */

const guard = handler => async params => {
  if (!state.user) {
    rememberDestination(currentHash());
    showLogin();
    return;
  }
  await handler(params);
};

route('login', showLogin);
route('register', showRegister);
route('dashboard', guard(showDashboard));
route('recipe/new', guard(showRecipeForm));
route('recipe/edit/:id', guard(showRecipeForm));
route('recipe/:id', guard(showRecipeDetail));
route('cook/:id', guard(showCookingMode));
route('groups', guard(showGroups));
route('groups/new', guard(showGroupForm));
route('groups/:id', guard(showGroupDetail));
route('invites', guard(showInvites));

/* ===== Header e navegação ===== */

const TITLES = {
  'dashboard': 'RecipeBox',
  'groups': 'Grupos',
  'groups/new': 'Novo Grupo',
  'groups/:id': 'Grupo',
  'invites': 'Convites',
  'recipe/new': 'Nova Receita',
  'recipe/edit/:id': 'Editar Receita',
  'recipe/:id': 'Receita',
  'cook/:id': 'Modo Cozinha',
};

let previousPattern = null;

setRouteChangeHook(pattern => {
  // Sair do modo cozinha precisa liberar o wake lock. Sem isso, a tela do
  // celular continua acesa indefinidamente depois de navegar para outra tela.
  if (previousPattern === 'cook/:id' && pattern !== 'cook/:id') {
    leaveCookingMode();
  }
  previousPattern = pattern;

  // O modo cozinha ocupa a tela inteira: header e navegação atrapalhariam.
  const immersive = pattern === 'cook/:id';
  $('#app-header').hidden = immersive;
  $('.bottom-nav').classList.toggle('immersive', immersive);

  $('#header-title').textContent = TITLES[pattern] || 'RecipeBox';
  $('#btn-back').hidden = pattern === 'dashboard' || pattern === 'groups';

  const section = pattern.startsWith('groups') ? 'groups' : 'dashboard';
  document.querySelectorAll('.bottom-nav a').forEach(link => {
    const active = link.dataset.page === section;
    link.classList.toggle('active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });

  renderUserName();
  window.scrollTo(0, 0);
});

/* ===== Ações declarativas (no lugar dos antigos onclick inline) ===== */

registerActions({
  ...recipeDetailActions,
  ...cookingActions,
  ...groupActions,
  'ir-cadastro': () => navigate('register'),
  'ir-login': () => navigate('login'),
});

/* ===== Boot ===== */

function initChrome() {
  $('#btn-back').addEventListener('click', () => window.history.back());

  const themeButton = $('#theme-toggle');
  const syncThemeButton = () => {
    themeButton.textContent = isDarkTheme() ? '☀️' : '🌙';
    themeButton.setAttribute('aria-label', isDarkTheme() ? 'Usar tema claro' : 'Usar tema escuro');
  };
  themeButton.addEventListener('click', () => {
    toggleTheme();
    syncThemeButton();
  });
  syncThemeButton();

  // "/" foca a busca, como em qualquer app de busca decente.
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    const search = $('#search-input');
    if (search?.offsetParent) {
      event.preventDefault();
      search.focus();
    }
  });
}

async function boot() {
  initTheme();
  initActionDelegation();
  initChrome();
  initLoginPage();
  initDashboard();
  initRecipeForm();
  initGroups();
  initInvites();

  if (API.getToken()) {
    try {
      enterApp(await API.getMe());
    } catch {
      API.clearToken();
    }
  }

  startRouter();
}

window.addEventListener('online', () => toast('Você está online novamente', 'success'));
window.addEventListener('offline', () =>
  toast('Sem conexão — as receitas já abertas continuam disponíveis', 'warning')
);

boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
