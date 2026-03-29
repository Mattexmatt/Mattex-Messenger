import React from "react";
import {
  View, Text, FlatList, Pressable, Image, ActivityIndicator, Platform
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";

interface StarredMessage {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  type: string;
  createdAt: string;
  sender: { id: number; displayName: string; avatarUrl?: string | null } | null;
  otherUser: { id: number; displayName: string; username: string; avatarUrl?: string | null } | null;
}

function formatTime(date: string) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 7 * 86400000) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function getPreview(msg: StarredMessage): string {
  if (msg.type === "audio") return "🎤 Voice note";
  if (msg.type === "image") return "🖼️ Photo";
  const main = msg.content.startsWith("↩ \"")
    ? msg.content.split("\n").slice(1).join(" ")
    : msg.content;
  return main.slice(0, 120);
}

export default function StarredScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();

  const { data: starred, isLoading } = useQuery<StarredMessage[]>({
    queryKey: ["starred"],
    queryFn: () => apiRequest("/conversations/starred"),
    enabled: !!token,
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + (Platform.OS === "web" ? 72 : 16),
        paddingHorizontal: 16, paddingBottom: 14,
        backgroundColor: theme.gradientTop,
        borderBottomWidth: 1, borderBottomColor: theme.border,
        flexDirection: "row", alignItems: "center", gap: 4,
      }}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)}
          style={{ padding: 8, marginLeft: -4, marginRight: 4 }}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <Ionicons name="star" size={20} color="#F59E0B" style={{ marginRight: 6 }} />
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "Inter_700Bold", color: theme.text }}>Starred Messages</Text>
        {starred && starred.length > 0 && (
          <View style={{ backgroundColor: `${theme.primary}22`, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ color: theme.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{starred.length}</Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : !starred || starred.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 40 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#F59E0B18", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#F59E0B33" }}>
            <Ionicons name="star-outline" size={38} color="#F59E0B" />
          </View>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: theme.text }}>No starred messages</Text>
          <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textSecondary, textAlign: "center", lineHeight: 22 }}>
            Long-press any message and tap the star to save it here for quick access.
          </Text>
        </View>
      ) : (
        <FlatList
          data={starred}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ paddingVertical: 8 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 72 }} />}
          renderItem={({ item }) => {
            const isOwn = item.senderId === user?.id;
            const chatPartner = item.otherUser;
            const senderName = isOwn ? "You" : (item.sender?.displayName ?? "Unknown");
            return (
              <Pressable
                onPress={() => router.push({
                  pathname: "/chat/[id]",
                  params: {
                    id: item.conversationId,
                    name: chatPartner?.displayName ?? "Chat",
                    username: chatPartner?.username ?? "",
                    userId: chatPartner?.id ?? 0,
                    avatarUrl: chatPartner?.avatarUrl ?? "",
                  } as any,
                })}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center",
                  paddingHorizontal: 16, paddingVertical: 14, gap: 12,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                {/* Avatar */}
                <View style={{ position: "relative" }}>
                  {chatPartner?.avatarUrl ? (
                    <Image source={{ uri: chatPartner.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: `${theme.primary}22`, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: `${theme.primary}44` }}>
                      <Text style={{ color: theme.primary, fontSize: 18, fontFamily: "Inter_700Bold" }}>
                        {(chatPartner?.displayName ?? "?")[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  {/* Star badge */}
                  <View style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: "#F59E0B", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: theme.background }}>
                    <Ionicons name="star" size={10} color="#fff" />
                  </View>
                </View>

                {/* Content */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                    <Text style={{ flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.text }} numberOfLines={1}>
                      {chatPartner?.displayName ?? "Chat"}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textMuted, fontFamily: "Inter_400Regular" }}>
                      {formatTime(item.createdAt)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: theme.textSecondary, fontFamily: "Inter_400Regular" }} numberOfLines={2}>
                    <Text style={{ color: isOwn ? theme.primary : theme.textMuted, fontFamily: "Inter_600SemiBold" }}>
                      {senderName}:{" "}
                    </Text>
                    {getPreview(item)}
                  </Text>
                </View>

                <Feather name="chevron-right" size={16} color={theme.textMuted} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
