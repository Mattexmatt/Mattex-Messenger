import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Platform,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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

const SUGGESTIONS = [
  { icon: "zap", label: "Quick summary", prompt: "Give me a quick summary of what you can help me with" },
  { icon: "edit-3", label: "Help me write", prompt: "Help me write a short professional message" },
  { icon: "code", label: "Write code", prompt: "Help me write a simple function in JavaScript" },
  { icon: "lightbulb" as any, label: "Brainstorm", prompt: "Give me 5 creative ideas for a mobile app feature" },
  { icon: "globe", label: "Explain something", prompt: "Explain how AI language models work in simple terms" },
  { icon: "trending-up", label: "Productivity tip", prompt: "Give me your best productivity tip for today" },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function ThinkingDots({ color }: { color: string }) {
  const anims = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const makeAnim = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.delay(400),
        ])
      );
    const a0 = makeAnim(anims[0], 0);
    const a1 = makeAnim(anims[1], 180);
    const a2 = makeAnim(anims[2], 360);
    a0.start(); a1.start(); a2.start();
    return () => { a0.stop(); a1.stop(); a2.stop(); };
  }, []);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6 }}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: 8, height: 8, borderRadius: 4, backgroundColor: color,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.2] }) }],
            opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
          }}
        />
      ))}
    </View>
  );
}

