import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { apiRequest } from "@/utils/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  content: "Hey! I'm Mattex AI 👋 — your built-in assistant. Ask me anything — questions, advice, writing, coding, math, or just a chat!",
};

export default function AIScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text };
    setInput("");
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    scrollToBottom();

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const { reply } = await apiRequest("/mattex/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, history }),
      });

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: reply,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [input, loading, messages, scrollToBottom]);

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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>✦</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Mattex AI</Text>
            <Text style={styles.headerSub}>by Allan Matt Tech</Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onContentSizeChange={scrollToBottom}
        showsVerticalScrollIndicator={false}
        style={styles.messageList}
      />

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

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask Mattex AI anything..."
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
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
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
    headerSub: { fontSize: 11, color: theme.textMuted, fontFamily: "Inter_400Regular" },

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
