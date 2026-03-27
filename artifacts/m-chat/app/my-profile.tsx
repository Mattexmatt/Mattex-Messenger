import React, { useState, useEffect } from "react";
import {
  View, Text, Pressable, ScrollView, TextInput,
  Modal, ActivityIndicator, Alert, Platform, Image
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

const STATUS_PRESETS = [
  { emoji: "🟢", label: "Available" },
  { emoji: "🔴", label: "Busy" },
  { emoji: "💼", label: "At work" },
  { emoji: "🎓", label: "In a meeting" },
  { emoji: "🏋️", label: "At the gym" },
  { emoji: "😴", label: "Sleeping" },
  { emoji: "🎮", label: "Gaming" },
  { emoji: "✈️", label: "Travelling" },
  { emoji: "🔇", label: "Do not disturb" },
];

export default function MyProfileScreen() {
  const { theme } = useTheme();
  const { user, updateUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState("🟢 Available");
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [customStatus, setCustomStatus] = useState("");
  const [showEditName, setShowEditName] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("mchat_status").then((s) => {
      if (s) setStatus(s);
    });
  }, []);

  const applyStatus = async (val: string) => {
    setStatus(val);
    await AsyncStorage.setItem("mchat_status", val);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowStatusPicker(false);
    setShowCustom(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await apiRequest("/users/me", {
        method: "PUT",
        body: JSON.stringify({ displayName: displayName.trim(), avatarUrl: avatarUrl.trim() || null }),
      });
      updateUser(updated);
      setShowEditName(false);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSaving(false); }
  };

  if (!user) return null;

  const bg = theme.background;
  const surf = theme.surface;
  const border = theme.border;
  const primary = theme.primary;
  const txt = theme.text;
  const txtSec = theme.textSecondary;
  const txtMut = theme.textMuted;

  const joinedDate = new Date(user.createdAt ?? Date.now()).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + (Platform.OS === "web" ? 72 : 16),
        paddingHorizontal: 20, paddingBottom: 16,
        backgroundColor: theme.gradientTop,
        flexDirection: "row", alignItems: "center",
      }}>
        <Pressable
          style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}
          onPress={() => router.back()}
        >
          <Feather name="chevron-left" size={22} color={primary} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "Inter_700Bold", color: txt, marginLeft: 12 }}>My Profile</Text>
        <Pressable
          style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: `${primary}22`, borderRadius: 10 }}
          onPress={() => { setDisplayName(user.displayName); setAvatarUrl(user.avatarUrl ?? ""); setShowEditName(true); }}
        >
          <Text style={{ color: primary, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Edit</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {/* Avatar Section */}
        <View style={{ alignItems: "center", paddingVertical: 36, backgroundColor: theme.gradientTop }}>
          <Pressable
            style={{ position: "relative" }}
            onPress={() => { setDisplayName(user.displayName); setAvatarUrl(user.avatarUrl ?? ""); setShowEditName(true); }}
          >
            {user.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={{ width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: primary }} />
            ) : (
              <View style={{
                width: 110, height: 110, borderRadius: 55,
                backgroundColor: `${primary}22`, borderWidth: 3, borderColor: primary,
                alignItems: "center", justifyContent: "center",
              }}>
                <Text style={{ fontSize: 48, fontFamily: "Inter_700Bold", color: primary }}>
                  {user.displayName[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{
              position: "absolute", bottom: 4, right: 4,
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: primary, alignItems: "center", justifyContent: "center",
              borderWidth: 2, borderColor: theme.gradientTop,
            }}>
              <Feather name="camera" size={14} color={bg} />
            </View>
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: txt, marginTop: 14 }}>{user.displayName}</Text>
          <Text style={{ fontSize: 15, color: txtSec, fontFamily: "Inter_400Regular", marginTop: 4 }}>@{user.username}</Text>
          {user.isOwner && (
            <View style={{ marginTop: 10, backgroundColor: primary, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 10 }}>
              <Text style={{ color: bg, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Owner · Allan Matt Tech</Text>
            </View>
          )}
        </View>

        {/* Status */}
        <View style={{ marginTop: 24, marginHorizontal: 16 }}>
          <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginLeft: 4 }}>Status</Text>
          <Pressable
            style={{
              flexDirection: "row", alignItems: "center", gap: 14,
              backgroundColor: surf, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16,
              borderWidth: 1, borderColor: border,
            }}
            onPress={() => setShowStatusPicker(true)}
          >
            <Text style={{ fontSize: 22 }}>{status.split(" ")[0]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_500Medium", color: txt }}>
                {status.split(" ").slice(1).join(" ") || status}
              </Text>
              <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 3 }}>Tap to change your status</Text>
            </View>
            <Feather name="chevron-right" size={18} color={txtMut} />
          </Pressable>
        </View>

        {/* Info */}
        <View style={{ marginTop: 24, marginHorizontal: 16 }}>
          <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginLeft: 4 }}>Info</Text>
          <View style={{ backgroundColor: surf, borderRadius: 14, borderWidth: 1, borderColor: border, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, gap: 14 }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={17} color={primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>Username</Text>
                <Text style={{ fontSize: 16, color: txt, fontFamily: "Inter_500Medium", marginTop: 2 }}>@{user.username}</Text>
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: border, marginLeft: 64 }} />
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, gap: 14 }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${theme.success}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="calendar" size={17} color={theme.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>Member since</Text>
                <Text style={{ fontSize: 16, color: txt, fontFamily: "Inter_500Medium", marginTop: 2 }}>{joinedDate}</Text>
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: border, marginLeft: 64 }} />
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, gap: 14 }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${theme.accent}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="message-circle" size={17} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>App</Text>
                <Text style={{ fontSize: 16, color: txt, fontFamily: "Inter_500Medium", marginTop: 2 }}>M Chat by Allan Matt Tech</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Status Picker Modal */}
      <Modal visible={showStatusPicker} animationType="slide" transparent onRequestClose={() => setShowStatusPicker(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt, marginBottom: 16 }}>Set Status</Text>

            {showCustom ? (
              <View>
                <TextInput
                  style={{
                    backgroundColor: theme.inputBg, borderRadius: 12,
                    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: txt,
                    borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular", marginBottom: 14,
                  }}
                  placeholder="Type a custom status..."
                  placeholderTextColor={txtMut}
                  value={customStatus}
                  onChangeText={setCustomStatus}
                  maxLength={60}
                  autoFocus
                />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable style={{ flex: 1, backgroundColor: `${primary}22`, borderRadius: 12, paddingVertical: 14, alignItems: "center" }} onPress={() => setShowCustom(false)}>
                    <Text style={{ color: primary, fontFamily: "Inter_600SemiBold" }}>Back</Text>
                  </Pressable>
                  <Pressable style={{ flex: 1, backgroundColor: primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" }} onPress={() => customStatus.trim() && applyStatus(`✏️ ${customStatus.trim()}`)}>
                    <Text style={{ color: bg, fontFamily: "Inter_600SemiBold" }}>Set</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {STATUS_PRESETS.map((s) => (
                  <Pressable
                    key={s.label}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 14,
                      padding: 14, borderRadius: 12, marginBottom: 8,
                      backgroundColor: status === `${s.emoji} ${s.label}` ? `${primary}22` : theme.surfaceElevated,
                      borderWidth: 1, borderColor: status === `${s.emoji} ${s.label}` ? primary : border,
                    }}
                    onPress={() => applyStatus(`${s.emoji} ${s.label}`)}
                  >
                    <Text style={{ fontSize: 22 }}>{s.emoji}</Text>
                    <Text style={{ flex: 1, fontSize: 16, color: txt, fontFamily: "Inter_400Regular" }}>{s.label}</Text>
                    {status === `${s.emoji} ${s.label}` && <Feather name="check" size={18} color={primary} />}
                  </Pressable>
                ))}
                <Pressable
                  style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 12, backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: border }}
                  onPress={() => setShowCustom(true)}
                >
                  <Text style={{ fontSize: 22 }}>✏️</Text>
                  <Text style={{ flex: 1, fontSize: 16, color: primary, fontFamily: "Inter_500Medium" }}>Custom status...</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Name Modal */}
      <Modal visible={showEditName} animationType="slide" transparent onRequestClose={() => setShowEditName(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt, marginBottom: 20 }}>Edit Profile</Text>
            <Text style={{ fontSize: 13, color: txtSec, fontFamily: "Inter_500Medium", marginBottom: 8 }}>Display Name</Text>
            <TextInput
              style={{ backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular", marginBottom: 14 }}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={txtMut}
            />
            <Text style={{ fontSize: 13, color: txtSec, fontFamily: "Inter_500Medium", marginBottom: 8 }}>Avatar URL (optional)</Text>
            <TextInput
              style={{ backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular", marginBottom: 20 }}
              value={avatarUrl}
              onChangeText={setAvatarUrl}
              placeholder="https://..."
              placeholderTextColor={txtMut}
              autoCapitalize="none"
            />
            <Pressable
              style={{ backgroundColor: primary, borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center" }}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={bg} /> : <Text style={{ color: bg, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>Save Changes</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
