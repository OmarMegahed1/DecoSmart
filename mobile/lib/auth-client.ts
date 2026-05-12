import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { Platform } from "react-native";

const webHost =
  typeof window !== "undefined" && window.location?.hostname
    ? window.location.hostname
    : "localhost";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android"
    ? "http://10.0.2.2:4000"
    : Platform.OS === "web"
      ? `http://${webHost}:4000`
      : "http://localhost:4000");

if (
  __DEV__ &&
  Platform.OS !== "web" &&
  Constants.isDevice &&
  /http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(API_URL)
) {
  console.warn(
    "[Decor AI] Physical device + API_URL pointing at localhost — API calls will fail. " +
      "Set EXPO_PUBLIC_API_URL to http://<your-dev-machine-LAN-IP>:4000 in mobile/.env"
  );
}

export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: "/auth",
  /**
   * Use our `useSessionRefetchOnAppFocus` for focus refetches. The built-in session refresh
   * manager uses a separate `$fetch("/get-session")` path that can race during navigation and
   * briefly clear the session atom while segments are still settling.
   */
  sessionOptions: {
    refetchOnWindowFocus: false,
  },
  plugins:
    Platform.OS === "web"
      ? []
      : [
          expoClient({
            scheme: "decor-ai",
            storagePrefix: "decor-ai",
            storage: SecureStore,
          }),
        ],
});

/** Same backing store as `authClient.useSession()` — use after `refetch()` so navigation matches root layout. */
export function getSessionStoreSnapshot(): {
  data: { user?: { id: string } } | null;
  error: { message?: string } | null;
} {
  type Inner = {
    $store: {
      atoms: {
        session: {
          get: () => {
            data: { user?: { id: string } } | null;
            error: { message?: string } | null;
          };
        };
      };
    };
  };
  return (authClient as unknown as Inner).$store.atoms.session.get();
}
