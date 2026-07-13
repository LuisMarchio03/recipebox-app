import { API } from '../api.js';
import { state } from '../state.js';
import { showPage, navigate } from '../router.js';
import { escapeHtml, toast, showModal, confirmDelete, skeletonCards, emptyState } from '../ui.js';
import { recipeCard, observeCardImages } from './dashboard.js';

const $ = selector => document.querySelector(selector);

/* ===== Lista de grupos ===== */

export async function showGroups() {
  showPage('page-groups');
  const container = $('#groups-list');
  container.innerHTML = skeletonCards(2);

  try {
    state.groups = await API.getGroups();
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  if (!state.groups.length) {
    container.innerHTML = emptyState('👥', 'Nenhum grupo', 'Crie um grupo para compartilhar receitas com a família.');
    return;
  }

  container.innerHTML = state.groups.map(group => `
    <article class="group-card" data-action="abrir-grupo" data-id="${escapeHtml(group.id)}" tabindex="0" role="link">
      <h3>📁 ${escapeHtml(group.name)}</h3>
      <div class="group-meta">
        ${escapeHtml(String(group.member_count))} membro(s)
        • ${escapeHtml(String(group.recipe_count))} receita(s)
        • ${group.role === 'owner' ? '👑 Dono' : '👤 Membro'}
      </div>
      ${group.description ? `<p class="group-description">${escapeHtml(group.description)}</p>` : ''}
    </article>
  `).join('');
}

/* ===== Detalhe do grupo ===== */

export async function showGroupDetail({ id }) {
  showPage('page-group-detail');
  const container = $('#group-detail-content');
  container.innerHTML = skeletonCards(2);

  let group, recipes;
  try {
    [group, recipes] = await Promise.all([
      API.getGroup(id),
      API.getRecipes({ group_id: id }),
    ]);
  } catch (err) {
    toast(err.message, 'error');
    navigate('groups');
    return;
  }

  const isOwner = group.myRole === 'owner';

  container.innerHTML = `
    <h2>📁 ${escapeHtml(group.name)}</h2>
    ${group.description ? `<p class="description">${escapeHtml(group.description)}</p>` : ''}

    <h3 class="section-title">👥 Membros (${group.members.length})</h3>
    <div class="member-list">
      ${group.members.map(member => `
        <div class="member-item">
          <div>
            <div class="name">${escapeHtml(member.name)}</div>
            <div class="role">@${escapeHtml(member.username)} • ${member.role === 'owner' ? '👑 Dono' : '👤 Membro'}</div>
          </div>
          ${isOwner && member.role !== 'owner' ? `
            <button class="btn btn-danger btn-sm"
                    data-action="remover-membro"
                    data-group="${escapeHtml(group.id)}"
                    data-user="${escapeHtml(member.id)}"
                    data-name="${escapeHtml(member.name)}">Remover</button>
          ` : ''}
        </div>
      `).join('')}
    </div>

    ${isOwner ? `
      <h3 class="section-title">➕ Adicionar membro</h3>
      <form class="add-member-form" data-group="${escapeHtml(group.id)}">
        <input type="text" id="add-member-input" placeholder="Nome de usuário" aria-label="Nome de usuário" autocomplete="off">
        <button type="submit" class="btn btn-primary btn-sm">Adicionar</button>
      </form>
    ` : ''}

    <h3 class="section-title">📖 Receitas do grupo (${recipes.length})</h3>
    <div class="recipe-list">
      ${recipes.length
        ? recipes.map(recipeCard).join('')
        : emptyState('📝', 'Nenhuma receita', 'Ao criar uma receita, escolha este grupo para compartilhá-la.')}
    </div>

    <div class="actions">
      <button class="btn btn-secondary btn-sm" data-action="exportar-grupo-word" data-id="${escapeHtml(group.id)}">📄 Exportar (Word)</button>
      <button class="btn btn-secondary btn-sm" data-action="exportar-grupo-excel" data-id="${escapeHtml(group.id)}">📊 Exportar (Excel)</button>
    </div>
  `;

  observeCardImages(container);

  container.querySelector('.add-member-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('#add-member-input');
    const username = input.value.trim();
    if (!username) return toast('Digite um nome de usuário', 'warning');

    try {
      await API.addMember(group.id, username);
      toast(`${username} entrou no grupo`, 'success');
      showGroupDetail({ id: group.id });
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ===== Formulário de grupo ===== */

export function showGroupForm() {
  showPage('page-group-form');
  $('#group-form').reset();
  document.querySelectorAll('#page-group-form .form-group.error')
    .forEach(g => g.classList.remove('error'));
}

export function initGroups() {
  $('#btn-create-group')?.addEventListener('click', () => navigate('groups/new'));
  $('#btn-group-cancel')?.addEventListener('click', () => navigate('groups'));

  $('#group-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const name = $('#g-name').value.trim();
    if (!name) return toast('O nome do grupo é obrigatório', 'warning');

    try {
      await API.createGroup({ name, description: $('#g-description').value.trim() });
      toast('Grupo criado!', 'success');
      navigate('groups');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#groups-list')?.addEventListener('keydown', event => {
    const card = event.target.closest('.group-card[data-id]');
    if (card && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      navigate(`groups/${card.dataset.id}`);
    }
  });

  $('#btn-import-excel')?.addEventListener('click', importExcel);
  $('#btn-export-excel')?.addEventListener('click', async () => {
    try {
      await API.downloadExcel();
      toast('Excel exportado!', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function importExcel() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;

    try {
      const result = await API.importExcel(file);

      // O código antigo jogava as linhas ignoradas só no console. Quem importa
      // uma planilha de 40 receitas precisa saber que 3 ficaram de fora.
      if (result.skipped) {
        await showModal({
          icon: '📥',
          title: `${result.imported} importada(s), ${result.skipped} ignorada(s)`,
          message: (result.errors || []).slice(0, 8).join('\n') || 'Algumas linhas estavam incompletas.',
          confirmText: 'Entendi',
        });
      } else {
        toast(result.message, 'success');
      }
      navigate('dashboard');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  input.click();
}

export const groupActions = {
  'abrir-grupo': ({ id }) => navigate(`groups/${id}`),

  'remover-membro': async ({ group, user, name }) => {
    const confirmed = await confirmDelete(
      'Remover membro?',
      `${name} perderá acesso às receitas deste grupo.`
    );
    if (!confirmed) return;

    try {
      await API.removeMember(group, user);
      toast('Membro removido', 'success');
      showGroupDetail({ id: group });
    } catch (err) {
      toast(err.message, 'error');
    }
  },

  'exportar-grupo-word': async ({ id }) => {
    try {
      await API.downloadGroupWord(id);
    } catch (err) {
      toast(err.message, 'error');
    }
  },

  'exportar-grupo-excel': async ({ id }) => {
    try {
      await API.downloadExcel({ group_id: id });
      toast('Excel exportado!', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  },
};
