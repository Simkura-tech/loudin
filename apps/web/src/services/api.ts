import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// In development, Vite proxy forwards /api → http://localhost:3000 (same-origin).
// In production, set VITE_API_BASE_URL to your API domain (or leave empty for same-origin).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface SuspensionError extends Error {
  suspended: boolean;
  error_code: string;
  suspension_reason?: string;
}

/** Errors thrown by the api wrapper preserve the server's status + code so
 *  callers can branch on specific failure modes. */
export interface ApiError extends Error {
  status?: number;
  code?:   string;
  /** Server-supplied `details` payload — e.g. { fields: { line1: '…' } }
   *  for form validation errors. Shape is endpoint-specific. */
  details?: unknown;
}

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,   // Send httpOnly cookies with every request
  timeout: 10000,
});

// The instance defaults to `Content-Type: application/json`. For FormData
// bodies that default is actively harmful: axios 1.x sees the JSON header,
// serializes the FormData to JSON, and drops any File. Strip the header so
// axios detects FormData and sets `multipart/form-data` with a boundary.
// (Also handles company context here later once multi-company is reintroduced.)
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      config.headers.delete('Content-Type');
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<{
    message?: string;
    error?: string;
    error_code?: string;
    code?: string;
    details?: unknown;
    suspended?: boolean;
    suspension_reason?: string;
  }>) => {
    if (error.response) {
      // 401 → kick back to login. Skip for /api/auth/me so the AuthContext
      // can silently detect anonymous sessions on app load without looping.
      const requestUrl = error.config?.url || '';
      const isMeProbe = requestUrl.includes('/api/auth/me');
      if (error.response.status === 401 && !isMeProbe) {
        localStorage.removeItem('user');
        window.location.href = '/login';
      }

      // 403 + COMPANY_SUSPENDED → log out with reason preserved for the login screen
      if (
        error.response.status === 403 &&
        error.response.data?.error_code === 'COMPANY_SUSPENDED'
      ) {
        localStorage.removeItem('user');
        localStorage.setItem('account_suspended', 'true');
        if (error.response.data?.suspension_reason) {
          localStorage.setItem('suspension_reason', error.response.data.suspension_reason);
        }
        window.location.href = '/login';
        const suspensionError = new Error('Your account has been suspended') as SuspensionError;
        suspensionError.suspended = true;
        suspensionError.error_code = 'COMPANY_SUSPENDED';
        suspensionError.suspension_reason = error.response.data?.suspension_reason;
        return Promise.reject(suspensionError);
      }

      const message = error.response.data?.message
        || error.response.data?.error
        || 'An error occurred';
      const apiError: ApiError = new Error(message);
      apiError.status  = error.response.status;
      apiError.code    = error.response.data?.code || error.response.data?.error_code;
      apiError.details = error.response.data?.details;
      return Promise.reject(apiError);
    } else if (error.request) {
      return Promise.reject(new Error('No response from server. Please check your connection.'));
    } else {
      return Promise.reject(error);
    }
  },
);

export default api;
