let appState = { user: null, recipes: [], groups: [], currentTab: 'all', searchTerm: '' };

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function show(id) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const el = $(`#${id}`);
  if (el) el.classList.add('active');
}

/* ===== Toast System ===== */
function toast(msg, type = 'info') {
  let container = $('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 250); }, 3000);
}

/* ===== Loading Skeleton ===== */
function skeletonCards(n = 3) {
  return Array(n).fill(0).map(() => `
    <div class="recipe-card skeleton">
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

/* ===== Custom Modal ===== */
function showModal({ icon, title, message, confirmText, cancelText, onConfirm, danger }) {
  return new Promise(resolve => {
    const existing = $('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal">
        ${icon ? `<div class="modal-icon">${icon}</div>` : ''}
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="modal-actions">
          ${cancelText ? `<button class="btn btn-secondary modal-cancel">${cancelText}</button>` : ''}
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} modal-confirm">${confirmText || 'OK'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('.modal-confirm')?.addEventListener('click', () => close(true));
    overlay.querySelector('.modal-cancel')?.addEventListener('click', () => close(false));
    overlay.addEventListener('click', e => { if (e.target === overlay && cancelText) close(false); });
  });
}

async function confirmDelete(msg) {
  return showModal({
    icon: '🗑️',
    title: 'Excluir receita?',
    message: msg || 'Tem certeza? Esta ação não pode ser desfeita.',
    confirmText: 'Excluir', cancelText: 'Cancelar', danger: true,
  });
}

/* ===== Dark Mode ===== */
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
  const btn = $('#theme-toggle');
  if (btn) btn.textContent = isDark ? '🌙' : '☀️';
}

/* ===== Auto-resize Textarea ===== */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/* ===== Item List Editor ===== */
function addItemRow(containerId, value = '') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const isInstruction = containerId === 'instructions-rows';
  const isIngredient = containerId === 'ingredients-rows';

  const row = document.createElement('div');
  row.className = 'item-row';

  function makeMoveButtons() {
    const wrap = document.createElement('span');
    wrap.className = 'move-btns';
    wrap.innerHTML = `
      <button type="button" class="btn-move-up" tabindex="-1" title="Mover pra cima">▲</button>
      <button type="button" class="btn-move-down" tabindex="-1" title="Mover pra baixo">▼</button>
    `;
    return wrap;
  }

  function attachMoveHandlers(wrap, r) {
    wrap.querySelector('.btn-move-up').addEventListener('click', () => moveRow(r, -1));
    wrap.querySelector('.btn-move-down').addEventListener('click', () => moveRow(r, 1));
  }

  if (isIngredient) {
    const parts = value.split(' | ');
    const qty = parts.length > 1 ? parts[0] : '';
    const name = parts.length > 1 ? parts.slice(1).join(' | ') : value;
    const moveWrap = makeMoveButtons();
    row.innerHTML = `
      <input type="text" class="item-qty" value="${escapeHtml(qty)}" placeholder="Ex: 2 xícaras">
      <input type="text" class="item-input" value="${escapeHtml(name)}" placeholder="Ex: farinha de trigo">
      <button type="button" class="btn-remove-item" tabindex="-1" title="Remover">✕</button>
    `;
    row.insertBefore(moveWrap, row.firstChild);
    attachMoveHandlers(moveWrap, row);
    row.querySelector('.btn-remove-item').addEventListener('click', () => row.remove());
    container.appendChild(row);
    if (value === '') row.querySelector('.item-qty').focus();
  } else if (isInstruction && value.startsWith('# ')) {
    row.classList.add('section-row');
    const title = value.slice(2);
    const moveWrap = makeMoveButtons();
    row.innerHTML = `
      <span class="section-marker">#</span>
      <input type="text" class="item-input section-input" value="${escapeHtml(title)}" placeholder="Nome da seção (ex: Creme Branco)">
      <button type="button" class="btn-remove-item" tabindex="-1" title="Remover">✕</button>
    `;
    row.insertBefore(moveWrap, row.firstChild);
    attachMoveHandlers(moveWrap, row);
    row.querySelector('.btn-remove-item').addEventListener('click', () => row.remove());
    container.appendChild(row);
    if (value === '# ') row.querySelector('.section-input').focus();
  } else {
    const moveWrap = makeMoveButtons();
    row.innerHTML = `
      <input type="text" class="item-input" value="${escapeHtml(value)}" placeholder="${isInstruction ? 'Ex: Misture os ingredientes secos...' : 'Ex: 2 xícaras de farinha de trigo'}">
      <button type="button" class="btn-remove-item" tabindex="-1" title="Remover">✕</button>
    `;
    row.insertBefore(moveWrap, row.firstChild);
    attachMoveHandlers(moveWrap, row);
    row.querySelector('.btn-remove-item').addEventListener('click', () => {
      row.remove();
    });
    container.appendChild(row);
    if (value === '') row.querySelector('.item-input').focus();
  }
}

function initItemEditor(containerId, textareaId) {
  const container = document.getElementById(containerId);
  const textarea = document.getElementById(textareaId);
  if (!container || !textarea) return;
  container.innerHTML = '';
  const values = textarea.value.split('\n').filter(v => v.trim());
  if (values.length === 0) values.push('');
  values.forEach(v => addItemRow(containerId, v));
}

function collectItemValues(containerId) {
  const isIngredient = containerId === 'ingredients-rows';
  if (isIngredient) {
    const rows = document.querySelectorAll(`#${containerId} .item-row`);
    return Array.from(rows).map(row => {
      const qty = row.querySelector('.item-qty')?.value.trim() || '';
      const name = row.querySelector('.item-input')?.value.trim() || '';
      if (!name) return '';
      return qty ? `${qty} | ${name}` : name;
    }).filter(v => v);
  }
  const rows = document.querySelectorAll(`#${containerId} .item-row`);
  return Array.from(rows).map(row => {
    const isSection = row.classList.contains('section-row');
    const input = row.querySelector('.item-input');
    const val = input?.value.trim() || '';
    if (!val) return '';
    return isSection ? `# ${val}` : val;
  }).filter(v => v);
}

function moveRow(row, direction) {
  const container = row.parentNode;
  if (direction === -1 && row.previousElementSibling) {
    container.insertBefore(row, row.previousElementSibling);
  } else if (direction === 1 && row.nextElementSibling) {
    container.insertBefore(row.nextElementSibling, row);
  }
}

/* ===== Add Item Button Events ===== */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-add-item');
  if (btn) {
    const editor = btn.dataset.editor;
    addItemRow(`${editor}-rows`, '');
    return;
  }
  const sectionBtn = e.target.closest('.btn-add-section');
  if (sectionBtn) {
    const editor = sectionBtn.dataset.editor;
    addItemRow(`${editor}-rows`, '# ');
  }
});

