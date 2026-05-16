import "../lib/textDefaults";
import { Slot, useRouter, useSegments, useRootNavigationState } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import * as SplashScreen from "expo-splash-screen";
import { authClient } from "../lib/auth-client";
import { useSessionRefetchOnAppFocus } from "../lib/useSessionRefetchOnAppFocus";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";

/** Keep the native splash visible until we know auth + navigation are ready. */
void SplashScreen.preventAutoHideAsync().catch(() => {});

/** Matches primary screens (gallery, profile, model-view). */
const APP_SCREEN_BACKGROUND = "#F5EFE6";

export default function RootLayout() {
  const { data: session, isPending, refetch } = authClient.useSession();
  useSessionRefetchOnAppFocus(refetch);
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();
  const routerRef = useRef(router);
  routerRef.current = router;

  // Stable primitives only — avoids object/array dependency churn loops.
  const routeGroup = segments[0];
  const sessionId = session?.user?.id ?? null;
  /** Only "(auth)" counts as the auth stack; missing `segments[0]` happens briefly during transitions. */
  const inAuthGroup = routeGroup === "(auth)";
  /** Deep link targets at repo root (not under `(auth)`), must work signed-out after email link. */
  const isPublicRootRoute =
    routeGroup === "verify-email-callback" || routeGroup === "reset-password";
  /** Known route group outside (auth), e.g. "(tabs)", "room-picker" — not the in-between navigation state. */
  const outsideAuthGroup =
    routeGroup != null && routeGroup !== "(auth)" && !isPublicRootRoute;
  const navReady = !!navState?.key;

  /**
   * Auth redirect guard — **yes, this useEffect is needed** for Expo Router + client-side session:
   * there is no server middleware; the first paint can be the wrong stack (e.g. login vs tabs).
   * This syncs URL to session once navigation is mounted. Alternatives (per-route wrappers only)
   * still need the same decision somewhere; keeping it central avoids duplicated redirects.
   */
  useEffect(() => {
    if (!navReady) return;
    if (isPending) return;

    const target =
      sessionId && inAuthGroup
        ? "/(tabs)"
        : !sessionId && outsideAuthGroup
          ? "/(auth)/login"
          : null;

    if (!target) return;

    const delay = target === "/(auth)/login" ? 500 : 0;
    const timer = setTimeout(() => {
      routerRef.current.replace(target as any);
    }, delay);

    return () => clearTimeout(timer);
  }, [navReady, isPending, sessionId, routeGroup, inAuthGroup, outsideAuthGroup]);

  const showSpinner =
    !navReady ||
    isPending ||
    (!sessionId && outsideAuthGroup) ||
    (!!sessionId && inAuthGroup);

  /** Hide splash only once the router can show real UI (avoids splash → gated spinner flash). */
  useEffect(() => {
    if (showSpinner) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [showSpinner]);

  if (showSpinner) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={styles.loadingRoot}>
          <ActivityIndicator size="large" color="#c46b4a" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Slot />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: APP_SCREEN_BACKGROUND,
  },
});
