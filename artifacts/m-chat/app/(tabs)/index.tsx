import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, TextInput,
  ActivityIndicator, Image, Platform
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
  id: number; otherUser: ConvUser; lastMessage?: ConvMessage; updatedAt: string;
}

function formatTime(date: string) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatsScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ConvUser[]>([]);
  const [searching, setSearching] = useState(false);
  const queryClient = useQueryClient();

  const { data: conversations, isLoading, refetch } = useQuery<Conversation[]>({
    queryKey: ["conversations", token],
    queryFn: () => apiRequest("/conversations"),
    enabled: !!token,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!token) {
      router.push("/(auth)/login");
    }
  }, [token]);

  const handleSearch = useCallback(async (q: string) => {
    setSearch(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await apiRequest(`/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(results);
    } catch {}
    finally { setSearching(false); }
  }, []);

  const startChat = async (otherUser: ConvUser) => {
    try {
      const conv = await apiRequest("/conversations", {
        method: "POST",
        body: JSON.stringify({ otherUserId: otherUser.id }),
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setSearch("");
      setSearchResults([]);
      router.push({ pathname: "/chat/[id]", params: { id: conv.id, name: otherUser.displayName, username: otherUser.username } });
    } catch (e) { console.error(e); }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 12, backgroundColor: theme.background,
    },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    headerTitle: { fontSize: 28, fontWeight: "800" as const, color: theme.text, fontFamily: "Inter_700Bold" },
    composeBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: theme.primary, alignItems: "center", justifyContent: "center",
    },
    searchBox: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: theme.inputBg, borderRadius: 12,
      paddingHorizontal: 12, height: 42, gap: 8,
      borderWidth: 1, borderColor: theme.border,
    },
    searchInput: { flex: 1, fontSize: 15, color: theme.text, fontFamily: "Inter_400Regular" },
    convItem: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 20, paddingVertical: 14, gap: 14,
    },
    avatar: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: theme.primary, alignItems: "center", justifyContent: "center",
    },
    avatarText: { color: theme.isDark ? "#000" : "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
    convInfo: { flex: 1 },
    convName: { fontSize: 16, fontWeight: "600" as const, color: theme.text, fontFamily: "Inter_600SemiBold" },
    convLast: { fontSize: 13, color: theme.textSecondary, fontFamily: "Inter_400Regular", marginTop: 2 },
    convTime: { fontSize: 12, color: theme.textMuted, fontFamily: "Inter_400Regular" },
    sep: { height: 1, backgroundColor: theme.border, marginLeft: 86 },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    emptyText: { color: theme.textSecondary, fontSize: 16, fontFamily: "Inter_400Regular" },
    emptyHint: { color: theme.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
    sectionHead: { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: theme.surface },
    sectionHeadText: { fontSize: 12, fontWeight: "600" as const, color: theme.textMuted, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  });

  const renderConversation = ({ item }: { item: Conversation }) => (
    <Pressable
      style={({ pressed }) => [s.convItem, { opacity: pressed ? 0.7 : 1 }]}
      onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id, name: item.otherUser.displayName, username: item.otherUser.username } })}
    >
      {item.otherUser.avatarUrl ? (
        <Image source={{ uri: item.otherUser.avatarUrl }} style={[s.avatar, { borderRadius: 26 }]} />
      ) : (
        <View style={s.avatar}>
          <Text style={s.avatarText}>{item.otherUser.displayName[0].toUpperCase()}</Text>
        </View>
      )}
      <View style={s.convInfo}>
        <Text style={s.convName}>{item.otherUser.displayName}</Text>
        <Text style={s.convLast} numberOfLines={1}>
          {item.lastMessage ? (
            item.lastMessage.type === "audio" ? "🎤 Voice note" :
            item.lastMessage.type === "image" ? "🖼️ Image" :
            item.lastMessage.content
          ) : "Start a conversation"}
        </Text>
      </View>
      {item.lastMessage && (
        <Text style={s.convTime}>{formatTime(item.lastMessage.createdAt)}</Text>
      )}
    </Pressable>
  );

  const renderSearchResult = ({ item }: { item: ConvUser }) => (
    <Pressable
      style={({ pressed }) => [s.convItem, { opacity: pressed ? 0.7 : 1 }]}
      onPress={() => startChat(item)}
    >
      <View style={s.avatar}>
        <Text style={s.avatarText}>{item.displayName[0].toUpperCase()}</Text>
      </View>
      <View style={s.convInfo}>
        <Text style={s.convName}>{item.displayName}</Text>
        <Text style={s.convLast}>@{item.username}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={theme.textMuted} />
    </Pressable>
  );

  if (!token) {
    return (
      <View style={[s.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.headerTitle}>Messages</Text>
          <Pressable style={s.composeBtn} onPress={() => setSearch("")}>
            <Feather name="edit-2" size={18} color={theme.isDark ? "#000" : "#fff"} />
          </Pressable>
        </View>
        <View style={s.searchBox}>
          <Feather name="search" size={16} color={theme.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search users..."
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator size="small" color={theme.primary} />}
          {!!search && (
            <Pressable onPress={() => { setSearch(""); setSearchResults([]); }}>
              <Feather name="x" size={16} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {search.length > 0 ? (
        <FlatList
          data={searchResults}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderSearchResult}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          ListHeaderComponent={
            searchResults.length > 0 ? (
              <View style={s.sectionHead}>
                <Text style={s.sectionHeadText}>USERS</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            !searching ? (
              <View style={s.emptyWrap}>
                <Ionicons name="search-outline" size={48} color={theme.textMuted} />
                <Text style={s.emptyText}>No users found</Text>
              </View>
            ) : null
          }
          scrollEnabled={searchResults.length > 0}
        />
      ) : isLoading ? (
        <View style={s.emptyWrap}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations ?? []}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderConversation}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          onRefresh={refetch}
          refreshing={false}
          scrollEnabled={!!(conversations?.length)}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Feather name="message-circle" size={56} color={theme.textMuted} />
              <Text style={s.emptyText}>No conversations yet</Text>
              <Text style={s.emptyHint}>Search for a user above to start chatting</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
