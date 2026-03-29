import React, { useState, useRef } from "react";
import {
  View, Text, Pressable, ScrollView, Modal, TextInput,
  Platform, Image, Alert, ActivityIndicator, Animated,
  KeyboardAvoidingView, useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/utils/api";
import * as Haptics from "expo-haptics";

// ─── Text Status Background Presets ───────────────────────────────────────────
const TEXT_BACKGROUNDS: { key: string; colors: [string, string] }[] = [
  { key: "violet",  colors: ["#7B2D8B", "#3A006F"] },
  { key: "ocean",   colors: ["#0077B6", "#00B4D8"] },
  { key: "forest",  colors: ["#1B5E20", "#2E7D32"] },
  { key: "sunset",  colors: ["#E85D04", "#9D0208"] },
  { key: "rose",    colors: ["#C62A6E", "#8338EC"] },
  { key: "midnight",colors: ["#12002A", "#1A003E"] },
  { key: "gold",    colors: ["#F77F00", "#D62828"] },
  { key: "slate",   colors: ["#1C1C2E", "#2E2E4E"] },
];

function getTextBg(key: string): [string, string] {
  return TEXT_BACKGROUNDS.find(b => b.key === key)?.colors ?? ["#7B2D8B", "#3A006F"];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
interface StatusItem {
  id: number;
  userId: number;
  mediaUrl: string;
  caption?: string | null;
  type: string;
  expiresAt: string;
  createdAt: string;
  user: { id: number; username: string; displayName: string; avatarUrl?: string | null };
}
interface StoryGroup { user: StatusItem["user"]; items: StatusItem[] }

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ─── Instagram-style gradient story ring ──────────────────────────────────────
const IG_GRADIENT: [string, string, string, string] = ["#F58529", "#DD2A7B", "#8134AF", "#515BD4"];

function StoryRing({ group, size, onPress, isMe, theme, user: userProp }: {
  group?: StoryGroup; size?: number; onPress: () => void; isMe?: boolean; theme: any;
  user?: { id: number; username: string; displayName: string; avatarUrl?: string | null };
}) {
  const sz = size ?? 72;
  const hasStory = (group?.items?.length ?? 0) > 0;
  const storyCount = group?.items?.length ?? 0;
  const user = group?.user ?? userProp;
  const primary = theme.primary;
  const RING = 3;
  const GAP = 2;
  const outer = sz + (RING + GAP) * 2;

  const avatarContent = user?.avatarUrl ? (
    <Image source={{ uri: user.avatarUrl }} style={{ width: sz, height: sz, borderRadius: sz / 2 }} />
  ) : (
    <View style={{ width: sz, height: sz, borderRadius: sz / 2, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: sz * 0.38, color: primary, fontFamily: "Inter_700Bold" }}>
        {user?.displayName?.[0]?.toUpperCase() ?? "+"}
      </Text>
    </View>
  );

  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", gap: 6 }}>
      {hasStory ? (
        <LinearGradient
          colors={IG_GRADIENT}
          start={{ x: 0.2, y: 1 }} end={{ x: 1, y: 0.2 }}
          style={{ width: outer, height: outer, borderRadius: outer / 2, alignItems: "center", justifyContent: "center" }}
        >
          <View style={{ width: sz + GAP * 2, height: sz + GAP * 2, borderRadius: (sz + GAP * 2) / 2, backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }}>
            {avatarContent}
          </View>
        </LinearGradient>
      ) : (
        <View style={{ width: outer, height: outer, borderRadius: outer / 2, backgroundColor: theme.border, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: sz + GAP * 2, height: sz + GAP * 2, borderRadius: (sz + GAP * 2) / 2, backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }}>
            {avatarContent}
          </View>
        </View>
      )}

      {/* "+" badge for My Story */}
      {isMe && (
        <View style={{ position: "absolute", bottom: 20, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.background }}>
          <Feather name="plus" size={12} color={theme.background} />
        </View>
      )}

      {/* Dot indicators for multiple stories (WhatsApp-style) */}
      {storyCount > 1 && (
        <View style={{ flexDirection: "row", gap: 2, position: "absolute", bottom: 18, alignSelf: "center" }}>
          {Array.from({ length: Math.min(storyCount, 5) }).map((_, i) => (
            <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: primary }} />
          ))}
        </View>
      )}

      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: theme.text, maxWidth: sz + 10, textAlign: "center" }} numberOfLines={1}>
        {isMe ? "My Story" : user?.displayName?.split(" ")[0] ?? ""}
      </Text>
    </Pressable>
  );
}

