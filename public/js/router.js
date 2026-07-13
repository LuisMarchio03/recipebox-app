import { state } from './state.js';

const routes = [];

/** Registra uma rota. `pattern` usa `:param`, ex: 'recipe/edit/:id'. */
export function route(pattern, handler) {
  const parts = pattern.split('/');
  routes.push({ parts, handler, pattern });
}

function match(hash) {
  const [pathPart] = hash.split('?');
  const segments = pathPart.split('/').filter(Boolean);

  const query = Object.fromEntries(
    new URLSearchParams(hash.split('?')[1] || '')
  );

  for (const { parts, handler, pattern } of routes) {
    if (parts.length !== segments.length) continue;

    const params = { ...query };
    const ok = parts.every((part, i) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = decodeURIComponent(segments[i]);
        return true;
      }
      return part === segments[i];
    });

    if (ok) return { handler, params, pattern };
  }
  return null;
}

export function currentHash() {
  return window.location.hash.slice(1) || 'dashboard';
}

export function navigate(hash) {
  window.location.hash = hash;
}

export function showPage(id) {
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

let onRouteChange = () => {};

export function setRouteChangeHook(fn) {
  onRouteChange = fn;
}

export async function resolveRoute() {
  const hash = currentHash();
  const found = match(hash);

  if (!found) {
    navigate('dashboard');
    return;
  }

  onRouteChange(found.pattern, hash);

  try {
    await found.handler(found.params);
  } catch (err) {
    // Erros de rota que escapam do handler não podem deixar o app numa tela
    // em branco sem explicação.
    console.error('Erro ao abrir a rota', hash, err);
  }
}

export function startRouter() {
  window.addEventListener('hashchange', resolveRoute);
  resolveRoute();
}

export function requireAuth() {
  return Boolean(state.user);
}
