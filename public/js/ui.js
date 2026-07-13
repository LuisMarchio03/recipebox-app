/**
 * Escapa texto para interpolação em HTML.
 *
 * A versão anterior usava textContent -> innerHTML, que escapa `& < >` mas NÃO
 * escapa aspas. Como o app montava `onclick="fn('${escapeHtml(titulo)}')"`, um
 * título contendo uma aspa simples fechava a string JS e executava código
 * arbitrário em quem abrisse a receita.
 *
 * Os `onclick` inline foram todos removidos (veja `registerActions`), mas o
 * escape de aspas fica como segunda barreira: se alguém reintroduzir um
 * atributo interpolado, o dado continua inerte.
 */
const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, ch => ESCAPE_MAP[ch]);
}

/* ===== Ações declarativas ===== */

const actions = new Map();

/**
 * Substitui os `onclick="..."` inline. O HTML declara apenas
 * `data-action="excluir-receita" data-id="..."` — dado, nunca código — e o
 * comportamento vive aqui em JavaScript de verdade.
 */
export function registerActions(map) {
  for (const [name, handler] of Object.entries(map)) {
    actions.set(name, handler);
  }
}

export function initActionDelegation() {
  document.addEventListener('click', event => {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const handler = actions.get(el.dataset.action);
    if (!handler) return;
    event.preventDefault();
    handler(el.dataset, el, event);
  });
}

/* ===== Toasts ===== */

const TOAST_ICONS = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

export function toast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    // Leitores de tela anunciam a mensagem sem tirar o foco de onde o usuário está.
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 250);
  }, 3500);
}

/* ===== Modal ===== */

export function showModal({ icon, title, message, confirmText, cancelText, danger }) {
  return new Promise(resolve => {
    document.querySelector('.modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="modal">
        ${icon ? `<div class="modal-icon" aria-hidden="true">${escapeHtml(icon)}</div>` : ''}
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          ${cancelText ? `<button type="button" class="btn btn-secondary" data-modal="cancel">${escapeHtml(cancelText)}</button>` : ''}
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-modal="confirm">${escapeHtml(confirmText || 'OK')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const previouslyFocused = document.activeElement;
    const close = result => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      previouslyFocused?.focus?.();
      resolve(result);
    };

    const onKey = event => {
      if (event.key === 'Escape' && cancelText) close(false);
      if (event.key === 'Enter') close(true);
    };

    overlay.querySelector('[data-modal="confirm"]').addEventListener('click', () => close(true));
    overlay.querySelector('[data-modal="cancel"]')?.addEventListener('click', () => close(false));
    overlay.addEventListener('click', event => {
      if (event.target === overlay && cancelText) close(false);
    });
    document.addEventListener('keydown', onKey);

    overlay.querySelector('[data-modal="confirm"]').focus();
  });
}

export function confirmDelete(title, message) {
  return showModal({
    icon: '🗑️',
    title: title || 'Excluir receita?',
    message: message || 'Esta ação não pode ser desfeita.',
    confirmText: 'Excluir',
    cancelText: 'Cancelar',
    danger: true,
  });
}

/* ===== Skeletons ===== */

export function skeletonCards(count = 3) {
  return Array.from({ length: count }, () => `
    <div class="recipe-card skeleton" aria-hidden="true">
      <div class="skeleton-meta">
        <div class="skeleton-line" style="width:60px;height:22px;border-radius:12px"></div>
        <div class="skeleton-line" style="width:50px;height:22px;border-radius:12px"></div>
      </div>
      <div class="skeleton-line" style="width:75%"></div>
      <div class="skeleton-line" style="width:90%"></div>
      <div class="skeleton-line" style="width:45%"></div>
    </div>
  `).join('');
}

export function emptyState(icon, title, message) {
  return `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">${escapeHtml(icon)}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

/* ===== Formatação ===== */

export function difficultyStars(difficulty) {
  const levels = { 'Fácil': 1, 'Médio': 2, 'Difícil': 3 };
  const filled = levels[difficulty] || 2;
  const stars = Array.from({ length: 3 }, (_, i) =>
    `<span class="star${i < filled ? ' active' : ''}" aria-hidden="true">★</span>`
  ).join('');
  return `<span class="difficulty-stars" title="${escapeHtml(difficulty || 'Médio')}" aria-label="Dificuldade: ${escapeHtml(difficulty || 'Médio')}">${stars}</span>`;
}

export function formatMinutes(minutes) {
  const n = Number(minutes) || 0;
  if (!n) return '—';
  if (n < 60) return `${n} min`;
  const hours = Math.floor(n / 60);
  const rest = n % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}
