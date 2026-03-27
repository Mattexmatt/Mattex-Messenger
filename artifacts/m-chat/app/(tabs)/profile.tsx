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
import { useQuery } from "@tanstack/react-query";
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

interface ConvUser {
  id: number; username: string; displayName: string; avatarUrl?: string | null; isOwner: boolean; createdAt: string;
}
interface Conversation {
  id: number; otherUser: ConvUser; updatedAt: string;
}

function AvatarRing({ user, size = 52, color, hasUpdate }: { user: ConvUser; size?: number; color: string; hasUpdate: boolean }) {
  return (
    <View style={{ position: "relative" }}>
      <View style={{ borderWidth: hasUpdate ? 2.5 : 1.5, borderColor: hasUpdate ? color : `${color}44`, borderRadius: (size + 10) / 2, padding: 2 }}>
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        ) : (
          <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}22`, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: size * 0.38, color, fontFamily: "Inter_700Bold" }}>{user.displayName[0].toUpperCase()}</Text>
          </View>
        )}
      </View>
      {hasUpdate && (
        <View style={{ position: "absolute", bottom: 2, right: 2, width: 13, height: 13, borderRadius: 7, backgroundColor: color, borderWidth: 2, borderColor: "#000" }} />
      )}
    </View>
  );
}

export default function StatusScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();

  const [myStatus, setMyStatus] = useState("🟢 Available");
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customStatus, setCustomStatus] = useState("");

  useEffect(() => {
    AsyncStorage.getItem("mchat_status").then((s) => { if (s) setMyStatus(s); });
  }, []);

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ["conversations", token],
    queryFn: () => apiRequest("/conversations"),
    enabled: !!token,
    refetchInterval: 30000,
  });

  const applyStatus = async (val: string) => {
    setMyStatus(val);
    await AsyncStorage.setItem("mchat_status", val);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowStatusPicker(false);
    setShowCustom(false);
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
        <Text style={{ fontSize: 14, color: txtSec, fontFamily: "Inter_400Regular", marginTop: 3 }}>Status & recent activity</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* My Status */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>My Status</Text>

          <Pressable
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: 16,
              backgroundColor: surf, borderRadius: 18, padding: 16,
              borderWidth: 1.5, borderColor: primary + "66",
              opacity: pressed ? 0.85 : 1,
            })}
            onPress={() => setShowStatusPicker(true)}
          >
            {/* Avatar with camera add icon */}
            <View style={{ position: "relative" }}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2.5, borderColor: primary }} />
              ) : (
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: `${primary}22`, borderWidth: 2.5, borderColor: primary, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: primary }}>{user?.displayName[0].toUpperCase()}</Text>
                </View>
              )}
              <View style={{ position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: surf }}>
                <Feather name="edit-2" size={11} color={bg} />
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: txt }}>{user?.displayName}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Text style={{ fontSize: 18 }}>{myStatus.split(" ")[0]}</Text>
                <Text style={{ fontSize: 14, color: txtSec, fontFamily: "Inter_400Regular" }}>{myStatus.split(" ").slice(1).join(" ")}</Text>
              </View>
              <Text style={{ fontSize: 11, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 4 }}>Tap to update your status</Text>
            </View>

            <Feather name="chevron-right" size={18} color={txtMut} />
          </Pressable>
        </View>

        {/* Recent Updates from Contacts */}
        <View style={{ paddingHorizontal: 16, paddingTop: 28 }}>
          <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
            Recent Updates
          </Text>

          {contacts.length === 0 ? (
            <View style={{ backgroundColor: surf, borderRadius: 16, padding: 32, alignItems: "center", gap: 12, borderWidth: 1, borderColor: border }}>
              <Ionicons name="radio-outline" size={48} color={txtMut} />
              <Text style={{ color: txtSec, fontSize: 16, fontFamily: "Inter_500Medium" }}>No updates yet</Text>
              <Text style={{ color: txtMut, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" }}>When your contacts set their status, they'll appear here</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: surf, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: "hidden" }}>
              {contacts.map((contact, idx) => {
                const color = AVATAR_COLORS[contact.id % AVATAR_COLORS.length];
                const hasUpdate = idx < 3;
                const timeAgo = hasUpdate ? (idx === 0 ? "just now" : idx === 1 ? "5 mins ago" : "1 hr ago") : "No updates";

                return (
                  <React.Fragment key={contact.id}>
                    <Pressable
                      style={({ pressed }) => ({
                        flexDirection: "row", alignItems: "center", gap: 14,
                        paddingHorizontal: 16, paddingVertical: 14,
                        opacity: pressed ? 0.7 : 1,
                        backgroundColor: hasUpdate ? `${color}08` : "transparent",
                      })}
                      onPress={() => hasUpdate && Alert.alert(`${contact.displayName}'s Status`, "🟢 Available")}
                    >
                      <AvatarRing user={contact} size={50} color={color} hasUpdate={hasUpdate} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: hasUpdate ? txt : txtSec }}>{contact.displayName}</Text>
                        <Text style={{ fontSize: 12, color: hasUpdate ? color : txtMut, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                          {hasUpdate ? `🟢 Available · ${timeAgo}` : "No recent updates"}
                        </Text>
                      </View>
                      {hasUpdate && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                      )}
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
            <Pressable
              style={{ flex: 1, backgroundColor: surf, borderRadius: 16, padding: 18, alignItems: "center", gap: 10, borderWidth: 1, borderColor: border }}
              onPress={() => router.push("/my-profile")}
            >
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={22} color={primary} />
              </View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: txt, textAlign: "center" }}>My Profile</Text>
            </Pressable>

            <Pressable
              style={{ flex: 1, backgroundColor: surf, borderRadius: 16, padding: 18, alignItems: "center", gap: 10, borderWidth: 1, borderColor: border }}
              onPress={() => setShowStatusPicker(true)}
            >
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: `${theme.accent}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="zap" size={22} color={theme.accent} />
              </View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: txt, textAlign: "center" }}>Set Status</Text>
            </Pressable>

            <Pressable
              style={{ flex: 1, backgroundColor: surf, borderRadius: 16, padding: 18, alignItems: "center", gap: 10, borderWidth: 1, borderColor: border }}
              onPress={() => router.push("/settings")}
            >
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
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt, marginBottom: 16 }}>Set Your Status</Text>

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
                    <Text style={{ color: bg, fontFamily: "Inter_600SemiBold" }}>Set Status</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {STATUS_PRESETS.map((s) => (
                  <Pressable
                    key={s.label}
                    style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 12, marginBottom: 8, backgroundColor: myStatus === `${s.emoji} ${s.label}` ? `${primary}22` : theme.surfaceElevated, borderWidth: 1, borderColor: myStatus === `${s.emoji} ${s.label}` ? primary : border }}
                    onPress={() => applyStatus(`${s.emoji} ${s.label}`)}
                  >
                    <Text style={{ fontSize: 22 }}>{s.emoji}</Text>
                    <Text style={{ flex: 1, fontSize: 16, color: txt, fontFamily: "Inter_400Regular" }}>{s.label}</Text>
                    {myStatus === `${s.emoji} ${s.label}` && <Feather name="check" size={18} color={primary} />}
                  </Pressable>
                ))}
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
