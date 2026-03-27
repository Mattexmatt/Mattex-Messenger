import React, { useState, useRef } from "react";
import {
  View, Text, Pressable, ScrollView, Modal, TextInput,
  Platform, Image, Alert, ActivityIndicator, Animated,
  Dimensions, KeyboardAvoidingView
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/utils/api";
import * as Haptics from "expo-haptics";

const { width: SCREEN_W } = Dimensions.get("window");

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

// ─── Story Ring ───────────────────────────────────────────────────────────────
function StoryRing({ group, size, onPress, isMe, theme, user: userProp }: {
  group?: StoryGroup; size?: number; onPress: () => void; isMe?: boolean; theme: any;
  user?: { id: number; username: string; displayName: string; avatarUrl?: string | null };
}) {
  const sz = size ?? 68;
  const hasStory = (group?.items?.length ?? 0) > 0;
  const user = group?.user ?? userProp;
  const primary = theme.primary;

  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", gap: 5 }}>
      <View style={{
        width: sz + 6, height: sz + 6, borderRadius: (sz + 6) / 2,
        padding: 2, borderWidth: hasStory ? 2.5 : 1.5,
        borderColor: hasStory ? primary : `${primary}33`,
      }}>
        {user?.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={{ width: sz, height: sz, borderRadius: sz / 2 }} />
        ) : (
          <View style={{ width: sz, height: sz, borderRadius: sz / 2, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: sz * 0.38, color: primary, fontFamily: "Inter_700Bold" }}>
              {user?.displayName?.[0]?.toUpperCase() ?? "+"}
            </Text>
          </View>
        )}
        <View style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.background }}>
          <Feather name="plus" size={13} color={theme.background} />
        </View>
      </View>
      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: theme.text, maxWidth: sz + 8, textAlign: "center" }} numberOfLines={1}>
        {isMe ? "My Story" : user?.displayName?.split(" ")[0] ?? ""}
      </Text>
    </Pressable>
  );
}

