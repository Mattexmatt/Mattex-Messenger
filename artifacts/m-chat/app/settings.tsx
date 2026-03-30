import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, Pressable, Modal, ScrollView, Alert, Platform, Image, Switch, ActivityIndicator, TextInput
} from "react-native";
import UserBadge from "@/components/UserBadge";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, DisplayMode } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import THEMES, { ThemeName } from "@/constants/colors";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type SoundType, previewSound, updateSoundEnabled, updateSoundType } from "@/utils/sounds";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/utils/api";

const THEME_OPTIONS: { key: ThemeName; label: string; emoji: string; colors: string[]; desc: string }[] = [
  { key: "midnight", label: "Midnight Hacker", emoji: "💀", colors: ["#080C08", "#00CC44", "#0F1A0F"], desc: "Dark green terminal" },
  { key: "synthwave", label: "Synthwave", emoji: "🌆", colors: ["#0D0015", "#FF2D78", "#3D0055"], desc: "Neon retro 80s vibes" },
  { key: "cyberpunk", label: "Cyberpunk", emoji: "⚡", colors: ["#0A0A0F", "#F5E642", "#00FFFF"], desc: "Yellow & cyan neon city" },
  { key: "ocean", label: "Deep Ocean", emoji: "🌊", colors: ["#020B18", "#00D4FF", "#00FFCC"], desc: "Bioluminescent depths" },
  { key: "volcanic", label: "Volcanic", emoji: "🌋", colors: ["#0C0500", "#FF6B00", "#FF9944"], desc: "Molten fire & ash" },
  { key: "galaxy", label: "Galaxy", emoji: "🌌", colors: ["#05020F", "#8B5CF6", "#FFD700"], desc: "Cosmic purple & gold" },
  { key: "arctic", label: "Arctic", emoji: "❄️", colors: ["#030E1A", "#4FC3F7", "#B3E5FC"], desc: "Ice-cold crystalline" },
];

const SOUND_OPTIONS: { key: SoundType; label: string; desc: string; icon: string }[] = [
  { key: "default", label: "Default", desc: "Classic double-tone", icon: "bell" },
  { key: "soft", label: "Soft", desc: "Gentle mellow chime", icon: "wind" },
  { key: "pop", label: "Pop", desc: "Short crisp pop", icon: "zap" },
  { key: "ping", label: "Ping", desc: "High crystal ping", icon: "radio" },
];

interface Settings {
  notificationsEnabled: boolean;
  showPreview: boolean;
  soundEnabled: boolean;
  soundType: SoundType;
  vibrationEnabled: boolean;
  readReceipts: boolean;
  onlineStatus: boolean;
  lastSeen: "everyone" | "nobody";
  enterToSend: boolean;
  autoSaveMedia: boolean;
  fontSize: "small" | "medium" | "large";
  bubbleStyle: "rounded" | "sharp" | "balloon";
  bubbleColor: string;
  translateLanguage: string;
}

const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
  showPreview: true,
  soundEnabled: true,
  soundType: "default",
  vibrationEnabled: true,
  readReceipts: true,
  onlineStatus: true,
  lastSeen: "everyone",
  enterToSend: false,
  autoSaveMedia: false,
  fontSize: "medium",
  bubbleStyle: "rounded",
  bubbleColor: "",
  translateLanguage: "English",
};

const LANGUAGES = [
  "English", "Spanish", "French", "German", "Portuguese", "Arabic",
  "Swahili", "Chinese (Simplified)", "Chinese (Traditional)", "Japanese",
  "Korean", "Hindi", "Italian", "Russian", "Dutch", "Turkish", "Polish",
  "Hausa", "Yoruba", "Igbo", "Amharic", "Somali", "Zulu", "Afrikaans",
];

const BUBBLE_COLORS = [
  { key: "", label: "Default" },
  { key: "#2563EB", label: "Blue" },
  { key: "#7C3AED", label: "Purple" },
  { key: "#059669", label: "Green" },
  { key: "#DC2626", label: "Red" },
  { key: "#D97706", label: "Amber" },
  { key: "#DB2777", label: "Pink" },
  { key: "#0891B2", label: "Cyan" },
  { key: "#374151", label: "Slate" },
];

