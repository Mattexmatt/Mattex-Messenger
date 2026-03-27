import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, TextInput,
  ActivityIndicator, Image, Platform, ScrollView, Modal, Animated
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { apiRequest } from "@/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface ConvUser {
  id: number; username: string; displayName: string; avatarUrl?: string | null; isOwner: boolean; createdAt: string;
}
interface ConvMessage {
  id: number; conversationId: number; senderId: number; content: string; type: string; createdAt: string;
}
interface Conversation {
  id: number; otherUser: ConvUser; lastMessage?: ConvMessage; updatedAt: string; unreadCount?: number;
}

function formatTime(date: string) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} mins`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function AvatarCircle({ user, size = 52, theme }: { user: ConvUser; size?: number; theme: any }) {
  const colors = [
    theme.primary, theme.accent, "#FF6B9D", "#C77DFF", "#4FC3F7", "#FFB74D", "#69F0AE"
  ];
  const color = colors[user.id % colors.length];
  return user.avatarUrl ? (
    <Image source={{ uri: user.avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color + "33",
      borderWidth: 2, borderColor: color,
      alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ color, fontSize: size * 0.38, fontFamily: "Inter_700Bold" }}>
        {user.displayName[0].toUpperCase()}
      </Text>
    </View>
  );
}

const MENU_ITEMS = [
  { icon: "user", label: "My Profile", action: "profile" },
  { icon: "edit-3", label: "New Chat", action: "newchat" },
  { icon: "star", label: "Starred Messages", action: "starred" },
  { icon: "settings", label: "Settings", action: "settings" },
];

export default function ChatsScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ConvUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const queryClient = useQueryClient();

  const { data: conversations, isLoading, refetch } = useQuery<Conversation[]>({
    queryKey: ["conversations", token],
    queryFn: () => apiRequest("/conversations"),
    enabled: !!token,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!token) router.replace("/(auth)/login");
  }, [token]);

  const openMenu = () => {
    setMenuOpen(true);
    Animated.spring(menuAnim, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }).start();
  };

  const closeMenu = () => {
    Animated.timing(menuAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setMenuOpen(false));
  };

  const handleMenuAction = (action: string) => {
    closeMenu();
    setTimeout(() => {
      if (action === "profile") router.push("/my-profile");
      else if (action === "settings") router.push("/(tabs)/profile");
      else if (action === "newchat") searchRef.current?.focus();
    }, 150);
  };

  const searchRef = useRef<TextInput>(null);

  const handleSearch = useCallback(async (q: string) => {
    setSearch(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await apiRequest(`/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(results);
    } catch {} finally { setSearching(false); }
  }, []);

  const startChat = async (otherUser: ConvUser) => {
    try {
      const conv = await apiRequest("/conversations", {
        method: "POST",
        body: JSON.stringify({ otherUserId: otherUser.id }),
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setSearch(""); setSearchResults([]);
      router.push({ pathname: "/chat/[id]", params: { id: conv.id, name: otherUser.displayName, username: otherUser.username } });
    } catch (e) { console.error(e); }
  };

  if (!token) {
    return <View style={{ flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={theme.primary} /></View>;
  }

  const recentContacts = conversations?.map(c => c.otherUser) ?? [];

  const menuScale = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const menuOpacity = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{
        paddingTop: insets.top + (Platform.OS === "web" ? 72 : 16),
        paddingHorizontal: 20,
        paddingBottom: 16,
        backgroundColor: theme.gradientTop,
      }}>
        {/* Title Row */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
          <Text style={{ flex: 1, fontSize: 26, fontFamily: "Inter_700Bold", color: theme.text }}>Chats</Text>
          {/* Compose button */}
          <Pressable
            style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: `${theme.primary}22`,
              alignItems: "center", justifyContent: "center",
              marginRight: 10,
            }}
            onPress={() => searchRef.current?.focus()}
          >
            <Feather name="edit-2" size={17} color={theme.primary} />
          </Pressable>
          {/* Hamburger menu */}
          <Pressable
            style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: `${theme.primary}22`,
              alignItems: "center", justifyContent: "center",
              gap: 4,
            }}
            onPress={openMenu}
          >
            <View style={{ width: 18, height: 2, backgroundColor: theme.primary, borderRadius: 1 }} />
            <View style={{ width: 18, height: 2, backgroundColor: theme.primary, borderRadius: 1 }} />
            <View style={{ width: 18, height: 2, backgroundColor: theme.primary, borderRadius: 1 }} />
          </Pressable>
        </View>

        {/* Search bar */}
        <View style={{
          flexDirection: "row", alignItems: "center",
          backgroundColor: theme.surface + "CC",
          borderRadius: 14, paddingHorizontal: 14, height: 44,
          borderWidth: 1, borderColor: theme.border,
        }}>
          <Feather name="search" size={16} color={theme.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            ref={searchRef}
            style={{ flex: 1, fontSize: 15, color: theme.text, fontFamily: "Inter_400Regular" }}
            placeholder="Search or start new chat"
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator size="small" color={theme.primary} />}
          {!!search && (
            <Pressable onPress={() => { setSearch(""); setSearchResults([]); }} hitSlop={8}>
              <Feather name="x" size={16} color={theme.textMuted} />
            </Pressable>
          )}
        </View>

        {recentContacts.length > 0 && !search && (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={{ marginTop: 18 }}
            contentContainerStyle={{ gap: 16, paddingRight: 8 }}
          >
            {recentContacts.slice(0, 8).map(u => (
              <Pressable
                key={u.id}
                style={{ alignItems: "center", gap: 6 }}
                onPress={() => startChat(u)}
              >
                <View style={{
                  borderWidth: 2.5, borderColor: theme.primary,
                  borderRadius: 34, padding: 2,
                }}>
                  <AvatarCircle user={u} size={56} theme={theme} />
                </View>
                <Text style={{
                  color: theme.text, fontSize: 11,
                  fontFamily: "Inter_500Medium",
                  maxWidth: 60, textAlign: "center",
                }} numberOfLines={1}>{u.displayName.split(" ")[0]}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {search.length > 0 ? (
        <FlatList
          data={searchResults}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ paddingTop: 8 }}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center",
                paddingHorizontal: 20, paddingVertical: 14, gap: 14,
                opacity: pressed ? 0.7 : 1,
              })}
              onPress={() => startChat(item)}
            >
              <AvatarCircle user={item} size={54} theme={theme} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: theme.text }}>{item.displayName}</Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, fontFamily: "Inter_400Regular", marginTop: 2 }}>@{item.username}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={theme.textMuted} />
            </Pressable>
          )}
          ListEmptyComponent={
            !searching ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 }}>
                <Ionicons name="search-outline" size={48} color={theme.textMuted} />
                <Text style={{ color: theme.textSecondary, fontSize: 16, fontFamily: "Inter_400Regular" }}>No users found</Text>
              </View>
            ) : null
          }
        />
      ) : (
        <FlatList
          data={conversations ?? []}
          keyExtractor={(i) => String(i.id)}
          onRefresh={refetch}
          refreshing={false}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
              <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textSecondary, letterSpacing: 0.5 }}>MESSAGES</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center",
                paddingHorizontal: 20, paddingVertical: 12, gap: 14,
                opacity: pressed ? 0.75 : 1,
              })}
              onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id, name: item.otherUser.displayName, username: item.otherUser.username } })}
            >
              <AvatarCircle user={item.otherUser} size={56} theme={theme} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: theme.text }}>{item.otherUser.displayName}</Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, fontFamily: "Inter_400Regular", marginTop: 3 }} numberOfLines={1}>
                  {item.lastMessage
                    ? item.lastMessage.type === "audio" ? "🎤 Voice note"
                    : item.lastMessage.type === "image" ? "🖼️ Image"
                    : item.lastMessage.senderId === user?.id ? `You: ${item.lastMessage.content}` : item.lastMessage.content
                    : "Start a conversation"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                {item.lastMessage && (
                  <Text style={{ fontSize: 12, color: theme.textMuted, fontFamily: "Inter_400Regular" }}>{formatTime(item.lastMessage.createdAt)}</Text>
                )}
                {(item.unreadCount ?? 0) > 0 && (
                  <View style={{
                    backgroundColor: theme.badge,
                    minWidth: 20, height: 20, borderRadius: 10,
                    alignItems: "center", justifyContent: "center",
                    paddingHorizontal: 5,
                  }}>
                    <Text style={{ color: theme.badgeText, fontSize: 11, fontFamily: "Inter_700Bold" }}>{item.unreadCount}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 90 }} />
          )}
          ListEmptyComponent={
            isLoading ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 }}>
                <ActivityIndicator color={theme.primary} />
              </View>
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 }}>
                <Feather name="message-circle" size={56} color={theme.textMuted} />
                <Text style={{ color: theme.textSecondary, fontSize: 16, fontFamily: "Inter_400Regular" }}>No conversations yet</Text>
                <Text style={{ color: theme.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" }}>Search for someone above to start chatting</Text>
              </View>
            )
          }
        />
      )}

      {/* Hamburger Dropdown Menu */}
      {menuOpen && (
        <Modal visible transparent animationType="none" onRequestClose={closeMenu}>
          <Pressable style={{ flex: 1 }} onPress={closeMenu}>
            <Animated.View style={{
              position: "absolute",
              top: insets.top + (Platform.OS === "web" ? 100 : 72),
              right: 16,
              backgroundColor: theme.surface,
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: theme.border,
              minWidth: 200,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4,
              shadowRadius: 20,
              elevation: 20,
              opacity: menuOpacity,
              transform: [{ scale: menuScale }, { translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
              transformOrigin: "top right",
            }}>
              {MENU_ITEMS.map((item, idx) => (
                <React.Fragment key={item.action}>
                  <Pressable
                    style={({ pressed }) => ({
                      flexDirection: "row", alignItems: "center", gap: 14,
                      paddingHorizontal: 18, paddingVertical: 15,
                      backgroundColor: pressed ? `${theme.primary}18` : "transparent",
                    })}
                    onPress={() => handleMenuAction(item.action)}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: `${theme.primary}22`, alignItems: "center", justifyContent: "center" }}>
                      <Feather name={item.icon as any} size={15} color={theme.primary} />
                    </View>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: theme.text }}>{item.label}</Text>
                  </Pressable>
                  {idx < MENU_ITEMS.length - 1 && (
                    <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 64 }} />
                  )}
                </React.Fragment>
              ))}
            </Animated.View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
