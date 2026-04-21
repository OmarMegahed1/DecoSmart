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
} from "react-native";
import { Image } from "expo-image";
import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();

  const handleSubmit = async () => {
    setLoading(true);
    setError("");

    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
      });
      if (signInError) throw new Error(signInError.message || "Failed to sign in");
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={styles.spacer} />
        <Text style={styles.brand}>Deco-Smart</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.logoSection}>
        <View style={styles.ringLarge}>
          <View style={styles.ringSmall}>
            <View style={styles.logoCard}>
              <Image
                source={require("../../assets/Logo Frame.svg")}
                style={styles.logoImage}
                contentFit="contain"
              />
            </View>
          </View>
        </View>

        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue to your smart home</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="name@example.com"
          placeholderTextColor="#78716c"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <View style={styles.passwordHeader}>
          <Text style={styles.label}>Password</Text>
          <Pressable>
            <Text style={styles.forgot}>Forgot?</Text>
          </Pressable>
        </View>

        <View style={styles.passwordWrap}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Enter your password"
            placeholderTextColor="#78716c"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeButton}>
            <Feather name={showPassword ? "eye-off" : "eye"} size={18} color="#78716c" />
          </Pressable>
        </View>

        <Pressable style={styles.rememberRow} onPress={() => setRemember((v) => !v)}>
          <View style={[styles.checkbox, remember && styles.checkboxChecked]} />
          <Text style={styles.rememberText}>Remember me for 30 days</Text>
        </Pressable>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          style={styles.primaryButton}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.primaryText}>Sign In</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.signupLinkWrap}
          onPress={() => router.push("/(auth)/signup")}
        >
          <Text style={styles.signupText}>
            Don't have an account? <Text style={styles.signupAccent}>Sign Up</Text>
          </Text>
        </Pressable>

      </View>
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
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  brand: {
    fontSize: 32,
    fontWeight: "700",
    color: "#3e2f28",
  },
  spacer: {
    width: 40,
    height: 40,
  },
  logoSection: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  ringLarge: {
    width: 240,
    height: 240,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(196,106,74,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  ringSmall: {
    width: 192,
    height: 192,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(196,106,74,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  logoCard: {
    width:200,
    height: 200,
    borderRadius: 16,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 0,
  },
  logoImage: {
    width: 250,
    height: 250,
    transform: [{ translateY: 23 }],
  },
  title: {
    marginTop: 12,
    fontSize: 48,
    fontWeight: "700",
    color: "#3e2f28",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 16,
    color: "#57534e",
  },
  form: {
    marginTop: 8,
    gap: 12,
  },
  label: {
    color: "#3e2f28",
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#eae3d6",
    color: "#3e2f28",
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 16,
  },
  passwordHeader: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  forgot: {
    color: "#c46a4a",
    fontSize: 14,
    fontWeight: "500",
  },
  passwordWrap: {
    backgroundColor: "#eae3d6",
    borderRadius: 8,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  passwordInput: {
    flex: 1,
    color: "#3e2f28",
    fontSize: 16,
  },
  eyeButton: {
    padding: 4,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(196,106,74,0.35)",
    backgroundColor: "#eae3d6",
  },
  checkboxChecked: {
    backgroundColor: "#c46a4a",
  },
  rememberText: {
    color: "#57534e",
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: "#b91c1c",
    textAlign: "center",
  },
  primaryText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  signupLinkWrap: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 2,
  },
  signupText: {
    color: "#57534e",
    fontSize: 14,
  },
  signupAccent: {
    color: "#c46a4a",
    fontWeight: "700",
  },
  primaryButton: {
    backgroundColor: "#c46a4a",
    borderRadius: 8,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#c46a4a",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
