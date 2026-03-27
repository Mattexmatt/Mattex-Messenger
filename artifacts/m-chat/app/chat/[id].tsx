import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, TextInput,
  Image, ActivityIndicator, Platform, Alert, ScrollView,
  Animated, PanResponder, Modal
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { playSendSound, playReceiveSound, initSoundSettings } from "@/utils/sounds";

interface Message {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  type: "text" | "audio" | "image";
  createdAt: string;
  sender?: { id: number; displayName: string; avatarUrl?: string | null };
}

interface AppSettings {
  fontSize: "small" | "medium" | "large";
  bubbleStyle: "rounded" | "sharp" | "balloon";
  readReceipts: boolean;
  enterToSend: boolean;
  vibrationEnabled: boolean;
}

const EMOJI_CATEGORIES: { label: string; icon: string; emojis: string[] }[] = [
  { label: "Smiles", icon: "😊", emojis: ["😂","😍","😭","😎","🤣","😅","🥺","😤","😏","🤔","😬","🥳","😴","🤯","🥶","😈","👻","🤡","💀","🫠","😻","🤩","😢","😡","🤬","🤗","😐","😑","🫡","🫢"] },
  { label: "Gestures", icon: "👋", emojis: ["👍","👎","👏","🙌","🤝","👊","✊","🤜","🤞","✌️","🤟","🤙","💪","🖐️","👋","🙏","🫶","💅","🫰","🤌"] },
  { label: "Hearts", icon: "❤️", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","💝","💖","💗","💓","💞","💕","💟","🫀","♥️"] },
  { label: "Objects", icon: "🎉", emojis: ["🔥","✨","💯","🎉","🎊","🎈","🏆","🥇","💎","💰","🚀","⚡","🌈","🌟","💫","🎯","🎮","🎵","🎶","🎸"] },
];

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "😡", "✨"];

