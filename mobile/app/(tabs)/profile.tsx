import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator, Alert, ScrollView } from "react-native";
import { authClient } from "../../lib/auth-client";
import { Feather } from "@expo/vector-icons";

export default function ProfileScreen() {
  const { data: session } = authClient.useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(session?.user?.name ?? "");
    setEmail(session?.user?.email ?? "");
  }, [session?.user?.name, session?.user?.email]);

  const onSave = async () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert("Missing fields", "Please enter both name and email.");
      return;
    }

    try {
      setSaving(true);
      const client = authClient as any;
      if (typeof client.updateUser === "function") {
        const res = await client.updateUser({ name: name.trim(), email: email.trim() });
        if (res?.error) throw new Error(res.error.message || "Failed to save profile");
      }
      Alert.alert("Saved", "Your profile has been updated.");
    } catch (e: any) {
      Alert.alert("Update failed", e?.message || "Could not update profile.");
    } finally {
      setSaving(false);
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
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor="#8B7E74"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor="#8B7E74"
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Pressable style={styles.saveBtn} onPress={onSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
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
  saveBtn: {
    marginTop: 4,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#C46A4A",
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#fff",
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
