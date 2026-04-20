import axios from "axios";

export const TOKEN_KEY = "auth_access_token";

const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const API_BASE = RAW_API_BASE.replace(/\/+$/, "");

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setAuthHeader(config, token) {
  config.headers = config.headers ?? {};

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    delete config.headers.Authorization;
  }

  return config;
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000, // default for normal requests
});

// General request interceptor
api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();

    // For long streaming endpoints, do not let axios kill the request too early
    // 0 means no timeout in axios
    if (config.url?.includes("/ask/stream")) {
      config.timeout = 0;
    }

    return setAuthHeader(config, token);
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Keep the original error behavior.
    // Do NOT auto-clear token here.
    // Let AuthContext decide what to do with 401s.
    return Promise.reject(error);
  }
);

export function saveAccessToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAccessToken() {
  return getStoredToken();
}

export default api;
