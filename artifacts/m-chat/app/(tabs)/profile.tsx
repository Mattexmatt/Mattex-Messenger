import React, { useState, useEffect } from "react";
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
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_OPTIONS: { key: ThemeName; label: string; emoji: string; colors: string[]; desc: string }[] = [
  { key: "midnight", label: "Midnight Hacker", emoji: "💀", colors: ["#080C08", "#00CC44", "#0F1A0F"], desc: "Dark green terminal" },
  { key: "synthwave", label: "Synthwave", emoji: "🌆", colors: ["#0D0015", "#FF2D78", "#3D0055"], desc: "Neon retro 80s vibes" },
  { key: "cyberpunk", label: "Cyberpunk", emoji: "⚡", colors: ["#0A0A0F", "#F5E642", "#00FFFF"], desc: "Yellow & cyan neon city" },
  { key: "ocean", label: "Deep Ocean", emoji: "🌊", colors: ["#020B18", "#00D4FF", "#00FFCC"], desc: "Bioluminescent depths" },
  { key: "volcanic", label: "Volcanic", emoji: "🌋", colors: ["#0C0500", "#FF6B00", "#FF9944"], desc: "Molten fire & ash" },
  { key: "galaxy", label: "Galaxy", emoji: "🌌", colors: ["#05020F", "#8B5CF6", "#FFD700"], desc: "Cosmic purple & gold" },
  { key: "arctic", label: "Arctic", emoji: "❄️", colors: ["#030E1A", "#4FC3F7", "#B3E5FC"], desc: "Ice-cold crystalline" },
];

interface Settings {
  notificationsEnabled: boolean;
  showPreview: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  readReceipts: boolean;
  onlineStatus: boolean;
  lastSeen: "everyone" | "nobody";
  enterToSend: boolean;
  autoSaveMedia: boolean;
  fontSize: "small" | "medium" | "large";
}

const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
  showPreview: true,
  soundEnabled: true,
  vibrationEnabled: true,
  readReceipts: true,
  onlineStatus: true,
  lastSeen: "everyone",
  enterToSend: false,
  autoSaveMedia: false,
  fontSize: "medium",
};