/* ===== Difficulty Helpers ===== */
function diffStars(diff) {
  const levels = { 'Fácil': 1, 'Médio': 2, 'Difícil': 3 };
  const n = levels[diff] || 2;
  return '<span class="difficulty-stars">' + Array(3).fill(0).map((_, i) =>
    `<span class="star${i < n ? ' active' : ''}">★</span>`
  ).join('') + '</span>';
}

/* ===== Init ===== */
async function init() {
  initTheme();
  const token = API.getToken();
  if (token) {
    try {
      appState.user = await API.getMe();
      $('#app-main').style.display = 'block';
      $('#page-login').classList.remove('active');
      $('.bottom-nav').classList.add('active');
      router();
    } catch {
      API.clearToken();
      showLogin();
    }
  } else {
    showLogin();
  }
}

function showLogin() {
  $('#page-login').classList.add('active');
  $('#app-main').style.display = 'none';
  $('.bottom-nav').classList.remove('active');
}

/* ===== Router ===== */
function router() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const parts = hash.split('/');
  if (!appState.user) { showLogin(); return; }

  $('#user-name').textContent = appState.user.name;
  $('#theme-toggle').textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';

       if (hash === 'dashboard') showDashboard();
  else if (hash === 'groups') showGroups();
  else if (hash === 'groups/new') showGroupForm();
  else if (parts[0] === 'groups' && parts[1]) showGroupDetail(parts[1]);
  else if (hash === 'recipe/new') showRecipeForm();
  else if (parts[0] === 'recipe' && parts[1] === 'edit' && parts[2]) showRecipeForm(parts[2]);
  else if (parts[0] === 'recipe' && parts[1]) showRecipeDetail(parts[1]);
  else { window.location.hash = 'dashboard'; }

  updateNav(hash);
}

