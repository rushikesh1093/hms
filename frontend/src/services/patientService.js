import api from './api';
import { cleanParams } from '../utils/format';

export const patientService = {
  list: (params) => api.get('/patients', { params: cleanParams(params) }).then((r) => r.data),
  get: (id) => api.get(`/patients/${id}`).then((r) => r.data),
  create: (body) => api.post('/patients', body).then((r) => r.data),
  update: (id, body) => api.put(`/patients/${id}`, body).then((r) => r.data),
  deactivate: (id) => api.delete(`/patients/${id}`).then((r) => r.data),
  restore: (id) => api.post(`/patients/${id}/restore`).then((r) => r.data),
  search: (q) => api.get('/patients/search', { params: { q } }).then((r) => r.data),
  checkDuplicates: (body) => api.post('/patients/check-duplicates', body).then((r) => r.data),
  checkups: (id) => api.get(`/patients/${id}/checkups`).then((r) => r.data),
  followups: (id) => api.get(`/patients/${id}/followups`).then((r) => r.data),
  portalAccess: (id) => api.get(`/patients/${id}/portal-access`).then((r) => r.data),
  setPortalPassword: (id, password) => api.put(`/patients/${id}/portal-access`, { password }).then((r) => r.data),
  disablePortal: (id) => api.delete(`/patients/${id}/portal-access`).then((r) => r.data),
};
