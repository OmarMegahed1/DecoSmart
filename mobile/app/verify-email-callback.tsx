import { useEffect, useMemo } from "react";
import { View, ActivityIndicator, StyleSheet, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { authClient } from "../lib/auth-client";

function friendlyVerificationError(code: string | undefined): string {
  const c = (code ?? "").toUpperCase();
  if (!c) {
    return "We could not verify your email. Try requesting a new link from Profile.";
  }
  if (c.includes("TOKEN_EXPIRED") || c === "TOKEN_EXPIRED") {
    return "This link has expired. Open Profile and send a new verification email.";
  }
  if (c.includes("INVALID_TOKEN") || c === "INVALID_TOKEN") {
    return "This link is invalid or was already used. Try sending a new verification email from Profile.";
  }
  if (c.includes("USER_NOT_FOUND")) {
    return "We could not find your account. Sign in again or contact support.";
  }
  return `Verification failed (${code}). Try again from Profile.`;
}

export default function VerifyEmailCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ error?: string | string[] }>();
  const { refetch } = authClient.useSession();

  const errorCode = useMemo(() => {
    const e = params.error;
    if (typeof e === "string") return e;
    if (Array.isArray(e)) return e[0];
    return undefined;
  }, [params.error]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await refetch();
      } catch {
        Alert.alert(
          "Could not refresh session",
          "Your email may still be verified. Try signing out and back in, or pull to refresh on Profile.",
          [{ text: "OK", onPress: () => router.replace("/(tabs)/profile") }],
        );
        return;
      }
      if (!alive) return;

      if (errorCode) {
        Alert.alert("Email verification", friendlyVerificationError(errorCode), [
          { text: "OK", onPress: () => router.replace("/(tabs)/profile") },
        ]);
      } else {
        Alert.alert(
          "Email verified",
          "Your account email is updated when verification succeeds. If it still looks wrong, pull to refresh or sign out and back in.",
          [{ text: "OK", onPress: () => router.replace("/(tabs)/profile") }],
        );
      }
    })();

    return () => {
      alive = false;
    };
  }, [errorCode, refetch, router]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color="#c46b4a" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#F5EFE6",
    alignItems: "center",
    justifyContent: "center",
  },
});
