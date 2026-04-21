import { Slot, useRouter, useSegments, useRootNavigationState } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { authClient } from "../lib/auth-client";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import "../global.css";

export default function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();
  const routerRef = useRef(router);
  routerRef.current = router;

  // Stable primitives only — avoids object/array dependency churn loops.
  const segmentsKey = segments[0] ?? "";
  const sessionId = session?.user?.id ?? null;
  const inAuthGroup = segmentsKey === "(auth)";
  const navReady = !!navState?.key;

  useEffect(() => {
    if (!navReady) return;
    if (isPending) return;

    const target =
      sessionId && inAuthGroup
        ? "/(tabs)"
        : !sessionId && !inAuthGroup
        ? "/(auth)/login"
        : null;

    if (!target) return;

    const delay = target === "/(auth)/login" ? 500 : 0;
    const timer = setTimeout(() => {
      routerRef.current.replace(target as any);
    }, delay);

    return () => clearTimeout(timer);
  }, [navReady, isPending, sessionId, segmentsKey, inAuthGroup]);

  const showSpinner = !navReady || isPending || (!sessionId && !inAuthGroup) || (!!sessionId && inAuthGroup);

  if (showSpinner) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-900" style={styles.loadingRoot}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Slot />
    </>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
  },
});
