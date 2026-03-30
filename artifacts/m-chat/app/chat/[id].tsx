import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, FlatList, Pressable, TextInput,
  Image, ActivityIndicator, Platform, Alert, ScrollView,
  Animated, PanResponder, Modal, Clipboard, StyleSheet,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useCall } from "@/context/CallContext";
import { apiRequest } from "@/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AvatarPreview from "@/components/AvatarPreview";
import { playSendSound, playReceiveSound, initSoundSettings } from "@/utils/sounds";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import Svg, { Defs, Pattern, Rect, Path as SvgPath, Circle as SvgCircle } from "react-native-svg";
import UserBadge from "@/components/UserBadge";

interface Message {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  type: "text" | "audio" | "image" | "video" | "call";
  isDeleted?: number;
  deletedForIds?: string;
  spamFlag?: string | null;
  spamReason?: string | null;
  readAt?: string | null;
  starredBy?: string | null;
  viewOnce?: number;
  viewedBy?: string | null;
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

function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return "last seen a while ago";
  const d = new Date(lastSeenAt);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "last seen just now";
  if (diffMins < 60) return `last seen ${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) {
    const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return `last seen today at ${t}`;
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `last seen yesterday at ${t}`;
  }
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 7) return `last seen ${diffDays}d ago`;
  return `last seen ${d.toLocaleDateString([], { day: "numeric", month: "short" })}`;
}

function getBubbleRadius(style: AppSettings["bubbleStyle"]) {
  return style === "sharp" ? 6 : style === "balloon" ? 28 : 18;
}
function getFontSize(size: AppSettings["fontSize"]) {
  return size === "small" ? 13 : size === "large" ? 18 : 15;
}

// ─── Telegram-style Typing bubble ─────────────────────────────────────────────
function TypingBubble({ type, theme, r }: { type: "typing" | "recording"; theme: any; r: number }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Telegram exact: dots scale up/down in a wave, opacity pulses
    const pulse = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ])
      );
    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 200);
    const a3 = pulse(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  const isDark = !!(theme as any).isDark;
  const dotBg = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.35)";
  const dotBgActive = theme.primary;

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 14, marginBottom: 10 }}>
      <View style={{
        backgroundColor: theme.bubble,
        borderRadius: 18, borderBottomLeftRadius: 4,
        paddingHorizontal: 14, paddingVertical: 12,
        borderWidth: 1, borderColor: theme.border,
        flexDirection: "row", alignItems: "center", gap: 5,
        shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
      }}>
        {type === "recording" ? (
          <>
            {[3, 5, 8, 6, 4, 7, 5].map((h, i) => (
              <Animated.View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: theme.primary, opacity: 0.8 }} />
            ))}
          </>
        ) : (
          <>
            {[dot1, dot2, dot3].map((d, i) => (
              <Animated.View
                key={i}
                style={{
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: dotBg,
                  transform: [{ scale: d.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
                  opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
                }}
              />
            ))}
          </>
        )}
      </View>
    </View>
  );
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
  message, isOwn, onSelect, onClose, onReply, onDeleteForMe, onDeleteForAll, onStar, isStarred, onEdit, theme,
}: {
  message: Message; isOwn: boolean;
  onSelect: (emoji: string) => void; onClose: () => void;
  onReply: () => void; onDeleteForMe: () => void; onDeleteForAll: () => void;
  onStar: () => void; isStarred: boolean;
  onEdit: () => void;
  theme: any;
}) {
  const mainContent = message.content.startsWith("↩ \"")
    ? message.content.split("\n").slice(1).join("\n")
    : message.content;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={onClose}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
          <Pressable onStartShouldSetResponder={() => true}>
            <View style={{ backgroundColor: theme.surface, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: theme.border, alignItems: "center", gap: 12, width: 340 }}>
              {/* Reaction emojis */}
              <View style={{ flexDirection: "row", gap: 5 }}>
                {QUICK_REACTIONS.map(emoji => (
                  <Pressable
                    key={emoji}
                    onPress={() => { onSelect(emoji); onClose(); }}
                    style={({ pressed }) => ({
                      width: 42, height: 42, borderRadius: 21,
                      backgroundColor: pressed ? `${theme.primary}22` : theme.surfaceElevated,
                      alignItems: "center", justifyContent: "center",
                      borderWidth: 1, borderColor: theme.border,
                    })}
                  >
                    <Text style={{ fontSize: 22 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Message preview */}
              <View style={{ backgroundColor: theme.surfaceElevated, borderRadius: 12, padding: 10, width: "100%", borderWidth: 1, borderColor: theme.border, borderLeftWidth: 3, borderLeftColor: theme.primary }}>
                <Text style={{ fontSize: 11, color: theme.primary, fontFamily: "Inter_600SemiBold", marginBottom: 3 }}>
                  {isOwn ? "You" : message.sender?.displayName ?? "Them"}
                </Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, fontFamily: "Inter_400Regular" }} numberOfLines={2}>
                  {mainContent}
                </Text>
              </View>

              {/* Action buttons — row 1 */}
              <View style={{ flexDirection: "row", gap: 8, width: "100%" }}>
                <Pressable
                  style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: pressed ? `${theme.primary}30` : `${theme.primary}18`, borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: `${theme.primary}33` })}
                  onPress={() => { onReply(); onClose(); }}
                >
                  <Feather name="corner-up-left" size={15} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Reply</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: pressed ? "#F59E0B22" : (isStarred ? "#F59E0B18" : theme.surfaceElevated), borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: isStarred ? "#F59E0B55" : theme.border })}
                  onPress={() => { onStar(); onClose(); }}
                >
                  <Ionicons name={isStarred ? "star" : "star-outline"} size={15} color="#F59E0B" />
                  <Text style={{ color: "#F59E0B", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{isStarred ? "Unstar" : "Star"}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: pressed ? theme.border : theme.surfaceElevated, borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: theme.border })}
                  onPress={() => { Clipboard.setString(mainContent); onClose(); }}
                >
                  <Feather name="copy" size={15} color={theme.textSecondary} />
                  <Text style={{ color: theme.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Copy</Text>
                </Pressable>
                {isOwn && message.type === "text" && (
                  <Pressable
                    style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: pressed ? `${theme.primary}30` : theme.surfaceElevated, borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: theme.border })}
                    onPress={() => { onEdit(); onClose(); }}
                  >
                    <Feather name="edit-2" size={15} color={theme.primary} />
                    <Text style={{ color: theme.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Edit</Text>
                  </Pressable>
                )}
              </View>

              {/* Action buttons — row 2: delete */}
              <View style={{ flexDirection: "row", gap: 8, width: "100%" }}>
                <Pressable
                  style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: pressed ? "#ff444422" : "#ff444418", borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: "#ff444433" })}
                  onPress={() => { onDeleteForMe(); onClose(); }}
                >
                  <Feather name="eye-off" size={15} color="#ff4444" />
                  <Text style={{ color: "#ff4444", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Delete for me</Text>
                </Pressable>
                {isOwn && (
                  <Pressable
                    style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: pressed ? "#ff444422" : "#ff444418", borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: "#ff444433" })}
                    onPress={() => {
                      Alert.alert("Delete for everyone?", "This message will be removed for all participants.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => { onDeleteForAll(); onClose(); } },
                      ]);
                    }}
                  >
                    <Feather name="trash-2" size={15} color="#ff4444" />
                    <Text style={{ color: "#ff4444", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Delete for all</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Audio playback bubble ─────────────────────────────────────────────────────
function AudioBubble({ content, isOwn, theme }: { content: string; isOwn: boolean; theme: any }) {
  const aBubbleDark = !!(theme as any).isDark;
  const aOwnText = aBubbleDark ? "#ffffff" : theme.text;
  const aOwnTextMuted = aBubbleDark ? "rgba(255,255,255,0.60)" : theme.textMuted;
  const aOwnBtnBg = aBubbleDark ? "rgba(255,255,255,0.20)" : `${theme.primary}22`;
  const aOwnBtnColor = aBubbleDark ? "#ffffff" : theme.primary;
  const aOwnBarFilled = aBubbleDark ? "#ffffff" : theme.primary;
  const aOwnBarEmpty = aBubbleDark ? "rgba(255,255,255,0.45)" : theme.textSecondary;
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0); // 0-1
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => () => { soundRef.current?.unloadAsync().catch(() => {}); }, []);

  const toggle = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Voice note", "Audio playback is available in the native app (Expo Go)");
      return;
    }
    try {
      if (playing) {
        await soundRef.current?.pauseAsync();
        setPlaying(false);
        return;
      }
      if (!soundRef.current) {
        let uri = content;
        if (content.startsWith("data:")) {
          const b64 = content.split(",")[1];
          const ext = content.includes("ogg") ? "ogg" : content.includes("webm") ? "webm" : "m4a";
          const tmpPath = FileSystem.cacheDirectory + `voice_${Date.now()}.${ext}`;
          await FileSystem.writeAsStringAsync(tmpPath, b64, { encoding: FileSystem.EncodingType.Base64 });
          uri = tmpPath;
        }
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.isLoaded) {
            const p = status.durationMillis ? status.positionMillis / status.durationMillis : 0;
            setPos(p);
            if (status.didJustFinish) {
              setPlaying(false);
              setPos(0);
              soundRef.current?.unloadAsync().catch(() => {});
              soundRef.current = null;
            }
          }
        });
        setPlaying(true);
      } else {
        await soundRef.current.playAsync();
        setPlaying(true);
      }
    } catch { Alert.alert("Error", "Could not play audio"); }
  };

  const bars = [3, 5, 8, 6, 10, 7, 5, 9, 6, 4, 8, 5, 3];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Pressable
        onPress={toggle}
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isOwn ? aOwnBtnBg : `${theme.primary}22`, alignItems: "center", justifyContent: "center" }}
      >
        <Feather name={playing ? "pause" : "play"} size={15} color={isOwn ? aOwnBtnColor : theme.primary} />
      </Pressable>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", gap: 2.5, alignItems: "flex-end", height: 16 }}>
          {bars.map((h, i) => {
            const filled = pos > 0 && i / bars.length < pos;
            return (
              <View key={i} style={{ width: 2.5, height: h, borderRadius: 2, backgroundColor: filled ? (isOwn ? aOwnBarFilled : theme.primary) : (isOwn ? aOwnBarEmpty : theme.textSecondary) }} />
            );
          })}
        </View>
        <Text style={{ fontSize: 11, color: isOwn ? aOwnTextMuted : theme.textMuted, fontFamily: "Inter_400Regular" }}>
          {playing ? "Playing…" : "Voice note"}
        </Text>
      </View>
    </View>
  );
}

// ─── Chat wallpaper ────────────────────────────────────────────────────────────
function ChatWallpaper({ isDark }: { isDark: boolean }) {
  const bg = isDark ? "#0a131a" : "#dfe7ec";
  const stroke = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
  const dot = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="cwp" x="0" y="0" width="52" height="52" patternUnits="userSpaceOnUse">
            <SvgPath d="M26 3L49 26L26 49L3 26Z" stroke={stroke} strokeWidth="1" fill="none" />
            <SvgCircle cx="26" cy="26" r="2" fill={dot} />
            <SvgCircle cx="1" cy="1" r="1" fill={dot} />
            <SvgCircle cx="51" cy="1" r="1" fill={dot} />
            <SvgCircle cx="1" cy="51" r="1" fill={dot} />
            <SvgCircle cx="51" cy="51" r="1" fill={dot} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#cwp)" />
      </Svg>
    </View>
  );
}

// ─── Image/Video preview modal ─────────────────────────────────────────────────
interface PreviewAsset {
  uri: string;
  type: "image" | "video";
  hdMode: boolean;
  caption: string;
  viewOnce: boolean;
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const { sendSignal, onSignal } = useCall();
  const insets = useSafeAreaInsets();
  const { id, name, username, userId: otherUserIdParam, avatarUrl, isOwner: isOwnerParam, role: roleParam } = useLocalSearchParams<{ id: string; name: string; username: string; userId: string; avatarUrl: string; isOwner: string; role: string }>();
  const otherIsOwner = isOwnerParam === "true";
  const otherRole = roleParam ?? "user";
  const isDark = !!(theme as any).isDark;
  const ownText = isDark ? "#ffffff" : theme.text;
  const ownTextMuted = isDark ? "rgba(255,255,255,0.70)" : theme.textSecondary;
  const ownReplyBg = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.05)";
  const ownReplyBorder = isDark ? "rgba(255,255,255,0.60)" : theme.border;
  const ownReplyLabel = isDark ? "rgba(255,255,255,0.75)" : theme.primary;
  const otherUserId = otherUserIdParam ? parseInt(otherUserIdParam, 10) : null;

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactions, setReactions] = useState<Record<number, string[]>>({});
  const [reactionPickerMsg, setReactionPickerMsg] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [typingStatus, setTypingStatus] = useState<{ type: "typing" | "recording" } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    fontSize: "medium", bubbleStyle: "rounded", readReceipts: true, enterToSend: false, vibrationEnabled: true,
  });

  const inputRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();
  const lastMsgCount = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);

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
    // Load mute state for this conversation
    AsyncStorage.getItem(`mchat_muted_${id}`).then((v) => setIsMuted(v === "1"));
  }, []);

  // Load block status for the other user
  useEffect(() => {
    if (!token || !otherUserId) return;
    apiRequest(`/users/${otherUserId}/block`).then((r: any) => setIsBlocked(r.isBlocked ?? false)).catch(() => {});
  }, [otherUserId, token]);

  const toggleMute = useCallback(async () => {
    const next = !isMuted;
    setIsMuted(next);
    await AsyncStorage.setItem(`mchat_muted_${id}`, next ? "1" : "0");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isMuted, id]);

  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  // Voice recording state (WhatsApp-style)
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordCancelledRef = useRef(false);

  // Attach sheet state
  const [showAttach, setShowAttach] = useState(false);
  // Image/Video preview before send
  const [previewAsset, setPreviewAsset] = useState<PreviewAsset | null>(null);
  // Upload progress (0-100) for pending sends
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  // Full-screen image viewer after send/receive
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  // View-once viewed IDs (for this session)
  const [sessionViewed, setSessionViewed] = useState<Set<number>>(new Set());

  const toggleBlock = useCallback(() => {
    if (!otherUserId) return;
    if (isBlocked) {
      setBlockLoading(true);
      apiRequest(`/users/${otherUserId}/block`, { method: "DELETE" })
        .then(() => {
          setIsBlocked(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        })
        .catch(() => Alert.alert("Error", "Could not unblock user"))
        .finally(() => setBlockLoading(false));
    } else {
      setShowBlockConfirm(true);
    }
  }, [isBlocked, otherUserId]);

  const confirmBlock = useCallback(() => {
    if (!otherUserId) return;
    setBlockLoading(true);
    apiRequest(`/users/${otherUserId}/block`, { method: "POST" })
      .then(() => {
        setIsBlocked(true);
        setShowBlockConfirm(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      })
      .catch(() => Alert.alert("Error", "Could not block user"))
      .finally(() => setBlockLoading(false));
  }, [otherUserId]);

  const { data: messages } = useQuery<Message[]>({
    queryKey: ["messages", id, token],
    queryFn: () => apiRequest(`/conversations/${id}/messages`),
    enabled: !!token && !!id,
    refetchInterval: 3000,
  });

  // Listen for real-time chat-updated signals (e.g. delete-for-all from other side)
  useEffect(() => {
    const unsub = onSignal((msg: any) => {
      if (msg.type === "chat-updated" && String(msg.conversationId) === String(id)) {
        queryClient.invalidateQueries({ queryKey: ["messages", id, token] });
      }
    });
    return unsub;
  }, [onSignal, id, token, queryClient]);

  // Mark the other user's messages as read when we open the chat
  useEffect(() => {
    if (!token || !id) return;
    apiRequest(`/conversations/${id}/read`, { method: "POST" }).catch(() => {});
    const interval = setInterval(() => {
      apiRequest(`/conversations/${id}/read`, { method: "POST" }).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [id, token]);

  // ID of the most recent message sent by me (for Sent/Seen indicator)
  const lastOwnMsgId = useMemo(() => {
    if (!messages || !user?.id) return null;
    return messages.find(m => m.senderId === user.id)?.id ?? null;
  }, [messages, user?.id]);

  // Presence: poll the other user's online/last-seen status
  const { data: presence } = useQuery<{ isOnline: boolean; lastSeenAt: string | null }>({
    queryKey: ["presence", otherUserId],
    queryFn: () => apiRequest(`/presence/${otherUserId}`),
    enabled: !!token && !!otherUserId,
    refetchInterval: 8000,
  });

  // Typing: poll who's typing in this conversation
  const { data: whoTyping } = useQuery<{ userId: number; displayName: string; type: "typing" | "recording" }[]>({
    queryKey: ["typing", id],
    queryFn: () => apiRequest(`/conversations/${id}/typing`),
    enabled: !!token && !!id,
    refetchInterval: 2500,
  });

  // Derive header status string
  const headerStatus = useMemo(() => {
    if (whoTyping && whoTyping.length > 0) {
      const t = whoTyping[0];
      return { text: t.type === "recording" ? "recording..." : "typing...", color: "#22c55e", animate: true };
    }
    if (presence?.isOnline) return { text: "online", color: "#22c55e", animate: false };
    return { text: formatLastSeen(presence?.lastSeenAt), color: undefined, animate: false };
  }, [whoTyping, presence]);

  // Notify server when I'm typing/stopped
  const sendTypingEvent = useCallback((type: "typing" | "stopped") => {
    if (!token || !id) return;
    const now = Date.now();
    if (type === "typing" && now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    apiRequest(`/conversations/${id}/typing`, { method: "POST", body: JSON.stringify({ type }) }).catch(() => {});
  }, [id, token]);

  // Track text changes to send typing events
  useEffect(() => {
    if (text.length > 0) {
      sendTypingEvent("typing");
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingEvent("stopped");
      }, 3000);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      sendTypingEvent("stopped");
    }
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [text]);

  // Play sound + vibrate on new message (respects mute)
  useEffect(() => {
    if (!messages) return;
    const newCount = messages.length;
    if (newCount > lastMsgCount.current && lastMsgCount.current > 0) {
      const newest = messages[0];
      if (newest.senderId !== user?.id) {
        if (!isMuted) playReceiveSound();
        if (!isMuted && appSettings.vibrationEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
    lastMsgCount.current = newCount;
  }, [messages, isMuted]);

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

  // ── Voice recording (WhatsApp-style) ──────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (Platform.OS === "web") {
      setIsRecording(true);
      setRecordDuration(0);
      recordCancelledRef.current = false;
      recordTimerRef.current = setInterval(() => setRecordDuration(p => p + 1), 1000);
      return;
    }
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert("Permission needed", "Microphone permission is required"); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      recordCancelledRef.current = false;
      setIsRecording(true);
      setRecordDuration(0);
      if (appSettings.vibrationEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      recordTimerRef.current = setInterval(() => setRecordDuration(p => p + 1), 1000);
    } catch { Alert.alert("Error", "Could not start recording"); }
  }, [appSettings.vibrationEnabled]);

  const stopRecording = useCallback(async (cancelled = false) => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setIsRecording(false);
    if (Platform.OS === "web") {
      if (!cancelled) Alert.alert("Voice notes", "Voice note recording is available in the native Expo Go app on your device.");
      setRecordDuration(0);
      return;
    }
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      if (cancelled || recordDuration < 1) { setRecordDuration(0); return; }
      const uri = rec.getURI();
      if (!uri) { setRecordDuration(0); return; }
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const ext = uri.split(".").pop() ?? "m4a";
      await sendMsg(`data:audio/${ext};base64,${b64}`, "audio");
    } catch { Alert.alert("Error", "Could not send voice note"); }
    setRecordDuration(0);
  }, [recordDuration, sendMsg]);

  // ── Image / video attach ────────────────────────────────────────────────────────
  const pickImage = useCallback(async (source: "gallery" | "camera", mediaType: "image" | "video" = "image") => {
    setShowAttach(false);
    try {
      let result;
      const hdQuality = 0.95;
      const stdQuality = 0.65;

      if (source === "camera") {
        const { granted } = await ImagePicker.requestCameraPermissionsAsync();
        if (!granted) { Alert.alert("Permission needed", "Camera access is required"); return; }
        if (mediaType === "video") {
          result = await (ImagePicker as any).launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: 60 });
        } else {
          result = await ImagePicker.launchCameraAsync({ quality: stdQuality, base64: true, exif: false });
        }
      } else {
        if (mediaType === "video") {
          result = await (ImagePicker as any).launchImageLibraryAsync({ mediaTypes: ["videos"], videoMaxDuration: 60 });
        } else {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"] as any,
            quality: stdQuality,
            base64: true,
            exif: false,
          });
        }
      }

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        if (mediaType === "video") {
          setPreviewAsset({ uri: asset.uri, type: "video", hdMode: false, caption: "", viewOnce: false });
        } else if (asset.base64) {
          const uri = `data:image/jpeg;base64,${asset.base64}`;
          setPreviewAsset({ uri, type: "image", hdMode: false, caption: "", viewOnce: false });
        }
      }
    } catch { Alert.alert("Error", "Could not attach media"); }
  }, []);

  const sendPreviewAsset = useCallback(async () => {
    if (!previewAsset) return;
    const assetCopy = { ...previewAsset };
    setPreviewAsset(null);
    setSending(true);
    // Generate a temp key for upload progress
    const progressKey = `upload-${Date.now()}`;
    setUploadProgress(p => ({ ...p, [progressKey]: 0 }));
    // Simulate progress stages
    const progressInterval = setInterval(() => {
      setUploadProgress(p => {
        const cur = p[progressKey] ?? 0;
        if (cur >= 90) { clearInterval(progressInterval); return p; }
        return { ...p, [progressKey]: cur + Math.random() * 15 };
      });
    }, 200);
    try {
      if (assetCopy.type === "image") {
        let content = assetCopy.uri;
        await apiRequest(`/conversations/${id}/messages`, {
          method: "POST", body: JSON.stringify({ content, type: "image", viewOnce: assetCopy.viewOnce ? 1 : 0 }),
        });
        if (assetCopy.caption.trim()) {
          await apiRequest(`/conversations/${id}/messages`, {
            method: "POST", body: JSON.stringify({ content: assetCopy.caption, type: "text" }),
          });
        }
      } else {
        let content = assetCopy.uri;
        if (Platform.OS !== "web" && !content.startsWith("data:")) {
          try {
            const b64 = await FileSystem.readAsStringAsync(content, { encoding: FileSystem.EncodingType.Base64 });
            content = `data:video/mp4;base64,${b64}`;
          } catch {}
        }
        await apiRequest(`/conversations/${id}/messages`, {
          method: "POST", body: JSON.stringify({ content, type: "video", viewOnce: assetCopy.viewOnce ? 1 : 0 }),
        });
        if (assetCopy.caption.trim()) {
          await apiRequest(`/conversations/${id}/messages`, {
            method: "POST", body: JSON.stringify({ content: assetCopy.caption, type: "text" }),
          });
        }
      }
      clearInterval(progressInterval);
      setUploadProgress(p => ({ ...p, [progressKey]: 100 }));
      setTimeout(() => setUploadProgress(p => { const n = { ...p }; delete n[progressKey]; return n; }), 800);
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      playSendSound();
    } catch {
      clearInterval(progressInterval);
      setUploadProgress(p => { const n = { ...p }; delete n[progressKey]; return n; });
      Alert.alert("Error", "Failed to send media");
    } finally {
      setSending(false);
    }
  }, [previewAsset, id, queryClient]);

  // ── Star / unstar ──────────────────────────────────────────────────────────────
  const starMsg = useCallback(async (msgId: number) => {
    try {
      await apiRequest(`/conversations/${id}/messages/${msgId}/star`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["starred"] });
      if (appSettings.vibrationEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { Alert.alert("Error", "Could not star message"); }
  }, [id, queryClient, appSettings.vibrationEnabled]);

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

  const deleteMsg = useCallback(async (msgId: number, scope: "me" | "all") => {
    setReactionPickerMsg(null);
    // Optimistic update
    queryClient.setQueryData(["messages", id, token], (old: Message[] | undefined) => {
      if (!old) return old;
      return old.map(m => {
        if (m.id !== msgId) return m;
        if (scope === "all") return { ...m, isDeleted: 1, content: "" };
        const existing = (m.deletedForIds ?? "").split(",").filter(Boolean);
        if (!existing.includes(String(user?.id))) existing.push(String(user?.id ?? ""));
        return { ...m, deletedForIds: existing.join(",") };
      });
    });
    try {
      await apiRequest(`/conversations/${id}/messages/${msgId}?scope=${scope}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["messages", id, token] });
      if (scope === "all" && otherUserId) {
        sendSignal(otherUserId, { type: "chat-updated", conversationId: id });
      }
      if (appSettings.vibrationEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      queryClient.invalidateQueries({ queryKey: ["messages", id, token] });
      Alert.alert("Error", "Could not delete message");
    }
  }, [id, queryClient, appSettings, user, token, otherUserId, sendSignal]);

  const editMsg = useCallback(async (msgId: number, newContent: string) => {
    if (!newContent.trim()) return;
    queryClient.setQueryData(["messages", id, token], (old: Message[] | undefined) => {
      if (!old) return old;
      return old.map(m => m.id === msgId ? { ...m, content: newContent.trim() } : m);
    });
    try {
      await apiRequest(`/conversations/${id}/messages/${msgId}`, {
        method: "PATCH",
        body: JSON.stringify({ content: newContent.trim() }),
      });
      queryClient.invalidateQueries({ queryKey: ["messages", id, token] });
      if (otherUserId) sendSignal(otherUserId, { type: "chat-updated", conversationId: id });
    } catch {
      queryClient.invalidateQueries({ queryKey: ["messages", id, token] });
      Alert.alert("Error", "Could not edit message");
    }
    setEditingMsg(null);
    setText("");
  }, [id, queryClient, token, otherUserId, sendSignal]);

  const r = getBubbleRadius(appSettings.bubbleStyle);
  const fs = getFontSize(appSettings.fontSize);

  const renderMsg = ({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.senderId === user?.id;
    // Hide messages "deleted for me" for the current user
    const deletedForMe = (item.deletedForIds ?? "").split(",").filter(Boolean).includes(String(user?.id));
    if (deletedForMe) return null;

    const allMessages = messages ?? [];
    const nextMsg = allMessages[index - 1];
    const prevMsg = allMessages[index + 1];
    const isFirst = !prevMsg || prevMsg.senderId !== item.senderId;
    const isLast = !nextMsg || nextMsg.senderId !== item.senderId;
    const msgReactions = reactions[item.id] ?? [];
    const isDeletedForAll = item.isDeleted === 1;

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
              onLongPress={() => {
                if (!isDeletedForAll) {
                  setReactionPickerMsg(item);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
              }}
              delayLongPress={320}
            >
              <View style={{
                backgroundColor: isDeletedForAll ? "transparent" : (isOwn ? theme.bubbleOwn : theme.bubble),
                borderTopLeftRadius: isOwn ? ownTopLeft : othTopLeft,
                borderTopRightRadius: isOwn ? ownTopRight : othTopRight,
                borderBottomLeftRadius: isOwn ? ownBotLeft : othBotLeft,
                borderBottomRightRadius: isOwn ? ownBotRight : othBotRight,
                paddingHorizontal: 13, paddingVertical: 8,
                borderWidth: 1,
                borderColor: isDeletedForAll ? theme.border : (isOwn ? "transparent" : theme.border),
                borderStyle: isDeletedForAll ? "dashed" : "solid",
              }}>
                {isDeletedForAll ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="slash" size={13} color={theme.textMuted} />
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", fontStyle: "italic", color: theme.textMuted }}>
                      This message was deleted
                    </Text>
                  </View>
                ) : (
                  <>
                    {/* Reply context strip */}
                    {isReplyMsg && replyLine && (
                      <View style={{ backgroundColor: isOwn ? ownReplyBg : `${theme.primary}18`, borderRadius: 8, padding: 8, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: isOwn ? ownReplyBorder : theme.primary }}>
                        <Text style={{ fontSize: 11, color: isOwn ? ownReplyLabel : theme.primary, fontFamily: "Inter_600SemiBold", marginBottom: 2 }}>↩ Replied</Text>
                        <Text style={{ fontSize: 12, color: isOwn ? ownTextMuted : theme.textSecondary, fontFamily: "Inter_400Regular" }} numberOfLines={1}>{replyLine}</Text>
                      </View>
                    )}

                    {/* Mattex AI spam/scam warning */}
                    {(item.spamFlag === "spam" || item.spamFlag === "scam") && (
                      <View style={{
                        backgroundColor: item.spamFlag === "scam" ? "rgba(220,38,38,0.12)" : "rgba(245,158,11,0.12)",
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        marginBottom: 6,
                        borderLeftWidth: 3,
                        borderLeftColor: item.spamFlag === "scam" ? "#DC2626" : "#F59E0B",
                        gap: 2,
                      }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Text style={{ fontSize: 12 }}>{item.spamFlag === "scam" ? "🚨" : "⚠️"}</Text>
                          <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: item.spamFlag === "scam" ? "#DC2626" : "#B45309" }}>
                            {item.spamFlag === "scam" ? "Possible Scam" : "Possible Spam"}
                          </Text>
                          <Text style={{ fontSize: 10, color: item.spamFlag === "scam" ? "#DC2626" : "#B45309", fontFamily: "Inter_400Regular", marginLeft: 2 }}>· Mattex AI</Text>
                        </View>
                        {!!item.spamReason && (
                          <Text style={{ fontSize: 11, color: item.spamFlag === "scam" ? "#B91C1C" : "#92400E", fontFamily: "Inter_400Regular", marginLeft: 17 }}>
                            {item.spamReason}
                          </Text>
                        )}
                      </View>
                    )}

                    {item.type === "audio" && !item.content.startsWith("{") ? (
                      <AudioBubble content={item.content} isOwn={isOwn} theme={theme} />
                    ) : (item.type === "call" || (item.content.startsWith("{") && item.content.includes('"status"'))) ? (
                      (() => {
                        let callMeta: { type: string; status: string; duration?: number } = { type: "audio", status: "missed" };
                        try { callMeta = JSON.parse(item.content); } catch {}
                        const isMissed = callMeta.status === "missed";
                        const callColor = isMissed ? "#ef4444" : "#22c55e";
                        return (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minWidth: 160 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${callColor}20`, alignItems: "center", justifyContent: "center" }}>
                              <Feather name={callMeta.type === "video" ? "video" : "phone"} size={16} color={callColor} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: isOwn ? ownText : theme.text }}>
                                {callMeta.type === "video" ? "Video call" : "Voice call"}
                              </Text>
                              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: isOwn ? ownTextMuted : theme.textSecondary }}>
                                {isMissed ? "Missed" : callMeta.status === "rejected" ? "Declined" : callMeta.status === "cancelled" ? "Cancelled" : callMeta.duration ? `${Math.floor((callMeta.duration ?? 0) / 60)}:${String((callMeta.duration ?? 0) % 60).padStart(2, "0")}` : "Completed"}
                              </Text>
                            </View>
                          </View>
                        );
                      })()
                    ) : item.type === "image" ? (
                      (() => {
                        const isViewOnce = item.viewOnce === 1;
                        const hasViewed = isViewOnce && ((item.viewedBy ?? "").split(",").filter(Boolean).includes(String(user?.id)) || sessionViewed.has(item.id));
                        if (isViewOnce && !isOwn && hasViewed) {
                          return (
                            <View style={{ width: 180, height: 48, borderRadius: 10, backgroundColor: `${theme.primary}18`, borderWidth: 1, borderColor: `${theme.primary}33`, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
                              <Feather name="eye-off" size={16} color={theme.primary} />
                              <Text style={{ fontSize: 13, color: theme.primary, fontFamily: "Inter_500Medium" }}>Viewed</Text>
                            </View>
                          );
                        }
                        return (
                          <Pressable
                            onPress={() => {
                              if (isViewOnce && !isOwn) {
                                setSessionViewed(s => new Set([...s, item.id]));
                                apiRequest(`/conversations/${id}/messages/${item.id}/view`, { method: "POST" }).catch(() => {});
                              }
                              setViewerUri(item.content);
                            }}
                            style={{ position: "relative" }}
                          >
                            <Image
                              source={{ uri: item.content }}
                              style={{ width: 220, height: 160, borderRadius: 10 }}
                              resizeMode="cover"
                            />
                            {isViewOnce && !hasViewed && (
                              <View style={{ position: "absolute", bottom: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                                <Feather name="eye" size={12} color="#fff" />
                                <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium" }}>View once</Text>
                              </View>
                            )}
                          </Pressable>
                        );
                      })()
                    ) : item.type === "video" ? (
                      <Pressable onPress={() => setViewerUri(item.content)}>
                        <View style={{ width: 220, height: 160, borderRadius: 10, backgroundColor: "#000", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                          {Platform.OS === "web" ? (
                            <video
                              src={item.content}
                              style={{ width: "100%", height: "100%", objectFit: "cover" as any, borderRadius: 10 } as any}
                            />
                          ) : (
                            <>
                              <Feather name="play-circle" size={48} color="rgba(255,255,255,0.9)" />
                              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 }}>Video</Text>
                            </>
                          )}
                        </View>
                      </Pressable>
                    ) : (
                      <Text style={{ fontSize: fs, fontFamily: "Inter_400Regular", lineHeight: fs * 1.5, color: isOwn ? ownText : theme.text }}>
                        {mainContent}
                      </Text>
                    )}
                  </>
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

            {/* Timestamp + Sent/Seen + Star */}
            {isLast && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3, justifyContent: isOwn ? "flex-end" : "flex-start", paddingHorizontal: 2 }}>
                {(item.starredBy ?? "").split(",").filter(Boolean).includes(String(user?.id)) && (
                  <Ionicons name="star" size={11} color="#F59E0B" />
                )}
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted }}>{formatMsgTime(item.createdAt)}</Text>
                {isOwn && item.id === lastOwnMsgId && (
                  <Text style={{
                    fontSize: 11,
                    fontFamily: "Inter_600SemiBold",
                    color: item.readAt ? theme.primary : theme.textMuted,
                  }}>
                    {item.readAt ? "Seen" : "Sent"}
                  </Text>
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
        <Pressable
          onPress={() => avatarUrl ? setShowAvatarPreview(true) : router.push({ pathname: "/user/[id]", params: { id: otherUserId, name, username, avatarUrl: avatarUrl ?? "" } })}
          style={{ borderRadius: 20 }}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: `${theme.primary}66` }} />
          ) : (
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${theme.primary}33`, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: `${theme.primary}66` }}>
              <Text style={{ color: theme.primary, fontSize: 17, fontFamily: "Inter_700Bold" }}>{(name ?? "?")[0].toUpperCase()}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: "/user/[id]", params: { id: otherUserId, name, username, avatarUrl: avatarUrl ?? "" } })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: theme.text }}>{name}</Text>
            <UserBadge isOwner={otherIsOwner} role={otherRole} size="sm" />
            {isMuted && <Feather name="bell-off" size={13} color={theme.textMuted} />}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            {(presence?.isOnline || (whoTyping && whoTyping.length > 0)) && (
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#22c55e" }} />
            )}
            <Text style={{
              fontSize: 12,
              color: headerStatus.color ?? theme.textSecondary,
              fontFamily: (whoTyping && whoTyping.length > 0) ? "Inter_600SemiBold" : "Inter_400Regular",
              fontStyle: (whoTyping && whoTyping.length > 0) ? "italic" : "normal",
            }}>
              {headerStatus.text}
            </Text>
          </View>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Pressable
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: `${theme.primary}18`, alignItems: "center", justifyContent: "center" }}
            onPress={() => router.push({ pathname: "/call/[id]", params: { id: String(otherUserId), name, username, callType: "video", avatarUrl: avatarUrl ?? "" } })}
          >
            <Feather name="video" size={18} color={theme.primary} />
          </Pressable>
          <Pressable
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: `${theme.primary}18`, alignItems: "center", justifyContent: "center" }}
            onPress={() => router.push({ pathname: "/call/[id]", params: { id: String(otherUserId), name, username, callType: "voice", avatarUrl: avatarUrl ?? "" } })}
          >
            <Feather name="phone" size={18} color={theme.primary} />
          </Pressable>
          <Pressable
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: showMenu ? `${theme.primary}44` : `${theme.primary}18`, alignItems: "center", justifyContent: "center" }}
            onPress={() => setShowMenu(m => !m)}
          >
            <Feather name="more-vertical" size={18} color={theme.primary} />
          </Pressable>
        </View>
      </View>

      {/* Dropdown menu */}
      {showMenu && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowMenu(false)}>
            <View style={{ position: "absolute", top: insets.top + (Platform.OS === "web" ? 130 : 72), right: 12, backgroundColor: theme.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.border, overflow: "hidden", minWidth: 220, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 10 }}>
              {/* View Shared Media */}
              <Pressable
                onPress={() => { setShowMenu(false); setShowMedia(true); }}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 15, backgroundColor: pressed ? theme.surfaceElevated : "transparent", borderBottomWidth: 1, borderBottomColor: theme.border })}
              >
                <Feather name="image" size={19} color={theme.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: theme.text }}>Shared Media</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: theme.textMuted, marginTop: 1 }}>Photos & videos</Text>
                </View>
                <Feather name="chevron-right" size={16} color={theme.textMuted} />
              </Pressable>

              {/* Mute toggle */}
              <Pressable
                onPress={() => { toggleMute(); setShowMenu(false); }}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 15, backgroundColor: pressed ? theme.surfaceElevated : "transparent", borderBottomWidth: 1, borderBottomColor: theme.border })}
              >
                <Feather name={isMuted ? "bell" : "bell-off"} size={19} color={isMuted ? theme.primary : theme.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: theme.text }}>{isMuted ? "Unmute notifications" : "Mute notifications"}</Text>
                  {isMuted && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: theme.textMuted, marginTop: 1 }}>Messages silenced</Text>}
                </View>
                {isMuted && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary }} />}
              </Pressable>

              {/* Block / Unblock */}
              <Pressable
                onPress={() => { setShowMenu(false); toggleBlock(); }}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 15, backgroundColor: pressed ? "#ff444412" : "transparent" })}
              >
                <Feather name={isBlocked ? "user-check" : "user-x"} size={19} color="#ff4444" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#ff4444" }}>{isBlocked ? `Unblock ${name}` : `Block ${name}`}</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: theme.textMuted, marginTop: 1 }}>
                    {isBlocked ? "Allow messages again" : "Stop messages & calls"}
                  </Text>
                </View>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* ── Shared Media Gallery (Telegram-style) ──────────────────── */}
      <Modal visible={showMedia} animationType="slide" onRequestClose={() => setShowMedia(false)}>
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          {/* Header */}
          <View style={{
            paddingTop: insets.top + (Platform.OS === "web" ? 72 : 16),
            paddingHorizontal: 16, paddingBottom: 12,
            backgroundColor: theme.surface,
            borderBottomWidth: 1, borderBottomColor: theme.border,
            flexDirection: "row", alignItems: "center", gap: 12,
          }}>
            <Pressable onPress={() => setShowMedia(false)} style={{ padding: 6 }}>
              <Feather name="arrow-left" size={22} color={theme.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: theme.text }}>{name}</Text>
              <Text style={{ fontSize: 12, color: theme.textMuted, fontFamily: "Inter_400Regular" }}>Shared media</Text>
            </View>
          </View>

          {/* Media grid */}
          {(() => {
            const allMsgs: Message[] = messages ?? [];
            const mediaItems = allMsgs.filter(m => (m.type === "image" || m.type === "video") && !m.isDeleted && m.content);
            if (mediaItems.length === 0) {
              return (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
                  <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: `${theme.primary}18`, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="image" size={36} color={theme.textMuted} />
                  </View>
                  <Text style={{ color: theme.text, fontFamily: "Inter_600SemiBold", fontSize: 17 }}>No media yet</Text>
                  <Text style={{ color: theme.textMuted, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", paddingHorizontal: 40 }}>
                    Photos and videos shared in this conversation will appear here.
                  </Text>
                </View>
              );
            }
            const COLS = 3;
            const SIZE = Math.floor((350) / COLS);
            return (
              <ScrollView contentContainerStyle={{ padding: 2 }}>
                {/* Group by month */}
                {Array.from(new Set(mediaItems.map(m => {
                  const d = new Date(m.createdAt);
                  return `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}`;
                }))).map(month => {
                  const monthItems = mediaItems.filter(m => {
                    const d = new Date(m.createdAt);
                    return `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}` === month;
                  });
                  return (
                    <View key={month}>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 }}>{month}</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, paddingHorizontal: 2 }}>
                        {monthItems.map(item => (
                          <Pressable
                            key={item.id}
                            onPress={() => setMediaViewer(item.content)}
                            style={{ width: SIZE, height: SIZE, backgroundColor: theme.surface }}
                          >
                            <Image
                              source={{ uri: item.content }}
                              style={{ width: SIZE, height: SIZE }}
                              resizeMode="cover"
                            />
                            {item.type === "video" && (
                              <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" }}>
                                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
                                  <Feather name="play" size={14} color="#fff" />
                                </View>
                              </View>
                            )}
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            );
          })()}
        </View>
      </Modal>

      {/* Full-screen media viewer */}
      <Modal visible={!!mediaViewer} animationType="fade" transparent onRequestClose={() => setMediaViewer(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.96)", alignItems: "center", justifyContent: "center" }}>
          <Pressable
            style={{ position: "absolute", top: insets.top + 16, right: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}
            onPress={() => setMediaViewer(null)}
          >
            <Feather name="x" size={22} color="#fff" />
          </Pressable>
          {mediaViewer && (
            <Image source={{ uri: mediaViewer }} style={{ width: "100%", height: "80%" }} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* Messages with wallpaper */}
      <View style={{ flex: 1, position: "relative" }}>
        <ChatWallpaper isDark={isDark} />
      <FlatList
        style={{ flex: 1 }}
        data={messages ?? []}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderMsg}
        inverted
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingVertical: 12, paddingBottom: 4 }}
        ListHeaderComponent={
          whoTyping && whoTyping.length > 0 ? (
            <TypingBubble type={whoTyping[0].type} theme={theme} r={r} />
          ) : null
        }
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
      </View>

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

      {/* Edit preview bar */}
      {editingMsg && (
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.surfaceElevated, borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderLeftWidth: 3, borderLeftColor: "#F59E0B" }}>
          <Feather name="edit-2" size={16} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: "#F59E0B", fontFamily: "Inter_600SemiBold", marginBottom: 2 }}>Editing message</Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary, fontFamily: "Inter_400Regular" }} numberOfLines={1}>
              {editingMsg.content.startsWith("↩ \"") ? editingMsg.content.split("\n").slice(1).join(" ") : editingMsg.content}
            </Text>
          </View>
          <Pressable onPress={() => { setEditingMsg(null); setText(""); }} style={{ padding: 4 }}>
            <Feather name="x" size={18} color={theme.textMuted} />
          </Pressable>
        </View>
      )}

      {/* Blocked banner — replaces input when user is blocked */}
      {isBlocked && (
        <View style={{ backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: 24, paddingVertical: 18, paddingBottom: insets.bottom + 18, alignItems: "center", gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name="user-x" size={20} color="#ff4444" />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#ff4444" }}>You blocked {name}</Text>
          </View>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: theme.textMuted, textAlign: "center" }}>
            Unblock from the menu above to send messages.
          </Text>
          <Pressable
            onPress={toggleBlock}
            style={({ pressed }) => ({ marginTop: 4, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, backgroundColor: pressed ? "#ff444430" : "#ff444418", borderWidth: 1, borderColor: "#ff444433" })}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#ff4444" }}>Unblock {name}</Text>
          </Pressable>
        </View>
      )}

      {/* Input bar */}
      {!isBlocked && !isRecording && <View style={{
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
          <Pressable style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }} onPress={() => setShowAttach(true)}>
            <Feather name="paperclip" size={22} color={theme.textSecondary} />
          </Pressable>
        )}

        {text.trim() ? (
          <Pressable
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: editingMsg ? "#F59E0B" : theme.primary, alignItems: "center", justifyContent: "center" }}
            onPress={() => editingMsg ? editMsg(editingMsg.id, text) : sendMsg(text)}
            disabled={sending}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Feather name={editingMsg ? "check" : "send"} size={17} color="#fff" />}
          </Pressable>
        ) : (
          <Pressable
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: `${theme.primary}22`, alignItems: "center", justifyContent: "center" }}
            onPressIn={startRecording}
            onPressOut={() => stopRecording(false)}
            delayLongPress={200}
          >
            <Feather name="mic" size={20} color={theme.primary} />
          </Pressable>
        )}
      </View>}

      {/* WhatsApp-style recording bar */}
      {!isBlocked && isRecording && (
        <View style={{
          flexDirection: "row", alignItems: "center",
          paddingHorizontal: 16, paddingVertical: 14,
          paddingBottom: insets.bottom + 14,
          backgroundColor: theme.surface,
          borderTopWidth: 1, borderTopColor: theme.border, gap: 12,
        }}>
          {/* Cancel */}
          <Pressable
            onPress={() => stopRecording(true)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 4 }}
          >
            <Feather name="chevron-left" size={20} color={theme.textMuted} />
            <Text style={{ color: theme.textMuted, fontFamily: "Inter_400Regular", fontSize: 14 }}>Cancel</Text>
          </Pressable>

          {/* Waveform + timer */}
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
            {/* Animated red dot */}
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#ff4444" }} />
            {/* Mini waveform */}
            <View style={{ flex: 1, flexDirection: "row", gap: 2, alignItems: "flex-end", height: 24 }}>
              {[4,7,10,6,8,5,9,7,4,8,6,10,5,7,4].map((h, i) => (
                <View key={i} style={{ flex: 1, height: h, borderRadius: 2, backgroundColor: "#ff444488" }} />
              ))}
            </View>
            <Text style={{ color: theme.text, fontFamily: "Inter_600SemiBold", fontSize: 15, minWidth: 44 }}>
              {`${Math.floor(recordDuration / 60).toString().padStart(2, "0")}:${(recordDuration % 60).toString().padStart(2, "0")}`}
            </Text>
          </View>

          {/* Send button */}
          <Pressable
            onPress={() => stopRecording(false)}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* ── Upload progress overlay ─── */}
      {Object.keys(uploadProgress).length > 0 && (
        <View style={{ position: "absolute", bottom: 88, right: 16, left: 16, zIndex: 99, gap: 6, pointerEvents: "none" }}>
          {Object.entries(uploadProgress).map(([key, pct]) => (
            <View key={key} style={{ backgroundColor: isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.92)", borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: theme.border }}>
              <Feather name="image" size={16} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.text, marginBottom: 4 }}>
                  {pct >= 100 ? "Sent!" : "Sending..."}
                </Text>
                <View style={{ height: 3, backgroundColor: theme.border, borderRadius: 2, overflow: "hidden" }}>
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: pct >= 100 ? "#22c55e" : theme.primary, width: `${Math.min(pct, 100)}%` }} />
                </View>
              </View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: pct >= 100 ? "#22c55e" : theme.primary }}>
                {Math.round(Math.min(pct, 100))}%
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Full-screen image/video viewer ─── */}
      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <Pressable
            style={{ position: "absolute", top: insets.top + 10, right: 16, zIndex: 20, padding: 10, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20 }}
            onPress={() => setViewerUri(null)}
          >
            <Feather name="x" size={22} color="#fff" />
          </Pressable>
          {viewerUri && (
            viewerUri.startsWith("data:video") || viewerUri.includes(".mp4") ? (
              Platform.OS === "web" ? (
                <video
                  src={viewerUri}
                  controls
                  autoPlay
                  style={{ width: "100%", height: "100%", objectFit: "contain" } as any}
                />
              ) : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="play-circle" size={72} color="rgba(255,255,255,0.6)" />
                  <Text style={{ color: "rgba(255,255,255,0.5)", marginTop: 12, fontFamily: "Inter_400Regular" }}>Video preview</Text>
                </View>
              )
            ) : (
              <Image source={{ uri: viewerUri }} style={{ flex: 1 }} resizeMode="contain" />
            )
          )}
          {/* Save / share actions */}
          <View style={{ position: "absolute", bottom: insets.bottom + 24, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 24 }}>
            <Pressable style={{ alignItems: "center", gap: 6 }} onPress={() => setViewerUri(null)}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="download" size={22} color="#fff" />
              </View>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular" }}>Save</Text>
            </Pressable>
            <Pressable style={{ alignItems: "center", gap: 6 }} onPress={() => setViewerUri(null)}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="share-2" size={22} color="#fff" />
              </View>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular" }}>Share</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Media Preview Modal (WhatsApp-style) ─────────────────────────────── */}
      {previewAsset && (
        <Modal visible animationType="fade" transparent={false} onRequestClose={() => setPreviewAsset(null)}>
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            {/* Top bar */}
            <View style={{
              position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
              flexDirection: "row", alignItems: "center", paddingTop: insets.top + 8,
              paddingHorizontal: 12, paddingBottom: 12,
              backgroundColor: "rgba(0,0,0,0.5)",
            }}>
              <Pressable onPress={() => setPreviewAsset(null)} style={{ padding: 8 }}>
                <Feather name="x" size={24} color="#fff" />
              </Pressable>
              <Text style={{ flex: 1, color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" }}>
                {previewAsset.type === "video" ? "Video" : "Photo"}
              </Text>
              {/* HD toggle */}
              <Pressable
                onPress={() => setPreviewAsset(p => p ? { ...p, hdMode: !p.hdMode } : null)}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6,
                  borderRadius: 16, borderWidth: 1.5,
                  borderColor: previewAsset.hdMode ? "#22c55e" : "rgba(255,255,255,0.4)",
                  backgroundColor: previewAsset.hdMode ? "#22c55e22" : "transparent",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Feather name="zap" size={13} color={previewAsset.hdMode ? "#22c55e" : "rgba(255,255,255,0.7)"} />
                <Text style={{ color: previewAsset.hdMode ? "#22c55e" : "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>HD</Text>
              </Pressable>
              {/* View once toggle */}
              <Pressable
                onPress={() => setPreviewAsset(p => p ? { ...p, viewOnce: !p.viewOnce } : null)}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6,
                  borderRadius: 16, borderWidth: 1.5,
                  borderColor: previewAsset.viewOnce ? "#a78bfa" : "rgba(255,255,255,0.4)",
                  backgroundColor: previewAsset.viewOnce ? "#a78bfa22" : "transparent",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Feather name="eye" size={13} color={previewAsset.viewOnce ? "#a78bfa" : "rgba(255,255,255,0.7)"} />
                <Text style={{ color: previewAsset.viewOnce ? "#a78bfa" : "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>1x</Text>
              </Pressable>
            </View>

            {/* Preview content */}
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              {previewAsset.type === "image" ? (
                <Image
                  source={{ uri: previewAsset.uri }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="contain"
                />
              ) : Platform.OS === "web" ? (
                <video
                  src={previewAsset.uri}
                  controls
                  style={{ maxWidth: "100%", maxHeight: "100%", outline: "none" } as any}
                />
              ) : (
                <View style={{ alignItems: "center", gap: 12 }}>
                  <Feather name="film" size={64} color="rgba(255,255,255,0.5)" />
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular", fontSize: 14 }}>Video ready to send</Text>
                </View>
              )}
            </View>

            {/* Bottom caption + send */}
            <View style={{
              backgroundColor: "rgba(0,0,0,0.65)",
              paddingBottom: insets.bottom + 12,
              paddingTop: 10, paddingHorizontal: 12,
            }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
                <View style={{
                  flex: 1, backgroundColor: "rgba(255,255,255,0.12)",
                  borderRadius: 22, paddingHorizontal: 16, paddingVertical: 8,
                  borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
                }}>
                  <TextInput
                    value={previewAsset.caption}
                    onChangeText={(t) => setPreviewAsset(p => p ? { ...p, caption: t } : null)}
                    placeholder="Add a caption…"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    style={{ color: "#fff", fontFamily: "Inter_400Regular", fontSize: 15, maxHeight: 100 }}
                    multiline
                  />
                </View>
                <Pressable
                  onPress={sendPreviewAsset}
                  disabled={sending}
                  style={({ pressed }) => ({
                    width: 50, height: 50, borderRadius: 25,
                    backgroundColor: pressed ? "#16a34a" : "#22c55e",
                    alignItems: "center", justifyContent: "center",
                    opacity: sending ? 0.6 : 1,
                  })}
                >
                  {sending ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={20} color="#fff" />}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Attach bottom sheet */}
      <Modal visible={showAttach} transparent animationType="slide" onRequestClose={() => setShowAttach(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setShowAttach(false)}>
          <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: insets.bottom + 20 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: "center", marginBottom: 20 }} />
            <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: theme.text, paddingHorizontal: 24, marginBottom: 16 }}>Attach</Text>

            {/* 2-column grid of options */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12, marginBottom: 16 }}>
              {[
                { icon: "image", label: "Photo", sub: "Gallery", color: "#6366f1", onPress: () => pickImage("gallery", "image") },
                { icon: "video", label: "Video", sub: "Gallery", color: "#f59e0b", onPress: () => pickImage("gallery", "video") },
                { icon: "camera", label: "Camera", sub: "Take photo", color: "#22c55e", onPress: () => pickImage("camera", "image") },
                { icon: "film", label: "Record", sub: "Take video", color: "#ef4444", onPress: () => pickImage("camera", "video") },
              ].map((opt) => (
                <Pressable
                  key={opt.label}
                  onPress={opt.onPress}
                  style={({ pressed }) => ({
                    width: "47%", borderRadius: 16, borderWidth: 1, borderColor: theme.border,
                    backgroundColor: pressed ? theme.surfaceElevated : theme.surface,
                    padding: 16, alignItems: "center", gap: 8, opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: `${opt.color}18`, alignItems: "center", justifyContent: "center" }}>
                    <Feather name={opt.icon as any} size={24} color={opt.color} />
                  </View>
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.text }}>{opt.label}</Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted }}>{opt.sub}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => setShowAttach(false)}
              style={({ pressed }) => ({ marginHorizontal: 24, borderRadius: 14, height: 50, backgroundColor: pressed ? theme.border : theme.surfaceElevated, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border })}
            >
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Reaction picker modal */}
      {reactionPickerMsg && (
        <ReactionPicker
          message={reactionPickerMsg}
          isOwn={reactionPickerMsg.senderId === user?.id}
          onSelect={(emoji) => addReaction(reactionPickerMsg.id, emoji)}
          onClose={() => setReactionPickerMsg(null)}
          onReply={() => { setReplyTo(reactionPickerMsg); inputRef.current?.focus(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          onDeleteForMe={() => deleteMsg(reactionPickerMsg.id, "me")}
          onDeleteForAll={() => deleteMsg(reactionPickerMsg.id, "all")}
          onStar={() => starMsg(reactionPickerMsg.id)}
          isStarred={(reactionPickerMsg.starredBy ?? "").split(",").filter(Boolean).includes(String(user?.id))}
          onEdit={() => {
            const msg = reactionPickerMsg;
            setReactionPickerMsg(null);
            const editableContent = msg.content.startsWith("↩ \"")
              ? msg.content.split("\n").slice(1).join("\n")
              : msg.content;
            setEditingMsg(msg);
            setText(editableContent);
            setTimeout(() => inputRef.current?.focus(), 100);
          }}
          theme={theme}
        />
      )}

      {/* Block confirmation modal */}
      <Modal visible={showBlockConfirm} transparent animationType="fade" onRequestClose={() => setShowBlockConfirm(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: 24 }} onPress={() => setShowBlockConfirm(false)}>
          <View style={{ backgroundColor: theme.surface, borderRadius: 20, padding: 24, width: "100%", maxWidth: 340, borderWidth: 1, borderColor: theme.border }} onStartShouldSetResponder={() => true}>
            <View style={{ alignItems: "center", marginBottom: 18 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#ff444418", borderWidth: 2, borderColor: "#ff444433", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Feather name="user-x" size={26} color="#ff4444" />
              </View>
              <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.text, marginBottom: 8 }}>Block {name}?</Text>
              <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textSecondary, textAlign: "center", lineHeight: 20 }}>
                They won't be able to message you. You can unblock them any time from the chat or Settings.
              </Text>
            </View>
            <Pressable
              onPress={confirmBlock}
              disabled={blockLoading}
              style={({ pressed }) => ({ height: 50, borderRadius: 13, backgroundColor: pressed ? "#cc2222" : "#ff4444", alignItems: "center", justifyContent: "center", marginBottom: 10 })}
            >
              {blockLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 }}>Block {name}</Text>}
            </Pressable>
            <Pressable
              onPress={() => setShowBlockConfirm(false)}
              style={({ pressed }) => ({ height: 50, borderRadius: 13, backgroundColor: pressed ? `${theme.primary}22` : `${theme.primary}10`, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${theme.primary}33` })}
            >
              <Text style={{ color: theme.primary, fontFamily: "Inter_600SemiBold", fontSize: 16 }}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Avatar full-screen preview */}
      <AvatarPreview
        visible={showAvatarPreview}
        onClose={() => setShowAvatarPreview(false)}
        imageSource={avatarUrl ? { uri: avatarUrl } : null}
        name={name ?? ""}
      />
    </KeyboardAvoidingView>
  );
}