// ─── Story Viewer ─────────────────────────────────────────────────────────────
interface ViewerUser { id: number; username: string; displayName: string; avatarUrl?: string | null }
interface StatusViewEntry { user: ViewerUser; viewedAt: string }

function StoryViewer({ groups, startGroupIdx, onClose, theme, currentUser, token }: {
  groups: StoryGroup[]; startGroupIdx: number; onClose: () => void; theme: any;
  currentUser?: ViewerUser | null; token: string | null;
}) {
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W } = useWindowDimensions();
  const [groupIdx, setGroupIdx] = useState(startGroupIdx);
  const [itemIdx, setItemIdx] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [replyFocused, setReplyFocused] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const DURATION = 5000;

  const group = groups[groupIdx];
  const item = group?.items[itemIdx];
  const isOwn = item?.userId === currentUser?.id;
  const isTextStory = item?.type === "text";
  const textBgKey = isTextStory ? item.mediaUrl.replace("text:", "") : "";
  const textColors = getTextBg(textBgKey);

  // Fetch viewers for own stories
  const { data: viewers, refetch: refetchViewers } = useQuery<StatusViewEntry[]>({
    queryKey: ["status-views", item?.id],
    queryFn: () => apiRequest(`/statuses/${item!.id}/views`),
    enabled: !!token && !!item?.id && isOwn,
    refetchInterval: isOwn ? 8000 : false,
  });

  // Record view when story changes
  React.useEffect(() => {
    if (item && !isOwn && token) {
      apiRequest(`/statuses/${item.id}/view`, { method: "POST" }).catch(() => {});
    }
    startProgress();
    setShowViewers(false);
    setReplyText("");
    setReplySent(false);
    setReplyFocused(false);
    return () => animRef.current?.stop();
  }, [groupIdx, itemIdx]);

  // Pause / resume animation when reply box focused
  React.useEffect(() => {
    if (replyFocused) {
      animRef.current?.stop();
    } else {
      startProgress();
    }
  }, [replyFocused]);

  const handleReply = async () => {
    if (!replyText.trim() || !token) return;
    setReplySending(true);
    try {
      const conv = await apiRequest("/conversations", { method: "POST", body: JSON.stringify({ otherUserId: group.user.id }) });
      const preview = item.caption ? `↩ Status: "${item.caption.slice(0, 60)}${item.caption.length > 60 ? "…" : ""}"` : "↩ Replied to a status";
      await apiRequest(`/conversations/${conv.id}/messages`, { method: "POST", body: JSON.stringify({ content: `${preview}\n\n${replyText.trim()}`, type: "text" }) });
      setReplyText("");
      setReplySent(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setReplySent(false), 2500);
    } catch {
      // silent
    } finally {
      setReplySending(false);
    }
  };

  const startProgress = () => {
    progressAnim.setValue(0);
    animRef.current?.stop();
    animRef.current = Animated.timing(progressAnim, { toValue: 1, duration: DURATION, useNativeDriver: false });
    animRef.current.start(({ finished }) => { if (finished) advance(); });
  };

  const advance = () => {
    if (itemIdx < group.items.length - 1) { setItemIdx(i => i + 1); }
    else if (groupIdx < groups.length - 1) { setGroupIdx(g => g + 1); setItemIdx(0); }
    else { onClose(); }
  };

  const goBack = () => {
    if (itemIdx > 0) { setItemIdx(i => i - 1); }
    else if (groupIdx > 0) { setGroupIdx(g => g - 1); setItemIdx(0); }
    else { onClose(); }
  };

  if (!group || !item) return null;

  const viewCount = viewers?.length ?? 0;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>

        {/* Background: image or text gradient */}
        {isTextStory ? (
          <LinearGradient colors={textColors} style={{ position: "absolute", inset: 0, top: 0, left: 0, right: 0, bottom: 0 }} />
        ) : (
          <Image source={{ uri: item.mediaUrl }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
        )}

        {/* Gradient overlays for readability */}
        <LinearGradient colors={["rgba(0,0,0,0.65)", "transparent"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 200 }} />
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 280 }} />

        {/* Text story content */}
        {isTextStory && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <Text style={{ color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 40, textShadowColor: "rgba(0,0,0,0.3)", textShadowRadius: 8 }}>
              {item.caption}
            </Text>
          </View>
        )}

        {/* Progress bars */}
        <View style={{ position: "absolute", top: insets.top + 10, left: 12, right: 12, flexDirection: "row", gap: 3 }}>
          {group.items.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 3, backgroundColor: "rgba(255,255,255,0.35)", borderRadius: 2, overflow: "hidden" }}>
              <Animated.View style={{
                height: "100%", borderRadius: 2, backgroundColor: "#fff",
                width: i < itemIdx ? "100%" : i === itemIdx
                  ? progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) : "0%",
              }} />
            </View>
          ))}
        </View>

        {/* User info header */}
        <View style={{ position: "absolute", top: insets.top + 26, left: 16, right: 56, flexDirection: "row", alignItems: "center", gap: 10 }}>
          {group.user.avatarUrl ? (
            <Image source={{ uri: group.user.avatarUrl }} style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: "#fff" }} />
          ) : (
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 }}>{group.user.displayName[0].toUpperCase()}</Text>
            </View>
          )}
          <View>
            <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>{group.user.displayName}</Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular", fontSize: 12 }}>{timeAgo(item.createdAt)}</Text>
          </View>
        </View>

        {/* Close button */}
        <Pressable
          style={{ position: "absolute", top: insets.top + 26, right: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}
          onPress={onClose}
        >
          <Feather name="x" size={20} color="#fff" />
        </Pressable>

        {/* Caption (for image stories) */}
        {!isTextStory && item.caption && (
          <View style={{ position: "absolute", bottom: insets.bottom + (isOwn ? 100 : 82), left: 20, right: 20, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 12, padding: 12 }}>
            <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Inter_500Medium", lineHeight: 24 }}>{item.caption}</Text>
          </View>
        )}

        {/* ── Views panel (own stories only) ── */}
        {isOwn && (
          <Pressable
            onPress={() => setShowViewers(v => !v)}
            style={{ position: "absolute", bottom: insets.bottom + 20, left: 20, right: 20 }}
          >
            {/* Viewer count row */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {/* Stacked avatars */}
              <View style={{ flexDirection: "row" }}>
                {(viewers ?? []).slice(0, 4).map((v, i) => (
                  <View key={v.user.id} style={{ marginLeft: i === 0 ? 0 : -10, borderWidth: 2, borderColor: "rgba(0,0,0,0.6)", borderRadius: 14 }}>
                    {v.user.avatarUrl ? (
                      <Image source={{ uri: v.user.avatarUrl }} style={{ width: 26, height: 26, borderRadius: 13 }} />
                    ) : (
                      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" }}>{v.user.displayName[0].toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
              <Feather name="eye" size={18} color="rgba(255,255,255,0.9)" />
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
                {viewCount} {viewCount === 1 ? "view" : "views"}
              </Text>
              <Feather name={showViewers ? "chevron-down" : "chevron-up"} size={16} color="rgba(255,255,255,0.7)" />
            </View>

            {/* Expanded viewer list */}
            {showViewers && (viewers ?? []).length > 0 && (
              <View style={{ marginTop: 12, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 16, paddingVertical: 8, maxHeight: 200 }}>
                <ScrollView scrollEnabled nestedScrollEnabled>
                  {(viewers ?? []).map((v, i) => (
                    <View
                      key={v.user.id}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: i < (viewers!.length - 1) ? 0.5 : 0, borderBottomColor: "rgba(255,255,255,0.1)" }}
                    >
                      {v.user.avatarUrl ? (
                        <Image source={{ uri: v.user.avatarUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                      ) : (
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>{v.user.displayName[0].toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>{v.user.displayName}</Text>
                        <Text style={{ color: "rgba(255,255,255,0.55)", fontFamily: "Inter_400Regular", fontSize: 12 }}>@{v.user.username} · {timeAgo(v.viewedAt)}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {showViewers && (viewers ?? []).length === 0 && (
              <View style={{ marginTop: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Feather name="eye-off" size={16} color="rgba(255,255,255,0.5)" />
                <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular", fontSize: 14 }}>No views yet</Text>
              </View>
            )}
          </Pressable>
        )}

        {/* ── Reply input (others' stories only) ── */}
        {!isOwn && (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "position" : undefined}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
          >
            <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 12, paddingTop: 8 }}>
              {replySent ? (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(0,200,100,0.25)", borderRadius: 28, paddingVertical: 14, borderWidth: 1, borderColor: "rgba(0,200,100,0.4)" }}>
                  <Feather name="check-circle" size={18} color="#4ade80" />
                  <Text style={{ color: "#4ade80", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Reply sent!</Text>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 28, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }}>
                  <TextInput
                    value={replyText}
                    onChangeText={setReplyText}
                    placeholder={`Reply to ${group.user.displayName}…`}
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    style={{ flex: 1, color: "#fff", fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 6, minHeight: 36 }}
                    onFocus={() => setReplyFocused(true)}
                    onBlur={() => setReplyFocused(false)}
                    onSubmitEditing={handleReply}
                    returnKeyType="send"
                    multiline={false}
                  />
                  {replyText.trim().length > 0 && (
                    <Pressable
                      onPress={handleReply}
                      disabled={replySending}
                      style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: pressed ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" })}
                    >
                      {replySending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Feather name="send" size={17} color="#fff" />
                      )}
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Tap left → back, tap right → advance */}
        <Pressable style={{ position: "absolute", left: 0, top: insets.top + 80, width: SCREEN_W * 0.33, bottom: isOwn ? 140 : 76 }} onPress={goBack} />
        <Pressable style={{ position: "absolute", right: 0, top: insets.top + 80, width: SCREEN_W * 0.33, bottom: isOwn ? 140 : 76 }} onPress={advance} />
        <Pressable style={{ position: "absolute", left: SCREEN_W * 0.33, right: SCREEN_W * 0.33, top: insets.top + 80, bottom: isOwn ? 140 : 76 }} onPress={onClose} />
      </View>
    </Modal>
  );
}

// ─── Add Status Modal ─────────────────────────────────────────────────────────
type AddStep = "pick" | "text-compose" | "preview";

function AddStatusModal({ visible, onClose, onAdded, theme, insets }: {
  visible: boolean; onClose: () => void; onAdded: () => void; theme: any; insets: any;
}) {
  const [step, setStep] = useState<AddStep>("pick");
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showVideoUrl, setShowVideoUrl] = useState(false);
  // text status
  const [textContent, setTextContent] = useState("");
  const [selectedBg, setSelectedBg] = useState(TEXT_BACKGROUNDS[0].key);

  const bg = theme.background;
  const surf = theme.surface;
  const border = theme.border;
  const primary = theme.primary;
  const txt = theme.text;
  const txtSec = theme.textSecondary;
  const txtMut = theme.textMuted;

  const reset = () => {
    setStep("pick"); setMediaUri(null); setVideoUrl(""); setCaption("");
    setShowVideoUrl(false); setTextContent(""); setSelectedBg(TEXT_BACKGROUNDS[0].key);
  };
  const handleClose = () => { reset(); onClose(); };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow access to your gallery."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], quality: 0.5, base64: true, allowsEditing: true, aspect: [9, 16],
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setMediaUri(a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri);
      setStep("preview");
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow camera access."); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"], quality: 0.5, base64: true, allowsEditing: true, aspect: [9, 16],
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setMediaUri(a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri);
      setStep("preview");
    }
  };

  const handleVideoUrl = () => {
    if (!videoUrl.trim()) return;
    setMediaUri(videoUrl.trim());
    setStep("preview");
  };

  const handlePost = async (type: "image" | "text" | "video") => {
    let mediaUrl: string;
    let postCaption: string | null;

    if (type === "text") {
      if (!textContent.trim()) return;
      mediaUrl = `text:${selectedBg}`;
      postCaption = textContent.trim();
    } else {
      const url = mediaUri ?? videoUrl.trim();
      if (!url) return;
      mediaUrl = url;
      postCaption = caption.trim() || null;
    }

    setUploading(true);
    try {
      await apiRequest("/statuses", {
        method: "POST",
        body: JSON.stringify({ mediaUrl, caption: postCaption, type }),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAdded();
      handleClose();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setUploading(false);
    }
  };

  const textBgColors = getTextBg(selectedBg);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      {/* Tapping the dark overlay closes the modal */}
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={handleClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }} onStartShouldSetResponder={() => true}>
              <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 20 }} />

              {/* ── STEP: PICK ── */}
              {step === "pick" && (
                <>
                  <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: txt, marginBottom: 4 }}>Add to Story</Text>
                  <Text style={{ fontSize: 14, color: txtMut, fontFamily: "Inter_400Regular", marginBottom: 22 }}>Share something — disappears in 24 hours</Text>

                  {/* 3 options: Camera, Gallery, Text */}
                  <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                    <Pressable style={{ flex: 1, backgroundColor: `${primary}18`, borderRadius: 18, paddingVertical: 24, alignItems: "center", gap: 10, borderWidth: 1.5, borderColor: `${primary}44` }} onPress={takePhoto}>
                      <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
                        <Feather name="camera" size={24} color={primary} />
                      </View>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: txt }}>Camera</Text>
                    </Pressable>

                    <Pressable style={{ flex: 1, backgroundColor: `${theme.accent}18`, borderRadius: 18, paddingVertical: 24, alignItems: "center", gap: 10, borderWidth: 1.5, borderColor: `${theme.accent}44` }} onPress={pickImage}>
                      <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: `${theme.accent}22`, alignItems: "center", justifyContent: "center" }}>
                        <Feather name="image" size={24} color={theme.accent} />
                      </View>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: txt }}>Gallery</Text>
                    </Pressable>

                    <Pressable style={{ flex: 1, backgroundColor: `${theme.success}18`, borderRadius: 18, paddingVertical: 24, alignItems: "center", gap: 10, borderWidth: 1.5, borderColor: `${theme.success}44` }} onPress={() => setStep("text-compose")}>
                      <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: `${theme.success}22`, alignItems: "center", justifyContent: "center" }}>
                        <Feather name="type" size={24} color={theme.success} />
                      </View>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: txt }}>Text</Text>
                    </Pressable>
                  </View>

                  {/* Video URL fallback */}
                  {showVideoUrl ? (
                    <View style={{ gap: 10 }}>
                      <TextInput
                        style={{ backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular" }}
                        placeholder="Paste a video URL (mp4, mov...)"
                        placeholderTextColor={txtMut}
                        value={videoUrl} onChangeText={setVideoUrl}
                        autoCapitalize="none" autoFocus
                      />
                      <Pressable style={{ backgroundColor: primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" }} onPress={handleVideoUrl}>
                        <Text style={{ color: bg, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Use This Video</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable style={{ alignItems: "center", paddingVertical: 12, flexDirection: "row", justifyContent: "center", gap: 8 }} onPress={() => setShowVideoUrl(true)}>
                      <Feather name="video" size={15} color={txtSec} />
                      <Text style={{ fontSize: 14, color: txtSec, fontFamily: "Inter_500Medium" }}>Paste a video URL instead</Text>
                    </Pressable>
                  )}
                </>
              )}

              {/* ── STEP: TEXT COMPOSE ── */}
              {step === "text-compose" && (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
                    <Pressable onPress={() => setStep("pick")} style={{ marginRight: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: `${primary}18`, alignItems: "center", justifyContent: "center" }}>
                      <Feather name="arrow-left" size={18} color={primary} />
                    </Pressable>
                    <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt }}>Text Status</Text>
                  </View>

                  {/* Live preview */}
                  <View style={{ borderRadius: 18, overflow: "hidden", height: 200, marginBottom: 16 }}>
                    <LinearGradient colors={textBgColors} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
                      <Text style={{ color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 32 }}>
                        {textContent.trim() || "Type something..."}
                      </Text>
                    </LinearGradient>
                  </View>

                  {/* Background color picker */}
                  <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Background</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4, marginBottom: 16 }}>
                    {TEXT_BACKGROUNDS.map(b => (
                      <Pressable key={b.key} onPress={() => setSelectedBg(b.key)}>
                        <LinearGradient
                          colors={b.colors}
                          style={{ width: 38, height: 38, borderRadius: 19, borderWidth: selectedBg === b.key ? 3 : 0, borderColor: "#fff" }}
                        />
                      </Pressable>
                    ))}
                  </ScrollView>

                  {/* Text input */}
                  <TextInput
                    style={{ backgroundColor: theme.inputBg, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular", minHeight: 80, marginBottom: 16, textAlignVertical: "top" }}
                    placeholder="What's on your mind?"
                    placeholderTextColor={txtMut}
                    value={textContent}
                    onChangeText={setTextContent}
                    multiline maxLength={200} autoFocus
                  />

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable style={{ flex: 1, backgroundColor: `${primary}18`, borderRadius: 14, paddingVertical: 15, alignItems: "center" }} onPress={() => setStep("pick")}>
                      <Text style={{ color: primary, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Back</Text>
                    </Pressable>
                    <Pressable
                      style={{ flex: 2, backgroundColor: primary, borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center", opacity: !textContent.trim() ? 0.5 : 1 }}
                      onPress={() => handlePost("text")} disabled={uploading || !textContent.trim()}
                    >
                      {uploading
                        ? <ActivityIndicator color={bg} />
                        : <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Feather name="send" size={15} color={bg} />
                            <Text style={{ color: bg, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Share Story</Text>
                          </View>}
                    </Pressable>
                  </View>
                </>
              )}

              {/* ── STEP: PREVIEW (image/video) ── */}
              {step === "preview" && (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
                    <Pressable onPress={() => setStep("pick")} style={{ marginRight: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: `${primary}18`, alignItems: "center", justifyContent: "center" }}>
                      <Feather name="arrow-left" size={18} color={primary} />
                    </Pressable>
                    <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: txt }}>Preview & Post</Text>
                  </View>

                  {mediaUri && (
                    <View style={{ borderRadius: 16, overflow: "hidden", marginBottom: 16, height: 210 }}>
                      <Image source={{ uri: mediaUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                      <LinearGradient colors={["transparent", "rgba(0,0,0,0.5)"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80 }} />
                    </View>
                  )}

                  <Text style={{ fontSize: 13, color: txtSec, fontFamily: "Inter_500Medium", marginBottom: 8 }}>Caption (optional)</Text>
                  <TextInput
                    style={{ backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular", marginBottom: 16, minHeight: 60, textAlignVertical: "top" }}
                    placeholder="What's on your mind?"
                    placeholderTextColor={txtMut}
                    value={caption} onChangeText={setCaption} multiline maxLength={200}
                  />

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable style={{ flex: 1, backgroundColor: `${primary}18`, borderRadius: 14, paddingVertical: 15, alignItems: "center" }} onPress={() => setStep("pick")}>
                      <Text style={{ color: primary, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Back</Text>
                    </Pressable>
                    <Pressable style={{ flex: 2, backgroundColor: primary, borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center" }} onPress={() => handlePost("image")} disabled={uploading}>
                      {uploading
                        ? <ActivityIndicator color={bg} />
                        : <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Feather name="send" size={15} color={bg} />
                            <Text style={{ color: bg, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Share Story</Text>
                          </View>}
                    </Pressable>
                  </View>
                </>
              )}
            </View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function StatusScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [viewerGroups, setViewerGroups] = useState<StoryGroup[]>([]);
  const [viewerStartIdx, setViewerStartIdx] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);

  const { data: statuses, isLoading, refetch } = useQuery<StatusItem[]>({
    queryKey: ["statuses", token],
    queryFn: () => apiRequest("/statuses"),
    enabled: !!token,
    refetchInterval: 15000,
  });

  const primary = theme.primary;
  const txt = theme.text;
  const txtSec = theme.textSecondary;
  const txtMut = theme.textMuted;
  const surf = theme.surface;
  const border = theme.border;
  const bg = theme.background;

  const groupedByUser: StoryGroup[] = React.useMemo(() => {
    if (!statuses) return [];
    const map = new Map<number, StoryGroup>();
    for (const s of statuses) {
      if (!map.has(s.userId)) map.set(s.userId, { user: s.user, items: [] });
      map.get(s.userId)!.items.push(s);
    }
    return Array.from(map.values());
  }, [statuses]);

  const myGroup = groupedByUser.find(g => g.user.id === user?.id);
  const contactGroups = groupedByUser.filter(g => g.user.id !== user?.id);

  const openViewer = (groups: StoryGroup[], startIdx: number) => {
    setViewerGroups(groups); setViewerStartIdx(startIdx); setViewerVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (!token) {
    return <View style={{ flex: 1, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={primary} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + (Platform.OS === "web" ? 72 : 16), paddingHorizontal: 16, paddingBottom: 14, backgroundColor: theme.gradientTop, borderBottomWidth: 1, borderBottomColor: border }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {/* WhatsApp-style back arrow */}
          <Pressable
            onPress={() => router.canGoBack() ? router.back() : router.navigate("/(tabs)" as any)}
            style={{ padding: 8, marginLeft: -4, marginRight: 2 }}
            hitSlop={8}
          >
            <Feather name="arrow-left" size={22} color={txt} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 26, fontFamily: "Inter_700Bold", color: txt }}>Updates</Text>
          <Pressable
            style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: pressed ? `${primary}33` : `${primary}18`, alignItems: "center", justifyContent: "center" })}
            onPress={() => setShowAdd(true)}
          >
            <Feather name="camera" size={20} color={primary} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>

        {/* ── Instagram-style story rings row ── */}
        <View style={{ paddingTop: 18, paddingBottom: 4 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 18 }}>
            {/* My Story bubble */}
            <StoryRing
              group={myGroup} isMe
              onPress={() => myGroup ? openViewer([myGroup, ...contactGroups], 0) : setShowAdd(true)}
              theme={theme}
              user={user ? { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl } : undefined}
            />
            {/* Contact stories */}
            {contactGroups.map((group, idx) => (
              <StoryRing key={group.user.id} group={group} onPress={() => openViewer([...contactGroups], idx)} theme={theme} />
            ))}
            {isLoading && <ActivityIndicator color={primary} style={{ alignSelf: "center", marginLeft: 12 }} />}
          </ScrollView>
        </View>

        {/* ── My Status card — elevated ── */}
        <Pressable
          style={({ pressed }) => ({
            marginHorizontal: 16, marginTop: 16, marginBottom: 4,
            borderRadius: 18,
            borderWidth: 1.5, borderColor: myGroup ? `${primary}55` : border,
            backgroundColor: myGroup ? `${primary}0D` : surf,
            padding: 16,
            flexDirection: "row", alignItems: "center", gap: 14,
            opacity: pressed ? 0.8 : 1,
          })}
          onPress={() => myGroup ? openViewer([myGroup], 0) : setShowAdd(true)}
        >
          {/* Avatar with gradient ring if has story */}
          <View>
            {myGroup ? (
              <LinearGradient
                colors={IG_GRADIENT} start={{ x: 0.2, y: 1 }} end={{ x: 1, y: 0.2 }}
                style={{ width: 60, height: 60, borderRadius: 30, padding: 2.5, alignItems: "center", justifyContent: "center" }}
              >
                <View style={{ width: 55, height: 55, borderRadius: 27.5, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
                  {user?.avatarUrl ? (
                    <Image source={{ uri: user.avatarUrl }} style={{ width: 51, height: 51, borderRadius: 25.5 }} />
                  ) : (
                    <View style={{ width: 51, height: 51, borderRadius: 25.5, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 21, color: primary, fontFamily: "Inter_700Bold" }}>{user?.displayName?.[0]?.toUpperCase() ?? "?"}</Text>
                    </View>
                  )}
                </View>
              </LinearGradient>
            ) : (
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: `${primary}18`, borderWidth: 2, borderColor: border, alignItems: "center", justifyContent: "center" }}>
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={{ width: 56, height: 56, borderRadius: 28 }} />
                ) : (
                  <Text style={{ fontSize: 22, color: primary, fontFamily: "Inter_700Bold" }}>{user?.displayName?.[0]?.toUpperCase() ?? "?"}</Text>
                )}
              </View>
            )}
            <View style={{ position: "absolute", bottom: -1, right: -1, width: 22, height: 22, borderRadius: 11, backgroundColor: primary, alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: surf }}>
              <Feather name="plus" size={11} color={bg} />
            </View>
          </View>

          {/* Info */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: txt }}>My Status</Text>
            <Text style={{ fontSize: 13, color: myGroup ? primary : txtMut, fontFamily: "Inter_400Regular", marginTop: 3 }}>
              {myGroup
                ? `${myGroup.items.length} update${myGroup.items.length > 1 ? "s" : ""} · tap to view`
                : "Share a photo, video or text"}
            </Text>
          </View>

          {/* Add button */}
          <Pressable
            onPress={() => setShowAdd(true)}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: primary, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="camera" size={17} color={bg} />
          </Pressable>
        </Pressable>

        {/* ── Recent updates ── */}
        {contactGroups.length > 0 && (
          <>
            {/* Section header with count pill */}
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 22, paddingBottom: 10, gap: 10 }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: txtMut, letterSpacing: 1, textTransform: "uppercase", flex: 1 }}>
                Recent Updates
              </Text>
              <View style={{ backgroundColor: `${primary}22`, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Text style={{ fontSize: 11, color: primary, fontFamily: "Inter_700Bold" }}>{contactGroups.length}</Text>
              </View>
            </View>

            {contactGroups.map((group, idx) => {
              const lastItem = group.items[group.items.length - 1];
              const firstItem = group.items[0];
              const isText = lastItem.type === "text";
              const textColors = isText ? getTextBg(lastItem.mediaUrl.replace("text:", "")) : null;
              const accentColors = ["#F58529", "#DD2A7B", "#8134AF", "#515BD4", "#00B4D8", "#52B788"];
              const ringColor = accentColors[group.user.id % accentColors.length];
              const ageMs = Date.now() - new Date(firstItem.createdAt).getTime();
              const isNew = ageMs < 30 * 60 * 1000; // < 30 min
              const isRecent = ageMs < 6 * 3600 * 1000; // < 6 hr
              const timeColor = isNew ? "#22c55e" : isRecent ? primary : txtMut;

              // Caption preview: use the most recent item's caption
              const captionPreview = lastItem.caption?.trim()
                || (isText ? "Text update" : "📸 Photo");

              return (
                <React.Fragment key={group.user.id}>
                  <Pressable
                    style={({ pressed }) => ({
                      flexDirection: "row", alignItems: "center", gap: 14,
                      paddingHorizontal: 16, paddingVertical: 13,
                      backgroundColor: pressed ? `${primary}08` : "transparent",
                    })}
                    onPress={() => openViewer(contactGroups, idx)}
                  >
                    {/* Avatar with IG-gradient ring + segment count arcs */}
                    <View style={{ position: "relative" }}>
                      <LinearGradient
                        colors={IG_GRADIENT}
                        start={{ x: 0.2, y: 1 }} end={{ x: 1, y: 0.2 }}
                        style={{ width: 60, height: 60, borderRadius: 30, padding: 2.5, alignItems: "center", justifyContent: "center" }}
                      >
                        <View style={{ width: 55, height: 55, borderRadius: 27.5, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
                          {group.user.avatarUrl ? (
                            <Image source={{ uri: group.user.avatarUrl }} style={{ width: 51, height: 51, borderRadius: 25.5 }} />
                          ) : (
                            <View style={{ width: 51, height: 51, borderRadius: 25.5, backgroundColor: `${ringColor}28`, alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: 21, color: ringColor, fontFamily: "Inter_700Bold" }}>{group.user.displayName[0].toUpperCase()}</Text>
                            </View>
                          )}
                        </View>
                      </LinearGradient>
                      {/* Story count badge */}
                      {group.items.length > 1 && (
                        <View style={{ position: "absolute", bottom: -2, right: -3, backgroundColor: primary, borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: bg }}>
                          <Text style={{ color: bg, fontSize: 10, fontFamily: "Inter_700Bold" }}>{group.items.length}</Text>
                        </View>
                      )}
                    </View>

                    {/* Portrait thumbnail */}
                    <View style={{ width: 48, height: 64, borderRadius: 11, overflow: "hidden", borderWidth: 1.5, borderColor: isNew ? "#22c55e55" : border }}>
                      {isText ? (
                        <LinearGradient colors={textColors!} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 5 }}>
                          <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold", textAlign: "center" }} numberOfLines={4}>
                            {lastItem.caption || "✦"}
                          </Text>
                        </LinearGradient>
                      ) : (
                        <Image source={{ uri: lastItem.mediaUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                      )}
                    </View>

                    {/* Info */}
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                        <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: txt }}>{group.user.displayName}</Text>
                        {isNew && (
                          <View style={{ backgroundColor: "#22c55e22", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, color: "#22c55e", fontFamily: "Inter_700Bold" }}>NEW</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 12.5, color: txtSec, fontFamily: "Inter_400Regular" }} numberOfLines={1}>
                        {captionPreview}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: timeColor, fontFamily: "Inter_600SemiBold", marginTop: 1 }}>
                        {timeAgo(firstItem.createdAt)}
                      </Text>
                    </View>
                  </Pressable>
                  {idx < contactGroups.length - 1 && (
                    <View style={{ height: 1, backgroundColor: border, marginLeft: 94 }} />
                  )}
                </React.Fragment>
              );
            })}
          </>
        )}

        {/* ── Empty state ── */}
        {!isLoading && contactGroups.length === 0 && (
          <View style={{ alignItems: "center", paddingTop: 48, gap: 14 }}>
            <LinearGradient colors={IG_GRADIENT} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="images-outline" size={34} color="#fff" />
            </LinearGradient>
            <View style={{ alignItems: "center", gap: 5 }}>
              <Text style={{ color: txt, fontSize: 17, fontFamily: "Inter_700Bold" }}>No updates yet</Text>
              <Text style={{ color: txtMut, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 260 }}>
                When your contacts post stories, they'll appear here. Updates disappear after 24h.
              </Text>
            </View>
            <Pressable
              onPress={() => setShowAdd(true)}
              style={{ backgroundColor: primary, borderRadius: 22, paddingHorizontal: 28, paddingVertical: 13, marginTop: 4 }}
            >
              <Text style={{ color: bg, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Add My First Update</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <AddStatusModal visible={showAdd} onClose={() => setShowAdd(false)} onAdded={() => { queryClient.invalidateQueries({ queryKey: ["statuses"] }); refetch(); }} theme={theme} insets={insets} />

      {viewerVisible && viewerGroups.length > 0 && (
        <StoryViewer groups={viewerGroups} startGroupIdx={viewerStartIdx} onClose={() => setViewerVisible(false)} theme={theme} currentUser={user} token={token} />
      )}
    </View>
  );
}
