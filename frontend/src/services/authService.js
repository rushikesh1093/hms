import api, { refreshSession, setAccessToken } from './api';

export const authService = {
  async login(username, password) {
    const { data } = await api.post('/auth/login', { username, password });
    setAccessToken(data.access_token);
    return data.user;
  },
  async restore() {
    const data = await refreshSession();
    return data.user;
  },
  async logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
    }
  },
  me: () => api.get('/auth/me').then((r) => r.data),
  updateProfile: (body) => api.put('/auth/me', body).then((r) => r.data),
  changePassword: (body) => api.post('/auth/change-password', body).then((r) => r.data),
};

export const userService = {
  list: (params) => api.get('/users', { params }).then((r) => r.data),
  create: (body) => api.post('/users', body).then((r) => r.data),
  update: (id, body) => api.put(`/users/${id}`, body).then((r) => r.data),
  resetPassword: (id, new_password) => api.post(`/users/${id}/reset-password`, { new_password }).then((r) => r.data),
  doctors: () => api.get('/users/doctors').then((r) => r.data),
};

export const auditService = {
  list: (params) => api.get('/audit-logs', { params }).then((r) => r.data),
  facets: () => api.get('/audit-logs/facets').then((r) => r.data),
};

export const configService = {
  get: () => api.get('/config').then((r) => r.data),
};
