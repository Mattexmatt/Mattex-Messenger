import React, { useState } from "react";
import {
  View, Text, Pressable, StyleSheet, Modal, TextInput,
  ScrollView, ActivityIndicator, Alert, Platform, Image, Switch
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";
import THEMES, { ThemeName } from "@/constants/colors";
import * as Haptics from "expo-haptics";

const THEME_OPTIONS: { key: ThemeName; label: string; emoji: string; colors: string[]; desc: string }[] = [
  { key: "midnight", label: "Midnight Hacker", emoji: "💀", colors: ["#080C08", "#00CC44", "#0F1A0F"], desc: "Dark green terminal" },
  { key: "synthwave", label: "Synthwave", emoji: "🌆", colors: ["#0D0015", "#FF2D78", "#3D0055"], desc: "Neon retro 80s vibes" },
  { key: "cyberpunk", label: "Cyberpunk", emoji: "⚡", colors: ["#0A0A0F", "#F5E642", "#00FFFF"], desc: "Yellow & cyan neon city" },
  { key: "ocean", label: "Deep Ocean", emoji: "🌊", colors: ["#020B18", "#00D4FF", "#00FFCC"], desc: "Bioluminescent depths" },
  { key: "volcanic", label: "Volcanic", emoji: "🌋", colors: ["#0C0500", "#FF6B00", "#FF9944"], desc: "Molten fire & ash" },
  { key: "galaxy", label: "Galaxy", emoji: "🌌", colors: ["#05020F", "#8B5CF6", "#FFD700"], desc: "Cosmic purple & gold" },
  { key: "arctic", label: "Arctic", emoji: "❄️", colors: ["#030E1A", "#4FC3F7", "#B3E5FC"], desc: "Ice-cold crystalline" },
];

export default function ProfileScreen() {
  const { theme, themeName, setTheme } = useTheme();
  const { user, token, logout, updateUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [showEdit, setShowEdit] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const updated = await apiRequest("/users/me", {
        method: "PUT",
        body: JSON.stringify({ displayName: displayName.trim(), avatarUrl: avatarUrl.trim() || null }),
      });
      updateUser(updated);
      setShowEdit(false);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSaving(false); }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => { logout(); router.replace("/(auth)/login"); } },
    ]);
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    scroll: { flex: 1 },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 24, backgroundColor: theme.background,
      alignItems: "center",
    },
    avatarLarge: {
      width: 88, height: 88, borderRadius: 44,
      backgroundColor: theme.primary, alignItems: "center", justifyContent: "center",
      marginBottom: 14, borderWidth: 3, borderColor: theme.accent,
    },
    avatarText: { fontSize: 36, fontFamily: "Inter_700Bold", color: theme.isDark ? "#000" : "#fff" },
    avatarImg: { width: 88, height: 88, borderRadius: 44 },
    userName: { fontSize: 22, fontWeight: "700" as const, color: theme.text, fontFamily: "Inter_700Bold" },
    userHandle: { fontSize: 14, color: theme.textSecondary, fontFamily: "Inter_400Regular", marginTop: 3 },
    ownerBadge: {
      marginTop: 8, backgroundColor: theme.primary, paddingHorizontal: 12,
      paddingVertical: 4, borderRadius: 10,
    },
    ownerText: { color: theme.isDark ? "#000" : "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
    section: { marginHorizontal: 16, marginTop: 16, borderRadius: 14, overflow: "hidden" as const, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
    row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, gap: 14 },
    rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    rowText: { flex: 1, fontSize: 16, color: theme.text, fontFamily: "Inter_400Regular" },
    rowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
    rowRightText: { fontSize: 14, color: theme.textSecondary, fontFamily: "Inter_400Regular" },
    sep: { height: 1, backgroundColor: theme.border, marginLeft: 64 },
    logoutRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, gap: 14 },
    versionText: { textAlign: "center", color: theme.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginVertical: 16 },

    modal: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 24,
    },
    sheetTitle: { fontSize: 20, fontWeight: "700" as const, color: theme.text, fontFamily: "Inter_700Bold", marginBottom: 20 },
    inputLabel: { fontSize: 13, color: theme.textSecondary, fontFamily: "Inter_500Medium", marginBottom: 8 },
    input: {
      backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14,
      paddingVertical: 12, fontSize: 15, color: theme.text,
      borderWidth: 1, borderColor: theme.border, fontFamily: "Inter_400Regular", marginBottom: 14,
    },
    saveBtn: { backgroundColor: theme.primary, borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center" },
    saveBtnText: { color: theme.isDark ? "#000" : "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
    grabber: { width: 40, height: 4, backgroundColor: theme.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 },

    themeOption: {
      flexDirection: "row", alignItems: "center", padding: 16,
      borderRadius: 12, marginBottom: 10, borderWidth: 1.5, gap: 14,
    },
    themeSwatches: { flexDirection: "row", gap: 4 },
    swatch: { width: 20, height: 20, borderRadius: 10 },
    themeLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium" },

    aboutBox: { alignItems: "center", paddingVertical: 20 },
    aboutLogo: {
      width: 64, height: 64, borderRadius: 16, backgroundColor: theme.primary,
      alignItems: "center", justifyContent: "center", marginBottom: 12,
    },
    aboutTitle: { fontSize: 22, fontWeight: "700" as const, color: theme.text, fontFamily: "Inter_700Bold" },
    aboutSub: { fontSize: 14, color: theme.textSecondary, fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "center" },
    aboutCredit: { marginTop: 16, padding: 14, backgroundColor: theme.surfaceElevated, borderRadius: 12, width: "100%" },
    aboutCreditText: { color: theme.text, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  });

  if (!user) {
    return (
      <View style={[s.container, { alignItems: "center", justifyContent: "center", gap: 16 }]}>
        <Ionicons name="person-circle-outline" size={72} color={theme.textMuted} />
        <Text style={{ color: theme.text, fontSize: 20, fontFamily: "Inter_600SemiBold" }}>Not signed in</Text>
        <Pressable
          style={{ backgroundColor: theme.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 }}
          onPress={() => router.push("/(auth)/login")}
        >
          <Text style={{ color: theme.isDark ? "#000" : "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" }}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
        <View style={s.header}>
          {user.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={s.avatarImg} />
          ) : (
            <View style={s.avatarLarge}>
              <Text style={s.avatarText}>{user.displayName[0].toUpperCase()}</Text>
            </View>
          )}
          <Text style={s.userName}>{user.displayName}</Text>
          <Text style={s.userHandle}>@{user.username}</Text>
          {user.isOwner && (
            <View style={s.ownerBadge}>
              <Text style={s.ownerText}>Owner · Allan Matt Tech</Text>
            </View>
          )}
        </View>

        <View style={s.section}>
          <Pressable style={s.row} onPress={() => { setDisplayName(user.displayName); setAvatarUrl(user.avatarUrl ?? ""); setShowEdit(true); }}>
            <View style={[s.rowIcon, { backgroundColor: `${theme.primary}22` }]}>
              <Feather name="edit-3" size={18} color={theme.primary} />
            </View>
            <Text style={s.rowText}>Edit Profile</Text>
            <Feather name="chevron-right" size={18} color={theme.textMuted} />
          </Pressable>
        </View>

        <View style={s.section}>
          <Pressable style={s.row} onPress={() => setShowTheme(true)}>
            <View style={[s.rowIcon, { backgroundColor: `${theme.accent}22` }]}>
              <Feather name="droplet" size={18} color={theme.accent} />
            </View>
            <Text style={s.rowText}>Chat Theme</Text>
            <View style={s.rowRight}>
              <Text style={s.rowRightText}>{THEMES[themeName].name}</Text>
              <Feather name="chevron-right" size={18} color={theme.textMuted} />
            </View>
          </Pressable>
          <View style={s.sep} />
          <Pressable style={s.row} onPress={() => setShowAbout(true)}>
            <View style={[s.rowIcon, { backgroundColor: `${theme.success}22` }]}>
              <Feather name="info" size={18} color={theme.success} />
            </View>
            <Text style={s.rowText}>About M Chat</Text>
            <Feather name="chevron-right" size={18} color={theme.textMuted} />
          </Pressable>
        </View>

        <View style={s.section}>
          <Pressable style={s.logoutRow} onPress={handleLogout}>
            <View style={[s.rowIcon, { backgroundColor: `${theme.danger}22` }]}>
              <Feather name="log-out" size={18} color={theme.danger} />
            </View>
            <Text style={[s.rowText, { color: theme.danger }]}>Sign Out</Text>
          </Pressable>
        </View>

        <Text style={s.versionText}>M Chat v1.0.0 · Allan Matt Tech</Text>
      </ScrollView>

      {/* Edit Profile Sheet */}
      <Modal visible={showEdit} animationType="slide" transparent onRequestClose={() => setShowEdit(false)}>
        <View style={s.modal}>
          <View style={s.sheet}>
            <View style={s.grabber} />
            <Text style={s.sheetTitle}>Edit Profile</Text>
            <Text style={s.inputLabel}>Display Name</Text>
            <TextInput style={s.input} value={displayName} onChangeText={setDisplayName} placeholder="Your name" placeholderTextColor={theme.textMuted} />
            <Text style={s.inputLabel}>Avatar URL (optional)</Text>
            <TextInput style={s.input} value={avatarUrl} onChangeText={setAvatarUrl} placeholder="https://..." placeholderTextColor={theme.textMuted} autoCapitalize="none" />
            <Pressable style={s.saveBtn} onPress={handleSaveProfile} disabled={saving}>
              {saving ? <ActivityIndicator color={theme.isDark ? "#000" : "#fff"} /> : <Text style={s.saveBtnText}>Save Changes</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Theme Selector Sheet */}
      <Modal visible={showTheme} animationType="slide" transparent onRequestClose={() => setShowTheme(false)}>
        <View style={s.modal}>
          <View style={s.sheet}>
            <View style={s.grabber} />
            <Text style={s.sheetTitle}>Choose Theme</Text>
            {THEME_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[s.themeOption, {
                  backgroundColor: themeName === opt.key ? `${theme.primary}22` : theme.surfaceElevated,
                  borderColor: themeName === opt.key ? theme.primary : theme.border,
                }]}
                onPress={() => { setTheme(opt.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowTheme(false); }}
              >
                <Text style={{ fontSize: 24 }}>{opt.emoji}</Text>
                <View style={s.themeSwatches}>
                  {opt.colors.map((c, i) => <View key={i} style={[s.swatch, { backgroundColor: c }]} />)}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.themeLabel, { color: theme.text, flex: 0, marginBottom: 2 }]}>{opt.label}</Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted, fontFamily: "Inter_400Regular" }}>{opt.desc}</Text>
                </View>
                {themeName === opt.key && <Feather name="check-circle" size={20} color={theme.primary} />}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      {/* About Sheet */}
      <Modal visible={showAbout} animationType="slide" transparent onRequestClose={() => setShowAbout(false)}>
        <View style={s.modal}>
          <View style={s.sheet}>
            <View style={s.grabber} />
            <View style={s.aboutBox}>
              <View style={s.aboutLogo}>
                <Feather name="message-circle" size={32} color={theme.isDark ? "#000" : "#fff"} />
              </View>
              <Text style={s.aboutTitle}>M Chat</Text>
              <Text style={s.aboutSub}>Mattex Chat · Next-Gen Messaging</Text>
              <View style={s.aboutCredit}>
                <Text style={s.aboutCreditText}>
                  M Chat is built and maintained by{"\n"}
                  <Text style={{ fontFamily: "Inter_700Bold", color: theme.primary }}>Allan Matt Tech</Text>
                  {"\n\n"}Features: End-to-end messaging · Voice notes · Video calling · Podcast Room · Meme Community · 3 Custom Themes
                </Text>
              </View>
            </View>
            <Pressable style={[s.saveBtn, { marginTop: 8 }]} onPress={() => setShowAbout(false)}>
              <Text style={s.saveBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
