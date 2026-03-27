import React, { useState, useEffect } from "react";
import {
  View, Text, Pressable, ScrollView, Modal, TextInput,
  Platform, Image, Alert, ActivityIndicator
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/utils/api";
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

interface ConvUser {
  id: number; username: string; displayName: string; avatarUrl?: string | null;
  status?: string | null; statusUpdatedAt?: string | null; isOwner: boolean; createdAt: string;
}
interface Conversation {
  id: number; otherUser: ConvUser; updatedAt: string;
}

function formatStatusTime(ts?: string | null): string {
  if (!ts) return "Status not set";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function AvatarRing({ user, size = 52, color, hasStatus }: { user: ConvUser; size?: number; color: string; hasStatus: boolean }) {
  return (
    <View style={{ position: "relative" }}>
      <View style={{ borderWidth: hasStatus ? 2.5 : 1, borderColor: hasStatus ? color : `${color}33`, borderRadius: (size + 12) / 2, padding: 2 }}>
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        ) : (
          <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}22`, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: size * 0.38, color, fontFamily: "Inter_700Bold" }}>{user.displayName[0].toUpperCase()}</Text>
          </View>
        )}
      </View>
      {hasStatus && (
        <View style={{ position: "absolute", bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: color, borderWidth: 2, borderColor: "#000" }} />
      )}
    </View>
  );
}

export default function StatusScreen() {
  const { theme } = useTheme();
  const { user, token, updateUser } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customStatus, setCustomStatus] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ["conversations", token],
    queryFn: () => apiRequest("/conversations"),
    enabled: !!token,
    refetchInterval: 15000,
  });

  const applyStatus = async (val: string) => {
    setSavingStatus(true);
    try {
      const updated = await apiRequest("/users/me", {
        method: "PUT",
        body: JSON.stringify({ status: val }),
      });
      updateUser(updated);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setShowStatusPicker(false);
      setShowCustom(false);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSavingStatus(false);
    }
  };

  const bg = theme.background;
  const surf = theme.surface;
  const border = theme.border;
  const primary = theme.primary;
  const txt = theme.text;
  const txtSec = theme.textSecondary;
  const txtMut = theme.textMuted;

  const AVATAR_COLORS = [primary, theme.accent, "#FF6B9D", "#C77DFF", "#4FC3F7", "#FFB74D", "#69F0AE"];
  const contacts = conversations?.map(c => c.otherUser) ?? [];
  const myStatus = user?.status ?? "🟢 Available";
  const myStatusEmoji = myStatus.split(" ")[0];
  const myStatusText = myStatus.split(" ").slice(1).join(" ") || myStatus;

  if (!token) {
    return (
      <View style={{ flex: 1, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + (Platform.OS === "web" ? 72 : 16), paddingHorizontal: 20, paddingBottom: 20, backgroundColor: theme.gradientTop }}>
        <Text style={{ fontSize: 28, fontFamily: "Inter_700Bold", color: txt }}>Updates</Text>
        <Text style={{ fontSize: 14, color: txtSec, fontFamily: "Inter_400Regular", marginTop: 3 }}>Live status from your contacts</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* My Status */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>My Status</Text>
          <Pressable
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: 16,
              backgroundColor: surf, borderRadius: 18, padding: 16,
              borderWidth: 1.5, borderColor: `${primary}55`,
              opacity: pressed ? 0.85 : 1,
            })}
            onPress={() => setShowStatusPicker(true)}
            disabled={savingStatus}
          >
            <View style={{ position: "relative" }}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2.5, borderColor: primary }} />
              ) : (
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: `${primary}22`, borderWidth: 2.5, borderColor: primary, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: primary }}>{user?.displayName[0].toUpperCase()}</Text>
                </View>
              )}
              <View style={{ position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: surf }}>
                {savingStatus
                  ? <ActivityIndicator size="small" color={bg} />
                  : <Feather name="edit-2" size={11} color={bg} />}
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: txt }}>{user?.displayName}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Text style={{ fontSize: 18 }}>{myStatusEmoji}</Text>
                <Text style={{ fontSize: 14, color: txtSec, fontFamily: "Inter_400Regular" }}>{myStatusText}</Text>
              </View>
              <Text style={{ fontSize: 11, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 4 }}>
                Updated {user?.statusUpdatedAt ? formatStatusTime(user.statusUpdatedAt) : "just now"}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={txtMut} />
          </Pressable>
        </View>

        {/* Contact Statuses */}
        <View style={{ paddingHorizontal: 16, paddingTop: 28 }}>
          <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Contact Status</Text>

          {isLoading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator color={primary} />
            </View>
          ) : contacts.length === 0 ? (
            <View style={{ backgroundColor: surf, borderRadius: 16, padding: 32, alignItems: "center", gap: 12, borderWidth: 1, borderColor: border }}>
              <Ionicons name="radio-outline" size={48} color={txtMut} />
              <Text style={{ color: txtSec, fontSize: 16, fontFamily: "Inter_500Medium" }}>No contacts yet</Text>
              <Text style={{ color: txtMut, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" }}>Start a chat and their status will appear here</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: surf, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: "hidden" }}>
              {contacts.map((contact, idx) => {
                const color = AVATAR_COLORS[contact.id % AVATAR_COLORS.length];
                const contactStatus = contact.status ?? "🟢 Available";
                const statusEmoji = contactStatus.split(" ")[0];
                const statusText = contactStatus.split(" ").slice(1).join(" ") || contactStatus;
                const timeStr = formatStatusTime(contact.statusUpdatedAt);
                const hasStatus = !!contact.status;

                return (
                  <React.Fragment key={contact.id}>
                    <Pressable
                      style={({ pressed }) => ({
                        flexDirection: "row", alignItems: "center", gap: 14,
                        paddingHorizontal: 16, paddingVertical: 14,
                        opacity: pressed ? 0.7 : 1,
                      })}
                      onPress={() => router.push({ pathname: "/chat/[id]", params: { id: conversations![idx].id, name: contact.displayName, username: contact.username } })}
                    >
                      <AvatarRing user={contact} size={50} color={color} hasStatus={hasStatus} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: txt }}>{contact.displayName}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                          <Text style={{ fontSize: 14 }}>{statusEmoji}</Text>
                          <Text style={{ fontSize: 13, color: hasStatus ? color : txtMut, fontFamily: "Inter_400Regular" }} numberOfLines={1}>
                            {statusText}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 2 }}>{timeStr}</Text>
                      </View>
                    </Pressable>
                    {idx < contacts.length - 1 && <View style={{ height: 1, backgroundColor: border, marginLeft: 80 }} />}
                  </React.Fragment>
                );
              })}
            </View>
          )}
        </View>

        {/* Quick actions */}
        <View style={{ paddingHorizontal: 16, paddingTop: 28 }}>
          <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Quick Actions</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable style={{ flex: 1, backgroundColor: surf, borderRadius: 16, padding: 18, alignItems: "center", gap: 10, borderWidth: 1, borderColor: border }} onPress={() => router.push("/my-profile")}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={22} color={primary} />
              </View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: txt, textAlign: "center" }}>My Profile</Text>
            </Pressable>
            <Pressable style={{ flex: 1, backgroundColor: surf, borderRadius: 16, padding: 18, alignItems: "center", gap: 10, borderWidth: 1, borderColor: border }} onPress={() => setShowStatusPicker(true)}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: `${theme.accent}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="zap" size={22} color={theme.accent} />
              </View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: txt, textAlign: "center" }}>Set Status</Text>
            </Pressable>
            <Pressable style={{ flex: 1, backgroundColor: surf, borderRadius: 16, padding: 18, alignItems: "center", gap: 10, borderWidth: 1, borderColor: border }} onPress={() => router.push("/settings")}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: `${theme.success}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="settings" size={22} color={theme.success} />
              </View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: txt, textAlign: "center" }}>Settings</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Status Picker Modal */}
      <Modal visible={showStatusPicker} animationType="slide" transparent onRequestClose={() => { setShowStatusPicker(false); setShowCustom(false); }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, maxHeight: "80%" }}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt, marginBottom: 4 }}>Set Your Status</Text>
            <Text style={{ fontSize: 13, color: txtMut, fontFamily: "Inter_400Regular", marginBottom: 16 }}>Your contacts will see this in real time</Text>

            {showCustom ? (
              <View>
                <TextInput
                  style={{ backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular", marginBottom: 14 }}
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
                    {savingStatus ? <ActivityIndicator color={bg} /> : <Text style={{ color: bg, fontFamily: "Inter_600SemiBold" }}>Set Status</Text>}
                  </Pressable>
                </View>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {STATUS_PRESETS.map((s) => {
                  const val = `${s.emoji} ${s.label}`;
                  const active = myStatus === val;
                  return (
                    <Pressable
                      key={s.label}
                      style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 12, marginBottom: 8, backgroundColor: active ? `${primary}22` : theme.surfaceElevated, borderWidth: 1, borderColor: active ? primary : border }}
                      onPress={() => applyStatus(val)}
                    >
                      <Text style={{ fontSize: 22 }}>{s.emoji}</Text>
                      <Text style={{ flex: 1, fontSize: 16, color: txt, fontFamily: "Inter_400Regular" }}>{s.label}</Text>
                      {active && <Feather name="check" size={18} color={primary} />}
                    </Pressable>
                  );
                })}
                <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 12, backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: border }} onPress={() => setShowCustom(true)}>
                  <Text style={{ fontSize: 22 }}>✏️</Text>
                  <Text style={{ flex: 1, fontSize: 16, color: primary, fontFamily: "Inter_500Medium" }}>Custom status...</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
