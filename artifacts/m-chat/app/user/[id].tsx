import React from "react";
import {
  View, Text, Image, Pressable, ScrollView,
  ActivityIndicator, Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import UserBadge from "@/components/UserBadge";

const HOBBY_COLORS = [
  "#FF6B9D", "#C77DFF", "#4FC3F7", "#52B788",
  "#FFB74D", "#F77F00", "#FF4D6D", "#4CC9F0",
  "#06D6A0", "#EF476F", "#118AB2", "#FFD166",
];

function hobbyColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return HOBBY_COLORS[h % HOBBY_COLORS.length];
}

function parseHobbies(raw?: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

interface UserProfile {
  id: number;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  hobbies?: string | null;
  status?: string | null;
  isOwner: boolean;
  role?: string;
  createdAt: string;
}

function formatJoined(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { month: "long", year: "numeric" });
}

export default function UserProfileScreen() {
  const { theme } = useTheme();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { id, name, username, avatarUrl: paramAvatar } = useLocalSearchParams<{
    id: string; name: string; username: string; avatarUrl: string;
  }>();

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["user", id, token],
    queryFn: () => apiRequest(`/users/${id}`),
    enabled: !!token && !!id,
  });

  const { data: presence } = useQuery<{ isOnline: boolean; lastSeenAt: string | null }>({
    queryKey: ["presence", id, token],
    queryFn: () => apiRequest(`/presence/${id}`),
    enabled: !!token && !!id,
    refetchInterval: 10000,
  });

  const displayName = profile?.displayName ?? name;
  const uname = profile?.username ?? username;
  const avatar = profile?.avatarUrl ?? (paramAvatar || null);
  const status = profile?.status;

  const goToChat = async () => {
    try {
      const conv = await apiRequest("/conversations", {
        method: "POST",
        body: JSON.stringify({ otherUserId: parseInt(id, 10) }),
      });
      router.replace({
        pathname: "/chat/[id]",
        params: {
          id: conv.id,
          name: displayName,
          username: uname,
          userId: id,
          avatarUrl: avatar ?? "",
        },
      });
    } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header bar */}
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8),
        paddingHorizontal: 12, paddingBottom: 12,
        backgroundColor: theme.surface,
        borderBottomWidth: 1, borderBottomColor: theme.border, gap: 10,
      }}>
        <Pressable style={{ padding: 6 }} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold", color: theme.text }}>
          Profile
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* Avatar + name hero */}
        <View style={{
          alignItems: "center",
          paddingTop: 36, paddingBottom: 28,
          paddingHorizontal: 24,
          backgroundColor: theme.surface,
          borderBottomWidth: 1, borderBottomColor: theme.border,
        }}>
          {isLoading ? (
            <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: theme.surfaceElevated, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : avatar ? (
            <Image
              source={{ uri: avatar }}
              style={{
                width: 100, height: 100, borderRadius: 50,
                borderWidth: 3, borderColor: theme.primary,
              }}
            />
          ) : (
            <View style={{
              width: 100, height: 100, borderRadius: 50,
              backgroundColor: `${theme.primary}33`,
              alignItems: "center", justifyContent: "center",
              borderWidth: 3, borderColor: `${theme.primary}66`,
            }}>
              <Text style={{ fontSize: 40, color: theme.primary, fontFamily: "Inter_700Bold" }}>
                {(displayName ?? "?")[0].toUpperCase()}
              </Text>
            </View>
          )}

          {/* Online dot */}
          {presence?.isOnline && (
            <View style={{
              position: "absolute",
              top: 36 + 72, left: "50%",
              marginLeft: 28,
              width: 18, height: 18, borderRadius: 9,
              backgroundColor: "#22c55e",
              borderWidth: 2.5, borderColor: theme.surface,
            }} />
          )}

          <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: theme.text, marginTop: 16 }}>
            {displayName}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, fontFamily: "Inter_400Regular" }}>
              @{uname}
            </Text>
            <UserBadge isOwner={profile?.isOwner ?? false} role={profile?.role} size="md" />
          </View>

          {/* Status text */}
          {status && (
            <Text style={{ fontSize: 13, color: theme.textMuted, fontFamily: "Inter_400Regular", marginTop: 8, textAlign: "center" }}>
              {status}
            </Text>
          )}

          {/* Online label */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
            <View style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: presence?.isOnline ? "#22c55e" : theme.textMuted,
            }} />
            <Text style={{ fontSize: 13, color: presence?.isOnline ? "#22c55e" : theme.textMuted, fontFamily: "Inter_400Regular" }}>
              {presence?.isOnline
                ? "Online now"
                : presence?.lastSeenAt
                  ? `Last seen ${new Date(presence.lastSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Offline"}
            </Text>
          </View>
        </View>

        {/* Bio */}
        {profile?.bio && (
          <View style={{ marginHorizontal: 20, marginTop: 20, backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", gap: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${theme.accent}22`, alignItems: "center", justifyContent: "center" }}>
              <Feather name="file-text" size={16} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: theme.textMuted, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>Bio</Text>
              <Text style={{ fontSize: 14, color: theme.text, fontFamily: "Inter_400Regular", lineHeight: 21 }}>{profile.bio}</Text>
            </View>
          </View>
        )}

        {/* Hobbies */}
        {parseHobbies(profile?.hobbies).length > 0 && (
          <View style={{ marginHorizontal: 20, marginTop: 14 }}>
            <Text style={{ fontSize: 11, color: theme.textMuted, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10, marginLeft: 4 }}>Hobbies & Interests</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {parseHobbies(profile.hobbies).map((h) => {
                const c = hobbyColor(h);
                return (
                  <View key={h} style={{ backgroundColor: `${c}22`, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: `${c}55` }}>
                    <Text style={{ color: c, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{h}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Info cards */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 12 }}>
          {profile?.createdAt && (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 14,
              backgroundColor: theme.surface, borderRadius: 14,
              paddingHorizontal: 18, paddingVertical: 14,
              borderWidth: 1, borderColor: theme.border,
            }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${theme.primary}18`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="calendar" size={17} color={theme.primary} />
              </View>
              <View>
                <Text style={{ fontSize: 12, color: theme.textMuted, fontFamily: "Inter_400Regular" }}>Joined</Text>
                <Text style={{ fontSize: 14, color: theme.text, fontFamily: "Inter_600SemiBold", marginTop: 1 }}>
                  {formatJoined(profile.createdAt)}
                </Text>
              </View>
            </View>
          )}

          {profile?.isOwner && (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 14,
              backgroundColor: `${theme.primary}10`, borderRadius: 14,
              paddingHorizontal: 18, paddingVertical: 14,
              borderWidth: 1, borderColor: `${theme.primary}33`,
            }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${theme.primary}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="shield" size={17} color={theme.primary} />
              </View>
              <View>
                <Text style={{ fontSize: 14, color: theme.primary, fontFamily: "Inter_700Bold" }}>App Owner</Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, fontFamily: "Inter_400Regular", marginTop: 1 }}>Allan Matt Tech</Text>
              </View>
            </View>
          )}
        </View>

        {/* Message button */}
        <View style={{ paddingHorizontal: 20, paddingTop: 32 }}>
          <Pressable
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
              backgroundColor: pressed ? `${theme.primary}cc` : theme.primary,
              borderRadius: 16, paddingVertical: 15,
            })}
            onPress={goToChat}
          >
            <Feather name="message-circle" size={20} color="#fff" />
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" }}>Message</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
