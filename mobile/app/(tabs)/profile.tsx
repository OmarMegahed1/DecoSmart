import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { authClient } from "../../lib/auth-client";
import { Feather } from "@expo/vector-icons";
import { getEmailVerificationCallbackUrl } from "../../lib/email-verification-redirect";

export default function ProfileScreen() {
  const { data: session, refetch } = authClient.useSession();
  const [name, setName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [sendingEmailChange, setSendingEmailChange] = useState(false);

  const currentEmail = session?.user?.email ?? "";

  useEffect(() => {
    setName(session?.user?.name ?? "");
  }, [session?.user?.name]);

  const onSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Please enter your name.");
      return;
    }

    try {
      setSavingName(true);
      const { error } = await authClient.updateUser({ name: trimmed });
      if (error) {
        throw new Error(error.message || "Failed to update name");
      }
      await refetch();
      Alert.alert("Saved", "Your name has been updated.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not update name.";
      Alert.alert("Update failed", message);
    } finally {
      setSavingName(false);
    }
  };

  const onRequestEmailChange = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Email required", "Enter the new email address.");
      return;
    }
    if (trimmed === currentEmail.toLowerCase()) {
      Alert.alert("Same email", "That is already your sign-in email.");
      return;
    }

    try {
      setSendingEmailChange(true);
      const { error } = await authClient.changeEmail({
        newEmail: trimmed,
        callbackURL: getEmailVerificationCallbackUrl(),
      });
      if (error) {
        throw new Error(error.message || "Could not start email change");
      }

      setNewEmail("");
      Alert.alert(
        "Check your inbox",
        `We sent a verification link to ${trimmed}. Your sign-in email updates only after you open that link. ` +
          `If that address is already used by another account, you will not receive a message (for privacy).`,
      );
      await refetch();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not request email change.";
      Alert.alert("Email change failed", message);
    } finally {
      setSendingEmailChange(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.avatarCircle}>
        <Feather name="user" size={46} color="#C46A4A" />
      </View>

      <Text style={styles.userName}>{session?.user?.name ?? "Designer"}</Text>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Display name</Text>
        <Text style={styles.helper}>Updates as soon as you save.</Text>
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor="#8B7E74"
        />
        <Pressable style={styles.primaryBtn} onPress={onSaveName} disabled={savingName}>
          {savingName ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Save name</Text>
          )}
        </Pressable>
      </View>

      <View style={[styles.formCard, styles.formCardSpaced]}>
        <Text style={styles.sectionTitle}>Sign-in email</Text>
        <Text style={styles.helper}>
          We email a verification link to the new address. Your sign-in email only changes after you confirm.
        </Text>
        <Text style={styles.label}>Current</Text>
        <View style={styles.readonlyBox}>
          <Text style={styles.readonlyText}>{currentEmail || "—"}</Text>
        </View>

        <Text style={styles.label}>New email</Text>
        <TextInput
          value={newEmail}
          onChangeText={setNewEmail}
          style={styles.input}
          placeholder="future@example.com"
          placeholderTextColor="#8B7E74"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Pressable
          style={styles.secondaryBtn}
          onPress={onRequestEmailChange}
          disabled={sendingEmailChange}
        >
          {sendingEmailChange ? (
            <ActivityIndicator color="#C46A4A" />
          ) : (
            <Text style={styles.secondaryBtnText}>Send verification link</Text>
          )}
        </Pressable>
      </View>

      <Pressable style={styles.logoutBtn} onPress={() => authClient.signOut()}>
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F5EFE6",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 36,
    alignItems: "center",
  },
  avatarCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: "rgba(196,106,74,0.2)",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  userName: {
    marginTop: 14,
    fontSize: 28,
    fontWeight: "800",
    color: "#3A2F2A",
  },
  formCard: {
    width: "100%",
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(196,106,74,0.12)",
    padding: 16,
  },
  formCardSpaced: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#3A2F2A",
    marginBottom: 6,
  },
  helper: {
    fontSize: 12,
    color: "#6B5B50",
    lineHeight: 17,
    marginBottom: 12,
  },
  label: {
    color: "#3A2F2A",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#F5EFE6",
    borderWidth: 1,
    borderColor: "#E7DED4",
    paddingHorizontal: 14,
    color: "#3A2F2A",
    fontSize: 15,
    marginBottom: 14,
  },
  readonlyBox: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: "#faf7f3",
    borderWidth: 1,
    borderColor: "#E7DED4",
    paddingHorizontal: 14,
    justifyContent: "center",
    marginBottom: 14,
  },
  readonlyText: {
    color: "#3A2F2A",
    fontSize: 15,
  },
  primaryBtn: {
    marginTop: 0,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#C46A4A",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  secondaryBtn: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(196,106,74,0.45)",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: "#C46A4A",
    fontWeight: "800",
    fontSize: 16,
  },
  logoutBtn: {
    marginTop: 18,
    width: "100%",
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.3)",
    backgroundColor: "rgba(220,38,38,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutText: {
    color: "#B91C1C",
    fontWeight: "700",
    fontSize: 16,
  },
});
