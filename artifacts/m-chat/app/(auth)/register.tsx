import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  ScrollView, Platform
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { apiRequest } from "@/utils/api";

export default function RegisterScreen() {
  const { theme } = useTheme();
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleRegister = async () => {
    if (!username.trim() || !password.trim() || !displayName.trim()) {
      setError("Please fill all fields");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
          displayName: displayName.trim(),
        }),
      });
      await login(data.token, data.user);
      router.dismissAll();
    } catch (e: any) {
      setError(e.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    scroll: { flex: 1 },
    inner: {
      paddingHorizontal: 28,
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 48),
      paddingBottom: insets.bottom + 40,
    },
    backBtn: { marginBottom: 24 },
    title: { fontSize: 26, fontWeight: "700" as const, color: theme.text, fontFamily: "Inter_700Bold", marginBottom: 6 },
    sub: { fontSize: 14, color: theme.textSecondary, fontFamily: "Inter_400Regular", marginBottom: 32 },
    label: { fontSize: 13, color: theme.textSecondary, fontFamily: "Inter_500Medium", marginBottom: 8, marginTop: 20 },
    inputRow: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: theme.inputBg, borderWidth: 1,
      borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14,
    },
    input: { flex: 1, height: 50, fontSize: 16, color: theme.text, fontFamily: "Inter_400Regular" },
    hint: { fontSize: 12, color: theme.textMuted, fontFamily: "Inter_400Regular", marginTop: 4 },
    errorText: { color: theme.danger, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 12, textAlign: "center" },
    btn: {
      marginTop: 32, backgroundColor: theme.primary, borderRadius: 14,
      height: 54, alignItems: "center", justifyContent: "center",
    },
    btnText: { color: theme.isDark ? "#000" : "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
    footer: { flexDirection: "row", justifyContent: "center", marginTop: 24, gap: 6 },
    footerText: { color: theme.textSecondary, fontFamily: "Inter_400Regular", fontSize: 14 },
    footerLink: { color: theme.primary, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  });

  return (
    <View style={s.container}>
      <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.inner}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color={theme.text} />
          </Pressable>

          <Text style={s.title}>Create Account</Text>
          <Text style={s.sub}>Join M Chat — no phone number needed</Text>

          <Text style={s.label}>Display Name</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder="Your name"
              placeholderTextColor={theme.textMuted}
              value={displayName}
              onChangeText={setDisplayName}
            />
          </View>

          <Text style={s.label}>Username</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder="e.g. allanmatt123"
              placeholderTextColor={theme.textMuted}
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Text style={s.hint}>Letters, numbers and underscores only</Text>

          <Text style={s.label}>Password</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder="Min. 6 characters"
              placeholderTextColor={theme.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
            />
            <Pressable onPress={() => setShowPass(!showPass)}>
              <Feather name={showPass ? "eye-off" : "eye"} size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          {!!error && <Text style={s.errorText}>{error}</Text>}

          <Pressable style={s.btn} onPress={handleRegister} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={theme.isDark ? "#000" : "#fff"} />
            ) : (
              <Text style={s.btnText}>Create Account</Text>
            )}
          </Pressable>

          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account?</Text>
            <Pressable onPress={() => router.replace("/(auth)/login")}>
              <Text style={s.footerLink}>Sign In</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
