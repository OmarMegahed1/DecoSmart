import * as Linking from "expo-linking";

/**
 * Where Better Auth redirects after the user taps the email link (`?token=` or `?error=`).
 *
 * Priority:
 * 1. `EXPO_PUBLIC_PASSWORD_RESET_REDIRECT` if set (HTTPS universal link or bridge URL).
 * 2. If `EXPO_PUBLIC_API_URL` is **https**, `${api}/reset-mobile-bridge` (store / production).
 * 3. Local dev: `Linking.createURL("/reset-password")` (direct deep link).
 */
export function getPasswordResetRedirectTo(): string {
  const explicit = process.env.EXPO_PUBLIC_PASSWORD_RESET_REDIRECT?.trim();
  if (explicit) return explicit;

  const api = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (api && /^https:\/\//i.test(api)) {
    return `${api.replace(/\/$/, "")}/reset-mobile-bridge`;
  }

  return Linking.createURL("/reset-password");
}
