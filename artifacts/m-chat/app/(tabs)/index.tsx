import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, TextInput,
  ActivityIndicator, Image, Platform, ScrollView, Modal, Animated,
  Alert,
} from "react-native";
const mattexAvatar = require("@/assets/images/mattex-avatar.png");
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { apiRequest } from "@/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import UserBadge from "@/components/UserBadge";
import AvatarPreview from "@/components/AvatarPreview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

interface ConvUser {
  id: number; username: string; displayName: string; avatarUrl?: string | null; isOwner: boolean; role?: string; createdAt: string;
  isOnline?: boolean; lastSeenAt?: string | null;
}
interface ConvMessage {
  id: number; conversationId: number; senderId: number; content: string; type: string; createdAt: string;
}
interface Conversation {
  id: number; otherUser: ConvUser; lastMessage?: ConvMessage; updatedAt: string; unreadCount?: number;
}

const EASE_IN_OUT = { duration: 200, useNativeDriver: true } as const;

function formatTime(date: string) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} mins`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── Skeleton Shimmer ──────────────────────────────────────────────────────────
function SkeletonItem({ theme }: { theme: any }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 750, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

  const block = (w: number | string, h: number, r = 6) => (
    <Animated.View style={{ width: w, height: h, borderRadius: r, backgroundColor: theme.border, opacity }} />
  );

  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 13, gap: 14 }}>
      <Animated.View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.border, opacity }} />
      <View style={{ flex: 1, gap: 8 }}>
        {block("55%", 14, 7)}
        {block("80%", 11, 7)}
      </View>
      <View style={{ alignItems: "flex-end", gap: 8 }}>
        {block(36, 10, 5)}
        {block(22, 22, 11)}
      </View>
    </View>
  );
}

function SkeletonList({ theme }: { theme: any }) {
  return (
    <>
      {[...Array(7)].map((_, i) => (
        <React.Fragment key={i}>
          <SkeletonItem theme={theme} />
          {i < 6 && <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 90 }} />}
        </React.Fragment>
      ))}
    </>
  );
}

// ─── Avatar Circle ─────────────────────────────────────────────────────────────
function AvatarCircle({ user, size = 52, theme }: { user: ConvUser; size?: number; theme: any }) {
  const colors = [theme.primary, theme.accent, "#FF6B9D", "#C77DFF", "#4FC3F7", "#FFB74D", "#69F0AE"];
  const color = colors[user.id % colors.length];
  const dotSize = Math.max(10, Math.round(size * 0.22));
  return (
    <View style={{ position: "relative" }}>
      {user.avatarUrl ? (
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
      )}
      {user.isOnline && (
        <View style={{
          position: "absolute", bottom: 0, right: 0,
          width: dotSize, height: dotSize, borderRadius: dotSize / 2,
          backgroundColor: "#22c55e",
          borderWidth: 2.5, borderColor: theme.background,
        }} />
      )}
    </View>
  );
}

// ─── People on M Chat modal ────────────────────────────────────────────────────
function PeopleModal({
  visible, peopleSearch, setPeopleSearch, onClose, onStartChat, token, theme, insets,
}: {
  visible: boolean; peopleSearch: string; setPeopleSearch: (s: string) => void;
  onClose: () => void; onStartChat: (u: ConvUser) => void;
  token: string | null; theme: any; insets: any;
}) {
  const hasQuery = peopleSearch.trim().length >= 2;

  const { data: results, isLoading } = useQuery<ConvUser[]>({
    queryKey: ["userSearch", token, peopleSearch.trim()],
    queryFn: () => apiRequest(`/users/search?q=${encodeURIComponent(peopleSearch.trim())}`),
    enabled: !!token && hasQuery,
    staleTime: 10_000,
  });

  const colors = [theme.primary, theme.accent, "#FF6B9D", "#C77DFF", "#4FC3F7", "#FFB74D", "#69F0AE"];
  const searchInputRef = React.useRef<TextInput>(null);

  React.useEffect(() => {
    if (visible) setTimeout(() => searchInputRef.current?.focus(), 300);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable style={{
          backgroundColor: theme.background,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingBottom: insets.bottom + 20,
          maxHeight: "92%",
        }} onPress={(e) => e.stopPropagation?.()}>
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border }} />
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: theme.text }}>New Chat</Text>
              <Text style={{ fontSize: 13, color: theme.textMuted, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                Search by name or username
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.surfaceElevated, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="x" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View style={{
            flexDirection: "row", alignItems: "center",
            marginHorizontal: 20, marginBottom: 16,
            backgroundColor: theme.surface,
            borderRadius: 14, paddingHorizontal: 14, height: 48,
            borderWidth: 1.5, borderColor: hasQuery ? `${theme.primary}88` : theme.border,
          }}>
            <Feather name="search" size={17} color={hasQuery ? theme.primary : theme.textMuted} style={{ marginRight: 10 }} />
            <TextInput
              ref={searchInputRef}
              style={{ flex: 1, fontSize: 16, color: theme.text, fontFamily: "Inter_400Regular" }}
              placeholder="Type a name or @username..."
              placeholderTextColor={theme.textMuted}
              value={peopleSearch}
              onChangeText={setPeopleSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {peopleSearch.length > 0 && (
              <Pressable onPress={() => setPeopleSearch("")} hitSlop={10}>
                <Feather name="x-circle" size={17} color={theme.textMuted} />
              </Pressable>
            )}
          </View>

          {!hasQuery ? (
            <View style={{ paddingTop: 48, alignItems: "center", gap: 14, paddingHorizontal: 40 }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: `${theme.primary}18`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="search" size={36} color={theme.primary} />
              </View>
              <Text style={{ color: theme.text, fontFamily: "Inter_600SemiBold", fontSize: 18, textAlign: "center" }}>Find someone</Text>
              <Text style={{ color: theme.textSecondary, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 21 }}>
                Type at least 2 characters to search. Share your username with friends so they can find you.
              </Text>
            </View>
          ) : isLoading ? (
            <View style={{ paddingTop: 50, alignItems: "center", gap: 12 }}>
              <ActivityIndicator color={theme.primary} />
              <Text style={{ color: theme.textMuted, fontFamily: "Inter_400Regular", fontSize: 14 }}>Searching...</Text>
            </View>
          ) : (
            <FlatList
              data={results ?? []}
              keyExtractor={(u) => String(u.id)}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const color = colors[item.id % colors.length];
                return (
                  <Pressable
                    style={({ pressed }) => ({
                      flexDirection: "row", alignItems: "center", gap: 14,
                      paddingVertical: 10, paddingHorizontal: 14,
                      backgroundColor: pressed ? `${theme.primary}12` : theme.surface,
                      borderRadius: 16, borderWidth: 1, borderColor: theme.border,
                    })}
                    onPress={() => onStartChat(item)}
                  >
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={{ width: 52, height: 52, borderRadius: 26 }} />
                    ) : (
                      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: `${color}33`, borderWidth: 2, borderColor: color, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color, fontSize: 20, fontFamily: "Inter_700Bold" }}>{item.displayName[0].toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: theme.text }}>{item.displayName}</Text>
                      <Text style={{ fontSize: 13, color: theme.textMuted, fontFamily: "Inter_400Regular", marginTop: 2 }}>@{item.username}</Text>
                    </View>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${theme.primary}22`, alignItems: "center", justifyContent: "center" }}>
                      <Feather name="message-circle" size={17} color={theme.primary} />
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={{ paddingTop: 40, alignItems: "center", gap: 10 }}>
                  <Ionicons name="search-outline" size={48} color={theme.textMuted} />
                  <Text style={{ color: theme.textSecondary, fontFamily: "Inter_500Medium", fontSize: 16 }}>No one found for "{peopleSearch}"</Text>
                  <Text style={{ color: theme.textMuted, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", paddingHorizontal: 20 }}>
                    Make sure you have the right spelling
                  </Text>
                </View>
              }
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Context Menu ──────────────────────────────────────────────────────────────
function ContextMenu({
  conv, pinnedIds, mutedIds, onClose, onPin, onMute, onDelete, theme, insets,
}: {
  conv: Conversation; pinnedIds: number[]; mutedIds: number[];
  onClose: () => void; onPin: () => void; onMute: () => void; onDelete: () => void;
  theme: any; insets: any;
}) {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const bgAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, ...EASE_IN_OUT }),
      Animated.timing(bgAnim, { toValue: 1, ...EASE_IN_OUT }),
    ]).start();
  }, []);

  const close = (cb?: () => void) => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 300, ...EASE_IN_OUT }),
      Animated.timing(bgAnim, { toValue: 0, ...EASE_IN_OUT }),
    ]).start(() => { onClose(); cb?.(); });
  };

  const isPinned = pinnedIds.includes(conv.id);
  const isMuted = mutedIds.includes(conv.id);

  const ACTIONS = [
    {
      icon: isPinned ? "bookmark" : "bookmark",
      label: isPinned ? "Unpin chat" : "Pin chat",
      color: theme.primary,
      onPress: () => close(onPin),
      filled: isPinned,
    },
    {
      icon: isMuted ? "bell" : "bell-off",
      label: isMuted ? "Unmute notifications" : "Mute notifications",
      color: "#F59E0B",
      onPress: () => close(onMute),
      filled: false,
    },
    {
      icon: "trash-2",
      label: "Delete chat",
      color: "#EF4444",
      onPress: () => close(onDelete),
      filled: false,
    },
  ];

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => close()}>
      <Animated.View
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end", opacity: bgAnim }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
        <Animated.View
          style={{
            backgroundColor: theme.background,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingBottom: insets.bottom + 12,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {/* Handle */}
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border }} />
          </View>

          {/* Header — who is this chat with */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 14 }}>
            <AvatarCircle user={conv.otherUser} size={46} theme={theme} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: theme.text }}>
                {conv.otherUser.displayName}
              </Text>
              <Text style={{ fontSize: 13, color: theme.textMuted, fontFamily: "Inter_400Regular" }}>
                @{conv.otherUser.username}
              </Text>
            </View>
            {isPinned && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${theme.primary}18`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Feather name="bookmark" size={11} color={theme.primary} />
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.primary }}>Pinned</Text>
              </View>
            )}
            {isMuted && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F59E0B18", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Feather name="bell-off" size={11} color="#F59E0B" />
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#F59E0B" }}>Muted</Text>
              </View>
            )}
          </View>

          <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 20, marginBottom: 8 }} />

          {/* Actions */}
          {ACTIONS.map((action, idx) => (
            <Pressable
              key={idx}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: 16,
                paddingHorizontal: 20, paddingVertical: 15,
                backgroundColor: pressed ? `${action.color}12` : "transparent",
              })}
              onPress={action.onPress}
            >
              <View style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: `${action.color}18`,
                alignItems: "center", justifyContent: "center",
              }}>
                <Feather name={action.icon as any} size={18} color={action.color} />
              </View>
              <Text style={{
                fontSize: 16, fontFamily: "Inter_500Medium",
                color: action.icon === "trash-2" ? action.color : theme.text,
              }}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── Animated Conversation Item ────────────────────────────────────────────────
const ConvItem = React.memo(function ConvItem({
  item, user, theme, isPinned, isMuted, onPress, onLongPress, onAvatarPress,
}: {
  item: Conversation; user: any; theme: any; isPinned: boolean; isMuted: boolean;
  onPress: () => void; onLongPress: () => void; onAvatarPress: () => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.97)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, ...EASE_IN_OUT }),
      Animated.timing(scaleAnim, { toValue: 1, ...EASE_IN_OUT }),
    ]).start();
  }, []);

  const hasUnread = (item.unreadCount ?? 0) > 0;
  const unreadCount = item.unreadCount ?? 0;

  const lastMsgText = useMemo(() => {
    if (!item.lastMessage) return "Start a conversation";
    const { type, content, senderId } = item.lastMessage;
    if (type === "audio") return content?.startsWith("data:music/") ? "🎵 Music" : "🎤 Voice note";
    if (type === "document") return "📄 Document";
    if (type === "image") return "🖼️ Image";
    if (type === "video") return "🎥 Video";
    if (type === "call" || (content?.startsWith("{") && content?.includes('"status"'))) {
      try {
        const m = JSON.parse(content);
        const icon = m.type === "video" ? "📹" : "📞";
        const label = m.status === "missed" ? "Missed call" : m.status === "rejected" ? "Declined call" : m.status === "cancelled" ? "Cancelled call" : "Call";
        return `${icon} ${label}`;
      } catch { return "📞 Call"; }
    }
    return senderId === user?.id ? `You: ${content}` : content;
  }, [item.lastMessage, user?.id]);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center",
          paddingHorizontal: 20, paddingVertical: 12, gap: 14,
          backgroundColor: pressed
            ? `${theme.primary}12`
            : hasUnread
              ? `${theme.primary}07`
              : isPinned
                ? `${theme.primary}04`
                : "transparent",
        })}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
      >
        {/* Unread accent bar */}
        {hasUnread && (
          <View style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: theme.primary }} />
        )}
        {/* Pin indicator bar */}
        {isPinned && !hasUnread && (
          <View style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: `${theme.primary}66` }} />
        )}

        <Pressable onPress={onAvatarPress} hitSlop={4}>
          <AvatarCircle user={item.otherUser} size={56} theme={theme} />
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
            {isPinned && <Feather name="bookmark" size={12} color={theme.primary} />}
            <Text style={{ fontSize: 16, fontFamily: hasUnread ? "Inter_700Bold" : "Inter_600SemiBold", color: theme.text, flexShrink: 1 }} numberOfLines={1}>
              {item.otherUser.displayName}
            </Text>
            <UserBadge isOwner={item.otherUser.isOwner} role={item.otherUser.role} size="sm" />
            {isMuted && <Feather name="bell-off" size={12} color={theme.textMuted} />}
          </View>
          <Text
            style={{ fontSize: 13, fontFamily: hasUnread ? "Inter_500Medium" : "Inter_400Regular", color: hasUnread ? theme.textSecondary : theme.textMuted, marginTop: 3 }}
            numberOfLines={1}
          >
            {lastMsgText}
          </Text>
        </View>

        <View style={{ alignItems: "flex-end", gap: 6 }}>
          {item.lastMessage && (
            <Text style={{
              fontSize: 12,
              fontFamily: hasUnread ? "Inter_600SemiBold" : "Inter_400Regular",
              color: hasUnread ? theme.primary : theme.textMuted,
            }}>
              {formatTime(item.lastMessage.createdAt)}
            </Text>
          )}
          {hasUnread ? (
            <View style={{
              backgroundColor: theme.badge,
              minWidth: 22, height: 22, borderRadius: 11,
              alignItems: "center", justifyContent: "center",
              paddingHorizontal: 6,
            }}>
              <Text style={{ color: theme.badgeText, fontSize: 12, fontFamily: "Inter_700Bold" }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          ) : (
            <View style={{ height: 22 }} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
});

const MENU_ITEMS = [
  { icon: "user", label: "My Profile", action: "profile" },
  { icon: "edit-3", label: "New Chat", action: "newchat" },
  { icon: "star", label: "Starred Messages", action: "starred" },
  { icon: "settings", label: "Settings", action: "settings" },
];

const PINNED_KEY = "mchat_pinned_ids";
const MUTED_KEY_PREFIX = "mchat_muted_";

export default function ChatsScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ConvUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [dpPreview, setDpPreview] = useState<{ imageSource: any; name: string; subtitle?: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "read" | "unread">("all");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [contextConv, setContextConv] = useState<Conversation | null>(null);
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [mutedIds, setMutedIds] = useState<number[]>([]);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const queryClient = useQueryClient();

  const { data: conversations, isLoading, refetch } = useQuery<Conversation[]>({
    queryKey: ["conversations", token],
    queryFn: () => apiRequest("/conversations"),
    enabled: !!token,
    refetchInterval: 5000,
  });

  // Load persisted pinned & muted from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(PINNED_KEY).then((v) => {
      if (v) setPinnedIds(JSON.parse(v));
    });
    // Load all muted conversations from existing AsyncStorage keys
    if (conversations) {
      Promise.all(
        conversations.map(c =>
          AsyncStorage.getItem(`${MUTED_KEY_PREFIX}${c.id}`).then(v => ({ id: c.id, muted: v === "1" }))
        )
      ).then((results) => {
        setMutedIds(results.filter(r => r.muted).map(r => r.id));
      });
    }
  }, [conversations]);

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
      else if (action === "settings") router.push("/settings");
      else if (action === "starred") router.push("/starred");
      else if (action === "newchat") { setPeopleSearch(""); setShowPeople(true); }
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
      router.push({ pathname: "/chat/[id]", params: { id: conv.id, name: otherUser.displayName, username: otherUser.username, userId: otherUser.id, avatarUrl: otherUser.avatarUrl ?? "", isOwner: String(otherUser.isOwner), role: otherUser.role ?? "user" } });
    } catch (e) { console.error(e); }
  };

  // ── Context menu actions ──
  const openContextMenu = (conv: Conversation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setContextConv(conv);
  };

  const handlePin = useCallback(() => {
    if (!contextConv) return;
    const id = contextConv.id;
    setPinnedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [id, ...prev];
      AsyncStorage.setItem(PINNED_KEY, JSON.stringify(next));
      return next;
    });
  }, [contextConv]);

  const handleMute = useCallback(() => {
    if (!contextConv) return;
    const id = contextConv.id;
    setMutedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      AsyncStorage.setItem(`${MUTED_KEY_PREFIX}${id}`, next.includes(id) ? "1" : "0");
      return next;
    });
  }, [contextConv]);

  const handleDelete = useCallback(() => {
    if (!contextConv) return;
    const conv = contextConv;
    Alert.alert(
      "Delete chat",
      `Delete your conversation with ${conv.otherUser.displayName}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // Optimistic update — remove instantly
            const prev = queryClient.getQueryData<Conversation[]>(["conversations", token]);
            queryClient.setQueryData<Conversation[]>(["conversations", token], old =>
              old?.filter(c => c.id !== conv.id) ?? []
            );
            // Also remove from pinned/muted
            setPinnedIds(p => p.filter(x => x !== conv.id));
            setMutedIds(m => m.filter(x => x !== conv.id));
            try {
              await apiRequest(`/conversations/${conv.id}`, { method: "DELETE" });
            } catch {
              // Rollback
              queryClient.setQueryData(["conversations", token], prev);
              Alert.alert("Error", "Could not delete this conversation. Please try again.");
            }
          },
        },
      ]
    );
  }, [contextConv, token, queryClient]);

  if (!token) {
    return <View style={{ flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={theme.primary} /></View>;
  }

  const recentContacts = conversations?.map(c => c.otherUser) ?? [];
  const menuScale = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const menuOpacity = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  // Sort: pinned first, then by updatedAt
  const sortedConversations = useMemo(() => {
    const list = (conversations ?? []).filter(c => {
      if (filter === "unread") return (c.unreadCount ?? 0) > 0;
      if (filter === "read") return (c.unreadCount ?? 0) === 0;
      return true;
    });
    return [...list].sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
      const bPinned = pinnedIds.includes(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [conversations, filter, pinnedIds]);

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
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center", shadowColor: theme.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 }}>
              <Text style={{ fontSize: 18 }}>💬</Text>
            </View>
            <View>
              <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: theme.text, letterSpacing: -0.3 }}>M Chat</Text>
              <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: theme.primary, letterSpacing: 1.2, textTransform: "uppercase", marginTop: -2 }}>Allan Matt Tech</Text>
            </View>
          </View>
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

        {/* Filter tabs */}
        {!search && (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            {(["all", "unread", "read"] as const).map((f) => {
              const labels = { all: "All", unread: "Unread", read: "Read" };
              const active = filter === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  style={{
                    paddingHorizontal: 18, paddingVertical: 7,
                    borderRadius: 20,
                    backgroundColor: active ? theme.primary : `${theme.primary}12`,
                    borderWidth: 1,
                    borderColor: active ? theme.primary : `${theme.primary}30`,
                  }}
                >
                  <Text style={{
                    fontSize: 13, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
                    color: active ? "#fff" : theme.primary,
                  }}>
                    {labels[f]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: theme.text }}>{item.displayName}</Text>
                  <UserBadge isOwner={item.isOwner} role={item.role} size="sm" />
                </View>
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
          data={sortedConversations}
          keyExtractor={(i) => String(i.id)}
          onRefresh={refetch}
          refreshing={false}
          ListHeaderComponent={
            <View>
              <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
                <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textSecondary, letterSpacing: 0.5 }}>MESSAGES</Text>
              </View>

              {/* Mattex AI pinned entry */}
              <Pressable
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center",
                  paddingHorizontal: 20, paddingVertical: 12, gap: 14,
                  opacity: pressed ? 0.75 : 1,
                  backgroundColor: `${theme.primary}08`,
                })}
                onPress={() => router.push("/(tabs)/ai" as any)}
              >
                <Pressable onPress={(e) => { e.stopPropagation?.(); setDpPreview({ imageSource: mattexAvatar, name: "Mattex AI", subtitle: "Your intelligent M Chat assistant" }); }} hitSlop={4}>
                  <Image source={mattexAvatar} style={{ width: 56, height: 56, borderRadius: 28 }} resizeMode="cover" />
                </Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 }}>
                    <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: theme.text }}>Mattex AI</Text>
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#1D9BF0", alignItems: "center", justifyContent: "center" }}>
                      <Feather name="check" size={9} color="#fff" />
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#1D9BF015", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#1D9BF030" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#1D9BF0", letterSpacing: 0.5 }}>M CHAT</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, color: theme.textMuted, fontFamily: "Inter_400Regular" }} numberOfLines={1}>
                    Your intelligent M Chat assistant
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <View style={{ backgroundColor: `${theme.primary}22`, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: theme.primary, letterSpacing: 0.5 }}>BOT</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={theme.textMuted} />
                </View>
              </Pressable>
              <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 90 }} />
            </View>
          }
          renderItem={({ item }) => (
            <ConvItem
              item={item}
              user={user}
              theme={theme}
              isPinned={pinnedIds.includes(item.id)}
              isMuted={mutedIds.includes(item.id)}
              onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id, name: item.otherUser.displayName, username: item.otherUser.username, userId: item.otherUser.id, avatarUrl: item.otherUser.avatarUrl ?? "", isOwner: String(item.otherUser.isOwner), role: item.otherUser.role ?? "user" } })}
              onLongPress={() => openContextMenu(item)}
              onAvatarPress={() => {
                if (item.otherUser.avatarUrl) {
                  setDpPreview({ imageSource: { uri: item.otherUser.avatarUrl }, name: item.otherUser.displayName });
                }
              }}
            />
          )}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 90 }} />
          )}
          ListEmptyComponent={
            isLoading ? (
              <SkeletonList theme={theme} />
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

      {/* Floating + button for new chat */}
      <Pressable
        style={({ pressed }) => ({
          position: "absolute",
          bottom: insets.bottom + 90,
          right: 20,
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: theme.primary,
          alignItems: "center", justifyContent: "center",
          shadowColor: theme.primary,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.5,
          shadowRadius: 12,
          elevation: 10,
          opacity: pressed ? 0.85 : 1,
        })}
        onPress={() => { setPeopleSearch(""); setShowPeople(true); }}
      >
        <Feather name="plus" size={26} color={theme.isDark ? "#000" : "#fff"} />
      </Pressable>

      {/* People modal */}
      <PeopleModal
        visible={showPeople}
        peopleSearch={peopleSearch}
        setPeopleSearch={setPeopleSearch}
        onClose={() => setShowPeople(false)}
        onStartChat={(u) => { setShowPeople(false); startChat(u); }}
        token={token}
        theme={theme}
        insets={insets}
      />

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

      {/* Long-press Context Menu */}
      {contextConv && (
        <ContextMenu
          conv={contextConv}
          pinnedIds={pinnedIds}
          mutedIds={mutedIds}
          onClose={() => setContextConv(null)}
          onPin={handlePin}
          onMute={handleMute}
          onDelete={handleDelete}
          theme={theme}
          insets={insets}
        />
      )}

      {/* DP preview */}
      {dpPreview && (
        <AvatarPreview
          visible={!!dpPreview}
          onClose={() => setDpPreview(null)}
          imageSource={dpPreview.imageSource}
          name={dpPreview.name}
          subtitle={dpPreview.subtitle}
        />
      )}
    </View>
  );
}
