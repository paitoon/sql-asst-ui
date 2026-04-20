import api, { TOKEN_KEY } from "./api";

export async function authorizedStreamFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem(TOKEN_KEY);

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const baseURL = api.defaults.baseURL || "";
  const url = `${baseURL}${path.startsWith("/") ? path : `/${path}`}`;

  return fetch(url, {
    ...options,
    headers,
  });
}
