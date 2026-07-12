const API = {
  getToken() {
    return localStorage.getItem('token');
  },

  setToken(token) {
    localStorage.setItem('token', token);
  },

  clearToken() {
    localStorage.removeItem('token');
  },

  async request(path, options = {}) {
    const token = this.getToken();
    const headers = { ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(path, { ...options, headers });

    if (res.status === 401) {
      this.clearToken();
      window.location.hash = '#login';
      throw new Error('Sessão expirada');
    }

    if (path.includes('/export/') && !path.includes('/import/')) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro ao exportar' }));
        throw new Error(err.error);
      }
      return res;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  },

  login(username, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  getMe() {
    return this.request('/api/auth/me');
  },

  getRecipes(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/recipes?${qs}`);
  },

  getRecipe(id) {
    return this.request(`/api/recipes/${id}`);
  },

  createRecipe(data) {
    return this.request('/api/recipes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateRecipe(id, data) {
    return this.request(`/api/recipes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteRecipe(id) {
    return this.request(`/api/recipes/${id}`, { method: 'DELETE' });
  },

  getGroups() {
    return this.request('/api/groups');
  },

  getGroup(id) {
    return this.request(`/api/groups/${id}`);
  },

  createGroup(data) {
    return this.request('/api/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  addMember(groupId, username) {
    return this.request(`/api/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  },

  removeMember(groupId, userId) {
    return this.request(`/api/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
    });
  },

  async downloadExcel(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await this.request(`/api/export/excel?${qs}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receitas_${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async downloadWord(id) {
    const res = await this.request(`/api/export/word/${id}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receita_${id}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async downloadGroupWord(groupId) {
    const res = await this.request(`/api/export/word/group/${groupId}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receitas_grupo_${groupId}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async importExcel(file) {
    const form = new FormData();
    form.append('file', file);
    return this.request('/api/import/excel', {
      method: 'POST',
      body: form,
    });
  },
};
