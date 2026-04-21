import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

export default function SignupScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const onSignup = async () => {
    try {
      if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
        throw new Error("Please fill all required fields");
      }
      if (password !== confirmPassword) {
        throw new Error("Passwords do not match");
      }
      if (!agree) {
        throw new Error("Please agree to the Terms of Service and Privacy Policy");
      }

      setLoading(true);
      setError("");
      const { error } = await authClient.signUp.email({ name, email, password });
      if (error) throw new Error(error.message || "Sign up failed");
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sign up");
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
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.topIconButton}>
            <Feather name="x" size={20} color="#3d2b1f" />
          </Pressable>
          <View style={styles.brandWrap}>
            <View style={styles.logoBadge}>
              <Feather name="home" size={12} color="#c46b4a" />
            </View>
            <Text style={styles.brandText}>Deco-Smart</Text>
          </View>
          <View style={styles.topIconButton} />
        </View>

        <Image
          source={require("../../assets/BackgroundOverlayShadow.svg")}
          style={styles.heroImage}
          contentFit="contain"
          contentPosition="center"
        />

        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Start your journey to a smarter home today.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Full Name</Text>
          <View style={styles.inputWrap}>
            <Feather name="user" size={14} color="#9c8c7f" style={styles.leadingIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor="#9c8c7f"
              value={name}
              onChangeText={setName}
            />
          </View>

          <Text style={styles.label}>Email Address</Text>
          <View style={styles.inputWrap}>
            <Feather name="mail" size={14} color="#9c8c7f" style={styles.leadingIcon} />
            <TextInput
              style={styles.input}
              placeholder="example@email.com"
              placeholderTextColor="#9c8c7f"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrap}>
            <Feather name="lock" size={14} color="#9c8c7f" style={styles.leadingIcon} />
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#9c8c7f"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.inputWrap}>
            <Feather name="lock" size={14} color="#9c8c7f" style={styles.leadingIcon} />
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#9c8c7f"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          </View>

          <Pressable style={styles.termsRow} onPress={() => setAgree((v) => !v)}>
            <View style={[styles.termsBox, agree && styles.termsBoxChecked]} />
            <Text style={styles.termsText}>
              I agree to the <Text style={styles.termsAccent}>Terms of Service</Text> and <Text style={styles.termsAccent}>Privacy Policy</Text>.
            </Text>
          </Pressable>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable style={styles.signupButton} onPress={onSignup} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.signupButtonText}>Sign Up</Text>}
          </Pressable>

          <Pressable style={styles.signinRow} onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.signinText}>
              Already have an account? <Text style={styles.signinAccent}>Sign In</Text>
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
    backgroundColor: "#f7f3ed",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  topBar: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topIconButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  brandWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(196,107,74,0.2)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  brandText: {
    fontSize: 32,
    fontWeight: "700",
    color: "#3d2b1f",
  },
  heroImage: {
    width: "100%",
    height: 200,
    borderRadius: 16,
    marginTop: 8,
    overflow: "hidden",
  },
  title: {
    marginTop: 24,
    fontSize: 48,
    lineHeight: 56,
    textAlign: "center",
    color: "#3d2b1f",
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 8,
    textAlign: "center",
    color: "#7a6a5e",
    fontSize: 14,
  },
  form: {
    marginTop: 16,
    gap: 10,
  },
  label: {
    marginTop: 4,
    color: "#3d2b1f",
    fontWeight: "600",
    fontSize: 14,
  },
  inputWrap: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dcd2c7",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  leadingIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: "#3d2b1f",
    fontSize: 16,
  },
  termsRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  termsBox: {
    width: 20,
    height: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    marginTop: 2,
  },
  termsBoxChecked: {
    backgroundColor: "#8a9a5b",
    borderColor: "#8a9a5b",
  },
  termsText: {
    flex: 1,
    color: "#7a6a5e",
    fontSize: 14,
    lineHeight: 19,
  },
  termsAccent: {
    color: "#8a9a5b",
    fontWeight: "600",
  },
  errorBox: {
    marginTop: 6,
    backgroundColor: "rgba(220, 38, 38, 0.12)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
  },
  signupButton: {
    marginTop: 8,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#c46b4a",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#c46b4a",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  signupButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  signinRow: {
    marginTop: 26,
    alignItems: "center",
    paddingVertical: 12,
  },
  signinText: {
    color: "#7a6a5e",
    fontSize: 16,
  },
  signinAccent: {
    color: "#c46b4a",
    fontWeight: "700",
  },
});
