import { API } from '../api.js';
import { showPage } from '../router.js';
import { escapeHtml, toast } from '../ui.js';

const $ = selector => document.querySelector(selector);

function render(invites) {
  const origin = window.location.origin;
  const base = origin + window.location.pathname.replace(/\/$/, '') + '/#register?token=';

  let html = `
    <div class="invites-header">
      <h2>Gerenciar Convites</h2>
      <p class="subtitle">Crie convites para compartilhar com quem você quer que tenha acesso ao app.</p>
      <button type="button" id="btn-create-invite" class="btn btn-primary">+ Novo Convite</button>
    </div>
    <div id="invite-result" class="invite-result" hidden>
      <p class="invite-link-label">Link do convite (copie e envie):</p>
      <div class="invite-link-box">
        <input type="text" id="invite-link" readonly>
        <button type="button" id="btn-copy-link" class="btn btn-secondary">Copiar</button>
      </div>
    </div>
    <div class="invites-list">
      <h3>Convites criados</h3>`;

  if (!invites.length) {
    html += `<p class="empty-state">Nenhum convite criado ainda.</p>`;
  } else {
    html += `<table class="invites-table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Criado em</th>
          <th>Usado por</th>
          <th>Usado em</th>
          <th></th>
        </tr>
      </thead>
      <tbody>`;
    for (const invite of invites) {
      const link = base + invite.code;
      const used = invite.used_by
        ? `${escapeHtml(invite.used_by_name || 'Alguém')} <small>(${invite.used_at})</small>`
        : `<span class="invite-pending">Pendente</span>`;
      html += `<tr>
        <td><code>${escapeHtml(invite.code)}</code></td>
        <td><small>${invite.created_at}</small></td>
        <td>${used}</td>
        <td><small>${invite.used_at || '—'}</small></td>
        <td>
          <button type="button" class="btn btn-sm btn-danger" data-action="revoke-invite" data-id="${escapeHtml(invite.id)}" ${invite.used_by ? 'disabled' : ''}>Revogar</button>
          <button type="button" class="btn btn-sm btn-secondary" data-action="copy-invite-link" data-link="${escapeHtml(link)}">Copiar link</button>
        </td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }

  html += `</div>`;
  $('#invites-content').innerHTML = html;
}

function bindEvents() {
  $('#btn-create-invite')?.addEventListener('click', async () => {
    try {
      const invite = await API.createInvite();
      const origin = window.location.origin;
      const base = origin + window.location.pathname.replace(/\/$/, '') + '/#register?token=';
      const link = base + invite.code;
      const result = $('#invite-result');
      result.hidden = false;
      $('#invite-link').value = link;
      toast('Convite criado! Copie o link e envie.', 'success');
      loadInvites();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#btn-copy-link')?.addEventListener('click', () => {
    const input = $('#invite-link');
    input.select();
    navigator.clipboard?.writeText(input.value).catch(() => {});
    toast('Link copiado!', 'success');
  });
}

document.addEventListener('click', event => {
  const revoke = event.target.closest('[data-action="revoke-invite"]');
  if (revoke) {
    const id = revoke.dataset.id;
    API.revokeInvite(id).then(() => {
      toast('Convite revogado', 'info');
      loadInvites();
    }).catch(err => toast(err.message, 'error'));
    return;
  }

  const copy = event.target.closest('[data-action="copy-invite-link"]');
  if (copy) {
    navigator.clipboard?.writeText(copy.dataset.link).catch(() => {});
    toast('Link copiado!', 'success');
  }
});

async function loadInvites() {
  try {
    const invites = await API.getInvites();
    render(invites);
    bindEvents();
  } catch (err) {
    toast(err.message, 'error');
  }
}

export function showInvites() {
  showPage('page-invites');
  loadInvites();
}

export function initInvites() {
}
