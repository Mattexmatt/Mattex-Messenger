import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, Pressable, ScrollView, Modal, TextInput,
  Platform, Image, Alert, ActivityIndicator, Animated,
  Dimensions, StyleSheet
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

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

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

interface StoryGroup {
  user: StatusItem["user"];
  items: StatusItem[];
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function StoryRing({ group, size, onPress, isMe, theme, user: userProp }: {
  group?: StoryGroup; size?: number; onPress: () => void; isMe?: boolean; theme: any;
  user?: { id: number; username: string; displayName: string; avatarUrl?: string | null };
}) {
  const sz = size ?? 68;
  const hasStory = (group?.items?.length ?? 0) > 0;
  const user = group?.user ?? userProp;
  const primary = theme.primary;
  const accent = theme.accent;

  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", gap: 5 }}>
      <View style={{
        width: sz + 6, height: sz + 6, borderRadius: (sz + 6) / 2,
        padding: 2,
        borderWidth: hasStory ? 2.5 : 1.5,
        borderColor: hasStory ? primary : `${primary}33`,
      }}>
        {user?.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={{ width: sz, height: sz, borderRadius: sz / 2 }} />
        ) : (
          <View style={{ width: sz, height: sz, borderRadius: sz / 2, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: sz * 0.38, color: primary, fontFamily: "Inter_700Bold" }}>
              {user?.displayName[0]?.toUpperCase() ?? "+"}
            </Text>
          </View>
        )}
        {isMe && !hasStory && (
          <View style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.background }}>
            <Feather name="plus" size={13} color={theme.background} />
          </View>
        )}
        {isMe && hasStory && (
          <View style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.background }}>
            <Feather name="plus" size={13} color={theme.background} />
          </View>
        )}
      </View>
      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: theme.text, maxWidth: sz + 8, textAlign: "center" }} numberOfLines={1}>
        {isMe ? "My Story" : user?.displayName?.split(" ")[0] ?? ""}
      </Text>
    </Pressable>
  );
}

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

  useEffect(() => {
    startProgress();
    return () => animRef.current?.stop();
  }, [groupIdx, itemIdx]);

  const startProgress = () => {
    progressAnim.setValue(0);
    animRef.current?.stop();
    animRef.current = Animated.timing(progressAnim, {
      toValue: 1, duration: DURATION, useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) advance();
    });
  };

  const advance = () => {
    if (itemIdx < group.items.length - 1) {
      setItemIdx(i => i + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(g => g + 1);
      setItemIdx(0);
    } else {
      onClose();
    }
  };

  const goBack = () => {
    if (itemIdx > 0) setItemIdx(i => i - 1);
    else if (groupIdx > 0) { setGroupIdx(g => g - 1); setItemIdx(0); }
  };

  if (!group || !item) return null;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {/* Story image */}
        <Image
          source={{ uri: item.mediaUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />

        {/* Gradient top */}
        <LinearGradient
          colors={["rgba(0,0,0,0.7)", "transparent"]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 180 }}
        />

        {/* Gradient bottom */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.8)"]}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 200 }}
        />

        {/* Progress bars */}
        <View style={{ position: "absolute", top: insets.top + 12, left: 12, right: 12, flexDirection: "row", gap: 3 }}>
          {group.items.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 3, backgroundColor: "rgba(255,255,255,0.35)", borderRadius: 2, overflow: "hidden" }}>
              <Animated.View style={{
                height: "100%", borderRadius: 2,
                backgroundColor: "#fff",
                width: i < itemIdx ? "100%" : i === itemIdx ? progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) : "0%",
              }} />
            </View>
          ))}
        </View>

        {/* User info */}
        <View style={{ position: "absolute", top: insets.top + 28, left: 16, right: 50, flexDirection: "row", alignItems: "center", gap: 10 }}>
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

        {/* Close */}
        <Pressable style={{ position: "absolute", top: insets.top + 28, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" }} onPress={onClose}>
          <Feather name="x" size={20} color="#fff" />
        </Pressable>

        {/* Caption */}
        {item.caption && (
          <View style={{ position: "absolute", bottom: insets.bottom + 60, left: 20, right: 20 }}>
            <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Inter_500Medium", textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 4, lineHeight: 24 }}>{item.caption}</Text>
          </View>
        )}

        {/* Tap zones for nav */}
        <Pressable style={{ position: "absolute", left: 0, top: 0, width: SCREEN_W * 0.35, bottom: 0 }} onPress={goBack} />
        <Pressable style={{ position: "absolute", right: 0, top: 0, width: SCREEN_W * 0.65, bottom: 0 }} onPress={advance} />
      </View>
    </Modal>
  );
}

