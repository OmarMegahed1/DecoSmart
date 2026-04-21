import { API_URL, authClient } from "./auth-client";

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${API_URL}${endpoint}`;
  
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (!isFormData && !headers.has("Content-Type") && options.method && options.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  // The expo client plugin intercepts requests matching baseURL automatically
  // but we provide credentials to be sure.
  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
}
