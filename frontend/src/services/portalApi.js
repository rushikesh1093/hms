import axios from 'axios';

/**
 * API client for the patient portal. Kept separate from the staff client: patients have
 * their own token type, which staff endpoints reject. The token is kept in sessionStorage
 * so it survives a page refresh but is cleared when the tab is closed.
 */
const KEY = 'hms_portal_token';

const portalApi = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL || '/api'}/portal`,
  timeout: 30000,
});

let onExpired = () => {};

function readToken() {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setPortalToken(token) {
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the session simply won't survive a refresh */
  }
}

export function hasPortalToken() {
  return Boolean(readToken());
}

export function setPortalExpiredHandler(fn) {
  onExpired = fn;
}

portalApi.interceptors.request.use((config) => {
  const token = readToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

portalApi.interceptors.response.use(
  (res) => res,
  (error) => {
    const isLogin = error.config?.url?.includes('/login');
    if (error.response?.status === 401 && !isLogin) {
      setPortalToken(null);
      onExpired();
    }
    return Promise.reject(error);
  },
);

export const portalService = {
  async login(patientCode, password) {
    const { data } = await portalApi.post('/login', { patient_code: patientCode, password });
    setPortalToken(data.access_token);
    return data;
  },
  logout() {
    setPortalToken(null);
  },
  me: () => portalApi.get('/me').then((r) => r.data),
  checkups: () => portalApi.get('/checkups').then((r) => r.data),
  followups: () => portalApi.get('/followups').then((r) => r.data),
  changePassword: (current_password, new_password) =>
    portalApi.post('/change-password', { current_password, new_password }).then((r) => r.data),
  async openPdf(checkupId) {
    const win = window.open('', '_blank');
    try {
      const res = await portalApi.get(`/checkups/${checkupId}/pdf`, { responseType: 'blob' });
      const href = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      if (win) win.location.href = href;
      else window.location.href = href;
    } catch (e) {
      win?.close();
      throw e;
    }
  },
};

export default portalApi;
