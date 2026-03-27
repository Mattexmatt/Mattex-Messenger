import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, TextInput, StyleSheet,
  Image, ActivityIndicator, Platform, Alert
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { apiRequest } from "@/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

interface Message {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  type: "text" | "audio" | "image";
  createdAt: string;
  sender?: { id: number; displayName: string; avatarUrl?: string | null };
}

const EMOJI_LIST = ["😂", "😍", "🔥", "❤️", "👍", "🎉", "😭", "💀", "✨", "🥺", "😎", "🤣", "💯", "🙏", "😤", "👏", "🤔", "😅", "🥳", "💪"];

function formatMsgTime(date: string) {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const { id, name, username } = useLocalSearchParams<{ id: string; name: string; username: string }>();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: ["messages", id, token],
    queryFn: () => apiRequest(`/conversations/${id}/messages`),
    enabled: !!token && !!id,
    refetchInterval: 3000,
  });

  const sendMsg = useCallback(async (content: string, type: "text" | "audio" = "text") => {
    if (!content.trim() && type === "text") return;
    setSending(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await apiRequest(`/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, type }),
      });
      setText("");
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      Alert.alert("Error", "Failed to send message");
    } finally {
      setSending(false);
    }
  }, [id, queryClient]);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: "row", alignItems: "center",
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
      paddingHorizontal: 12, paddingBottom: 12, paddingTop: insets.top + 8,
      backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
      gap: 10,
    },
    backBtn: { padding: 4 },
    headerAvatar: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: theme.primary, alignItems: "center", justifyContent: "center",
    },
    headerAvatarText: { color: theme.isDark ? "#000" : "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
    headerInfo: { flex: 1 },
    headerName: { fontSize: 16, fontWeight: "600" as const, color: theme.text, fontFamily: "Inter_600SemiBold" },
    headerSub: { fontSize: 12, color: theme.textSecondary, fontFamily: "Inter_400Regular" },
    headerActions: { flexDirection: "row", gap: 12 },
    actionBtn: { padding: 4 },
    msgContainer: { flex: 1, paddingHorizontal: 12 },
    bubbleWrap: { marginVertical: 3, maxWidth: "78%" },
    bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
    bubbleTime: { fontSize: 11, marginTop: 4, fontFamily: "Inter_400Regular" },
    inputWrap: {
      flexDirection: "row", alignItems: "flex-end",
      paddingHorizontal: 12, paddingVertical: 10,
      paddingBottom: insets.bottom + 10,
      backgroundColor: theme.surface,
      borderTopWidth: 1, borderTopColor: theme.border, gap: 8,
    },
    inputBox: {
      flex: 1, backgroundColor: theme.inputBg,
      borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
      fontSize: 15, color: theme.text, maxHeight: 120,
      borderWidth: 1, borderColor: theme.border, fontFamily: "Inter_400Regular",
    },
    iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    sendBtn: { backgroundColor: theme.primary, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    emojiBar: {
      flexDirection: "row", flexWrap: "wrap",
      backgroundColor: theme.surfaceElevated, paddingVertical: 8, paddingHorizontal: 8,
      borderTopWidth: 1, borderTopColor: theme.border,
    },
    emojiBtn: { padding: 6, fontSize: 24 },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    emptyText: { color: theme.textMuted, fontFamily: "Inter_400Regular", fontSize: 15 },
  });

  const renderMsg = ({ item }: { item: Message }) => {
    const isOwn = item.senderId === user?.id;
    return (
      <View style={[{ alignItems: isOwn ? "flex-end" : "flex-start" }, s.bubbleWrap, isOwn ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
        <View style={[s.bubble, { backgroundColor: isOwn ? theme.bubbleOwn : theme.bubble }]}>
          {item.type === "audio" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather name="mic" size={16} color={isOwn ? (theme.isDark ? "#fff" : "#fff") : theme.text} />
              <Text style={[s.bubbleText, { color: isOwn ? (theme.isDark ? "#fff" : "#fff") : theme.text }]}>Voice note</Text>
            </View>
          ) : (
            <Text style={[s.bubbleText, { color: isOwn ? (theme.isDark ? "#fff" : "#fff") : theme.text }]}>{item.content}</Text>
          )}
          <Text style={[s.bubbleTime, { color: isOwn ? "rgba(255,255,255,0.6)" : theme.textMuted }]}>{formatMsgTime(item.createdAt)}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior="padding" keyboardVerticalOffset={0}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <View style={s.headerAvatar}>
          <Text style={s.headerAvatarText}>{(name ?? "?")[0].toUpperCase()}</Text>
        </View>
        <View style={s.headerInfo}>
          <Text style={s.headerName}>{name}</Text>
          <Text style={s.headerSub}>@{username}</Text>
        </View>
        <View style={s.headerActions}>
          <Pressable style={s.actionBtn} onPress={() => router.push({ pathname: "/call/[id]", params: { id, name } })}>
            <Feather name="video" size={22} color={theme.primary} />
          </Pressable>
          <Pressable style={s.actionBtn}>
            <Feather name="phone" size={22} color={theme.primary} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={s.emptyWrap}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          style={s.msgContainer}
          data={messages ?? []}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderMsg}
          inverted
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingVertical: 12 }}
          scrollEnabled={!!(messages?.length)}
          ListEmptyComponent={
            <View style={[s.emptyWrap, { transform: [{ scaleY: -1 }] }]}>
              <Ionicons name="chatbubbles-outline" size={48} color={theme.textMuted} />
              <Text style={s.emptyText}>Say hello!</Text>
            </View>
          }
        />
      )}

      {showEmoji && (
        <View style={s.emojiBar}>
          {EMOJI_LIST.map((emoji) => (
            <Pressable key={emoji} onPress={() => setText(t => t + emoji)}>
              <Text style={s.emojiBtn}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={s.inputWrap}>
        <Pressable style={s.iconBtn} onPress={() => setShowEmoji(!showEmoji)}>
          <Ionicons name={showEmoji ? "keypad" : "happy-outline"} size={22} color={theme.textSecondary} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={s.inputBox}
          placeholder="Message..."
          placeholderTextColor={theme.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          onFocus={() => setShowEmoji(false)}
        />
        {text.trim() ? (
          <Pressable style={s.sendBtn} onPress={() => sendMsg(text)}>
            {sending ? (
              <ActivityIndicator size="small" color={theme.isDark ? "#000" : "#fff"} />
            ) : (
              <Feather name="send" size={16} color={theme.isDark ? "#000" : "#fff"} />
            )}
          </Pressable>
        ) : (
          <Pressable style={s.iconBtn} onPress={() => {
            Alert.alert("Voice Note", "Hold to record a voice note (WebRTC audio feature available in native build)");
          }}>
            <Feather name="mic" size={22} color={theme.primary} />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
