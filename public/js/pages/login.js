import { API } from '../api.js';
import { state } from '../state.js';
import { showPage, navigate, resolveRoute, currentHash } from '../router.js';

const $ = selector => document.querySelector(selector);

/**
 * Para onde voltar depois de entrar. Quem abre um link direto de receita cai no
 * login; sem isso, seria jogado no dashboard e teria que procurar a receita.
 */
let redirectTo = null;

export function rememberDestination(hash) {
  if (hash && !['login', 'register'].includes(hash)) redirectTo = hash;
}

function showAuthShell(pageId) {
  showPage(pageId);
  $('#app-main').hidden = true;
  $('.bottom-nav').classList.remove('active');
}

export function enterApp(user) {
  state.user = user;
  $('#app-main').hidden = false;
  $('#page-login').classList.remove('active');
  $('#page-register').classList.remove('active');
  $('.bottom-nav').classList.add('active');
}

export function showLogin() {
  showAuthShell('page-login');
  $('#login-error').textContent = '';
  $('#login-form').reset();
}

export function showRegister() {
  showAuthShell('page-register');
  $('#register-error').textContent = '';
  $('#register-form').reset();
}

export function renderUserName() {
  $('#user-name').textContent = state.user?.name || '';
}

/** Esconde o link de cadastro quando o servidor não tem INVITE_CODE configurado. */
export async function syncRegistrationAvailability() {
  try {
    const { registration_enabled: enabled } = await API.authConfig();
    $('#login-register-link').hidden = !enabled;
  } catch {
    $('#login-register-link').hidden = true;
  }
}

function bindAuthForm(formSelector, errorSelector, submit) {
  const form = $(formSelector);

  form?.addEventListener('submit', async event => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Aguarde...';
    $(errorSelector).textContent = '';

    try {
      const { token, user } = await submit();
      API.setToken(token);
      enterApp(user);

      const destination = redirectTo || 'dashboard';
      redirectTo = null;

      // Se o hash já for o destino, mudar o hash não dispara o hashchange —
      // o router precisa ser chamado à mão, senão a tela fica em branco.
      if (currentHash() === destination) {
        await resolveRoute();
      } else {
        navigate(destination);
      }
    } catch (err) {
      $(errorSelector).textContent = err.message;
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
}

export function initLoginPage() {
  bindAuthForm('#login-form', '#login-error', () =>
    API.login($('#username').value.trim(), $('#password').value)
  );

  bindAuthForm('#register-form', '#register-error', () => {
    const password = $('#reg-password').value;
    if (password !== $('#reg-password-confirm').value) {
      throw new Error('As senhas não conferem');
    }
    return API.register({
      username: $('#reg-username').value.trim(),
      name: $('#reg-name').value.trim(),
      password,
      invite_code: $('#reg-invite').value.trim(),
    });
  });

  $('#btn-logout')?.addEventListener('click', () => {
    API.clearToken();
    state.user = null;
    redirectTo = null;
    showLogin();
    navigate('login');
  });
}
