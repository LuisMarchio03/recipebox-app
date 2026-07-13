export const state = {
  user: null,
  recipes: [],
  groups: [],
  categories: [],
  filters: {
    tab: 'all',
    q: '',
    category: '',
    sort: 'recent',
  },
};

export function resetFilters() {
  state.filters.q = '';
  state.filters.category = '';
  state.filters.sort = 'recent';
}

/* ===== Progresso do checklist (por receita, no dispositivo) ===== */

const progressKey = recipeId => `recipe-progress-${recipeId}`;

export function loadProgress(recipeId) {
  try {
    return JSON.parse(localStorage.getItem(progressKey(recipeId)) || '{}');
  } catch {
    return {};
  }
}

export function saveProgress(recipeId, progress) {
  localStorage.setItem(progressKey(recipeId), JSON.stringify(progress));
}

export function clearProgress(recipeId) {
  localStorage.removeItem(progressKey(recipeId));
}

/* ===== Tema ===== */

export function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = saved ? saved === 'dark' : prefersDark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

export function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  return next;
}

export function isDarkTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}
