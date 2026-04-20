const CONFIG = {
  API_BASE: 'https://replypilot-backend-production.up.railway.app',
  APP_NAME: 'ReplyPilot',
  VERSION: '2.0.0'
};

const API = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('rp_token');
    const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
      },
      ...options
    });
    const data = await response.json();
    if (response.status === 401) {
      localStorage.removeItem('rp_token');
      localStorage.removeItem('rp_user');
      window.location.href = '/login.html';
    }
    return { data, ok: response.ok, status: response.status };
  },
  get: (endpoint) => API.request(endpoint),
  post: (endpoint, body) => API.request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => API.request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => API.request(endpoint, { method: 'DELETE' })
};

const Auth = {
  getToken: () => localStorage.getItem('rp_token'),
  getUser: () => { try { return JSON.parse(localStorage.getItem('rp_user') || '{}'); } catch { return {}; } },
  isLoggedIn: () => !!localStorage.getItem('rp_token'),
  save: (token, user) => { localStorage.setItem('rp_token', token); localStorage.setItem('rp_user', JSON.stringify(user)); },
  logout: () => { localStorage.removeItem('rp_token'); localStorage.removeItem('rp_user'); window.location.href = './index.html'; },
  requireAuth: () => { if (!localStorage.getItem('rp_token')) { window.location.href = '/login.html'; return false; } return true; }
};