export default function ProfileScreen() {
  const { theme, themeName, setTheme } = useTheme();
  const { user, logout, updateUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [showEdit, setShowEdit] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showLastSeen, setShowLastSeen] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    AsyncStorage.getItem("mchat_settings").then((raw) => {
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    });
  }, []);

  const saveSetting = async <K extends keyof Settings>(key: K, val: Settings[K]) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    await AsyncStorage.setItem("mchat_settings", JSON.stringify(updated));
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

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
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => { logout(); router.replace("/(auth)/login"); } },
    ]);
  };

  const handleClearCache = () => {
    Alert.alert("Clear Cache", "This will remove all cached media. Continue?", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => Alert.alert("Done", "Cache cleared.") },
    ]);
  };

  const bg = theme.background;
  const surf = theme.surface;
  const border = theme.border;
  const primary = theme.primary;
  const txt = theme.text;
  const txtSec = theme.textSecondary;
  const txtMut = theme.textMuted;
  const danger = theme.danger;
  const accent = theme.accent;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ marginTop: 24 }}>
      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: txtMut, letterSpacing: 1, marginBottom: 8, marginLeft: 20, textTransform: "uppercase" }}>{title}</Text>
      <View style={{ marginHorizontal: 16, borderRadius: 14, overflow: "hidden", backgroundColor: surf, borderWidth: 1, borderColor: border }}>
        {children}
      </View>
    </View>
  );

  const Row = ({
    icon, iconColor = primary, label, right, onPress, danger: isDanger, sep = true
  }: {
    icon: string; iconColor?: string; label: string; right?: React.ReactNode;
    onPress?: () => void; danger?: boolean; sep?: boolean;
  }) => (
    <>
      <Pressable
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center",
          paddingHorizontal: 16, paddingVertical: 14, gap: 14,
          opacity: pressed && onPress ? 0.7 : 1,
        })}
        onPress={onPress}
        disabled={!onPress && !right}
      >
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${iconColor}22`, alignItems: "center", justifyContent: "center" }}>
          <Feather name={icon as any} size={17} color={iconColor} />
        </View>
        <Text style={{ flex: 1, fontSize: 16, color: isDanger ? danger : txt, fontFamily: "Inter_400Regular" }}>{label}</Text>
        {right ?? (onPress ? <Feather name="chevron-right" size={17} color={txtMut} /> : null)}
      </Pressable>
      {sep && <View style={{ height: 1, backgroundColor: border, marginLeft: 64 }} />}
    </>
  );

  const ToggleRow = ({ icon, iconColor = primary, label, value, onChange, sep = true }: {
    icon: string; iconColor?: string; label: string; value: boolean; onChange: (v: boolean) => void; sep?: boolean;
  }) => (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 14 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${iconColor}22`, alignItems: "center", justifyContent: "center" }}>
          <Feather name={icon as any} size={17} color={iconColor} />
        </View>
        <Text style={{ flex: 1, fontSize: 16, color: txt, fontFamily: "Inter_400Regular" }}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: border, true: `${primary}88` }}
          thumbColor={value ? primary : txtMut}
          ios_backgroundColor={border}
        />
      </View>
      {sep && <View style={{ height: 1, backgroundColor: border, marginLeft: 64 }} />}
    </>
  );

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: bg, alignItems: "center", justifyContent: "center", gap: 16 }}>
        <Ionicons name="person-circle-outline" size={72} color={txtMut} />
        <Text style={{ color: txt, fontSize: 20, fontFamily: "Inter_600SemiBold" }}>Not signed in</Text>
        <Pressable style={{ backgroundColor: primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 }} onPress={() => router.push("/(auth)/login")}>
          <Text style={{ color: bg, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* Profile Header */}
        <View style={{
          paddingTop: insets.top + (Platform.OS === "web" ? 72 : 20),
          paddingHorizontal: 20, paddingBottom: 24,
          backgroundColor: theme.gradientTop, alignItems: "center",
        }}>
          <Pressable onPress={() => { setDisplayName(user.displayName); setAvatarUrl(user.avatarUrl ?? ""); setShowEdit(true); }}>
            {user.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: primary }} />
            ) : (
              <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: `${primary}33`, borderWidth: 3, borderColor: primary, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 36, fontFamily: "Inter_700Bold", color: primary }}>{user.displayName[0].toUpperCase()}</Text>
              </View>
            )}
            <View style={{ position: "absolute", bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.gradientTop }}>
              <Feather name="camera" size={13} color={bg} />
            </View>
          </Pressable>
          <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: txt, marginTop: 12 }}>{user.displayName}</Text>
          <Text style={{ fontSize: 14, color: txtSec, fontFamily: "Inter_400Regular", marginTop: 3 }}>@{user.username}</Text>
          {user.isOwner && (
            <View style={{ marginTop: 8, backgroundColor: primary, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 }}>
              <Text style={{ color: bg, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Owner · Allan Matt Tech</Text>
            </View>
          )}
        </View>

        {/* Account */}
        <Section title="Account">
          <Row icon="edit-3" iconColor={primary} label="Edit Profile" onPress={() => { setDisplayName(user.displayName); setAvatarUrl(user.avatarUrl ?? ""); setShowEdit(true); }} />
          <Row icon="at-sign" iconColor={accent} label="Username" right={<Text style={{ color: txtSec, fontFamily: "Inter_400Regular" }}>@{user.username}</Text>} sep={false} />
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <ToggleRow icon="bell" label="Message Notifications" value={settings.notificationsEnabled} onChange={(v) => saveSetting("notificationsEnabled", v)} />
          <ToggleRow icon="eye" label="Show Preview" value={settings.showPreview} onChange={(v) => saveSetting("showPreview", v)} />
          <ToggleRow icon="volume-2" label="Sounds" value={settings.soundEnabled} onChange={(v) => saveSetting("soundEnabled", v)} />
          <ToggleRow icon="smartphone" iconColor={accent} label="Vibration" value={settings.vibrationEnabled} onChange={(v) => saveSetting("vibrationEnabled", v)} sep={false} />
        </Section>

        {/* Privacy */}
        <Section title="Privacy">
          <ToggleRow icon="check-circle" label="Read Receipts" value={settings.readReceipts} onChange={(v) => saveSetting("readReceipts", v)} />
          <ToggleRow icon="activity" iconColor={accent} label="Show Online Status" value={settings.onlineStatus} onChange={(v) => saveSetting("onlineStatus", v)} />
          <Row icon="clock" iconColor={theme.success} label="Last Seen"
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: txtSec, fontFamily: "Inter_400Regular", fontSize: 14, textTransform: "capitalize" }}>{settings.lastSeen === "everyone" ? "Everyone" : "Nobody"}</Text>
                <Feather name="chevron-right" size={17} color={txtMut} />
              </View>
            }
            onPress={() => setShowLastSeen(true)}
            sep={false}
          />
        </Section>

        {/* Chats */}
        <Section title="Chats">
          <ToggleRow icon="corner-down-right" label="Enter Key to Send" value={settings.enterToSend} onChange={(v) => saveSetting("enterToSend", v)} />
          <ToggleRow icon="download" iconColor={accent} label="Auto-Save Media" value={settings.autoSaveMedia} onChange={(v) => saveSetting("autoSaveMedia", v)} />
          <Row icon="type" iconColor={theme.success} label="Font Size"
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: txtSec, fontFamily: "Inter_400Regular", fontSize: 14, textTransform: "capitalize" }}>{settings.fontSize}</Text>
                <Feather name="chevron-right" size={17} color={txtMut} />
              </View>
            }
            onPress={() => setShowFontSize(true)}
            sep={false}
          />
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <Row icon="droplet" iconColor={accent} label="Chat Theme"
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 16 }}>{THEME_OPTIONS.find(t => t.key === themeName)?.emoji}</Text>
                <Text style={{ color: txtSec, fontFamily: "Inter_400Regular", fontSize: 14 }}>{THEMES[themeName].name}</Text>
                <Feather name="chevron-right" size={17} color={txtMut} />
              </View>
            }
            onPress={() => setShowTheme(true)}
            sep={false}
          />
        </Section>

        {/* Storage */}
        <Section title="Storage & Data">
          <Row icon="trash-2" iconColor={danger} label="Clear Media Cache" onPress={handleClearCache} sep={false} />
        </Section>

        {/* Help */}
        <Section title="Help">
          <Row icon="info" iconColor={theme.success} label="About M Chat" onPress={() => setShowAbout(true)} />
          <Row icon="life-buoy" iconColor={accent} label="Help Center" onPress={() => Alert.alert("Help Center", "Contact us at support@allanmatttech.com")} sep={false} />
        </Section>

        {/* Sign Out */}
        <View style={{ marginTop: 24, marginHorizontal: 16 }}>
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: `${danger}18`, borderRadius: 14, paddingVertical: 16, borderWidth: 1, borderColor: `${danger}33` }}
            onPress={handleLogout}
          >
            <Feather name="log-out" size={18} color={danger} />
            <Text style={{ color: danger, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>Sign Out</Text>
          </Pressable>
        </View>

        <Text style={{ textAlign: "center", color: txtMut, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 20 }}>
          M Chat v1.0.0 · Allan Matt Tech
        </Text>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEdit} animationType="slide" transparent onRequestClose={() => setShowEdit(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontWeight: "700", color: txt, fontFamily: "Inter_700Bold", marginBottom: 20 }}>Edit Profile</Text>
            <Text style={{ fontSize: 13, color: txtSec, fontFamily: "Inter_500Medium", marginBottom: 8 }}>Display Name</Text>
            <TextInput style={{ backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular", marginBottom: 14 }} value={displayName} onChangeText={setDisplayName} placeholder="Your name" placeholderTextColor={txtMut} />
            <Text style={{ fontSize: 13, color: txtSec, fontFamily: "Inter_500Medium", marginBottom: 8 }}>Avatar URL (optional)</Text>
            <TextInput style={{ backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular", marginBottom: 20 }} value={avatarUrl} onChangeText={setAvatarUrl} placeholder="https://..." placeholderTextColor={txtMut} autoCapitalize="none" />
            <Pressable style={{ backgroundColor: primary, borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center" }} onPress={handleSaveProfile} disabled={saving}>
              {saving ? <ActivityIndicator color={bg} /> : <Text style={{ color: bg, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>Save Changes</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Theme Modal */}
      <Modal visible={showTheme} animationType="slide" transparent onRequestClose={() => setShowTheme(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, maxHeight: "85%" }}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontWeight: "700", color: txt, fontFamily: "Inter_700Bold", marginBottom: 16 }}>Choose Theme</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {THEME_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  style={{
                    flexDirection: "row", alignItems: "center", padding: 14,
                    borderRadius: 12, marginBottom: 10, borderWidth: 1.5, gap: 12,
                    backgroundColor: themeName === opt.key ? `${primary}22` : theme.surfaceElevated,
                    borderColor: themeName === opt.key ? primary : border,
                  }}
                  onPress={() => { setTheme(opt.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowTheme(false); }}
                >
                  <Text style={{ fontSize: 22 }}>{opt.emoji}</Text>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {opt.colors.map((c, i) => <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c }} />)}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: txt }}>{opt.label}</Text>
                    <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>{opt.desc}</Text>
                  </View>
                  {themeName === opt.key && <Feather name="check-circle" size={20} color={primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Last Seen Modal */}
      <Modal visible={showLastSeen} animationType="slide" transparent onRequestClose={() => setShowLastSeen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontWeight: "700", color: txt, fontFamily: "Inter_700Bold", marginBottom: 16 }}>Last Seen</Text>
            {(["everyone", "nobody"] as const).map(opt => (
              <Pressable
                key={opt}
                style={{ flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1.5, backgroundColor: settings.lastSeen === opt ? `${primary}22` : theme.surfaceElevated, borderColor: settings.lastSeen === opt ? primary : border }}
                onPress={() => { saveSetting("lastSeen", opt); setShowLastSeen(false); }}
              >
                <Text style={{ flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", color: txt, textTransform: "capitalize" }}>{opt === "everyone" ? "Everyone" : "Nobody"}</Text>
                {settings.lastSeen === opt && <Feather name="check" size={20} color={primary} />}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      {/* Font Size Modal */}
      <Modal visible={showFontSize} animationType="slide" transparent onRequestClose={() => setShowFontSize(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontWeight: "700", color: txt, fontFamily: "Inter_700Bold", marginBottom: 16 }}>Font Size</Text>
            {(["small", "medium", "large"] as const).map(opt => (
              <Pressable
                key={opt}
                style={{ flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1.5, backgroundColor: settings.fontSize === opt ? `${primary}22` : theme.surfaceElevated, borderColor: settings.fontSize === opt ? primary : border }}
                onPress={() => { saveSetting("fontSize", opt); setShowFontSize(false); }}
              >
                <Text style={{ flex: 1, fontFamily: "Inter_400Regular", color: txt, textTransform: "capitalize", fontSize: opt === "small" ? 13 : opt === "medium" ? 16 : 20 }}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)} — Sample text
                </Text>
                {settings.fontSize === opt && <Feather name="check" size={20} color={primary} />}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      {/* About Modal */}
      <Modal visible={showAbout} animationType="slide" transparent onRequestClose={() => setShowAbout(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: `${primary}22`, borderWidth: 2, borderColor: primary, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Feather name="message-circle" size={34} color={primary} />
              </View>
              <Text style={{ fontSize: 24, fontWeight: "700", color: txt, fontFamily: "Inter_700Bold" }}>M Chat</Text>
              <Text style={{ fontSize: 13, color: txtSec, fontFamily: "Inter_400Regular", marginTop: 4 }}>Version 1.0.0 · Mattex Chat</Text>
              <View style={{ marginTop: 16, padding: 16, backgroundColor: theme.surfaceElevated, borderRadius: 14, width: "100%", borderWidth: 1, borderColor: border }}>
                <Text style={{ color: txt, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 }}>
                  Built with care by{"\n"}
                  <Text style={{ fontFamily: "Inter_700Bold", color: primary }}>Allan Matt Tech</Text>
                  {"\n\n"}Real-time messaging · Voice notes · Video calls{"\n"}Podcast Room · Meme Community · 7 Themes
                </Text>
              </View>
            </View>
            <Pressable style={{ backgroundColor: primary, borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginTop: 8 }} onPress={() => setShowAbout(false)}>
              <Text style={{ color: bg, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
