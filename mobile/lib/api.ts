import { Platform } from "react-native";
import { API_URL, authClient } from "./auth-client";

type AuthClientWithCookie = {
  getCookie?: () => string | null | undefined;
};

/** Normalize backend error JSON: top-level `error`, Zod-style `details` / legacy `errors`, or dev `details` string. */
export function formatApiErrorPayload(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const o = data as Record<string, unknown>;

  const fieldMessages: string[] = [];
  const pushIssueRows = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (typeof item !== "object" || item === null) continue;
      const row = item as Record<string, unknown>;
      const field = typeof row.field === "string" ? row.field : "";
      const message = typeof row.message === "string" ? row.message : "";
      if (field && message) fieldMessages.push(`${field}: ${message}`);
      else if (message) fieldMessages.push(message);
    }
  };
  pushIssueRows(o.details);
  pushIssueRows(o.errors);

  let extra = "";
  const rawDetails = o.details;
  if (typeof rawDetails === "string" && rawDetails.trim() && fieldMessages.length === 0) {
    extra = rawDetails.trim();
  }

  const err = o.error;
  const head = typeof err === "string" && err.trim() ? err.trim() : null;

  if (fieldMessages.length > 0) {
    const joined = fieldMessages.join("; ");
    return head ? `${head} — ${joined}` : joined;
  }
  if (extra) return head ? `${head} — ${extra}` : extra;
  return head ?? fallback;
}

export async function readApiErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await res.json();
    return formatApiErrorPayload(data, fallback);
  } catch {
    /* ignore non-JSON body */
  }
  return fallback;
}

/**
 * Authenticated fetch to the API.
 * - **Web:** browser cookie jar + `credentials: "include"`.
 * - **Native:** Better Auth stores session cookies in SecureStore; send them via `Cookie`
 *   and use `credentials: "omit"` so RN does not fight manual headers (Better Auth Expo docs).
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${API_URL}${endpoint}`;

  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (!isFormData && !headers.has("Content-Type") && options.method && options.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  if (Platform.OS === "web") {
    return fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });
  }

  const getCookie = (authClient as AuthClientWithCookie).getCookie;
  const cookieHeader = typeof getCookie === "function" ? getCookie() : null;
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: "omit",
  });
}
