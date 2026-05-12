import { Redirect, Slot } from "expo-router";
import { authClient } from "../../lib/auth-client";
import { ActivityIndicator, StyleSheet, View } from "react-native";

const AUTH_BG = "#F5EFE6";

export default function AuthLayout() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <View style={styles.pendingRoot}>
        <ActivityIndicator size="large" color="#c46b4a" />
      </View>
    );
  }

  if (session?.user) {
    return <Redirect href="/(tabs)" />;
  }

  return <Slot />;
}

const styles = StyleSheet.create({
  pendingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AUTH_BG,
  },
});
