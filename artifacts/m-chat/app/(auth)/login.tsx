import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { apiRequest } from "@/utils/api";

export default function LoginScreen() {
  const { theme } = useTheme();
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Please fill all fields");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      await login(data.token, data.user);
      router.dismissAll();
    } catch (e: any) {
      setError(e.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    inner: {
      flex: 1,
      paddingHorizontal: 28,
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 60),
      paddingBottom: insets.bottom + 20,
    },
    logo: {
      alignItems: "center",
      marginBottom: 48,
    },
    logoIcon: {
      width: 72, height: 72,
      borderRadius: 18,
      backgroundColor: theme.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    logoText: {
      fontSize: 28, fontWeight: "700" as const,
      color: theme.text, fontFamily: "Inter_700Bold",
    },
    logoSub: {
      fontSize: 14, color: theme.textSecondary,
      fontFamily: "Inter_400Regular", marginTop: 4,
    },
    label: {
      fontSize: 13, color: theme.textSecondary,
      fontFamily: "Inter_500Medium", marginBottom: 8, marginTop: 20,
    },
    inputRow: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: theme.inputBg,
      borderWidth: 1, borderColor: theme.border,
      borderRadius: 12, paddingHorizontal: 14,
    },
    input: {
      flex: 1, height: 50, fontSize: 16, color: theme.text,
      fontFamily: "Inter_400Regular",
    },
    errorText: {
      color: theme.danger, fontSize: 13,
      fontFamily: "Inter_400Regular", marginTop: 12, textAlign: "center",
    },
    btn: {
      marginTop: 32, backgroundColor: theme.primary,
      borderRadius: 14, height: 54,
      alignItems: "center", justifyContent: "center",
    },
    btnText: {
      color: theme.isDark ? "#000" : "#fff", fontSize: 16,
      fontFamily: "Inter_600SemiBold",
    },
    footer: {
      flexDirection: "row", justifyContent: "center",
      marginTop: 24, gap: 6,
    },
    footerText: { color: theme.textSecondary, fontFamily: "Inter_400Regular", fontSize: 14 },
    footerLink: { color: theme.primary, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  });

  return (
    <KeyboardAvoidingView style={s.container} behavior="padding">
      <View style={s.inner}>
        <View style={s.logo}>
          <View style={s.logoIcon}>
            <Feather name="message-circle" size={36} color={theme.isDark ? "#000" : "#fff"} />
          </View>
          <Text style={s.logoText}>M Chat</Text>
          <Text style={s.logoSub}>by Allan Matt Tech</Text>
        </View>

        <Text style={s.label}>Username</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Enter your username"
            placeholderTextColor={theme.textMuted}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Text style={s.label}>Password</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Enter your password"
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

        <Pressable style={s.btn} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={theme.isDark ? "#000" : "#fff"} />
          ) : (
            <Text style={s.btnText}>Sign In</Text>
          )}
        </Pressable>

        <View style={s.footer}>
          <Text style={s.footerText}>No account?</Text>
          <Pressable onPress={() => router.replace("/(auth)/register")}>
            <Text style={s.footerLink}>Sign Up</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
