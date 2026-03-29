import React, { useState } from "react";
import {
  View, Text, FlatList, Pressable, TextInput,
  Image, Modal, ActivityIndicator, Alert, Platform
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons, AntDesign } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";

interface MemeAuthor {
  id: number; username: string; displayName: string; avatarUrl?: string | null;
  isOwner: boolean; role: string; warnCount: number; isBanned: boolean; createdAt: string;
}
interface Meme {
  id: number; imageUrl: string; caption?: string | null;
  status: "active" | "flagged" | "removed";
  isOfficial: boolean;
  likesCount: number; isLiked: boolean; author?: MemeAuthor | null; createdAt: string;
}

function formatAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: "#1D9BF0", alignItems: "center", justifyContent: "center",
    }}>
      <Feather name="check" size={size * 0.6} color="#fff" />
    </View>
  );
}

function MemeCard({ item, theme, isOwner, onLike, onModerate }: {
  item: Meme; theme: any; isOwner: boolean;
  onLike: (m: Meme) => void; onModerate: (m: Meme) => void;
}) {
  const [showFlagged, setShowFlagged] = useState(false);
  const isFlagged = item.status === "flagged";
  const txt = theme.text; const txtMut = theme.textMuted; const txtSec = theme.textSecondary;
  const surf = theme.surface; const border = theme.border; const primary = theme.primary;
  const danger = theme.danger ?? "#ef4444";
  const isDark = !!(theme as any).isDark;
  return (
    <View style={{
      backgroundColor: surf, marginHorizontal: 16, marginVertical: 6,
      borderRadius: 18, overflow: "hidden",
      borderWidth: 1.5, borderColor: isFlagged ? "#F59E0B55" : border,
      shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    }}>
      {item.isOfficial && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1D9BF010", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1D9BF022" }}>
          <VerifiedBadge size={16} />
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#1D9BF0" }}>M Chat Official</Text>
          <Text style={{ fontSize: 11, color: txtMut, fontFamily: "Inter_400Regular", marginLeft: "auto" }}>{formatAgo(item.createdAt)}</Text>
        </View>
      )}
      {!item.isOfficial && (
        <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 10 }}>
          {item.author?.avatarUrl ? (
            <Image source={{ uri: item.author.avatarUrl }} style={{ width: 38, height: 38, borderRadius: 19 }} />
          ) : (
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: primary, fontSize: 15, fontFamily: "Inter_700Bold" }}>{(item.author?.displayName ?? "?")[0].toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: txt }}>{item.author?.displayName ?? "Unknown"}</Text>
              {item.author?.isOwner && <VerifiedBadge size={14} />}
            </View>
            <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>{formatAgo(item.createdAt)}</Text>
          </View>
          {isOwner && (
            <Pressable onPress={() => onModerate(item)} style={{ padding: 6 }}>
              <Feather name="more-vertical" size={18} color={txtMut} />
            </Pressable>
          )}
        </View>
      )}
      {isFlagged && !showFlagged ? (
        <Pressable onPress={() => setShowFlagged(true)} style={{ height: 220, backgroundColor: "#F59E0B14", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#F59E0B22", alignItems: "center", justifyContent: "center" }}>
            <Feather name="alert-triangle" size={24} color="#F59E0B" />
          </View>
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#F59E0B", textAlign: "center" }}>Sensitive Content</Text>
          <Text style={{ fontSize: 13, color: txtMut, fontFamily: "Inter_400Regular", textAlign: "center" }}>This post was flagged for potentially inappropriate content. Tap to view.</Text>
        </Pressable>
      ) : (
        <Image source={{ uri: item.imageUrl }} style={{ width: "100%", height: 280, backgroundColor: theme.surfaceElevated }} resizeMode="cover" />
      )}
      {item.caption && (
        <Text style={{ fontSize: 14, color: txt, fontFamily: "Inter_400Regular", paddingHorizontal: 14, paddingTop: 10, lineHeight: 20 }}>{item.caption}</Text>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 }}>
        <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 7 }} onPress={() => onLike(item)}>
          <AntDesign name={item.isLiked ? "heart" : "hearto"} size={22} color={item.isLiked ? "#FF4757" : txtSec} />
          <Text style={{ fontSize: 14, color: item.isLiked ? "#FF4757" : txtSec, fontFamily: "Inter_500Medium" }}>{item.likesCount}</Text>
        </Pressable>
        {!item.isOfficial && isOwner && (
          <Pressable onPress={() => onModerate(item)} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: `${danger}18`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Feather name="shield" size={14} color={danger} />
            <Text style={{ fontSize: 12, color: danger, fontFamily: "Inter_600SemiBold" }}>Moderate</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function MemesScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const isDark = !!(theme as any).isDark;

  const [showPost, setShowPost] = useState(false);
  const [postAsOfficial, setPostAsOfficial] = useState(false);
  const [newCaption, setNewCaption] = useState("");
  const [pickedImage, setPickedImage] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [moderateTarget, setModerateTarget] = useState<Meme | null>(null);

  const { data: memes, isLoading, refetch, isRefetching } = useQuery<Meme[]>({
    queryKey: ["memes", token],
    queryFn: () => apiRequest("/memes"),
    refetchInterval: 20000,
  });

  const isBanned = (user as any)?.isBanned === true;
  const isOwner = user?.isOwner ?? false;

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow access to your photo library to post memes.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        const ext = asset.mimeType?.includes("png") ? "png" : "jpeg";
        setPickedImage(`data:image/${ext};base64,${asset.base64}`);
      } else if (asset.uri) {
        setPickedImage(asset.uri);
      }
    }
  };

  const handlePost = async () => {
    if (!pickedImage) { Alert.alert("Pick an image first"); return; }
    if (isBanned) {
      Alert.alert("Account Banned", "Your account has been banned for violating community guidelines.");
      return;
    }
    setPosting(true);
    try {
      await apiRequest("/memes", {
        method: "POST",
        body: JSON.stringify({
          imageUrl: pickedImage,
          caption: newCaption.trim() || undefined,
          isOfficial: postAsOfficial && isOwner,
        }),
      });
      qc.invalidateQueries({ queryKey: ["memes"] });
      setShowPost(false);
      setPickedImage(null);
      setNewCaption("");
      setPostAsOfficial(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not post meme.");
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (meme: Meme) => {
    if (!token) { Alert.alert("Sign in to like memes"); return; }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    qc.setQueryData<Meme[]>(["memes", token], (old) =>
      (old ?? []).map(m => m.id === meme.id
        ? { ...m, isLiked: !m.isLiked, likesCount: m.isLiked ? m.likesCount - 1 : m.likesCount + 1 }
        : m)
    );
    try {
      await apiRequest(`/memes/${meme.id}/like`, { method: "POST" });
    } catch {
      qc.invalidateQueries({ queryKey: ["memes"] });
    }
  };

  const adminRemove = async (meme: Meme) => {
    try {
      await apiRequest(`/memes/${meme.id}`, { method: "DELETE" });
      qc.setQueryData<Meme[]>(["memes", token], (old) => (old ?? []).filter(m => m.id !== meme.id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Alert.alert("Error", "Could not remove meme."); }
    setModerateTarget(null);
  };

  const adminFlag = async (meme: Meme) => {
    const next = meme.status === "flagged" ? "active" : "flagged";
    try {
      await apiRequest(`/memes/${meme.id}/flag`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      qc.setQueryData<Meme[]>(["memes", token], (old) =>
        (old ?? []).map(m => m.id === meme.id ? { ...m, status: next } : m));
    } catch { Alert.alert("Error", "Could not flag meme."); }
    setModerateTarget(null);
  };

  const adminWarn = async (meme: Meme) => {
    if (!meme.author) return;
    Alert.alert(`Warn ${meme.author.displayName}?`, "A warning will be issued. 3 warnings = auto-ban.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Warn", style: "destructive", onPress: async () => {
          try {
            const res = await apiRequest(`/memes/${meme.author!.id}/warn`, { method: "POST" });
            const msg = res.isBanned
              ? `${meme.author!.displayName} has been auto-banned after 3 warnings.`
              : `Warning issued. (${res.warnCount}/3 warnings)`;
            Alert.alert("Done", msg);
            qc.invalidateQueries({ queryKey: ["memes"] });
          } catch { Alert.alert("Error", "Could not warn user."); }
          setModerateTarget(null);
        }
      },
    ]);
  };

  const adminBan = async (meme: Meme, ban: boolean) => {
    if (!meme.author) return;
    Alert.alert(
      ban ? `Ban ${meme.author.displayName}?` : `Unban ${meme.author.displayName}?`,
      ban ? "They will not be able to post memes." : "They will regain posting access.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: ban ? "Ban" : "Unban", style: "destructive", onPress: async () => {
            try {
              await apiRequest(`/memes/${meme.author!.id}/ban`, { method: "PATCH", body: JSON.stringify({ banned: ban }) });
              Alert.alert("Done", ban ? "User banned." : "User unbanned.");
              qc.invalidateQueries({ queryKey: ["memes"] });
            } catch { Alert.alert("Error", "Could not update ban."); }
            setModerateTarget(null);
          }
        },
      ]
    );
  };

  const primary = theme.primary;
  const txt = theme.text;
  const txtSec = theme.textSecondary;
  const txtMut = theme.textMuted;
  const surf = theme.surface;
  const border = theme.border;
  const bg = theme.background;
  const danger = (theme as any).danger ?? "#ef4444";

  const officialMemes = (memes ?? []).filter(m => m.isOfficial);
  const regularMemes = (memes ?? []).filter(m => !m.isOfficial);

  const renderMeme = ({ item }: { item: Meme }) => (
    <MemeCard
      item={item}
      theme={theme}
      isOwner={isOwner}
      onLike={handleLike}
      onModerate={setModerateTarget}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
        paddingHorizontal: 20, paddingBottom: 14, backgroundColor: bg,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        borderBottomWidth: 1, borderBottomColor: border,
      }}>
        <View>
          <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: txt }}>Updates</Text>
          <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 1 }}>M Chat Community</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {!!token && !isBanned && (
            <Pressable
              onPress={() => setShowPost(true)}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }}
            >
              <Feather name="image" size={15} color={isDark ? "#000" : "#fff"} />
              <Text style={{ color: isDark ? "#000" : "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Post</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Banned notice */}
      {isBanned && (
        <View style={{ margin: 16, backgroundColor: `${danger}12`, borderRadius: 14, borderWidth: 1, borderColor: `${danger}30`, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${danger}22`, alignItems: "center", justifyContent: "center" }}>
            <Feather name="slash" size={20} color={danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: danger }}>Account Banned</Text>
            <Text style={{ fontSize: 13, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 2 }}>You cannot post memes. Contact the admin for appeals.</Text>
          </View>
        </View>
      )}

      {/* Official M Chat Channel Banner */}
      <View style={{
        margin: 16, marginBottom: 4,
        backgroundColor: "#1D9BF008", borderRadius: 18, borderWidth: 1.5, borderColor: "#1D9BF033",
        padding: 16,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#1D9BF0", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <Text style={{ fontSize: 22 }}>💬</Text>
            <View style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: "#1D9BF0", borderWidth: 2, borderColor: bg, alignItems: "center", justifyContent: "center" }}>
              <Feather name="check" size={10} color="#fff" />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: txt }}>M Chat Official</Text>
              <VerifiedBadge size={16} />
            </View>
            <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 1 }}>Official updates & announcements · No replies</Text>
          </View>
        </View>
        {officialMemes.length > 0 && (
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: border, paddingTop: 12 }}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#1D9BF0", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Latest Broadcast</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Image source={{ uri: officialMemes[0].imageUrl }} style={{ width: 52, height: 52, borderRadius: 10 }} resizeMode="cover" />
              <View style={{ flex: 1 }}>
                {officialMemes[0].caption && <Text style={{ fontSize: 14, color: txt, fontFamily: "Inter_400Regular" }} numberOfLines={2}>{officialMemes[0].caption}</Text>}
                <Text style={{ fontSize: 11, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 2 }}>{formatAgo(officialMemes[0].createdAt)}</Text>
              </View>
            </View>
          </View>
        )}
        {officialMemes.length === 0 && (
          <Text style={{ fontSize: 13, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 10, textAlign: "center" }}>No broadcasts yet. Stay tuned!</Text>
        )}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={primary} />
        </View>
      ) : (
        <FlatList
          data={[...officialMemes, ...regularMemes]}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderMeme}
          onRefresh={refetch}
          refreshing={isRefetching}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: 8 }}
          ListHeaderComponent={
            (officialMemes.length > 0 || regularMemes.length > 0) ? (
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: txtMut, textTransform: "uppercase", letterSpacing: 0.8, marginLeft: 20, marginBottom: 4, marginTop: 8 }}>
                {officialMemes.length > 0 ? "Broadcasts & Community" : "Community"}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingTop: 60 }}>
              <Ionicons name="images-outline" size={56} color={txtMut} />
              <Text style={{ color: txtSec, fontSize: 17, fontFamily: "Inter_600SemiBold" }}>No memes yet</Text>
              {!!token && !isBanned && (
                <Pressable onPress={() => setShowPost(true)} style={{ backgroundColor: primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 }}>
                  <Text style={{ color: isDark ? "#000" : "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Post the first one!</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}

      {/* Post Meme Modal */}
      <Modal visible={showPost} animationType="slide" transparent onRequestClose={() => setShowPost(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowPost(false)}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 28 }} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 20 }} />
            <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: txt, marginBottom: 18 }}>Post a Meme</Text>

            {/* Image picker */}
            <Pressable
              onPress={pickImage}
              style={{
                borderRadius: 16, borderWidth: 2, borderColor: pickedImage ? primary : border,
                borderStyle: pickedImage ? "solid" : "dashed",
                height: pickedImage ? 220 : 140,
                alignItems: "center", justifyContent: "center",
                overflow: "hidden", marginBottom: 16,
                backgroundColor: pickedImage ? "transparent" : `${primary}08`,
              }}
            >
              {pickedImage ? (
                <>
                  <Image source={{ uri: pickedImage }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  <Pressable
                    onPress={() => setPickedImage(null)}
                    style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}
                  >
                    <Feather name="x" size={14} color="#fff" />
                  </Pressable>
                </>
              ) : (
                <View style={{ alignItems: "center", gap: 8 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: `${primary}18`, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="image" size={24} color={primary} />
                  </View>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: primary }}>Choose from Gallery</Text>
                  <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>Tap to select a photo</Text>
                </View>
              )}
            </Pressable>

            {/* Caption */}
            <TextInput
              style={{
                backgroundColor: theme.inputBg, borderRadius: 14, paddingHorizontal: 14,
                paddingVertical: 12, fontSize: 15, color: txt,
                borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular", marginBottom: 14,
                minHeight: 56,
              }}
              placeholder="Add a caption (optional)…"
              placeholderTextColor={txtMut}
              value={newCaption}
              onChangeText={setNewCaption}
              multiline
            />

            {/* Owner: post as official toggle */}
            {isOwner && (
              <Pressable
                onPress={() => setPostAsOfficial(v => !v)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: postAsOfficial ? "#1D9BF018" : theme.surfaceElevated, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: postAsOfficial ? "#1D9BF055" : border }}
              >
                <VerifiedBadge size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: postAsOfficial ? "#1D9BF0" : txt }}>Post as M Chat Official</Text>
                  <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 1 }}>Broadcasts to all users as a verified announcement</Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: postAsOfficial ? "#1D9BF0" : border, backgroundColor: postAsOfficial ? "#1D9BF0" : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {postAsOfficial && <Feather name="check" size={12} color="#fff" />}
                </View>
              </Pressable>
            )}

            {/* Content warning notice */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: `${danger}10`, borderRadius: 10, padding: 10, marginBottom: 16 }}>
              <Feather name="alert-circle" size={15} color={danger} />
              <Text style={{ fontSize: 12, color: danger, fontFamily: "Inter_400Regular", flex: 1 }}>No nudity or explicit content. Violations result in warnings or a ban.</Text>
            </View>

            <Pressable
              style={{ backgroundColor: primary, borderRadius: 16, height: 52, alignItems: "center", justifyContent: "center", opacity: posting ? 0.7 : 1 }}
              onPress={handlePost}
              disabled={posting}
            >
              {posting ? <ActivityIndicator color={isDark ? "#000" : "#fff"} /> : (
                <Text style={{ color: isDark ? "#000" : "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
                  {postAsOfficial ? "📢 Broadcast" : "Post Meme"}
                </Text>
              )}
            </Pressable>
            <Pressable style={{ marginTop: 12, alignItems: "center" }} onPress={() => setShowPost(false)}>
              <Text style={{ color: txtSec, fontSize: 15, fontFamily: "Inter_400Regular" }}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Moderation action sheet (owner only) */}
      {moderateTarget && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setModerateTarget(null)}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setModerateTarget(null)}>
            <View style={{ backgroundColor: surf, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }} onStartShouldSetResponder={() => true}>
              <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: `${danger}18`, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="shield" size={20} color={danger} />
                </View>
                <View>
                  <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: txt }}>Moderate Post</Text>
                  <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>by {moderateTarget.author?.displayName ?? "Unknown"}</Text>
                </View>
              </View>

              {[
                {
                  icon: "flag", label: moderateTarget.status === "flagged" ? "Remove Flag" : "Flag as Inappropriate",
                  color: "#F59E0B", onPress: () => adminFlag(moderateTarget),
                },
                {
                  icon: "trash-2", label: "Remove Post",
                  color: danger, onPress: () => adminRemove(moderateTarget),
                },
                {
                  icon: "alert-triangle", label: `Warn User (${moderateTarget.author?.warnCount ?? 0}/3)`,
                  color: "#F59E0B", onPress: () => adminWarn(moderateTarget),
                },
                ...(moderateTarget.author?.isBanned
                  ? [{ icon: "user-check", label: "Unban User", color: theme.success ?? "#22c55e", onPress: () => adminBan(moderateTarget, false) }]
                  : [{ icon: "user-x", label: "Ban User", color: danger, onPress: () => adminBan(moderateTarget, true) }]
                ),
              ].map((action, i) => (
                <Pressable
                  key={i}
                  onPress={action.onPress}
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", gap: 14,
                    padding: 14, borderRadius: 14, marginBottom: 8,
                    backgroundColor: pressed ? `${action.color}18` : `${action.color}10`,
                    borderWidth: 1, borderColor: `${action.color}30`,
                  })}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${action.color}18`, alignItems: "center", justifyContent: "center" }}>
                    <Feather name={action.icon as any} size={18} color={action.color} />
                  </View>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: action.color }}>{action.label}</Text>
                </Pressable>
              ))}

              <Pressable onPress={() => setModerateTarget(null)} style={{ marginTop: 4, alignItems: "center", paddingVertical: 12 }}>
                <Text style={{ color: txtSec, fontSize: 15, fontFamily: "Inter_400Regular" }}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
