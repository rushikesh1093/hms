import api, { downloadFile } from './api';
import { cleanParams } from '../utils/format';

const EXT = { pdf: 'pdf', excel: 'xlsx', csv: 'csv' };

export const reportService = {
  dashboard: (params) => api.get('/reports/dashboard', { params: cleanParams(params) }).then((r) => r.data),
  generate: (params) => api.get('/reports/generate', { params: cleanParams(params) }).then((r) => r.data),
  export: (format, params) =>
    downloadFile(`/reports/export/${format}`, cleanParams(params), `${params.report_type}.${EXT[format]}`),
};
