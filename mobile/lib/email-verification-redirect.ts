import * as Linking from "expo-linking";
import { Platform } from "react-native";

/**
 * Where Better Auth redirects after `/auth/verify-email` (success or `?error=`).
 * Mirrors {@link ./password-reset-redirect} so mail clients get HTTPS in production native builds.
 */
export function getEmailVerificationCallbackUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_VERIFY_EMAIL_REDIRECT?.trim();
  if (explicit) return explicit;

  if (Platform.OS === "web") {
    return Linking.createURL("/verify-email-callback");
  }

  const api = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (api && /^https:\/\//i.test(api)) {
    return `${api.replace(/\/$/, "")}/verify-email-mobile-bridge`;
  }

  return Linking.createURL("/verify-email-callback");
}