function updateNav(hash) {
  const page = hash.split('/')[0];
  $$('.bottom-nav a').forEach(a => a.classList.toggle('active', page === a.dataset.page));
  const titles = { dashboard: 'RecipeBox', groups: 'Groups' };
  $('#header-title').textContent = titles[page] || 'RecipeBox';
  $('#btn-back').style.display = (page === 'dashboard' || page === 'groups') ? 'none' : 'inline';
}

window.addEventListener('hashchange', router);

/* ===== Dashboard ===== */
let searchTimeout = null;

async function showDashboard() {
  show('page-dashboard');
  $('#recipe-list').innerHTML = skeletonCards(3);
  $('#search-input').value = appState.searchTerm;
  updateSearchClear();
  try {
    appState.recipes = await API.getRecipes({ type: appState.currentTab === 'all' ? '' : appState.currentTab });
    renderRecipeList();
  } catch (e) { toast(e.message, 'error'); }
}

function renderRecipeList() {
  const container = $('#recipe-list');
  let recipes = appState.recipes;

  if (appState.searchTerm) {
    const t = appState.searchTerm.toLowerCase();
    recipes = recipes.filter(r =>
      r.title.toLowerCase().includes(t) ||
      (r.category || '').toLowerCase().includes(t) ||
      (r.description || '').toLowerCase().includes(t)
    );
  }

  if (!recipes.length) {
    container.innerHTML = appState.searchTerm
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><h3>Nenhum resultado</h3><p>Nenhuma receita encontrada para "${escapeHtml(appState.searchTerm)}"</p></div>`
      : `<div class="empty-state"><div class="empty-icon">🍳</div><h3>Nenhuma receita ainda</h3><p>Clique em + para adicionar a primeira!</p></div>`;
    return;
  }

  container.innerHTML = recipes.map(r => `
    <div class="recipe-card" onclick="window.location.hash='recipe/${r.id}'">
      <div class="meta">
        ${r.category ? `<span class="category">${escapeHtml(r.category)}</span>` : ''}
        ${r.is_private ? '<span class="badge badge-private">🔒 Privada</span>' : ''}
        ${r.group_id ? '<span class="badge badge-group">👥 Grupo</span>' : ''}
        ${r.difficulty ? `<span class="difficulty">${diffStars(r.difficulty)}</span>` : ''}
      </div>
      <h3>${escapeHtml(r.title)}</h3>
      ${r.description ? `<p class="description">${escapeHtml(r.description)}</p>` : ''}
    </div>
  `).join('');
}

/* Tabs */
$$('.tab').forEach(tab => {
  tab.addEventListener('click', async () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    appState.currentTab = tab.dataset.tab;
    appState.searchTerm = '';
    $('#search-input').value = '';
    updateSearchClear();
    $('#recipe-list').innerHTML = skeletonCards(3);
    try {
      appState.recipes = await API.getRecipes({ type: appState.currentTab === 'all' ? '' : appState.currentTab });
      renderRecipeList();
    } catch (e) { toast(e.message, 'error'); }
  });
});

$('#btn-add-recipe')?.addEventListener('click', () => window.location.hash = 'recipe/new');

/* Search */
$('#search-input')?.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    appState.searchTerm = e.target.value;
    updateSearchClear();
    renderRecipeList();
  }, 200);
});

$('#search-clear')?.addEventListener('click', () => {
  appState.searchTerm = '';
  $('#search-input').value = '';
  updateSearchClear();
  renderRecipeList();
  $('#search-input').focus();
});

function updateSearchClear() {
  const btn = $('#search-clear');
  if (btn) btn.classList.toggle('visible', !!$('#search-input')?.value);
}

/* ===== Recipe Detail ===== */
async function showRecipeDetail(id) {
  show('page-recipe-detail');
  $('#recipe-detail-content').innerHTML = skeletonCards(1);
  try {
    const r = await API.getRecipe(id);
    const isOwner = r.user_id === appState.user.id;

    const ingItems = r.ingredients.split('\n').filter(l => l.trim());
    const instLines = r.instructions.split('\n').filter(l => l.trim());

    function renderIngredient(line) {
      const idx = line.indexOf(' | ');
      if (idx > 0) {
        const qty = escapeHtml(line.slice(0, idx));
        const name = escapeHtml(line.slice(idx + 3));
        return `<span class="ing-qty">${qty}</span> ${name}`;
      }
      return escapeHtml(line);
    }

    // Separate section headers from step lines
    const instSections = [];
    let currentSection = { title: null, steps: [] };
    instLines.forEach(line => {
      if (line.startsWith('# ')) {
        if (currentSection.steps.length || currentSection.title) {
          instSections.push(currentSection);
        }
        currentSection = { title: line.slice(2).trim(), steps: [] };
      } else {
        currentSection.steps.push(line);
      }
    });
    if (currentSection.steps.length || currentSection.title) {
      instSections.push(currentSection);
    }

    const progressKey = `recipe-progress-${r.id}`;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(progressKey) || '{}'); } catch {}

    function checkedAttr(prefix, idx) {
      return saved[`${prefix}-${idx}`] ? 'checked' : '';
    }

    // Count total steps (non-section lines)
    let stepCount = 0;
    let checkedCount = 0;
    instLines.forEach(line => {
      if (!line.startsWith('# ')) {
        if (saved[`inst-${stepCount}`]) checkedCount++;
        stepCount++;
      }
    });
    const totalSteps = stepCount;
    const pct = totalSteps ? Math.round((checkedCount / totalSteps) * 100) : 0;

    $('#recipe-detail-content').innerHTML = `
      <h2>${escapeHtml(r.title)}</h2>
      ${r.description ? `<p class="description">${escapeHtml(r.description)}</p>` : ''}

      <div class="info-grid">
        <div class="info-item"><div class="label">Preparo</div><div class="value">${formatTime(r.prep_time)}</div></div>
        <div class="info-item"><div class="label">Cozimento</div><div class="value">${formatTime(r.cook_time)}</div></div>
        <div class="info-item"><div class="label">Porções</div><div class="value">${r.servings}</div></div>
        <div class="info-item"><div class="label">Categoria</div><div class="value">${escapeHtml(r.category || '—')}</div></div>
        <div class="info-item"><div class="label">Dificuldade</div><div class="value">${diffStars(r.difficulty)}</div></div>
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        ${r.is_private ? '<span class="badge badge-private">🔒 Privada</span>' : ''}
        ${r.group_id ? '<span class="badge badge-group">👥 Compartilhada em Grupo</span>' : ''}
      </div>

      <div class="section-title">📝 Ingredientes</div>
      <div class="checklist" data-recipe="${r.id}" data-type="ingredients">
        ${ingItems.map((item, i) => `
          <label class="checklist-item ${checkedAttr('ing', i) ? 'checked' : ''}">
            <input type="checkbox" data-idx="${i}" data-type="ing" ${checkedAttr('ing', i)}>
            <span>${renderIngredient(item)}</span>
          </label>
        `).join('')}
      </div>

      <div class="section-title">👩‍🍳 Modo de Preparo</div>
      ${totalSteps > 0 ? `
      <div class="cooking-tools">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span class="progress-text">${checkedCount}/${totalSteps} passos</span>
        <button class="btn-reset" onclick="resetProgress('${r.id}')">↺ Resetar</button>
      </div>
      ` : ''}
      <div class="checklist" data-recipe="${r.id}" data-type="instructions">
        ${(() => {
          let globalStepIdx = 0;
          let html = '';
          instSections.forEach((sec, si) => {
            if (sec.title) {
              html += `<div class="checklist-section">${escapeHtml(sec.title)}</div>`;
            }
            sec.steps.forEach((step, si2) => {
              const stepNum = si2 + 1;
              const gIdx = globalStepIdx;
              html += `
                <label class="checklist-item ${checkedAttr('inst', gIdx) ? 'checked' : ''}">
                  <input type="checkbox" data-step-idx="${gIdx}" ${checkedAttr('inst', gIdx)}>
                  <span class="step-num">${stepNum}.</span>
                  <span>${escapeHtml(step)}</span>
                </label>
              `;
              globalStepIdx++;
            });
          });
          return html;
        })()}
      </div>

      <div class="actions">
        ${isOwner ? `
          <button class="btn btn-primary btn-sm" onclick="window.location.hash='recipe/edit/${r.id}'">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="handleDelete('${r.id}')">🗑️ Excluir</button>
        ` : ''}
        <button class="btn btn-secondary btn-sm" onclick="handlePrint()">🖨️ Imprimir</button>
        <button class="btn btn-secondary btn-sm" onclick="handleShare('${escapeHtml(r.title)}','${escapeHtml(r.description || '')}')">📤 Compartilhar</button>
        <button class="btn btn-secondary btn-sm" onclick="API.downloadWord('${r.id}')">📄 Word</button>
      </div>
    `;

    // Attach checkbox change listeners
    $('#recipe-detail-content').querySelectorAll('.checklist input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const recipeId = cb.closest('.checklist').dataset.recipe;
        const checklistType = cb.closest('.checklist').dataset.type;
        const key = `recipe-progress-${recipeId}`;
        let data = {};
        try { data = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
        const idx = cb.dataset.stepIdx || cb.dataset.idx;
        if (checklistType === 'instructions') {
          data[`inst-${idx}`] = cb.checked;
        } else {
          data[`ing-${idx}`] = cb.checked;
        }
        localStorage.setItem(key, JSON.stringify(data));
        cb.closest('.checklist-item').classList.toggle('checked', cb.checked);
        if (checklistType === 'instructions') {
          const container = cb.closest('#recipe-detail-content') || $('#recipe-detail-content');
          const checks = container.querySelectorAll('.checklist[data-type="instructions"] input[type="checkbox"]');
          const total = checks.length;
          const done = Array.from(checks).filter(c => c.checked).length;
          const fill = container.querySelector('.progress-fill');
          const text = container.querySelector('.progress-text');
          const pct = total ? Math.round((done / total) * 100) : 0;
          if (fill) fill.style.width = pct + '%';
          if (text) text.textContent = `${done}/${total} passos`;
        }
      });
    });

  } catch (e) { toast(e.message, 'error'); window.location.hash = 'dashboard'; }
}

function resetProgress(recipeId) {
  localStorage.removeItem(`recipe-progress-${recipeId}`);
  showRecipeDetail(recipeId);
}

function formatTime(m) { return m ? `${m} min` : '—'; }

async function handleDelete(id) {
  const confirmed = await confirmDelete();
  if (!confirmed) return;
  try {
    await API.deleteRecipe(id);
    toast('Receita excluída', 'success');
    window.location.hash = 'dashboard';
  } catch (e) { toast(e.message, 'error'); }
}

function handlePrint() {
  window.print();
}

function handleShare(title, description) {
  if (navigator.share) {
    navigator.share({ title, text: description, url: window.location.href }).catch(() => {});
  } else {
    navigator.clipboard.writeText(window.location.href).then(() => toast('Link copiado!', 'success'));
  }
}

/* ===== Recipe Form ===== */
async function showRecipeForm(editId) {
  show('page-recipe-form');
  const form = $('#recipe-form');
  form.reset();
  clearErrors();

  if (editId) {
    $('#form-title').textContent = 'Editar Receita';
    $('#form-submit').textContent = 'Salvar';
    try {
      const r = await API.getRecipe(editId);
      $('#r-title').value = r.title;
      $('#r-description').value = r.description;
      $('#r-ingredients').value = r.ingredients;
      $('#r-instructions').value = r.instructions;
      $('#r-prep-time').value = r.prep_time;
      $('#r-cook-time').value = r.cook_time;
      $('#r-servings').value = r.servings;
      $('#r-category').value = r.category;
      $('#r-difficulty').value = r.difficulty || 'Médio';
      $('#r-private').checked = !!r.is_private;
      window._editGroupId = r.group_id || '';
    } catch (e) { toast(e.message, 'error'); window.location.hash = 'dashboard'; }
  } else {
    $('#form-title').textContent = 'Nova Receita';
    $('#form-submit').textContent = 'Criar';
    $('#r-ingredients').value = '';
    $('#r-instructions').value = '';
    $('#r-servings').value = 1;
    $('#r-difficulty').value = 'Médio';
    window._editGroupId = '';
  }

  initItemEditor('ingredients-rows', 'r-ingredients');
  initItemEditor('instructions-rows', 'r-instructions');

  try {
    const groups = await API.getGroups();
    const sel = $('#r-group');
    sel.innerHTML = '<option value="">Nenhum (Receita pessoal)</option>'
      + groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    if (window._editGroupId) {
      sel.value = window._editGroupId;
    }
  } catch {}
  delete window._editGroupId;
}

$('#recipe-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Sync item editors to hidden textareas
  $('#r-ingredients').value = collectItemValues('ingredients-rows').join('\n');
  $('#r-instructions').value = collectItemValues('instructions-rows').join('\n');

  if (!validateForm()) return;

  const editId = window.location.hash.includes('edit') ? window.location.hash.split('/')[2] : null;
  const data = {
    title: $('#r-title').value.trim(),
    description: $('#r-description').value.trim(),
    ingredients: $('#r-ingredients').value.trim(),
    instructions: $('#r-instructions').value.trim(),
    prep_time: parseInt($('#r-prep-time').value) || 0,
    cook_time: parseInt($('#r-cook-time').value) || 0,
    servings: parseInt($('#r-servings').value) || 1,
    category: $('#r-category').value.trim(),
    difficulty: $('#r-difficulty').value,
    is_private: $('#r-private').checked,
    group_id: $('#r-group').value || null,
  };

  try {
    if (editId) {
      await API.updateRecipe(editId, data);
      toast('Receita atualizada!', 'success');
    } else {
      await API.createRecipe(data);
      toast('Receita criada!', 'success');
    }
    window.location.hash = 'dashboard';
  } catch (e) { toast(e.message, 'error'); }
});

function validateForm() {
  let valid = true;
  clearErrors();

  if (!$('#r-title').value.trim()) {
    showError('r-title', 'O título é obrigatório'); valid = false;
  }
  if (!$('#r-ingredients').value.trim()) {
    showError('r-ingredients', 'Os ingredientes são obrigatórios'); valid = false;
  }
  if (!$('#r-instructions').value.trim()) {
    showError('r-instructions', 'O modo de preparo é obrigatório'); valid = false;
  }
  return valid;
}

function showError(id, msg) {
  const el = $(`#${id}`);
  if (!el) return;
  const group = el.closest('.form-group');
  if (group) {
    group.classList.add('error');
    const errEl = group.querySelector('.error-msg');
    if (errEl) errEl.textContent = msg;
  }
}

function clearErrors() {
  $$('.form-group.error').forEach(g => g.classList.remove('error'));
}

$('#btn-form-cancel')?.addEventListener('click', () => window.location.hash = 'dashboard');

/* Auto-resize textareas */
$$('textarea').forEach(ta => {
  ta.addEventListener('input', () => autoResize(ta));
});

/* ===== Groups ===== */
async function showGroups() {
  show('page-groups');
  $('#groups-list').innerHTML = skeletonCards(2);
  try {
    appState.groups = await API.getGroups();
    renderGroups();
  } catch (e) { toast(e.message, 'error'); }
}

function renderGroups() {
  const container = $('#groups-list');
  if (!appState.groups.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><h3>Nenhum grupo</h3><p>Crie um grupo para compartilhar receitas!</p></div>';
    return;
  }
  container.innerHTML = appState.groups.map(g => `
    <div class="group-card" onclick="window.location.hash='groups/${g.id}'">
      <h3>📁 ${escapeHtml(g.name)}</h3>
      <div class="group-meta">${g.member_count} membro(s) • ${g.role === 'owner' ? '👑 Dono' : '👤 Membro'}</div>
      ${g.description ? `<p style="font-size:13px;color:var(--text-tertiary);margin-top:4px">${escapeHtml(g.description)}</p>` : ''}
    </div>
  `).join('');
}

$('#btn-create-group')?.addEventListener('click', () => window.location.hash = 'groups/new');
$('#btn-import-excel')?.addEventListener('click', importExcel);
$('#btn-export-excel')?.addEventListener('click', exportExcel);

/* ===== Group Detail ===== */
async function showGroupDetail(id) {
  show('page-group-detail');
  $('#group-detail-content').innerHTML = skeletonCards(2);
  try {
    const g = await API.getGroup(id);
    const recipes = await API.getRecipes({ group_id: id });
    renderGroupDetail(g, recipes);
  } catch (e) { toast(e.message, 'error'); window.location.hash = 'groups'; }
}

function renderGroupDetail(g, recipes) {
  const container = $('#group-detail-content');
  const isOwner = g.myRole === 'owner';

  container.innerHTML = `
    <h2>📁 ${escapeHtml(g.name)}</h2>
    ${g.description ? `<p style="color:var(--text-secondary);margin-bottom:16px">${escapeHtml(g.description)}</p>` : ''}

    <div class="section-title">👥 Membros (${g.members.length})</div>
    <div class="member-list">
      ${g.members.map(m => `
        <div class="member-item">
          <div>
            <div class="name">${escapeHtml(m.name)}</div>
            <div class="role">@${escapeHtml(m.username)} • ${m.role === 'owner' ? '👑 Dono' : '👤 Membro'}</div>
          </div>
          ${isOwner && m.role !== 'owner' ? `<button class="btn btn-danger btn-sm" onclick="handleRemoveMember('${g.id}','${m.id}')">Remover</button>` : ''}
        </div>
      `).join('')}
    </div>

    ${isOwner ? `
      <div class="section-title">➕ Adicionar Membro</div>
      <div class="add-member-form" style="margin-bottom:16px">
        <input type="text" id="add-member-input" placeholder="Username do usuário">
        <button class="btn btn-primary btn-sm" onclick="handleAddMember('${g.id}')">Adicionar</button>
      </div>
    ` : ''}

    <div class="section-title">📖 Receitas do Grupo (${recipes.length})</div>
    <div class="recipe-list" id="group-recipes-list">
      ${recipes.length ? recipes.map(r => `
        <div class="recipe-card" onclick="window.location.hash='recipe/${r.id}'">
          <div class="meta">
            ${r.category ? `<span class="category">${escapeHtml(r.category)}</span>` : ''}
            ${r.difficulty ? `<span class="difficulty">${diffStars(r.difficulty)}</span>` : ''}
          </div>
          <h3>${escapeHtml(r.title)}</h3>
          ${r.description ? `<p class="description">${escapeHtml(r.description)}</p>` : ''}
        </div>
      `).join('') : '<div class="empty-state" style="padding:20px"><div class="empty-icon">📝</div><p>Nenhuma receita neste grupo ainda.</p></div>'}
    </div>

    <div class="actions" style="margin-top:16px">
      <button class="btn btn-secondary btn-sm" onclick="API.downloadGroupWord('${g.id}')">📄 Exportar Grupo (Word)</button>
      <button class="btn btn-secondary btn-sm" onclick="API.downloadExcel({group_id:'${g.id}'})">📊 Exportar Grupo (Excel)</button>
    </div>
  `;
}

async function handleAddMember(groupId) {
  const input = $('#add-member-input');
  const username = input.value.trim();
  if (!username) return toast('Digite um username', 'warning');
  try {
    await API.addMember(groupId, username);
    toast('Membro adicionado!', 'success');
    window.location.hash = `groups/${groupId}`;
  } catch (e) { toast(e.message, 'error'); }
}

async function handleRemoveMember(groupId, userId) {
  const confirmed = await showModal({
    icon: '👋', title: 'Remover membro?',
    message: 'Este membro perderá acesso ao grupo.',
    confirmText: 'Remover', cancelText: 'Cancelar', danger: true,
  });
  if (!confirmed) return;
  try {
    await API.removeMember(groupId, userId);
    toast('Membro removido', 'success');
    window.location.hash = `groups/${groupId}`;
  } catch (e) { toast(e.message, 'error'); }
}

/* ===== Group Form ===== */
function showGroupForm() {
  show('page-group-form');
  $('#group-form-title').textContent = 'Novo Grupo';
  $('#group-form').reset();
  clearErrors();
}

$('#group-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();
  const name = $('#g-name').value.trim();
  if (!name) { showError('g-name', 'Nome é obrigatório'); return; }
  try {
    await API.createGroup({ name, description: $('#g-description').value.trim() });
    toast('Grupo criado!', 'success');
    window.location.hash = 'groups';
  } catch (e) { toast(e.message, 'error'); }
});

