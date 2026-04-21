import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
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

export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: "/auth",
  plugins:
    Platform.OS === "web"
      ? []
      : [
          expoClient({
            scheme: "decor-ai",
            storage: SecureStore,
          }),
        ],
});
