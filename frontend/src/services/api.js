import axios from 'axios';

/**
 * Shared Axios instance.
 * - The access token lives only in memory (never localStorage) to limit XSS exposure.
 * - The refresh token is an httpOnly cookie handled by the browser.
 * - A 401 triggers one silent refresh (shared by concurrent requests) and a retry.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  timeout: 30000,
});

let accessToken = null;
let refreshPromise = null;
let onSessionExpired = () => {};

export function setAccessToken(token) {
  accessToken = token;
}

export function setSessionExpiredHandler(fn) {
  onSessionExpired = fn;
}

export function refreshSession() {
  if (!refreshPromise) {
    const call = () => axios.post(`${api.defaults.baseURL}/auth/refresh`, null, { withCredentials: true });
    refreshPromise = call()
      .catch(async (err) => {
        // Another tab rotated the cookie a moment ago; the browser now holds the new one.
        if (err.response?.data?.error?.code === 'refresh_race') {
          await new Promise((r) => setTimeout(r, 400));
          return call();
        }
        throw err;
      })
      .then((res) => {
        accessToken = res.data.access_token;
        return res.data;
      })
      .finally(() => {
        // Keep the resolved promise briefly so near-simultaneous callers reuse it.
        setTimeout(() => {
          refreshPromise = null;
        }, 1000);
      });
  }
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isAuthCall = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');
    if (status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        await refreshSession();
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        accessToken = null;
        onSessionExpired();
      }
    }
    return Promise.reject(error);
  },
);

/** Human-readable message from an API error ({error: {message, details}}). */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  if (error.code === 'ECONNABORTED') return 'The server took too long to respond.';
  if (!error.response) return 'Cannot reach the server. Check your connection.';
  const body = error.response.data;
  if (body?.error) {
    const { message, details } = body.error;
    if (Array.isArray(details) && details.length && details[0]?.message && details[0]?.field !== undefined) {
      return details.map((d) => (d.field ? `${humanize(d.field)}: ${d.message}` : d.message)).join(' • ');
    }
    return message || fallback;
  }
  return fallback;
}

export function getErrorCode(error) {
  return error?.response?.data?.error?.code;
}

/** Map API validation details onto react-hook-form fields. Returns true if any matched. */
export function applyFieldErrors(error, setError) {
  const details = error?.response?.data?.error?.details;
  if (!Array.isArray(details)) return false;
  let matched = false;
  details.forEach((d) => {
    if (d.field) {
      setError(d.field, { type: 'server', message: d.message });
      matched = true;
    }
  });
  return matched;
}

function humanize(field) {
  return field.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Download a binary API response (PDF/Excel/CSV) using the server-provided filename. */
export async function downloadFile(url, params, fallbackName) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const disposition = res.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const name = match ? match[1] : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Open a PDF from the API in a new tab (for viewing/printing). */
export async function openPdf(url) {
  const win = window.open('', '_blank');
  try {
    const res = await api.get(url, { responseType: 'blob' });
    const href = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    if (win) win.location.href = href;
    else window.location.href = href;
  } catch (e) {
    win?.close();
    throw e;
  }
}

export default api;
