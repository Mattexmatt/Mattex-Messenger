import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

function makeWelcome(name?: string): Message {
  const greeting = name ? `Hey ${name.split(" ")[0]}!` : "Hey!";
  return {
    id: "welcome",
    role: "assistant",
    content: `${greeting} I'm Mattex AI ✦ — your built-in assistant. I remember our conversations and personalise my answers to you. Ask me anything!`,
  };
}

export default function AIScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([makeWelcome(user?.displayName)]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [clearing, setClearing] = useState(false);
  const listRef = useRef<FlatList>(null);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  // Load persisted history on mount
  useEffect(() => {
    apiRequest("/mattex/history")
      .then((rows: Array<{ id: number; role: "user" | "assistant"; content: string; createdAt: string }>) => {
        if (rows.length > 0) {
          const loaded: Message[] = rows.map(r => ({
            id: String(r.id),
            role: r.role,
            content: r.content,
            createdAt: r.createdAt,
          }));
          setMessages([makeWelcome(user?.displayName), ...loaded]);
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text };
    setInput("");
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    scrollToEnd();

    try {
      const { reply } = await apiRequest("/mattex/chat", {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });

      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: reply,
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setMessages(prev => [
        ...prev,
        { id: `e-${Date.now()}`, role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  }, [input, loading, scrollToEnd]);

  const clearHistory = useCallback(() => {
    Alert.alert(
      "Clear Chat History",
      "This will delete all your saved Mattex AI conversations. Mattex won't remember past chats after this.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setClearing(true);
            try {
              await apiRequest("/mattex/history", { method: "DELETE" });
              setMessages([makeWelcome(user?.displayName)]);
            } catch {
              Alert.alert("Error", "Could not clear history.");
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  }, [user?.displayName]);

  const styles = makeStyles(theme);

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.row, isUser ? styles.rowUser : styles.rowAI]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>✦</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAI]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 72 : 0) }]}>
      {/* Header */}
      <View style={styles.header}>
        {/* WhatsApp-style back arrow */}
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.navigate("/(tabs)" as any)}
          style={{ padding: 8, marginLeft: -4, marginRight: 4 }}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>

        <View style={styles.headerLeft}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>✦</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Mattex AI</Text>
            <Text style={styles.headerSub}>Personalised · History saved</Text>
          </View>
        </View>

        {/* Clear history button */}
        <Pressable
          onPress={clearHistory}
          disabled={clearing}
          style={({ pressed }) => ({
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: pressed ? `${theme.primary}22` : `${theme.primary}11`,
            alignItems: "center", justifyContent: "center",
          })}
          hitSlop={8}
        >
          {clearing
            ? <ActivityIndicator size="small" color={theme.primary} />
            : <Feather name="trash-2" size={16} color={theme.primary} />}
        </Pressable>
      </View>

      {/* History loading skeleton */}
      {!historyLoaded && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.primary} />
          <Text style={{ color: theme.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 10 }}>
            Loading your chat history…
          </Text>
        </View>
      )}

      {/* Messages */}
      {historyLoaded && (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onContentSizeChange={scrollToEnd}
          showsVerticalScrollIndicator={false}
          style={styles.messageList}
        />
      )}

      {/* Typing indicator */}
      {loading && (
        <View style={styles.typingRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>✦</Text>
          </View>
          <View style={[styles.bubble, styles.bubbleAI, styles.typingBubble]}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        </View>
      )}

      {/* Personalisation hint (shown once, above the input) */}
      {historyLoaded && messages.length === 1 && user?.bio && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
          <Text style={{ fontSize: 12, color: theme.textMuted, fontFamily: "Inter_400Regular", textAlign: "center" }}>
            ✦ Mattex knows your interests and will personalise its answers for you
          </Text>
        </View>
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: Platform.OS === "web" ? 96 : Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask Mattex AI anything…"
          placeholderTextColor={theme.textMuted}
          multiline
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={Platform.OS !== "web" ? sendMessage : undefined}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { opacity: !input.trim() || loading ? 0.4 : 1 }]}
          onPress={sendMessage}
          disabled={!input.trim() || loading}
          activeOpacity={0.7}
        >
          <Ionicons name="send" size={18} color={theme.background} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      flexDirection: "column",
    },

    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.surface,
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
    headerAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    headerAvatarText: { fontSize: 18, color: theme.background, fontWeight: "bold" },
    headerTitle: { fontSize: 16, fontWeight: "700", color: theme.text, fontFamily: "Inter_700Bold" },
    headerSub: { fontSize: 11, color: theme.primary, fontFamily: "Inter_400Regular" },

    messageList: { flex: 1 },
    list: { padding: 16, gap: 12, paddingBottom: 8 },

    row: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 4 },
    rowUser: { justifyContent: "flex-end" },
    rowAI: { justifyContent: "flex-start" },

    avatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: 13, color: theme.background, fontWeight: "bold" },

    bubble: {
      maxWidth: "78%",
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    bubbleAI: {
      backgroundColor: theme.surface,
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: theme.border,
    },
    bubbleUser: {
      backgroundColor: theme.primary,
      borderBottomRightRadius: 4,
    },
    bubbleText: { fontSize: 15, lineHeight: 22 },
    bubbleTextAI: { color: theme.text, fontFamily: "Inter_400Regular" },
    bubbleTextUser: { color: theme.background, fontFamily: "Inter_400Regular" },

    typingRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 16,
      marginBottom: 4,
    },
    typingBubble: { paddingVertical: 12, paddingHorizontal: 16 },

    inputBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.surface,
    },
    input: {
      flex: 1,
      backgroundColor: theme.inputBg,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
      color: theme.text,
      maxHeight: 120,
      minHeight: 44,
      borderWidth: 1,
      borderColor: theme.border,
      fontFamily: "Inter_400Regular",
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.primary,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