$('#btn-group-cancel')?.addEventListener('click', () => window.location.hash = 'groups');

/* ===== Login ===== */
$('#login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-form button');
  btn.disabled = true; btn.textContent = 'Entrando...';
  $('#login-error').textContent = '';
  try {
    const result = await API.login($('#username').value, $('#password').value);
    API.setToken(result.token);
    appState.user = result.user;
    $('#app-main').style.display = 'block';
    $('#page-login').classList.remove('active');
    $('.bottom-nav').classList.add('active');
    window.location.hash = 'dashboard';
  } catch (e) {
    $('#login-error').textContent = e.message;
  }
  btn.disabled = false; btn.textContent = 'Entrar';
});

$('#btn-logout')?.addEventListener('click', () => {
  API.clearToken();
  appState.user = null;
  showLogin();
  window.location.hash = '';
});

/* Theme toggle */
$('#theme-toggle')?.addEventListener('click', toggleTheme);

/* ===== Import / Export ===== */
async function importExcel() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const result = await API.importExcel(file);
      toast(result.message, 'success');
      if (result.errors) console.warn('Import errors:', result.errors);
      window.location.hash = 'dashboard';
    } catch (e) { toast(e.message, 'error'); }
  };
  input.click();
}

async function exportExcel() {
  try {
    await API.downloadExcel();
    toast('Excel exportado!', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

/* ===== Helpers ===== */
function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', init);
