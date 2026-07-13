const TOKEN_KEY = 'token';

/**
 * O <img src> do navegador não envia o header Authorization, então as fotos
 * protegidas são buscadas por fetch e viradas em object URL. O cache abaixo
 * evita refazer o trabalho a cada re-render; o HTTP cache (ETag +
 * Cache-Control) cuida das visitas seguintes.
 */
const imageCache = new Map();

export const API = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: token => localStorage.setItem(TOKEN_KEY, token),

  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    for (const url of imageCache.values()) URL.revokeObjectURL(url);
    imageCache.clear();
  },

  async request(path, options = {}) {
    const headers = { ...options.headers };
    const token = API.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(path, { ...options, headers });

    if (res.status === 401) {
      API.clearToken();
      window.location.hash = '#login';
      throw new Error('Sua sessão expirou. Entre novamente.');
    }

    if (options.raw) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha na requisição');
      }
      return res;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Falha na requisição');
    return data;
  },

  /* ===== Autenticação ===== */

  authConfig: () => API.request('/api/auth/config'),
  getMe: () => API.request('/api/auth/me'),

  login: (username, password) =>
    API.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  register: payload =>
    API.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /* ===== Receitas ===== */

  getRecipes(params = {}) {
    const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => value));
    const qs = new URLSearchParams(clean).toString();
    return API.request(`/api/recipes${qs ? '?' + qs : ''}`);
  },

  getCategories: () => API.request('/api/recipes/categories'),
  getRecipe: id => API.request(`/api/recipes/${id}`),

  createRecipe: data =>
    API.request('/api/recipes', { method: 'POST', body: JSON.stringify(data) }),

  updateRecipe: (id, data) =>
    API.request(`/api/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteRecipe: id => API.request(`/api/recipes/${id}`, { method: 'DELETE' }),

  /* ===== Fotos ===== */

  uploadImage(id, { thumb, full }) {
    invalidateImage(id);
    return API.request(`/api/recipes/${id}/image`, {
      method: 'PUT',
      body: JSON.stringify({ thumb, full }),
    });
  },

  deleteImage(id) {
    invalidateImage(id);
    return API.request(`/api/recipes/${id}/image`, { method: 'DELETE' });
  },

  async loadImage(id, size = 'thumb') {
    const key = `${id}:${size}`;
    if (imageCache.has(key)) return imageCache.get(key);

    const res = await API.request(`/api/recipes/${id}/image?size=${size}`, { raw: true });
    const url = URL.createObjectURL(await res.blob());
    imageCache.set(key, url);
    return url;
  },

  /* ===== Grupos ===== */

  getGroups: () => API.request('/api/groups'),
  getGroup: id => API.request(`/api/groups/${id}`),

  createGroup: data =>
    API.request('/api/groups', { method: 'POST', body: JSON.stringify(data) }),

  addMember: (groupId, username) =>
    API.request(`/api/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  removeMember: (groupId, userId) =>
    API.request(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),

  /* ===== Importar / Exportar ===== */

  importExcel(file, groupId) {
    const form = new FormData();
    form.append('file', file);
    if (groupId) form.append('group_id', groupId);
    return API.request('/api/import/excel', { method: 'POST', body: form });
  },

  downloadExcel(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return download(`/api/export/excel${qs ? '?' + qs : ''}`);
  },

  downloadWord: id => download(`/api/export/word/${id}`),
  downloadGroupWord: groupId => download(`/api/export/word/group/${groupId}`),
};

function invalidateImage(id) {
  for (const size of ['thumb', 'full']) {
    const key = `${id}:${size}`;
    const url = imageCache.get(key);
    if (url) URL.revokeObjectURL(url);
    imageCache.delete(key);
  }
}

/**
 * Usa o nome de arquivo que o servidor mandou no Content-Disposition, para o
 * download sair como "Bolo_de_Cenoura.docx" e não como um UUID opaco.
 */
async function download(path) {
  const res = await API.request(path, { raw: true });
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename=(?:"([^"]+)"|([^;]+))/i.exec(disposition);
  const filename = (match?.[1] || match?.[2] || 'download').trim();

  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