function formatMsgTime(date: string) {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function getBubbleRadius(style: AppSettings["bubbleStyle"]) {
  return style === "sharp" ? 6 : style === "balloon" ? 28 : 18;
}
function getFontSize(size: AppSettings["fontSize"]) {
  return size === "small" ? 13 : size === "large" ? 18 : 15;
}

// ─── Swipeable message row ─────────────────────────────────────────────────────
function SwipeableRow({ onReply, children }: { onReply: () => void; children: React.ReactNode }) {
  const swipeX = useRef(new Animated.Value(0)).current;
  const triggered = useRef(false);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && gs.dx > 0,
      onPanResponderMove: (_, gs) => {
        if (gs.dx > 0) {
          swipeX.setValue(Math.min(gs.dx * 0.55, 72));
          if (gs.dx > 75 && !triggered.current) {
            triggered.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 60) onReply();
        triggered.current = false;
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, tension: 180, friction: 10 }).start();
      },
      onPanResponderTerminate: () => {
        triggered.current = false;
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const arrowOpacity = swipeX.interpolate({ inputRange: [0, 40, 72], outputRange: [0, 0.5, 1] });
  const arrowTranslate = swipeX.interpolate({ inputRange: [0, 72], outputRange: [-16, 4] });

  return (
    <View {...pan.panHandlers} style={{ position: "relative" }}>
      {/* Reply arrow hint */}
      <Animated.View
        style={{
          position: "absolute", left: 6, top: 0, bottom: 0,
          justifyContent: "center", opacity: arrowOpacity,
          transform: [{ translateX: arrowTranslate }],
        }}
        pointerEvents="none"
      >
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(128,128,128,0.25)", alignItems: "center", justifyContent: "center" }}>
          <Feather name="corner-up-left" size={14} color="#aaa" />
        </View>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX: swipeX }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

// ─── Reaction picker modal ─────────────────────────────────────────────────────
function ReactionPicker({
  message, isOwn, onSelect, onClose, theme,
}: {
  message: Message; isOwn: boolean; onSelect: (emoji: string) => void; onClose: () => void; theme: any;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={onClose}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={{ backgroundColor: theme.surface, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 18, borderWidth: 1, borderColor: theme.border, alignItems: "center", gap: 12 }}>
              {/* Reaction emojis */}
              <View style={{ flexDirection: "row", gap: 6 }}>
                {QUICK_REACTIONS.map(emoji => (
                  <Pressable
                    key={emoji}
                    onPress={() => { onSelect(emoji); onClose(); }}
                    style={({ pressed }) => ({
                      width: 46, height: 46, borderRadius: 23,
                      backgroundColor: pressed ? `${theme.primary}22` : theme.surfaceElevated,
                      alignItems: "center", justifyContent: "center",
                      borderWidth: 1, borderColor: theme.border,
                    })}
                  >
                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Replied-to message preview */}
              <View style={{ backgroundColor: theme.surfaceElevated, borderRadius: 12, padding: 12, width: "100%", borderWidth: 1, borderColor: theme.border, borderLeftWidth: 3, borderLeftColor: theme.primary }}>
                <Text style={{ fontSize: 11, color: theme.primary, fontFamily: "Inter_600SemiBold", marginBottom: 4 }}>
                  {isOwn ? "You" : message.sender?.displayName ?? "Them"}
                </Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, fontFamily: "Inter_400Regular" }} numberOfLines={2}>
                  {message.content}
                </Text>
              </View>

              {/* Actions */}
              <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
                <Pressable
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: `${theme.primary}18`, borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: `${theme.primary}33` }}
                  onPress={onClose}
                >
                  <Feather name="corner-up-left" size={15} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Reply</Text>
                </Pressable>
                <Pressable
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.surfaceElevated, borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: theme.border }}
                  onPress={onClose}
                >
                  <Feather name="copy" size={15} color={theme.textSecondary} />
                  <Text style={{ color: theme.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Copy</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const { id, name, username } = useLocalSearchParams<{ id: string; name: string; username: string }>();

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactions, setReactions] = useState<Record<number, string[]>>({});
  const [reactionPickerMsg, setReactionPickerMsg] = useState<Message | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    fontSize: "medium", bubbleStyle: "rounded", readReceipts: true, enterToSend: false, vibrationEnabled: true,
  });

  const inputRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();
  const lastMsgCount = useRef(0);

  useEffect(() => {
    initSoundSettings();
    AsyncStorage.getItem("mchat_settings").then((raw) => {
      if (raw) {
        const s = JSON.parse(raw);
        setAppSettings({
          fontSize: s.fontSize ?? "medium",
          bubbleStyle: s.bubbleStyle ?? "rounded",
          readReceipts: s.readReceipts ?? true,
          enterToSend: s.enterToSend ?? false,
          vibrationEnabled: s.vibrationEnabled ?? true,
        });
      }
    });
  }, []);

  const { data: messages } = useQuery<Message[]>({
    queryKey: ["messages", id, token],
    queryFn: () => apiRequest(`/conversations/${id}/messages`),
    enabled: !!token && !!id,
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (!messages) return;
    const newCount = messages.length;
    if (newCount > lastMsgCount.current && lastMsgCount.current > 0) {
      const newest = messages[0];
      if (newest.senderId !== user?.id) {
        playReceiveSound();
        if (appSettings.vibrationEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
    lastMsgCount.current = newCount;
  }, [messages]);

  const sendMsg = useCallback(async (content: string, type: "text" | "audio" = "text") => {
    if (!content.trim() && type === "text") return;
    setSending(true);
    playSendSound();
    if (appSettings.vibrationEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    let finalContent = content;
    if (replyTo) {
      finalContent = `↩ "${replyTo.content.slice(0, 60)}${replyTo.content.length > 60 ? "…" : ""}"\n${content}`;
      setReplyTo(null);
    }

    try {
      await apiRequest(`/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: finalContent, type }),
      });
      setText("");
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch {
      Alert.alert("Error", "Failed to send message");
    } finally {
      setSending(false);
    }
  }, [id, queryClient, appSettings, replyTo]);

  const addReaction = (msgId: number, emoji: string) => {
    setReactions(prev => {
      const current = prev[msgId] ?? [];
      if (current.includes(emoji)) {
        const next = current.filter(e => e !== emoji);
        return next.length ? { ...prev, [msgId]: next } : { ...prev, [msgId]: [] };
      }
      return { ...prev, [msgId]: [...current, emoji] };
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const r = getBubbleRadius(appSettings.bubbleStyle);
  const fs = getFontSize(appSettings.fontSize);

  const renderMsg = ({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.senderId === user?.id;
    const allMessages = messages ?? [];
    const nextMsg = allMessages[index - 1];
    const prevMsg = allMessages[index + 1];
    const isFirst = !prevMsg || prevMsg.senderId !== item.senderId;
    const isLast = !nextMsg || nextMsg.senderId !== item.senderId;
    const msgReactions = reactions[item.id] ?? [];

    const ownTopLeft = r;
    const ownTopRight = isFirst ? r : 4;
    const ownBotLeft = r;
    const ownBotRight = isLast ? r : 4;
    const othTopLeft = isFirst ? r : 4;
    const othTopRight = r;
    const othBotLeft = isLast ? r : 4;
    const othBotRight = r;

    // Detect reply prefix
    const isReplyMsg = item.content.startsWith("↩ \"");
    const replyLine = isReplyMsg ? item.content.split("\n")[0].replace(/^↩ "(.+)"$/, "$1") : null;
    const mainContent = isReplyMsg ? item.content.split("\n").slice(1).join("\n") : item.content;

    return (
      <SwipeableRow onReply={() => { setReplyTo(item); inputRef.current?.focus(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: isOwn ? "flex-end" : "flex-start", marginBottom: isLast ? 8 : 2, paddingHorizontal: 12 }}>
          {/* Avatar for others */}
          {!isOwn && (
            <View style={{ width: 30, marginRight: 6, alignSelf: "flex-end", marginBottom: 2 }}>
              {isLast ? (
                item.sender?.avatarUrl ? (
                  <Image source={{ uri: item.sender.avatarUrl }} style={{ width: 28, height: 28, borderRadius: 14 }} />
                ) : (
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: `${theme.primary}33`, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 11, color: theme.primary, fontFamily: "Inter_700Bold" }}>{(name ?? "?")[0].toUpperCase()}</Text>
                  </View>
                )
              ) : null}
            </View>
          )}

          <View style={{ maxWidth: "72%" }}>
            {/* Sender name */}
            {!isOwn && isFirst && (
              <Text style={{ fontSize: 11, color: theme.textMuted, fontFamily: "Inter_600SemiBold", marginBottom: 3, marginLeft: 4 }}>
                {item.sender?.displayName ?? name}
              </Text>
            )}

            {/* Bubble — long press opens reaction picker */}
            <Pressable
              onLongPress={() => { setReactionPickerMsg(item); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
              delayLongPress={320}
            >
              <View style={{
                backgroundColor: isOwn ? theme.bubbleOwn : theme.bubble,
                borderTopLeftRadius: isOwn ? ownTopLeft : othTopLeft,
                borderTopRightRadius: isOwn ? ownTopRight : othTopRight,
                borderBottomLeftRadius: isOwn ? ownBotLeft : othBotLeft,
                borderBottomRightRadius: isOwn ? ownBotRight : othBotRight,
                paddingHorizontal: 13, paddingVertical: 8,
                borderWidth: isOwn ? 0 : 1, borderColor: theme.border,
              }}>
                {/* Reply context strip */}
                {isReplyMsg && replyLine && (
                  <View style={{ backgroundColor: isOwn ? "rgba(255,255,255,0.15)" : `${theme.primary}18`, borderRadius: 8, padding: 8, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: isOwn ? "rgba(255,255,255,0.6)" : theme.primary }}>
                    <Text style={{ fontSize: 11, color: isOwn ? "rgba(255,255,255,0.75)" : theme.primary, fontFamily: "Inter_600SemiBold", marginBottom: 2 }}>↩ Replied</Text>
                    <Text style={{ fontSize: 12, color: isOwn ? "rgba(255,255,255,0.7)" : theme.textSecondary, fontFamily: "Inter_400Regular" }} numberOfLines={1}>{replyLine}</Text>
                  </View>
                )}

                {item.type === "audio" ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
                      <Feather name="mic" size={14} color={isOwn ? "#fff" : theme.text} />
                    </View>
                    <View style={{ gap: 3 }}>
                      <View style={{ flexDirection: "row", gap: 2, alignItems: "center" }}>
                        {[3, 5, 8, 6, 4, 7, 5, 3].map((h, i) => (
                          <View key={i} style={{ width: 2.5, height: h, borderRadius: 2, backgroundColor: isOwn ? "rgba(255,255,255,0.7)" : theme.textSecondary }} />
                        ))}
                      </View>
                      <Text style={{ fontSize: 11, color: isOwn ? "rgba(255,255,255,0.6)" : theme.textMuted, fontFamily: "Inter_400Regular" }}>Voice note · 0:05</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={{ fontSize: fs, fontFamily: "Inter_400Regular", lineHeight: fs * 1.5, color: isOwn ? "#fff" : theme.text }}>
                    {mainContent}
                  </Text>
                )}
              </View>
            </Pressable>

            {/* Reaction badges */}
            {msgReactions.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4, justifyContent: isOwn ? "flex-end" : "flex-start" }}>
                {msgReactions.map((emoji, i) => (
                  <Pressable
                    key={i}
                    onPress={() => addReaction(item.id, emoji)}
                    style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.surfaceElevated, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${theme.primary}44`, gap: 3 }}
                  >
                    <Text style={{ fontSize: 14 }}>{emoji}</Text>
                    <Text style={{ fontSize: 11, color: theme.primary, fontFamily: "Inter_600SemiBold" }}>1</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Timestamp + ticks */}
            {isLast && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3, justifyContent: isOwn ? "flex-end" : "flex-start", paddingHorizontal: 2 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted }}>{formatMsgTime(item.createdAt)}</Text>
                {isOwn && appSettings.readReceipts && (
                  <Feather name="check-circle" size={11} color={theme.primary} />
                )}
              </View>
            )}
          </View>
        </View>
      </SwipeableRow>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior="padding" keyboardVerticalOffset={0}>
      {/* Header */}
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8),
        paddingHorizontal: 12, paddingBottom: 12,
        backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border, gap: 10,
      }}>
        <Pressable style={{ padding: 6 }} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${theme.primary}33`, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: `${theme.primary}66` }}>
          <Text style={{ color: theme.primary, fontSize: 17, fontFamily: "Inter_700Bold" }}>{(name ?? "?")[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: theme.text }}>{name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: theme.success }} />
            <Text style={{ fontSize: 12, color: theme.textSecondary, fontFamily: "Inter_400Regular" }}>online</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Pressable style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: `${theme.primary}18`, alignItems: "center", justifyContent: "center" }} onPress={() => router.push({ pathname: "/call/[id]", params: { id, name } })}>
            <Feather name="video" size={18} color={theme.primary} />
          </Pressable>
          <Pressable style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: `${theme.primary}18`, alignItems: "center", justifyContent: "center" }}>
            <Feather name="phone" size={18} color={theme.primary} />
          </Pressable>
          <Pressable style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: `${theme.primary}18`, alignItems: "center", justifyContent: "center" }}>
            <Feather name="more-vertical" size={18} color={theme.primary} />
          </Pressable>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        style={{ flex: 1 }}
        data={messages ?? []}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderMsg}
        inverted
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingVertical: 12, paddingBottom: 4 }}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 80, transform: [{ scaleY: -1 }] }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${theme.primary}18`, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="chatbubbles-outline" size={36} color={theme.textMuted} />
            </View>
            <Text style={{ color: theme.textSecondary, fontFamily: "Inter_500Medium", fontSize: 16 }}>Start the conversation!</Text>
            <Text style={{ color: theme.textMuted, fontFamily: "Inter_400Regular", fontSize: 13 }}>Say hello to {name} 👋</Text>
          </View>
        }
      />

      {/* Emoji picker */}
      {showEmoji && (
        <View style={{ backgroundColor: theme.surfaceElevated, borderTopWidth: 1, borderTopColor: theme.border }}>
          <View style={{ flexDirection: "row", paddingHorizontal: 8, paddingTop: 8, gap: 4 }}>
            {EMOJI_CATEGORIES.map((cat, idx) => (
              <Pressable key={cat.label} onPress={() => setEmojiCat(idx)} style={{ flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 10, backgroundColor: emojiCat === idx ? `${theme.primary}22` : "transparent", borderWidth: 1, borderColor: emojiCat === idx ? `${theme.primary}66` : "transparent" }}>
                <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView style={{ height: 160 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, paddingVertical: 8, gap: 2 }}>
            {EMOJI_CATEGORIES[emojiCat].emojis.map((emoji) => (
              <Pressable key={emoji} onPress={() => setText(t => t + emoji)} style={{ width: "12.5%", alignItems: "center", paddingVertical: 5 }}>
                <Text style={{ fontSize: 26 }}>{emoji}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Reply preview bar */}
      {replyTo && (
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.surfaceElevated, borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderLeftWidth: 3, borderLeftColor: theme.primary }}>
          <Feather name="corner-up-left" size={16} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: theme.primary, fontFamily: "Inter_600SemiBold", marginBottom: 2 }}>
              Replying to {replyTo.senderId === user?.id ? "yourself" : (replyTo.sender?.displayName ?? name)}
            </Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary, fontFamily: "Inter_400Regular" }} numberOfLines={1}>
              {replyTo.content.startsWith("↩ \"") ? replyTo.content.split("\n").slice(1).join(" ") : replyTo.content}
            </Text>
          </View>
          <Pressable onPress={() => setReplyTo(null)} style={{ padding: 4 }}>
            <Feather name="x" size={18} color={theme.textMuted} />
          </Pressable>
        </View>
      )}

      {/* Input bar */}
      <View style={{
        flexDirection: "row", alignItems: "flex-end", gap: 8,
        paddingHorizontal: 12, paddingVertical: 10,
        paddingBottom: insets.bottom + 10,
        backgroundColor: theme.surface,
        borderTopWidth: 1, borderTopColor: theme.border,
      }}>
        <Pressable style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }} onPress={() => { setShowEmoji(!showEmoji); if (!showEmoji) inputRef.current?.blur(); }}>
          <Ionicons name={showEmoji ? "keypad-outline" : "happy-outline"} size={24} color={showEmoji ? theme.primary : theme.textSecondary} />
        </Pressable>

        <View style={{ flex: 1, backgroundColor: theme.inputBg, borderRadius: 22, borderWidth: 1, borderColor: text.length > 0 ? `${theme.primary}66` : theme.border, flexDirection: "row", alignItems: "flex-end", overflow: "hidden" }}>
          <TextInput
            ref={inputRef}
            style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 10, fontSize: fs, color: theme.text, maxHeight: 120, fontFamily: "Inter_400Regular" }}
            placeholder={replyTo ? "Write your reply..." : "Message..."}
            placeholderTextColor={theme.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            onFocus={() => setShowEmoji(false)}
            onSubmitEditing={appSettings.enterToSend ? () => sendMsg(text) : undefined}
            blurOnSubmit={appSettings.enterToSend}
          />
        </View>

        {!text.trim() && (
          <Pressable style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }} onPress={() => Alert.alert("Attach", "File attachment coming soon!")}>
            <Feather name="paperclip" size={22} color={theme.textSecondary} />
          </Pressable>
        )}

        {text.trim() ? (
          <Pressable style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" }} onPress={() => sendMsg(text)} disabled={sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={17} color="#fff" />}
          </Pressable>
        ) : (
          <Pressable style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: `${theme.primary}22`, alignItems: "center", justifyContent: "center" }} onPress={() => Alert.alert("Voice Note", "Hold to record — available in the native Expo Go app")}>
            <Feather name="mic" size={20} color={theme.primary} />
          </Pressable>
        )}
      </View>

      {/* Reaction picker modal */}
      {reactionPickerMsg && (
        <ReactionPicker
          message={reactionPickerMsg}
          isOwn={reactionPickerMsg.senderId === user?.id}
          onSelect={(emoji) => addReaction(reactionPickerMsg.id, emoji)}
          onClose={() => setReactionPickerMsg(null)}
          theme={theme}
        />
      )}
    </KeyboardAvoidingView>
  );
}