// ─── Story Viewer ─────────────────────────────────────────────────────────────
function StoryViewer({ groups, startGroupIdx, onClose, theme }: {
  groups: StoryGroup[]; startGroupIdx: number; onClose: () => void; theme: any;
}) {
  const insets = useSafeAreaInsets();
  const [groupIdx, setGroupIdx] = useState(startGroupIdx);
  const [itemIdx, setItemIdx] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const DURATION = 5000;

  const group = groups[groupIdx];
  const item = group?.items[itemIdx];
  const isTextStory = item?.type === "text";
  const textBgKey = isTextStory ? item.mediaUrl.replace("text:", "") : "";
  const textColors = getTextBg(textBgKey);

  React.useEffect(() => {
    startProgress();
    return () => animRef.current?.stop();
  }, [groupIdx, itemIdx]);

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
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.75)"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 240 }} />

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
          <View style={{ position: "absolute", bottom: insets.bottom + 60, left: 20, right: 20, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 12, padding: 12 }}>
            <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Inter_500Medium", lineHeight: 24 }}>{item.caption}</Text>
          </View>
        )}

        {/* Tap left → back, tap right → advance, tap center top → close */}
        <Pressable style={{ position: "absolute", left: 0, top: insets.top + 80, width: SCREEN_W * 0.33, bottom: 0 }} onPress={goBack} />
        <Pressable style={{ position: "absolute", right: 0, top: insets.top + 80, width: SCREEN_W * 0.33, bottom: 0 }} onPress={advance} />
        {/* Center tap = close */}
        <Pressable style={{ position: "absolute", left: SCREEN_W * 0.33, right: SCREEN_W * 0.33, top: insets.top + 80, bottom: 0 }} onPress={onClose} />
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
          {/* Stop the press from propagating through the sheet */}
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={{ backgroundColor: surf, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
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
          </Pressable>
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
      <View style={{ paddingTop: insets.top + (Platform.OS === "web" ? 72 : 16), paddingHorizontal: 20, paddingBottom: 20, backgroundColor: theme.gradientTop }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 28, fontFamily: "Inter_700Bold", color: txt }}>Updates</Text>
            <Text style={{ fontSize: 13, color: txtSec, fontFamily: "Inter_400Regular", marginTop: 2 }}>Disappear in 24 hours</Text>
          </View>
          <Pressable style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }} onPress={() => setShowAdd(true)}>
            <Feather name="plus" size={22} color={primary} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* Story rings row */}
        <View style={{ paddingTop: 20, paddingBottom: 16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}>
            <StoryRing
              group={myGroup} isMe
              onPress={() => myGroup ? openViewer([myGroup, ...contactGroups], 0) : setShowAdd(true)}
              theme={theme}
              user={user ? { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl } : undefined}
            />
            {contactGroups.map((group, idx) => (
              <StoryRing key={group.user.id} group={group} onPress={() => openViewer([...contactGroups], idx)} theme={theme} />
            ))}
            {contactGroups.length === 0 && !isLoading && (
              <View style={{ justifyContent: "center", paddingLeft: 8 }}>
                <Text style={{ color: txtMut, fontSize: 13, fontFamily: "Inter_400Regular" }}>No stories from contacts yet</Text>
              </View>
            )}
          </ScrollView>
        </View>

        <View style={{ height: 1, backgroundColor: border, marginHorizontal: 16, marginBottom: 20 }} />

        {/* My Story */}
        <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
          <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>My Story</Text>

          {myGroup && myGroup.items.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {myGroup.items.map((item) => (
                <Pressable key={item.id} style={{ width: 110, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: border, height: 160 }} onPress={() => openViewer([myGroup], 0)}>
                  {item.type === "text" ? (
                    <LinearGradient colors={getTextBg(item.mediaUrl.replace("text:", ""))} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 10 }}>
                      <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 18 }} numberOfLines={5}>{item.caption}</Text>
                    </LinearGradient>
                  ) : (
                    <>
                      <Image source={{ uri: item.mediaUrl }} style={{ width: 110, height: 160 }} resizeMode="cover" />
                      <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60 }} />
                      <Text style={{ position: "absolute", bottom: 8, left: 8, right: 8, color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium" }} numberOfLines={2}>{item.caption ?? timeAgo(item.createdAt)}</Text>
                    </>
                  )}
                </Pressable>
              ))}
              <Pressable style={{ width: 110, height: 160, borderRadius: 16, backgroundColor: `${primary}18`, borderWidth: 1.5, borderColor: `${primary}44`, alignItems: "center", justifyContent: "center", gap: 8 }} onPress={() => setShowAdd(true)}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="plus" size={22} color={primary} />
                </View>
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: primary, textAlign: "center" }}>Add More</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <Pressable style={{ borderRadius: 18, overflow: "hidden", borderWidth: 2, borderColor: `${primary}44`, borderStyle: "dashed" }} onPress={() => setShowAdd(true)}>
              <LinearGradient colors={[`${primary}18`, `${theme.accent}18`]} style={{ paddingVertical: 32, alignItems: "center", gap: 12 }}>
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="camera" size={26} color={primary} />
                </View>
                <Text style={{ fontSize: 17, fontFamily: "Inter_600SemiBold", color: txt }}>Add Your First Story</Text>
                <Text style={{ fontSize: 13, color: txtMut, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 24 }}>Photo, video, or text — disappears in 24 hours</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>

        {/* Contact stories list */}
        {contactGroups.length > 0 && (
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Recent Stories</Text>
            <View style={{ backgroundColor: surf, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: "hidden" }}>
              {contactGroups.map((group, idx) => {
                const firstItem = group.items[0];
                const isText = firstItem.type === "text";
                const textColors = isText ? getTextBg(firstItem.mediaUrl.replace("text:", "")) : null;
                return (
                  <React.Fragment key={group.user.id}>
                    <Pressable style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })} onPress={() => openViewer(contactGroups, idx)}>
                      <View style={{ width: 60, height: 80, borderRadius: 12, overflow: "hidden", borderWidth: 2, borderColor: primary }}>
                        {isText ? (
                          <LinearGradient colors={textColors!} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 6 }}>
                            <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "center" }} numberOfLines={3}>{firstItem.caption}</Text>
                          </LinearGradient>
                        ) : (
                          <Image source={{ uri: firstItem.mediaUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: txt }}>{group.user.displayName}</Text>
                        <Text style={{ fontSize: 12, color: txtSec, fontFamily: "Inter_400Regular", marginTop: 3 }}>{group.items.length} {group.items.length === 1 ? "update" : "updates"}</Text>
                        <Text style={{ fontSize: 11, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 2 }}>{timeAgo(firstItem.createdAt)}</Text>
                      </View>
                      <Feather name="play-circle" size={26} color={primary} />
                    </Pressable>
                    {idx < contactGroups.length - 1 && <View style={{ height: 1, backgroundColor: border, marginLeft: 90 }} />}
                  </React.Fragment>
                );
              })}
            </View>
          </View>
        )}

        {/* Empty state */}
        {!isLoading && contactGroups.length === 0 && !myGroup && (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={{ backgroundColor: surf, borderRadius: 16, padding: 32, alignItems: "center", gap: 12, borderWidth: 1, borderColor: border }}>
              <Ionicons name="images-outline" size={52} color={txtMut} />
              <Text style={{ color: txtSec, fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center" }}>No stories yet</Text>
              <Text style={{ color: txtMut, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" }}>Share a photo, video or text story that disappears in 24 hours</Text>
            </View>
          </View>
        )}

        {/* Quick actions */}
        <View style={{ paddingHorizontal: 16, paddingTop: 28 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable style={{ flex: 1, backgroundColor: surf, borderRadius: 16, padding: 16, alignItems: "center", gap: 8, borderWidth: 1, borderColor: border }} onPress={() => router.push("/my-profile")}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={20} color={primary} />
              </View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: txt }}>Profile</Text>
            </Pressable>
            <Pressable style={{ flex: 1, backgroundColor: surf, borderRadius: 16, padding: 16, alignItems: "center", gap: 8, borderWidth: 1, borderColor: border }} onPress={() => router.push("/settings")}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${theme.success}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="settings" size={20} color={theme.success} />
              </View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: txt }}>Settings</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <AddStatusModal visible={showAdd} onClose={() => setShowAdd(false)} onAdded={() => { queryClient.invalidateQueries({ queryKey: ["statuses"] }); refetch(); }} theme={theme} insets={insets} />

      {viewerVisible && viewerGroups.length > 0 && (
        <StoryViewer groups={viewerGroups} startGroupIdx={viewerStartIdx} onClose={() => setViewerVisible(false)} theme={theme} />
      )}
    </View>
  );
}