export default function AIScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [clearing, setClearing] = useState(false);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  useEffect(() => {
    apiRequest("/mattex/history")
      .then((rows: Array<{ id: number; role: "user" | "assistant"; content: string; createdAt: string }>) => {
        if (rows.length > 0) {
          setMessages(rows.map(r => ({ id: String(r.id), role: r.role, content: r.content, createdAt: r.createdAt })));
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, []);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    scrollToEnd();
    try {
      const { reply } = await apiRequest("/mattex/chat", { method: "POST", body: JSON.stringify({ message: msg }) });
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  }, [input, loading, scrollToEnd]);

  const clearHistory = useCallback(() => {
    Alert.alert("Clear conversation", "Mattex AI won't remember past chats after this.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear", style: "destructive",
        onPress: async () => {
          setClearing(true);
          try {
            await apiRequest("/mattex/history", { method: "DELETE" });
            setMessages([]);
          } catch {
            Alert.alert("Error", "Could not clear history.");
          } finally {
            setClearing(false);
          }
        },
      },
    ]);
  }, []);

  const hasMessages = messages.length > 0;

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    if (isUser) {
      return (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 16, paddingHorizontal: 16 }}>
          <View style={{
            maxWidth: "80%",
            backgroundColor: theme.surface,
            borderRadius: 22,
            borderBottomRightRadius: 6,
            paddingHorizontal: 16,
            paddingVertical: 11,
            borderWidth: 1,
            borderColor: theme.border,
          }}>
            <Text style={{ fontSize: 15, color: theme.text, fontFamily: "Inter_400Regular", lineHeight: 22 }}>
              {item.content}
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 20, paddingHorizontal: 16 }}>
        <LinearGradient
          colors={["#8B5CF6", "#6366F1", "#3B82F6"]}
          style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0 }}
        >
          <Text style={{ fontSize: 14, color: "#fff" }}>✦</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.primary, marginBottom: 5 }}>Mattex AI</Text>
          <Text style={{ fontSize: 15, color: theme.text, fontFamily: "Inter_400Regular", lineHeight: 24 }}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top + (Platform.OS === "web" ? 72 : 0) }}>

      {/* ── Header ── */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12, backgroundColor: theme.background }}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.navigate("/(tabs)" as any)}
          style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 12, backgroundColor: pressed ? `${theme.primary}20` : "transparent", alignItems: "center", justifyContent: "center" })}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>

        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <LinearGradient
            colors={["#8B5CF6", "#6366F1", "#3B82F6"]}
            style={{ width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 18, color: "#fff" }}>✦</Text>
          </LinearGradient>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: theme.text }}>Mattex AI</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#1D9BF015", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#1D9BF030" }}>
                <Feather name="check-circle" size={9} color="#1D9BF0" />
                <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: "#1D9BF0", letterSpacing: 0.5 }}>M CHAT</Text>
              </View>
            </View>
            <Text style={{ fontSize: 11, color: theme.primary, fontFamily: "Inter_400Regular" }}>Personalized · History saved</Text>
          </View>
        </View>

        {hasMessages && (
          <Pressable
            onPress={clearHistory}
            disabled={clearing}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 12, backgroundColor: pressed ? `${theme.primary}20` : `${theme.primary}10`, alignItems: "center", justifyContent: "center" })}
            hitSlop={8}
          >
            {clearing ? <ActivityIndicator size="small" color={theme.primary} /> : <Feather name="trash-2" size={16} color={theme.primary} />}
          </Pressable>
        )}
      </View>

      {/* ── Loading skeleton ── */}
      {!historyLoaded ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
          <LinearGradient colors={["#8B5CF6", "#6366F1", "#3B82F6"]} style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 26, color: "#fff" }}>✦</Text>
          </LinearGradient>
          <ActivityIndicator color={theme.primary} />
          <Text style={{ color: theme.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" }}>Loading your conversations…</Text>
        </View>
      ) : !hasMessages ? (
        /* ── EMPTY / WELCOME STATE (Gemini-style) ── */
        <ScrollView
          contentContainerStyle={{ flex: 1, paddingBottom: Platform.OS === "web" ? 120 : insets.bottom + 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Big greeting */}
          <View style={{ alignItems: "center", paddingTop: 32, paddingBottom: 28, paddingHorizontal: 24 }}>
            <LinearGradient
              colors={["#8B5CF622", "#6366F122", "#3B82F622"]}
              style={{ width: 80, height: 80, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 20, borderWidth: 1.5, borderColor: "#8B5CF633" }}
            >
              <LinearGradient colors={["#8B5CF6", "#6366F1", "#3B82F6"]} style={{ width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 30, color: "#fff" }}>✦</Text>
              </LinearGradient>
            </LinearGradient>
            <Text style={{ fontSize: 28, fontFamily: "Inter_700Bold", color: theme.text, textAlign: "center", letterSpacing: -0.5 }}>
              {getGreeting()}{user?.displayName ? `,\n${user.displayName.split(" ")[0]}` : ""}
            </Text>
            <Text style={{ fontSize: 16, color: theme.textMuted, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8, lineHeight: 22 }}>
              How can I help you today?
            </Text>
          </View>

          {/* Suggestion chips */}
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: theme.textMuted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12, marginLeft: 4 }}>Try asking…</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {SUGGESTIONS.map(s => (
                <Pressable
                  key={s.label}
                  onPress={() => sendMessage(s.prompt)}
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", gap: 8,
                    backgroundColor: pressed ? `${theme.primary}22` : theme.surface,
                    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
                    borderWidth: 1, borderColor: pressed ? `${theme.primary}55` : theme.border,
                  })}
                >
                  <Feather name={s.icon as any} size={14} color={theme.primary} />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: theme.text }}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {user?.bio && (
            <View style={{ marginHorizontal: 16, marginTop: 20, padding: 14, borderRadius: 14, backgroundColor: `${theme.primary}0c`, borderWidth: 1, borderColor: `${theme.primary}22`, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <Text style={{ fontSize: 13 }}>✦</Text>
              <Text style={{ flex: 1, fontSize: 12, color: theme.textMuted, fontFamily: "Inter_400Regular", lineHeight: 18 }}>
                Mattex knows your profile and personalises answers just for you
              </Text>
            </View>
          )}
        </ScrollView>
      ) : (
        /* ── MESSAGES ── */
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 12 }}
          onContentSizeChange={scrollToEnd}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          ListFooterComponent={
            loading ? (
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, marginBottom: 8 }}>
                <LinearGradient colors={["#8B5CF6", "#6366F1", "#3B82F6"]} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Text style={{ fontSize: 14, color: "#fff" }}>✦</Text>
                </LinearGradient>
                <View style={{ paddingTop: 4 }}>
                  <ThinkingDots color={theme.primary} />
                </View>
              </View>
            ) : null
          }
        />
      )}

      {/* ── Input bar (Gemini-style floating pill) ── */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: Platform.OS === "web" ? 96 : Math.max(insets.bottom + 8, 16),
        backgroundColor: theme.background,
      }}>
        <View style={{
          flexDirection: "row", alignItems: "flex-end", gap: 10,
          backgroundColor: theme.surface,
          borderRadius: 28,
          borderWidth: 1.5,
          borderColor: input.trim() ? `${theme.primary}66` : theme.border,
          paddingHorizontal: 16,
          paddingVertical: 8,
        }}>
          <TextInput
            ref={inputRef}
            style={{
              flex: 1,
              fontSize: 15,
              color: theme.text,
              maxHeight: 120,
              minHeight: 36,
              fontFamily: "Inter_400Regular",
              paddingTop: 6,
              paddingBottom: 6,
            }}
            value={input}
            onChangeText={setInput}
            placeholder="Ask Mattex AI anything…"
            placeholderTextColor={theme.textMuted}
            multiline
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={Platform.OS !== "web" ? () => sendMessage() : undefined}
            blurOnSubmit={false}
          />
          <Pressable
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
            style={({ pressed }) => ({
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: input.trim() && !loading ? theme.primary : `${theme.primary}30`,
              alignItems: "center", justifyContent: "center",
              opacity: pressed ? 0.8 : 1,
              marginBottom: 1,
            })}
          >
            {loading
              ? <ActivityIndicator size="small" color={theme.primary} />
              : <Feather name="arrow-up" size={18} color={input.trim() ? theme.background : theme.textMuted} />
            }
          </Pressable>
        </View>
        <Text style={{ textAlign: "center", fontSize: 10, color: theme.textMuted, fontFamily: "Inter_400Regular", marginTop: 8 }}>
          Mattex AI · Powered by M Chat
        </Text>
      </View>
    </View>
  );
}
