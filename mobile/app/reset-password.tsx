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
import { useState, useMemo } from "react";
import { authClient } from "../lib/auth-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

/**
 * Lives outside `(auth)` so a signed-in user opening the email reset link is not
 * redirected to the home tab by `app/(auth)/_layout.tsx` before entering a new password.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; error?: string }>();

  const token = useMemo(() => {
    const t = params.token;
    return typeof t === "string" ? t : Array.isArray(t) ? t[0] : undefined;
  }, [params.token]);

  const queryError = useMemo(() => {
    const e = params.error;
    return typeof e === "string" ? e : Array.isArray(e) ? e[0] : undefined;
  }, [params.error]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const tokenInvalid =
    queryError === "INVALID_TOKEN" || queryError?.toLowerCase().includes("invalid");

  const handleSubmit = async () => {
    if (!token) {
      Alert.alert("Invalid link", "Open the reset link from your email again.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Password too short", "Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Mismatch", "Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (error) {
        throw new Error(error.message || "Could not reset password.");
      }

      setPassword("");
      setConfirm("");
      router.replace({ pathname: "/(auth)/login", params: { passwordReset: "1" } });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      Alert.alert("Reset failed", message);
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

        <Text style={styles.title}>Set new password</Text>

        {tokenInvalid || (!token && queryError) ? (
          <Text style={styles.subtitle}>
            This reset link is invalid or has expired. Request a new one from the sign-in screen.
          </Text>
        ) : !token ? (
          <Text style={styles.subtitle}>
            Missing reset token. Open the link from your email on this device, or request a new reset email.
          </Text>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Choose a new password (at least 8 characters). You’ll be signed out of other devices.
            </Text>

            <Text style={styles.label}>New password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                placeholder="At least 8 characters"
                placeholderTextColor="#78716c"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                autoComplete="new-password"
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeButton}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={18} color="#78716c" />
              </Pressable>
            </View>

            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              style={styles.input}
              placeholder="Repeat password"
              placeholderTextColor="#78716c"
              secureTextEntry={!showPassword}
              value={confirm}
              onChangeText={setConfirm}
              autoComplete="new-password"
            />

            <Pressable
              style={styles.primaryButton}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.primaryText}>Update password</Text>
              )}
            </Pressable>
          </>
        )}
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
    marginBottom: 16,
  },
  label: {
    color: "#3e2f28",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: "#eae3d6",
    color: "#3e2f28",
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 16,
    marginBottom: 8,
  },
  passwordWrap: {
    backgroundColor: "#eae3d6",
    borderRadius: 8,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  passwordInput: {
    flex: 1,
    color: "#3e2f28",
    fontSize: 16,
  },
  eyeButton: {
    padding: 4,
  },
  primaryButton: {
    backgroundColor: "#c46a4a",
    borderRadius: 8,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
  },
  primaryText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
});