function AddStatusModal({ visible, onClose, onAdded, theme, insets }: {
  visible: boolean; onClose: () => void; onAdded: () => void; theme: any; insets: any;
}) {
  const [step, setStep] = useState<"pick" | "caption">("pick");
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showVideoUrl, setShowVideoUrl] = useState(false);

  const bg = theme.background;
  const surf = theme.surface;
  const border = theme.border;
  const primary = theme.primary;
  const txt = theme.text;
  const txtSec = theme.textSecondary;
  const txtMut = theme.textMuted;

  const reset = () => {
    setStep("pick");
    setMediaUri(null);
    setVideoUrl("");
    setCaption("");
    setShowVideoUrl(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow access to your gallery to pick a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.5,
      base64: true,
      allowsEditing: true,
      aspect: [9, 16],
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : asset.uri;
      setMediaUri(uri);
      setStep("caption");
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow camera access to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.5,
      base64: true,
      allowsEditing: true,
      aspect: [9, 16],
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : asset.uri;
      setMediaUri(uri);
      setStep("caption");
    }
  };

  const handleVideoUrl = () => {
    if (!videoUrl.trim()) return;
    setMediaUri(videoUrl.trim());
    setStep("caption");
  };

  const handlePost = async () => {
    const url = mediaUri ?? videoUrl.trim();
    if (!url) return;
    setUploading(true);
    try {
      await apiRequest("/statuses", {
        method: "POST",
        body: JSON.stringify({
          mediaUrl: url,
          caption: caption.trim() || null,
          type: url.startsWith("data:") ? "image" : url.match(/\.(mp4|mov|webm)/i) ? "video" : "image",
        }),
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: surf, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 20 }} />

          {step === "pick" ? (
            <>
              <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: txt, marginBottom: 6 }}>Add to Story</Text>
              <Text style={{ fontSize: 14, color: txtMut, fontFamily: "Inter_400Regular", marginBottom: 24 }}>Share a photo or video — it disappears in 24 hours</Text>

              <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
                <Pressable
                  style={{ flex: 1, backgroundColor: `${primary}18`, borderRadius: 18, paddingVertical: 28, alignItems: "center", gap: 12, borderWidth: 1.5, borderColor: `${primary}44` }}
                  onPress={takePhoto}
                >
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="camera" size={26} color={primary} />
                  </View>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: txt }}>Camera</Text>
                  <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>Take a photo</Text>
                </Pressable>

                <Pressable
                  style={{ flex: 1, backgroundColor: `${theme.accent}18`, borderRadius: 18, paddingVertical: 28, alignItems: "center", gap: 12, borderWidth: 1.5, borderColor: `${theme.accent}44` }}
                  onPress={pickImage}
                >
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${theme.accent}22`, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="image" size={26} color={theme.accent} />
                  </View>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: txt }}>Gallery</Text>
                  <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>Pick a photo</Text>
                </Pressable>
              </View>

              {showVideoUrl ? (
                <View style={{ gap: 10 }}>
                  <TextInput
                    style={{ backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular" }}
                    placeholder="Paste a video URL (mp4, mov...)"
                    placeholderTextColor={txtMut}
                    value={videoUrl}
                    onChangeText={setVideoUrl}
                    autoCapitalize="none"
                    autoFocus
                  />
                  <Pressable style={{ backgroundColor: primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" }} onPress={handleVideoUrl}>
                    <Text style={{ color: bg, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Use This Video</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={{ alignItems: "center", paddingVertical: 14, flexDirection: "row", justifyContent: "center", gap: 8 }} onPress={() => setShowVideoUrl(true)}>
                  <Feather name="video" size={16} color={txtSec} />
                  <Text style={{ fontSize: 14, color: txtSec, fontFamily: "Inter_500Medium" }}>Paste a video URL instead</Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: txt, marginBottom: 16 }}>Preview & Post</Text>

              {/* Preview */}
              {mediaUri && (
                <View style={{ borderRadius: 16, overflow: "hidden", marginBottom: 16, height: 220 }}>
                  <Image source={{ uri: mediaUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  <LinearGradient colors={["transparent", "rgba(0,0,0,0.5)"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80 }} />
                </View>
              )}

              <Text style={{ fontSize: 13, color: txtSec, fontFamily: "Inter_500Medium", marginBottom: 8 }}>Add a caption (optional)</Text>
              <TextInput
                style={{ backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular", marginBottom: 16, minHeight: 60 }}
                placeholder="What's on your mind?"
                placeholderTextColor={txtMut}
                value={caption}
                onChangeText={setCaption}
                multiline
                maxLength={200}
              />

              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable style={{ flex: 1, backgroundColor: `${primary}18`, borderRadius: 14, paddingVertical: 15, alignItems: "center" }} onPress={() => setStep("pick")}>
                  <Text style={{ color: primary, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Back</Text>
                </Pressable>
                <Pressable style={{ flex: 2, backgroundColor: primary, borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center" }} onPress={handlePost} disabled={uploading}>
                  {uploading
                    ? <ActivityIndicator color={bg} />
                    : <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Feather name="send" size={16} color={bg} />
                        <Text style={{ color: bg, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Share Story</Text>
                      </View>
                  }
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

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
    setViewerGroups(groups);
    setViewerStartIdx(startIdx);
    setViewerVisible(true);
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
          <Pressable
            style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}
            onPress={() => setShowAdd(true)}
          >
            <Feather name="plus" size={22} color={primary} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* Story rings row */}
        <View style={{ paddingTop: 20, paddingBottom: 16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}>
            {/* My story ring */}
            <StoryRing
              group={myGroup}
              isMe
              onPress={() => {
                if (myGroup) {
                  openViewer([myGroup, ...contactGroups], 0);
                } else {
                  setShowAdd(true);
                }
              }}
              theme={theme}
              user={user ? { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl } : undefined}
            />

            {/* Contact story rings */}
            {contactGroups.map((group, idx) => (
              <StoryRing
                key={group.user.id}
                group={group}
                onPress={() => openViewer([...contactGroups], idx)}
                theme={theme}
              />
            ))}

            {/* Add placeholder when no contacts have stories */}
            {contactGroups.length === 0 && !isLoading && (
              <View style={{ justifyContent: "center", paddingLeft: 8 }}>
                <Text style={{ color: txtMut, fontSize: 13, fontFamily: "Inter_400Regular" }}>No stories from contacts yet</Text>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: border, marginHorizontal: 16, marginBottom: 20 }} />

        {/* My Status section */}
        <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
          <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>My Story</Text>

          {myGroup && myGroup.items.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {myGroup.items.map((item, idx) => (
                <Pressable
                  key={item.id}
                  style={{ width: 110, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: border }}
                  onPress={() => openViewer([myGroup], 0)}
                >
                  <Image source={{ uri: item.mediaUrl }} style={{ width: 110, height: 160 }} resizeMode="cover" />
                  <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60 }} />
                  <Text style={{ position: "absolute", bottom: 8, left: 8, right: 8, color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium" }} numberOfLines={2}>{item.caption ?? timeAgo(item.createdAt)}</Text>
                </Pressable>
              ))}

              {/* Add more */}
              <Pressable
                style={{ width: 110, height: 160, borderRadius: 16, backgroundColor: `${primary}18`, borderWidth: 1.5, borderColor: `${primary}44`, alignItems: "center", justifyContent: "center", gap: 8 }}
                onPress={() => setShowAdd(true)}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="plus" size={22} color={primary} />
                </View>
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: primary, textAlign: "center" }}>Add More</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <Pressable
              style={{ borderRadius: 18, overflow: "hidden", borderWidth: 2, borderColor: `${primary}44`, borderStyle: "dashed" }}
              onPress={() => setShowAdd(true)}
            >
              <LinearGradient
                colors={[`${primary}18`, `${theme.accent}18`]}
                style={{ paddingVertical: 32, alignItems: "center", gap: 12 }}
              >
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="camera" size={26} color={primary} />
                </View>
                <Text style={{ fontSize: 17, fontFamily: "Inter_600SemiBold", color: txt }}>Add Your First Story</Text>
                <Text style={{ fontSize: 13, color: txtMut, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 24 }}>Share a photo or video — it disappears after 24 hours</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>

        {/* Contact stories grid */}
        {contactGroups.length > 0 && (
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Recent Stories</Text>
            <View style={{ backgroundColor: surf, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: "hidden" }}>
              {contactGroups.map((group, idx) => (
                <React.Fragment key={group.user.id}>
                  <Pressable
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}
                    onPress={() => openViewer(contactGroups, idx)}
                  >
                    {/* Preview thumbnail */}
                    <View style={{ position: "relative" }}>
                      <View style={{ width: 60, height: 80, borderRadius: 12, overflow: "hidden", borderWidth: 2, borderColor: primary }}>
                        <Image source={{ uri: group.items[0].mediaUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                      </View>
                      {group.items.length > 1 && (
                        <View style={{ position: "absolute", top: 4, right: 4, backgroundColor: primary, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                          <Text style={{ color: bg, fontSize: 9, fontFamily: "Inter_700Bold" }}>+{group.items.length - 1}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: txt }}>{group.user.displayName}</Text>
                      <Text style={{ fontSize: 12, color: txtSec, fontFamily: "Inter_400Regular", marginTop: 3 }}>
                        {group.items.length} {group.items.length === 1 ? "update" : "updates"}
                      </Text>
                      <Text style={{ fontSize: 11, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 2 }}>{timeAgo(group.items[0].createdAt)}</Text>
                    </View>
                    <Feather name="play-circle" size={26} color={primary} />
                  </Pressable>
                  {idx < contactGroups.length - 1 && <View style={{ height: 1, backgroundColor: border, marginLeft: 90 }} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

        {/* Empty state */}
        {!isLoading && contactGroups.length === 0 && !myGroup && (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={{ backgroundColor: surf, borderRadius: 16, padding: 32, alignItems: "center", gap: 12, borderWidth: 1, borderColor: border }}>
              <Ionicons name="images-outline" size={52} color={txtMut} />
              <Text style={{ color: txtSec, fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center" }}>No stories yet</Text>
              <Text style={{ color: txtMut, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" }}>Be the first — share a photo or video that disappears in 24 hours</Text>
            </View>
          </View>
        )}

        {/* Quick actions row */}
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

      {/* Add story modal */}
      <AddStatusModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={() => { queryClient.invalidateQueries({ queryKey: ["statuses"] }); refetch(); }}
        theme={theme}
        insets={insets}
      />

      {/* Story viewer */}
      {viewerVisible && viewerGroups.length > 0 && (
        <StoryViewer
          groups={viewerGroups}
          startGroupIdx={viewerStartIdx}
          onClose={() => setViewerVisible(false)}
          theme={theme}
        />
      )}
    </View>
  );
}
