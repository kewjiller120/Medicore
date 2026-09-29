import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// The access token lives only in memory (a module-level variable), never
// in localStorage/sessionStorage - that limits what an XSS bug could steal.
// It's lost on a hard page refresh, which is exactly why AuthContext does a
// silent POST /auth/refresh on mount (using the httpOnly refresh cookie) to
// get a fresh one transparently.
let accessToken = null;
let onUnauthorized = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/** Registered once by AuthContext - called when refresh-on-401 itself fails, so the app can drop back to the login screen. */
export function setOnUnauthorized(fn) {
  onUnauthorized = fn;
}

const client = axios.create({
  baseURL,
  withCredentials: true, // send the httpOnly refresh-token cookie
});

client.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Concurrent requests that all 401 at once should trigger only ONE refresh
// call, not one per request - this dedupes them.
let refreshPromise = null;

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isAuthEndpoint =
      original?.url?.includes('/auth/refresh') || original?.url?.includes('/auth/login');

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${baseURL}/auth/refresh`, {}, { withCredentials: true })
            .finally(() => {
              refreshPromise = null;
            });
        }
        const { data } = await refreshPromise;
        setAccessToken(data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return client(original);
      } catch (refreshError) {
        setAccessToken(null);
        if (onUnauthorized) onUnauthorized();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

/** Pulls a clean, displayable message out of any API error shape. */
export function apiErrorMessage(err) {
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.response?.data?.details?.length) {
    return err.response.data.details.map((d) => d.message).join('; ');
  }
  if (err?.message) return err.message;
  return 'Something went wrong';
}

export default client;
