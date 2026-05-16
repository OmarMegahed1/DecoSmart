import * as Linking from "expo-linking";
import { Platform } from "react-native";

/**
 * Where Better Auth redirects after the user taps the email link (`?token=` or `?error=`).
 *
 * Priority:
 * 1. `EXPO_PUBLIC_PASSWORD_RESET_REDIRECT` if set (HTTPS universal link or bridge URL).
 * 2. **Web:** `Linking.createURL("/reset-password")` so the link opens in the browser with the token
 *    (the mobile bridge only emits `decor-ai://` and would strand web users).
 * 3. If `EXPO_PUBLIC_API_URL` is **https**, `${api}/reset-mobile-bridge` (native store builds / mail clients).
 * 4. Otherwise `Linking.createURL("/reset-password")` (native dev / http API).
 */
export function getPasswordResetRedirectTo(): string {
  const explicit = process.env.EXPO_PUBLIC_PASSWORD_RESET_REDIRECT?.trim();
  if (explicit) return explicit;

  if (Platform.OS === "web") {
    return Linking.createURL("/reset-password");
  }

  const api = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (api && /^https:\/\//i.test(api)) {
    return `${api.replace(/\/$/, "")}/reset-mobile-bridge`;
  }

  return Linking.createURL("/reset-password");
}