export default function SettingsScreen() {
  const { theme, themeName, setTheme, displayMode, setDisplayMode } = useTheme();
  const { user, logout, token } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [showDisplayMode, setShowDisplayMode] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showLastSeen, setShowLastSeen] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);
  const [showSound, setShowSound] = useState(false);
  const [showBubbleStyle, setShowBubbleStyle] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [showVipManage, setShowVipManage] = useState(false);
  const [vipSearch, setVipSearch] = useState("");
  const [vipSearchResults, setVipSearchResults] = useState<{ id: number; username: string; displayName: string; avatarUrl?: string | null; role: string }[]>([]);
  const [vipSearching, setVipSearching] = useState(false);
  const [vipUpdating, setVipUpdating] = useState<number | null>(null);
  const [loginAlertDismissed, setLoginAlertDismissed] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const { data: blockedUsers, isLoading: loadingBlocked } = useQuery<{
    blockId: number;
    blockedAt: string;
    user: { id: number; username: string; displayName: string; avatarUrl?: string | null };
  }[]>({
    queryKey: ["blockedUsers", token],
    queryFn: () => apiRequest("/users/blocked"),
    enabled: !!token && showBlocked,
    staleTime: 5_000,
  });

  interface SessionEntry {
    id: number;
    deviceName: string;
    platform: string;
    ipAddress: string | null;
    lastActiveAt: string;
    createdAt: string;
    isCurrent: boolean;
  }

  const { data: sessions, isLoading: loadingSessions, refetch: refetchSessions } = useQuery<SessionEntry[]>({
    queryKey: ["sessions", token],
    queryFn: () => apiRequest("/sessions"),
    enabled: !!token && showDevices,
    staleTime: 10_000,
  });

  const { data: loginAlerts } = useQuery<{ id: number; deviceName: string; platform: string; createdAt: string }[]>({
    queryKey: ["loginAlerts", token],
    queryFn: async () => {
      const since = await AsyncStorage.getItem("mchat_last_alert_check");
      return apiRequest(`/sessions/alerts${since ? `?since=${encodeURIComponent(since)}` : ""}`);
    },
    enabled: !!token,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (loginAlerts && loginAlerts.length > 0 && !loginAlertDismissed) {
      AsyncStorage.setItem("mchat_last_alert_check", new Date().toISOString());
    }
  }, [loginAlerts]);

  const revokeSession = async (id: number) => {
    try {
      await apiRequest(`/sessions/${id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not revoke that session.");
    }
  };

  const revokeAllOthers = async () => {
    try {
      await apiRequest("/sessions", { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not revoke sessions.");
    }
  };

  const searchVipUsers = useCallback(async (q: string) => {
    if (!q.trim()) { setVipSearchResults([]); return; }
    setVipSearching(true);
    try {
      const results = await apiRequest(`/users/search?q=${encodeURIComponent(q.trim())}`);
      setVipSearchResults(results.filter((u: any) => !u.isOwner));
    } catch { setVipSearchResults([]); }
    finally { setVipSearching(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchVipUsers(vipSearch), 400);
    return () => clearTimeout(t);
  }, [vipSearch, searchVipUsers]);

  const setUserRole = async (userId: number, role: "user" | "vip") => {
    setVipUpdating(userId);
    try {
      await apiRequest(`/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
      setVipSearchResults(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch { Alert.alert("Error", "Could not update role."); }
    finally { setVipUpdating(null); }
  };

  const unblockUser = async (userId: number, name: string) => {
    try {
      await apiRequest(`/users/${userId}/block`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["blockedUsers"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", `Could not unblock ${name}`);
    }
  };

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
    if (key === "soundEnabled") updateSoundEnabled(val as boolean);
    if (key === "soundType") updateSoundType(val as SoundType);
  };

  const handleLogout = () => {
    if (Platform.OS === "web") {
      logout().then(() => router.replace("/(auth)/login"));
      return;
    }
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => { logout(); router.replace("/(auth)/login"); } },
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

  const Row = ({ icon, iconColor = primary, label, sublabel, right, onPress, danger: isDanger, sep = true }: {
    icon: string; iconColor?: string; label: string; sublabel?: string; right?: React.ReactNode;
    onPress?: () => void; danger?: boolean; sep?: boolean;
  }) => (
    <>
      <Pressable
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 14, opacity: pressed && onPress ? 0.7 : 1 })}
        onPress={onPress}
      >
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${iconColor}22`, alignItems: "center", justifyContent: "center" }}>
          <Feather name={icon as any} size={17} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, color: isDanger ? danger : txt, fontFamily: "Inter_400Regular" }}>{label}</Text>
          {sublabel && <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 1 }}>{sublabel}</Text>}
        </View>
        {right ?? (onPress ? <Feather name="chevron-right" size={17} color={txtMut} /> : null)}
      </Pressable>
      {sep && <View style={{ height: 1, backgroundColor: border, marginLeft: 64 }} />}
    </>
  );

  const ToggleRow = ({ icon, iconColor = primary, label, sublabel, value, onChange, sep = true }: {
    icon: string; iconColor?: string; label: string; sublabel?: string; value: boolean; onChange: (v: boolean) => void; sep?: boolean;
  }) => (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 14 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${iconColor}22`, alignItems: "center", justifyContent: "center" }}>
          <Feather name={icon as any} size={17} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, color: txt, fontFamily: "Inter_400Regular" }}>{label}</Text>
          {sublabel && <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 1 }}>{sublabel}</Text>}
        </View>
        <Switch value={value} onValueChange={onChange} trackColor={{ false: border, true: `${primary}88` }} thumbColor={value ? primary : txtMut} ios_backgroundColor={border} />
      </View>
      {sep && <View style={{ height: 1, backgroundColor: border, marginLeft: 64 }} />}
    </>
  );

  const currentSound = SOUND_OPTIONS.find(s => s.key === settings.soundType) ?? SOUND_OPTIONS[0];

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ paddingTop: insets.top + (Platform.OS === "web" ? 72 : 16), paddingHorizontal: 20, paddingBottom: 16, backgroundColor: theme.gradientTop, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Pressable style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }} onPress={() => router.back()}>
          <Feather name="chevron-left" size={22} color={primary} />
        </Pressable>
        <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: txt }}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>

        {/* ── Login alert banner ── */}
        {(loginAlerts?.length ?? 0) > 0 && !loginAlertDismissed && (
          <Pressable
            onPress={() => { setLoginAlertDismissed(true); setShowDevices(true); }}
            style={{ margin: 16, marginBottom: 0, borderRadius: 14, backgroundColor: `${danger}18`, borderWidth: 1, borderColor: `${danger}44`, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${danger}22`, alignItems: "center", justifyContent: "center" }}>
              <Feather name="alert-triangle" size={18} color={danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: danger, fontFamily: "Inter_700Bold", fontSize: 14 }}>New login detected</Text>
              <Text style={{ color: danger, fontFamily: "Inter_400Regular", fontSize: 12, opacity: 0.8, marginTop: 1 }}>
                {loginAlerts!.length === 1
                  ? `Login from ${loginAlerts![0].deviceName} · Tap to review`
                  : `${loginAlerts!.length} new logins on other devices · Tap to review`}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={danger} />
          </Pressable>
        )}

        {/* ── Profile card ── */}
        <View style={{ marginTop: 20, marginHorizontal: 16 }}>
          <Pressable
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: surf, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: border, opacity: pressed ? 0.8 : 1 })}
            onPress={() => router.push("/my-profile")}
          >
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={{ width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: primary }} />
            ) : (
              <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: `${primary}22`, borderWidth: 2, borderColor: primary, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: primary }}>{user?.displayName[0].toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: txt }}>{user?.displayName}</Text>
                <UserBadge isOwner={user?.isOwner ?? false} role={user?.role} size="sm" />
              </View>
              <Text style={{ fontSize: 13, color: txtSec, fontFamily: "Inter_400Regular", marginTop: 1 }}>@{user?.username}</Text>
              <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 2 }}>Tap to edit profile</Text>
            </View>
            <Feather name="chevron-right" size={18} color={txtMut} />
          </Pressable>
        </View>

        {/* ── M CHAT PREMIUM ── */}
        <View style={{ marginTop: 20, marginHorizontal: 16 }}>
          <LinearGradient
            colors={user?.isOwner ? ["#0a0018", "#1a0035", "#0d001f"] : ["#0d0d0d", "#1a1a1a", "#0d0d0d"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 20, borderWidth: 1.5, borderColor: user?.isOwner ? "#9333ea66" : "#ffffff18", overflow: "hidden" }}
          >
            {/* Shine strip */}
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: user?.isOwner ? "#c084fc55" : "#ffffff22" }} />

            <View style={{ padding: 18, flexDirection: "row", alignItems: "center", gap: 16 }}>
              {/* Icon */}
              <LinearGradient
                colors={user?.isOwner ? ["#9333ea", "#6d28d9", "#4c1d95"] : ["#3a3a3a", "#2a2a2a"]}
                style={{ width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", shadowColor: user?.isOwner ? "#9333ea" : "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8 }}
              >
                <Text style={{ fontSize: 26 }}>💎</Text>
              </LinearGradient>

              {/* Text */}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: user?.isOwner ? "#c084fc" : "#ffffff" }}>
                    M Chat Premium
                  </Text>
                  {user?.isOwner ? (
                    <View style={{ backgroundColor: "#9333ea33", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2.5, borderWidth: 1, borderColor: "#9333ea66" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#c084fc", letterSpacing: 0.8 }}>ACTIVE</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: "#ffffff12", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2.5, borderWidth: 1, borderColor: "#ffffff22" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 0.8 }}>COMING SOON</Text>
                    </View>
                  )}
                </View>
                {user?.isOwner ? (
                  <Text style={{ fontSize: 12, color: "rgba(192,132,252,0.65)", fontFamily: "Inter_400Regular" }}>
                    All features unlocked · Founder access
                  </Text>
                ) : (
                  <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: "Inter_400Regular" }}>
                    Exclusive features · Badges · Priority support
                  </Text>
                )}
              </View>

              {/* Right arrow / lock */}
              {user?.isOwner ? (
                <Feather name="check-circle" size={20} color="#9333ea" />
              ) : (
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#ffffff0d", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="lock" size={15} color="#555" />
                </View>
              )}
            </View>

            {/* Feature pills (only for non-owners as a teaser) */}
            {!user?.isOwner && (
              <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingBottom: 16, flexWrap: "wrap" }}>
                {["💎 Premium Badge", "🎨 Exclusive Themes", "📌 Pinned Chats", "⚡ Priority Support"].map(f => (
                  <View key={f} style={{ backgroundColor: "#ffffff08", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#ffffff12" }}>
                    <Text style={{ fontSize: 11, color: "#666", fontFamily: "Inter_500Medium" }}>{f}</Text>
                  </View>
                ))}
              </View>
            )}
          </LinearGradient>
        </View>

        {/* ── ACCOUNT ── */}
        <Section title="Account">
          <Row
            icon="mail"
            iconColor={primary}
            label="Email Address"
            sublabel={(user as any)?.email ? ((user as any)?.emailVerified ? "Verified ✓" : "Tap to verify") : "Not set — add for recovery"}
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {(user as any)?.email ? (
                  <Text style={{ color: txtSec, fontFamily: "Inter_400Regular", fontSize: 13 }} numberOfLines={1}>{(user as any).email}</Text>
                ) : null}
                <Feather name="chevron-right" size={17} color={txtMut} />
              </View>
            }
            onPress={() => router.push("/my-profile")}
          />
          <Row icon="user" iconColor={accent} label="Username" sublabel={`@${user?.username}`} sep={false} />
        </Section>

        {/* ── NOTIFICATIONS & SOUNDS ── */}
        <Section title="Notifications & Sounds">
          <ToggleRow icon="bell" label="Message Notifications" sublabel="Get notified when someone messages you" value={settings.notificationsEnabled} onChange={(v) => saveSetting("notificationsEnabled", v)} />
          <ToggleRow icon="eye" iconColor={accent} label="Show Preview" sublabel="Show message content in notifications" value={settings.showPreview} onChange={(v) => saveSetting("showPreview", v)} />
          <ToggleRow
            icon="volume-2" iconColor={theme.success} label="Sounds"
            sublabel={settings.soundEnabled ? `Playing: ${currentSound.label}` : "Muted"}
            value={settings.soundEnabled} onChange={(v) => saveSetting("soundEnabled", v)}
          />
          <Row icon="music" iconColor={accent} label="Notification Sound"
            right={<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={{ color: txtSec, fontFamily: "Inter_400Regular", fontSize: 14 }}>{currentSound.label}</Text><Feather name="chevron-right" size={17} color={txtMut} /></View>}
            onPress={() => setShowSound(true)}
          />
          <ToggleRow icon="smartphone" iconColor={accent} label="Vibration" sublabel="Haptic feedback on messages" value={settings.vibrationEnabled} onChange={(v) => saveSetting("vibrationEnabled", v)} sep={false} />
        </Section>

        {/* ── PRIVACY & SECURITY ── */}
        <Section title="Privacy & Security">
          <ToggleRow icon="check-circle" label="Read Receipts" sublabel="Show when you've read messages" value={settings.readReceipts} onChange={(v) => saveSetting("readReceipts", v)} />
          <ToggleRow icon="activity" iconColor={accent} label="Show Online Status" sublabel="Let contacts see when you're active" value={settings.onlineStatus} onChange={(v) => saveSetting("onlineStatus", v)} />
          <Row icon="clock" iconColor={theme.success} label="Last Seen"
            right={<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={{ color: txtSec, fontFamily: "Inter_400Regular", fontSize: 14 }}>{settings.lastSeen === "everyone" ? "Everyone" : "Nobody"}</Text><Feather name="chevron-right" size={17} color={txtMut} /></View>}
            onPress={() => setShowLastSeen(true)}
          />
          <Row icon="user-x" iconColor={danger} label="Blocked Contacts"
            sublabel="People you have blocked"
            right={<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>{(blockedUsers?.length ?? 0) > 0 && <View style={{ backgroundColor: danger, borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" }}>{blockedUsers!.length}</Text></View>}<Feather name="chevron-right" size={17} color={txtMut} /></View>}
            onPress={() => setShowBlocked(true)}
          />
          <Row
            icon="shield"
            iconColor={accent}
            label="Logged-in Devices"
            sublabel="Manage active sessions"
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {(loginAlerts?.length ?? 0) > 0 && !loginAlertDismissed && (
                  <View style={{ backgroundColor: danger, borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" }}>{loginAlerts!.length}</Text>
                  </View>
                )}
                <Feather name="chevron-right" size={17} color={txtMut} />
              </View>
            }
            onPress={() => { setShowDevices(true); setLoginAlertDismissed(true); }}
            sep={false}
          />
        </Section>

        {/* ── CHATS ── */}
        <Section title="Chats">
          <ToggleRow icon="corner-down-right" label="Enter Key to Send" sublabel="Press Enter to send messages" value={settings.enterToSend} onChange={(v) => saveSetting("enterToSend", v)} />
          <ToggleRow icon="download" iconColor={accent} label="Auto-Save Media" sublabel="Automatically save photos & videos" value={settings.autoSaveMedia} onChange={(v) => saveSetting("autoSaveMedia", v)} />
          <Row icon="type" iconColor={theme.success} label="Font Size"
            sublabel="Message text size"
            right={<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={{ color: txtSec, fontFamily: "Inter_400Regular", fontSize: 14, textTransform: "capitalize" }}>{settings.fontSize}</Text><Feather name="chevron-right" size={17} color={txtMut} /></View>}
            onPress={() => setShowFontSize(true)}
          />
          <Row icon="message-square" iconColor={theme.success} label="Chat Bubble"
            sublabel="Shape and colour of message bubbles"
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: settings.bubbleColor || primary, borderWidth: 1.5, borderColor: border }} />
                <Text style={{ color: txtSec, fontFamily: "Inter_400Regular", fontSize: 14, textTransform: "capitalize" }}>{settings.bubbleStyle}</Text>
                <Feather name="chevron-right" size={17} color={txtMut} />
              </View>
            }
            onPress={() => setShowBubbleStyle(true)}
          />
          <Row icon="globe" iconColor="#2563EB" label="Translation Language"
            sublabel="Language to translate messages into"
            right={<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={{ color: txtSec, fontFamily: "Inter_400Regular", fontSize: 14 }}>{settings.translateLanguage || "English"}</Text><Feather name="chevron-right" size={17} color={txtMut} /></View>}
            onPress={() => setShowLanguage(true)} sep={false}
          />
        </Section>

        {/* ── APPEARANCE ── */}
        <Section title="Appearance">
          {(() => {
            const modeLabel = displayMode === "system" ? "System default" : displayMode === "light" ? "Light" : "Dark";
            const modeIcon = displayMode === "system" ? "smartphone" : displayMode === "light" ? "sun" : "moon";
            const modeColor = displayMode === "light" ? "#F59E0B" : displayMode === "dark" ? "#6366F1" : primary;
            return (
              <Row icon={modeIcon} iconColor={modeColor} label="Display Mode"
                sublabel="Light, dark, or follow system"
                right={<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={{ color: txtSec, fontFamily: "Inter_400Regular", fontSize: 14 }}>{modeLabel}</Text><Feather name="chevron-right" size={17} color={txtMut} /></View>}
                onPress={() => setShowDisplayMode(true)} sep={displayMode !== "light"} />
            );
          })()}
          {displayMode !== "light" && (
            <Row icon="droplet" iconColor={accent} label="Dark Theme"
              sublabel="Choose your color theme"
              right={<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={{ fontSize: 16 }}>{THEME_OPTIONS.find(t => t.key === themeName)?.emoji ?? "💀"}</Text><Text style={{ color: txtSec, fontFamily: "Inter_400Regular", fontSize: 14 }}>{THEMES[themeName]?.name ?? "Midnight Hacker"}</Text><Feather name="chevron-right" size={17} color={txtMut} /></View>}
              onPress={() => setShowTheme(true)} sep={false} />
          )}
        </Section>

        {/* ── STORAGE & DATA ── */}
        <Section title="Storage & Data">
          <Row icon="hard-drive" iconColor={accent} label="Media Cache" sublabel="Tap to clear stored media files" onPress={() => Alert.alert("Clear Cache", "Remove all cached media?", [{ text: "Cancel", style: "cancel" }, { text: "Clear", style: "destructive", onPress: () => Alert.alert("Done", "Cache cleared.") }])} sep={false} />
        </Section>

        {/* ── HELP & SUPPORT ── */}
        <Section title="Help & Support">
          <Row icon="info" iconColor={theme.success} label="About M Chat" sublabel="Version, credits & legal" onPress={() => setShowAbout(true)} />
          <Row icon="life-buoy" iconColor={accent} label="Help Center" sublabel="support@allanmatttech.com" onPress={() => Alert.alert("Help Center", "Contact us at support@allanmatttech.com")} sep={false} />
        </Section>

        {/* ── ADMIN (owner only) ── */}
        {user?.isOwner && (
          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#FFD700", letterSpacing: 1, marginBottom: 8, marginLeft: 20, textTransform: "uppercase" }}>Admin</Text>
            <View style={{ marginHorizontal: 16, borderRadius: 16, overflow: "hidden", borderWidth: 1.5, borderColor: "#FFD70033" }}>
              <Pressable onPress={() => router.push("/admin-dashboard" as any)}>
                <LinearGradient
                  colors={["#1a0a00", "#2a1200", "#1a0a00"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: "#FFD70022" }}
                >
                  <LinearGradient colors={["#FFD700", "#FFA500"]} style={{ width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 22 }}>👑</Text>
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFD700" }}>Admin Dashboard</Text>
                      <View style={{ backgroundColor: "#FFD70022", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1.5, borderWidth: 1, borderColor: "#FFD70044" }}>
                        <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: "#FFD700", letterSpacing: 0.5 }}>FOUNDER</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, color: "rgba(255,215,0,0.5)", fontFamily: "Inter_400Regular" }}>Stats · Users · Broadcasts · Moderation</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#FFD700" />
                </LinearGradient>
              </Pressable>
              <Pressable
                onPress={() => setShowVipManage(true)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, backgroundColor: pressed ? "#A855F710" : "transparent" })}
              >
                <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: "#A855F718", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="star" size={20} color="#A855F7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#A855F7" }}>VIP Management</Text>
                  <Text style={{ fontSize: 12, color: "rgba(168,85,247,0.55)", fontFamily: "Inter_400Regular" }}>Promote or demote users</Text>
                </View>
                <Feather name="chevron-right" size={18} color="#A855F7" />
              </Pressable>
            </View>
          </View>
        )}

        {/* ── DANGER ZONE ── */}
        <View style={{ marginTop: 32, marginHorizontal: 16 }}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: danger, letterSpacing: 1, marginBottom: 8, marginLeft: 4, textTransform: "uppercase" }}>Account Actions</Text>
          <Pressable
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: pressed ? `${danger}28` : `${danger}18`, borderRadius: 14, paddingVertical: 16, borderWidth: 1, borderColor: `${danger}44` })}
            onPress={handleLogout}
          >
            <Feather name="log-out" size={18} color={danger} />
            <Text style={{ color: danger, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>Sign Out</Text>
          </Pressable>
        </View>

        <Text style={{ textAlign: "center", color: txtMut, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 24, marginBottom: 10 }}>M Chat v1.0.0 · Allan Matt Tech</Text>
      </ScrollView>

      {/* Sound picker modal */}
      <Modal visible={showSound} animationType="slide" transparent onRequestClose={() => setShowSound(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowSound(false)}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt, marginBottom: 6 }}>Notification Sound</Text>
            <Text style={{ fontSize: 13, color: txtMut, fontFamily: "Inter_400Regular", marginBottom: 20 }}>Tap Preview to hear how each sound sounds</Text>
            {SOUND_OPTIONS.map((opt) => (
              <View key={opt.key} style={{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, marginBottom: 10, borderWidth: 1.5, backgroundColor: settings.soundType === opt.key ? `${primary}18` : theme.surfaceElevated, borderColor: settings.soundType === opt.key ? primary : border }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  <Feather name={opt.icon as any} size={18} color={primary} />
                </View>
                <Pressable style={{ flex: 1 }} onPress={() => { saveSetting("soundType", opt.key); }}>
                  <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: txt }}>{opt.label}</Text>
                  <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>{opt.desc}</Text>
                </Pressable>
                <Pressable style={{ backgroundColor: `${primary}22`, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginRight: 10 }} onPress={() => previewSound(opt.key)}>
                  <Text style={{ color: primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Preview</Text>
                </Pressable>
                {settings.soundType === opt.key && <Feather name="check-circle" size={20} color={primary} />}
              </View>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Display Mode modal */}
      <Modal visible={showDisplayMode} animationType="slide" transparent onRequestClose={() => setShowDisplayMode(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowDisplayMode(false)}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt, marginBottom: 6 }}>Display Mode</Text>
            <Text style={{ fontSize: 13, color: txtMut, fontFamily: "Inter_400Regular", marginBottom: 20 }}>Choose how M Chat looks on your device</Text>
            {([
              { key: "system" as const, label: "System default", desc: "Follows your device's appearance setting", icon: "smartphone", color: primary },
              { key: "light" as const, label: "Light", desc: "Always use light background", icon: "sun", color: "#F59E0B" },
              { key: "dark" as const, label: "Dark", desc: "Always use dark theme", icon: "moon", color: "#6366F1" },
            ]).map(opt => (
              <Pressable key={opt.key}
                style={{ flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 14, marginBottom: 10, borderWidth: 1.5, gap: 14, backgroundColor: displayMode === opt.key ? `${opt.color}18` : theme.surfaceElevated, borderColor: displayMode === opt.key ? opt.color : border }}
                onPress={() => { setDisplayMode(opt.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowDisplayMode(false); }}
              >
                <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: `${opt.color}22`, alignItems: "center", justifyContent: "center" }}>
                  <Feather name={opt.icon as any} size={20} color={opt.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: txt }}>{opt.label}</Text>
                  <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 2 }}>{opt.desc}</Text>
                </View>
                {displayMode === opt.key && <Feather name="check-circle" size={22} color={opt.color} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Theme modal */}
      <Modal visible={showTheme} animationType="slide" transparent onRequestClose={() => setShowTheme(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowTheme(false)}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, maxHeight: "85%" }} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt, marginBottom: 16 }}>Choose Theme</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {THEME_OPTIONS.map((opt) => (
                <Pressable key={opt.key} style={{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1.5, gap: 12, backgroundColor: themeName === opt.key ? `${primary}22` : theme.surfaceElevated, borderColor: themeName === opt.key ? primary : border }}
                  onPress={() => { setTheme(opt.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowTheme(false); }}>
                  <Text style={{ fontSize: 22 }}>{opt.emoji}</Text>
                  <View style={{ flexDirection: "row", gap: 4 }}>{opt.colors.map((c, i) => <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c }} />)}</View>
                  <View style={{ flex: 1 }}><Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: txt }}>{opt.label}</Text><Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>{opt.desc}</Text></View>
                  {themeName === opt.key && <Feather name="check-circle" size={20} color={primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Last Seen modal */}
      <Modal visible={showLastSeen} animationType="slide" transparent onRequestClose={() => setShowLastSeen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowLastSeen(false)}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt, marginBottom: 16 }}>Last Seen</Text>
            {(["everyone", "nobody"] as const).map(opt => (
              <Pressable key={opt} style={{ flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1.5, backgroundColor: settings.lastSeen === opt ? `${primary}22` : theme.surfaceElevated, borderColor: settings.lastSeen === opt ? primary : border }}
                onPress={() => { saveSetting("lastSeen", opt); setShowLastSeen(false); }}>
                <Text style={{ flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", color: txt }}>{opt === "everyone" ? "Everyone" : "Nobody"}</Text>
                {settings.lastSeen === opt && <Feather name="check" size={20} color={primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Font Size modal */}
      <Modal visible={showFontSize} animationType="slide" transparent onRequestClose={() => setShowFontSize(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowFontSize(false)}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt, marginBottom: 16 }}>Font Size</Text>
            {(["small", "medium", "large"] as const).map(opt => (
              <Pressable key={opt} style={{ flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1.5, backgroundColor: settings.fontSize === opt ? `${primary}22` : theme.surfaceElevated, borderColor: settings.fontSize === opt ? primary : border }}
                onPress={() => { saveSetting("fontSize", opt); setShowFontSize(false); }}>
                <Text style={{ flex: 1, fontFamily: "Inter_400Regular", color: txt, textTransform: "capitalize", fontSize: opt === "small" ? 13 : opt === "medium" ? 16 : 20 }}>{opt.charAt(0).toUpperCase() + opt.slice(1)} — Sample text</Text>
                {settings.fontSize === opt && <Feather name="check" size={20} color={primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Bubble Style modal */}
      <Modal visible={showBubbleStyle} animationType="slide" transparent onRequestClose={() => setShowBubbleStyle(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowBubbleStyle(false)}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt, marginBottom: 16 }}>Chat Bubble</Text>

            {/* ── Live preview ── */}
            {(() => {
              const previewColor = settings.bubbleColor || primary;
              const previewRadius = settings.bubbleStyle === "sharp" ? 6 : settings.bubbleStyle === "balloon" ? 28 : 18;
              return (
                <View style={{ backgroundColor: theme.background, borderRadius: 16, padding: 14, marginBottom: 20, gap: 10 }}>
                  {/* Received bubble */}
                  <View style={{ flexDirection: "row", justifyContent: "flex-start" }}>
                    <View style={{ backgroundColor: theme.bubble, borderRadius: previewRadius, borderBottomLeftRadius: 4, paddingHorizontal: 13, paddingVertical: 8, maxWidth: "70%", borderWidth: 1, borderColor: border }}>
                      <Text style={{ fontSize: 14, color: txt, fontFamily: "Inter_400Regular" }}>Hey! How's it going? 👋</Text>
                    </View>
                  </View>
                  {/* Own bubble */}
                  <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                    <View style={{ backgroundColor: previewColor, borderRadius: previewRadius, borderBottomRightRadius: 4, paddingHorizontal: 13, paddingVertical: 8, maxWidth: "70%" }}>
                      <Text style={{ fontSize: 14, color: "#ffffff", fontFamily: "Inter_400Regular" }}>All good, you? 😄</Text>
                    </View>
                  </View>
                </View>
              );
            })()}

            {/* ── Shape ── */}
            <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: txtMut, letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>Shape</Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
              {([
                { key: "rounded", label: "Rounded", radius: 18 },
                { key: "sharp", label: "Sharp", radius: 5 },
                { key: "balloon", label: "Balloon", radius: 28 },
              ] as const).map(opt => {
                const active = settings.bubbleStyle === opt.key;
                const previewColor = settings.bubbleColor || primary;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => saveSetting("bubbleStyle", opt.key)}
                    style={{ flex: 1, alignItems: "center", gap: 8, padding: 12, borderRadius: 14, borderWidth: 1.5, backgroundColor: active ? `${primary}18` : theme.surfaceElevated, borderColor: active ? primary : border }}
                  >
                    <View style={{ width: 54, height: 30, borderRadius: opt.radius, borderBottomRightRadius: 4, backgroundColor: previewColor, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Msg</Text>
                    </View>
                    <Text style={{ fontSize: 12, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium", color: active ? primary : txtSec }}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ── Colour ── */}
            <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: txtMut, letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>Bubble Colour</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {BUBBLE_COLORS.map(c => {
                const active = settings.bubbleColor === c.key;
                const swatch = c.key || primary;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => saveSetting("bubbleColor", c.key)}
                    style={{ alignItems: "center", gap: 5 }}
                  >
                    <View style={{
                      width: 40, height: 40, borderRadius: 20,
                      backgroundColor: swatch,
                      borderWidth: active ? 3 : 1.5,
                      borderColor: active ? "#fff" : `${swatch}66`,
                      alignItems: "center", justifyContent: "center",
                      shadowColor: swatch, shadowOpacity: active ? 0.5 : 0, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: active ? 4 : 0,
                    }}>
                      {active && <Feather name="check" size={16} color="#fff" />}
                    </View>
                    <Text style={{ fontSize: 9, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular", color: active ? primary : txtMut }}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Language modal */}
      <Modal visible={showLanguage} animationType="slide" transparent onRequestClose={() => setShowLanguage(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowLanguage(false)}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, maxHeight: "80%" }} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: "#2563EB18", alignItems: "center", justifyContent: "center" }}>
                <Feather name="globe" size={20} color="#2563EB" />
              </View>
              <View>
                <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt }}>Translation Language</Text>
                <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 2 }}>Messages will be translated into this language</Text>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {LANGUAGES.map(lang => {
                const active = (settings.translateLanguage || "English") === lang;
                return (
                  <Pressable key={lang} onPress={() => { saveSetting("translateLanguage", lang); setShowLanguage(false); }}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14, marginBottom: 4, backgroundColor: active ? `${primary}18` : pressed ? `${txt}08` : "transparent" })}>
                    <Text style={{ fontSize: 15, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular", color: active ? primary : txt }}>{lang}</Text>
                    {active && <Feather name="check" size={18} color={primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Devices modal */}
      <Modal visible={showDevices} animationType="slide" transparent onRequestClose={() => setShowDevices(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowDevices(false)}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, maxHeight: "85%" }} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${accent}18`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="shield" size={20} color={accent} />
              </View>
              <View>
                <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt }}>Logged-in Devices</Text>
                <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 1 }}>
                  {loadingSessions ? "Loading…" : `${sessions?.length ?? 0} active session${(sessions?.length ?? 0) !== 1 ? "s" : ""}`}
                </Text>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: border, marginBottom: 16, marginTop: 8 }} />

            {loadingSessions ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <ActivityIndicator color={accent} />
                <Text style={{ color: txtMut, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 10 }}>Loading sessions…</Text>
              </View>
            ) : (
              <>
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                  {(sessions ?? []).map((s, i) => {
                    const platformIcon = s.platform === "ios" ? "smartphone" : s.platform === "android" ? "smartphone" : s.platform === "macos" ? "monitor" : s.platform === "windows" ? "monitor" : "globe";
                    const timeSince = (dt: string) => {
                      const diff = Date.now() - new Date(dt).getTime();
                      if (diff < 60000) return "just now";
                      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
                      return `${Math.floor(diff / 86400000)}d ago`;
                    };
                    return (
                      <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderBottomWidth: i < (sessions!.length - 1) ? 1 : 0, borderBottomColor: border }}>
                        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: s.isCurrent ? `${accent}22` : `${primary}14`, alignItems: "center", justifyContent: "center" }}>
                          <Feather name={platformIcon as any} size={20} color={s.isCurrent ? accent : txtMut} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: txt }}>{s.deviceName}</Text>
                            {s.isCurrent && (
                              <View style={{ backgroundColor: `${accent}22`, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ color: accent, fontSize: 10, fontFamily: "Inter_700Bold" }}>THIS DEVICE</Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                            {s.ipAddress ? `${s.ipAddress} · ` : ""}{timeSince(s.lastActiveAt)}
                          </Text>
                        </View>
                        {!s.isCurrent && (
                          <Pressable
                            onPress={() => Alert.alert("Sign Out Device", `Sign out of ${s.deviceName}?`, [
                              { text: "Cancel", style: "cancel" },
                              { text: "Sign Out", style: "destructive", onPress: () => revokeSession(s.id) },
                            ])}
                            style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: pressed ? `${danger}30` : `${danger}14`, borderWidth: 1, borderColor: `${danger}33` })}
                          >
                            <Text style={{ color: danger, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Sign Out</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>

                {(sessions ?? []).filter(s => !s.isCurrent).length > 1 && (
                  <Pressable
                    onPress={() => Alert.alert("Sign Out All Other Devices", "This will sign out all other sessions.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Sign Out All", style: "destructive", onPress: revokeAllOthers },
                    ])}
                    style={{ marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: `${danger}14`, borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: `${danger}33` }}
                  >
                    <Feather name="log-out" size={16} color={danger} />
                    <Text style={{ color: danger, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Sign Out All Other Devices</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* About modal */}
      <Modal visible={showAbout} animationType="slide" transparent onRequestClose={() => setShowAbout(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowAbout(false)}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: `${primary}22`, borderWidth: 2, borderColor: primary, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Feather name="message-circle" size={34} color={primary} />
              </View>
              <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: txt }}>M Chat</Text>
              <Text style={{ fontSize: 13, color: txtSec, fontFamily: "Inter_400Regular", marginTop: 4 }}>Version 1.0.0 · Mattex Chat</Text>
              <View style={{ marginTop: 16, padding: 16, backgroundColor: theme.surfaceElevated, borderRadius: 14, width: "100%", borderWidth: 1, borderColor: border }}>
                <Text style={{ color: txt, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 }}>Built with care by{"\n"}<Text style={{ fontFamily: "Inter_700Bold", color: primary }}>Allan Matt Tech</Text>{"\n\n"}Real-time messaging · Voice notes · Video calls{"\n"}Podcast Room · Meme Community · 7 Themes</Text>
              </View>
            </View>
            <Pressable style={{ backgroundColor: primary, borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginTop: 8 }} onPress={() => setShowAbout(false)}>
              <Text style={{ color: bg, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Blocked Contacts modal */}
      <Modal visible={showBlocked} animationType="slide" transparent onRequestClose={() => setShowBlocked(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowBlocked(false)}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, maxHeight: "80%" }} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />

            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${danger}18`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="user-x" size={20} color={danger} />
              </View>
              <View>
                <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt }}>Blocked Contacts</Text>
                <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 1 }}>
                  {(blockedUsers?.length ?? 0) === 0 ? "No one blocked" : `${blockedUsers!.length} blocked`}
                </Text>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: border, marginBottom: 16, marginTop: 8 }} />

            {loadingBlocked ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <ActivityIndicator color={primary} />
                <Text style={{ color: txtMut, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 10 }}>Loading...</Text>
              </View>
            ) : (blockedUsers?.length ?? 0) === 0 ? (
              <View style={{ paddingVertical: 48, alignItems: "center", gap: 12 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${primary}14`, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="shield" size={32} color={primary} />
                </View>
                <Text style={{ color: txt, fontFamily: "Inter_600SemiBold", fontSize: 17 }}>No blocked contacts</Text>
                <Text style={{ color: txtMut, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", lineHeight: 19 }}>
                  Block someone from the ⋮ menu inside any chat
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
                {blockedUsers!.map((row) => {
                  const colors = [primary, "#FF6B9D", "#C77DFF", "#4FC3F7", "#FFB74D", "#69F0AE"];
                  const color = colors[(row.user?.id ?? 0) % colors.length];
                  return (
                    <View key={row.blockId} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: border }}>
                      {row.user?.avatarUrl ? (
                        <Image source={{ uri: row.user.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                      ) : (
                        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: `${color}28`, borderWidth: 2, borderColor: `${color}66`, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ color, fontSize: 18, fontFamily: "Inter_700Bold" }}>{(row.user?.displayName ?? "?")[0].toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: txt }}>{row.user?.displayName}</Text>
                        <Text style={{ fontSize: 13, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 1 }}>@{row.user?.username}</Text>
                      </View>
                      <Pressable
                        onPress={() => Alert.alert(`Unblock ${row.user?.displayName}?`, "They'll be able to find and message you again.", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Unblock", onPress: () => unblockUser(row.user!.id, row.user!.displayName) },
                        ])}
                        style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: pressed ? `${danger}30` : `${danger}18`, borderWidth: 1, borderColor: `${danger}33` })}
                      >
                        <Text style={{ color: danger, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Unblock</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* VIP Management modal */}
      <Modal visible={showVipManage} animationType="slide" transparent onRequestClose={() => setShowVipManage(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowVipManage(false)}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, maxHeight: "85%" }} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: "#F59E0B22", alignItems: "center", justifyContent: "center" }}>
                <Feather name="star" size={20} color="#F59E0B" />
              </View>
              <View>
                <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt }}>VIP Management</Text>
                <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 1 }}>Promote or demote users</Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.surfaceElevated, borderRadius: 14, borderWidth: 1, borderColor: border, paddingHorizontal: 14, gap: 10, marginBottom: 16 }}>
              <Feather name="search" size={17} color={txtMut} />
              <TextInput
                style={{ flex: 1, paddingVertical: 12, color: txt, fontFamily: "Inter_400Regular", fontSize: 15 }}
                placeholder="Search users…"
                placeholderTextColor={txtMut}
                value={vipSearch}
                onChangeText={setVipSearch}
                autoCapitalize="none"
              />
              {vipSearching && <ActivityIndicator size="small" color={primary} />}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {vipSearchResults.length === 0 && vipSearch.trim() !== "" && !vipSearching && (
                <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
                  <Feather name="user-x" size={28} color={txtMut} />
                  <Text style={{ color: txtMut, fontFamily: "Inter_400Regular", fontSize: 14 }}>No users found</Text>
                </View>
              )}
              {vipSearch.trim() === "" && (
                <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
                  <Feather name="search" size={28} color={txtMut} />
                  <Text style={{ color: txtMut, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" }}>Search for a username or display name{"\n"}to manage their role</Text>
                </View>
              )}
              {vipSearchResults.map((u) => {
                const isVip = u.role === "vip";
                const isUpdating = vipUpdating === u.id;
                const colors = [primary, "#FF6B9D", "#C77DFF", "#4FC3F7", "#FFB74D"];
                const col = colors[u.id % colors.length];
                return (
                  <View key={u.id} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: border }}>
                    {u.avatarUrl ? (
                      <Image source={{ uri: u.avatarUrl }} style={{ width: 46, height: 46, borderRadius: 23 }} />
                    ) : (
                      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: `${col}28`, borderWidth: 2, borderColor: `${col}66`, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: col, fontSize: 17, fontFamily: "Inter_700Bold" }}>{u.displayName[0].toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: txt }}>{u.displayName}</Text>
                        {isVip && <UserBadge isOwner={false} role="vip" size="sm" />}
                      </View>
                      <Text style={{ fontSize: 13, color: txtMut, fontFamily: "Inter_400Regular" }}>@{u.username}</Text>
                    </View>
                    {isUpdating ? (
                      <ActivityIndicator size="small" color={primary} />
                    ) : isVip ? (
                      <Pressable
                        onPress={() => Alert.alert(`Remove VIP from ${u.displayName}?`, "They will lose their VIP badge.", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Remove", style: "destructive", onPress: () => setUserRole(u.id, "user") },
                        ])}
                        style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: pressed ? `${danger}30` : `${danger}18`, borderWidth: 1, borderColor: `${danger}33` })}
                      >
                        <Text style={{ color: danger, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Revoke VIP</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => setUserRole(u.id, "vip")}
                        style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: pressed ? "#C77DFF33" : "#C77DFF22", borderWidth: 1, borderColor: "#C77DFF44" })}
                      >
                        <Text style={{ color: "#C77DFF", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Make VIP</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
