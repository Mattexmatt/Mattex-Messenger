import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, Dimensions, Image, Platform, ScrollView
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";

const { width, height } = Dimensions.get("window");

const HACKER_GREEN = "#00CC44";
const HACKER_GREEN_DARK = "#009933";
const HACKER_GREEN_DIM = "#00331A";
const BG_DARK = "#080C08";
const SURFACE = "#0F1A0F";
const BORDER = "#1A3320";
const TEXT = "#E8FFE8";
const TEXT_SUB = "#7ABF8A";
const TEXT_MUTED = "#3D6B4A";

export default function LoginScreen() {
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

  const topHeight = height * 0.42;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      bounces={false}
    >
      <View style={[s.topBlob, { height: topHeight, paddingTop: insets.top + (Platform.OS === "web" ? 80 : 24) }]}>
        <View style={s.iconWrap}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={s.icon}
            resizeMode="contain"
          />
        </View>
        <Text style={s.appName}>M Chat</Text>
        <Text style={s.tagline}>Secure messaging by Allan Matt Tech</Text>
      </View>

      <View style={[s.bottomCard, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={s.welcomeText}>Welcome back!</Text>
        <Text style={s.welcomeSub}>Sign in to continue</Text>

        <Text style={s.label}>Username</Text>
        <View style={s.inputRow}>
          <Feather name="user" size={16} color={TEXT_MUTED} style={{ marginRight: 10 }} />
          <TextInput
            style={s.input}
            placeholder="Enter your username"
            placeholderTextColor={TEXT_MUTED}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Text style={s.label}>Password</Text>
        <View style={s.inputRow}>
          <Feather name="lock" size={16} color={TEXT_MUTED} style={{ marginRight: 10 }} />
          <TextInput
            style={s.input}
            placeholder="Enter your password"
            placeholderTextColor={TEXT_MUTED}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPass}
          />
          <Pressable onPress={() => setShowPass(!showPass)} hitSlop={8}>
            <Feather name={showPass ? "eye-off" : "eye"} size={18} color={TEXT_SUB} />
          </Pressable>
        </View>

        {!!error && <Text style={s.errorText}>{error}</Text>}

        <Pressable style={s.btn} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={BG_DARK} />
          ) : (
            <Text style={s.btnText}>SIGN IN</Text>
          )}
        </Pressable>

        <View style={s.footer}>
          <Text style={s.footerText}>New here? </Text>
          <Pressable onPress={() => router.replace("/(auth)/register")}>
            <Text style={s.footerLink}>CREATE ACCOUNT</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  topBlob: {
    backgroundColor: HACKER_GREEN_DARK,
    borderBottomLeftRadius: width * 0.15,
    borderBottomRightRadius: width * 0.15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    shadowColor: HACKER_GREEN,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
    overflow: "hidden",
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: BG_DARK,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: HACKER_GREEN,
    shadowColor: HACKER_GREEN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  icon: {
    width: 68,
    height: 68,
    borderRadius: 16,
  },
  appName: {
    fontSize: 30,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  bottomCard: {
    flex: 1,
    backgroundColor: BG_DARK,
    paddingHorizontal: 28,
    paddingTop: 36,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: "700" as const,
    color: TEXT,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  welcomeSub: {
    fontSize: 14,
    color: TEXT_SUB,
    fontFamily: "Inter_400Regular",
    marginBottom: 28,
  },
  label: {
    fontSize: 12,
    color: TEXT_SUB,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
    textTransform: "uppercase" as const,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 52,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: TEXT,
    fontFamily: "Inter_400Regular",
  },
  errorText: {
    color: "#FF4444",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 12,
    textAlign: "center",
  },
  btn: {
    marginTop: 28,
    backgroundColor: HACKER_GREEN,
    borderRadius: 10,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: HACKER_GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  btnText: {
    color: BG_DARK,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  footerText: {
    color: TEXT_MUTED,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  footerLink: {
    color: HACKER_GREEN,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
