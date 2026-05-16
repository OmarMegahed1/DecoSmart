import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { getPasswordResetRedirectTo } from "../../lib/password-reset-redirect";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert("Email required", "Enter the email you used to sign up.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email: trimmed,
        redirectTo: getPasswordResetRedirectTo(),
      });

      if (error) {
        throw new Error(error.message || "Could not send reset email.");
      }

      setSent(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      Alert.alert("Request failed", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Pressable style={styles.backRow} onPress={() => router.replace("/(auth)/login")} hitSlop={12}>
          <Feather name="arrow-left" size={20} color="#3e2f28" />
          <Text style={styles.backText}>Back to sign in</Text>
        </Pressable>

        <Text style={styles.title}>Forgot password</Text>
        <Text style={styles.subtitle}>
          {sent
            ? "If an account exists for that email, we sent a link. Open it on this device to choose a new password."
            : "We’ll email you a secure link to reset your password. For privacy, we don’t confirm whether the email is registered."}
        </Text>

        {sent ? null : (
          <>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="name@example.com"
              placeholderTextColor="#78716c"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />

            <Pressable
              style={styles.primaryButton}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.primaryText}>Send reset link</Text>
              )}
            </Pressable>
          </>
        )}

        {sent ? (
          <Pressable style={styles.secondaryBtn} onPress={() => router.replace("/(auth)/login")}>
            <Text style={styles.secondaryBtnText}>Return to sign in</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5efe6",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  backText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#3e2f28",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#3e2f28",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#57534e",
    lineHeight: 22,
    marginBottom: 20,
  },
  label: {
    color: "#3e2f28",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#eae3d6",
    color: "#3e2f28",
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 16,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: "#c46a4a",
    borderRadius: 8,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryBtn: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#c46a4a",
    fontSize: 15,
    fontWeight: "700",
  },
});
