import api, { downloadFile, openPdf } from './api';
import { cleanParams } from '../utils/format';

export const checkupService = {
  list: (params) => api.get('/checkups', { params: cleanParams(params) }).then((r) => r.data),
  get: (id) => api.get(`/checkups/${id}`).then((r) => r.data),
  create: (body) => api.post('/checkups', body).then((r) => r.data),
  update: (id, body) => api.put(`/checkups/${id}`, body).then((r) => r.data),
  openPdf: (id) => openPdf(`/checkups/${id}/pdf`),
  downloadPdf: (id, code) => downloadFile(`/checkups/${id}/pdf`, undefined, `${code}.pdf`),
};

export const followupService = {
  list: (params) => api.get('/followups', { params: cleanParams(params) }).then((r) => r.data),
  counts: () => api.get('/followups/counts').then((r) => r.data),
  create: (body) => api.post('/followups', body).then((r) => r.data),
  update: (id, body) => api.put(`/followups/${id}`, body).then((r) => r.data),
};
