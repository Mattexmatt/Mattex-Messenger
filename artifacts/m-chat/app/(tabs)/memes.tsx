import React, { useState } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, TextInput,
  Image, Modal, ActivityIndicator, Platform, ScrollView, Alert
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons, AntDesign } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

interface MemeUser {
  id: number; username: string; displayName: string; avatarUrl?: string | null; isOwner: boolean; createdAt: string;
}
interface Meme {
  id: number; imageUrl: string; caption?: string | null;
  likesCount: number; isLiked: boolean; author?: MemeUser; createdAt: string;
}

function formatAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

export default function MemesScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showPost, setShowPost] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [newCaption, setNewCaption] = useState("");
  const [posting, setPosting] = useState(false);

  const { data: memes, isLoading, refetch } = useQuery<Meme[]>({
    queryKey: ["memes", token],
    queryFn: () => apiRequest("/memes"),
    refetchInterval: 15000,
  });

  const handleLike = async (meme: Meme) => {
    if (!token) { Alert.alert("Sign in to like memes"); return; }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Optimistic update
    queryClient.setQueryData<Meme[]>(["memes", token], (old) =>
      (old ?? []).map(m => m.id === meme.id ? { ...m, isLiked: !m.isLiked, likesCount: m.isLiked ? m.likesCount - 1 : m.likesCount + 1 } : m)
    );
    try {
      await apiRequest(`/memes/${meme.id}/like`, { method: "POST" });
    } catch {
      queryClient.invalidateQueries({ queryKey: ["memes"] });
    }
  };

  const handlePost = async () => {
    if (!newImageUrl.trim()) { Alert.alert("Please enter an image URL"); return; }
    setPosting(true);
    try {
      await apiRequest("/memes", {
        method: "POST",
        body: JSON.stringify({ imageUrl: newImageUrl.trim(), caption: newCaption.trim() || undefined }),
      });
      queryClient.invalidateQueries({ queryKey: ["memes"] });
      setShowPost(false);
      setNewImageUrl("");
      setNewCaption("");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setPosting(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 14, backgroundColor: theme.background,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    title: { fontSize: 28, fontWeight: "800" as const, color: theme.text, fontFamily: "Inter_700Bold" },
    addBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: theme.primary, alignItems: "center", justifyContent: "center",
    },
    card: {
      backgroundColor: theme.surface, marginHorizontal: 16, marginVertical: 8,
      borderRadius: 16, overflow: "hidden" as const,
      borderWidth: 1, borderColor: theme.border,
    },
    cardHeader: {
      flexDirection: "row", alignItems: "center", padding: 12, gap: 10,
    },
    avatarSmall: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: theme.primary, alignItems: "center", justifyContent: "center",
    },
    avatarSmallText: { color: theme.isDark ? "#000" : "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
    authorName: { fontSize: 14, fontWeight: "600" as const, color: theme.text, fontFamily: "Inter_600SemiBold" },
    timeText: { fontSize: 12, color: theme.textMuted, fontFamily: "Inter_400Regular" },
    memeImg: { width: "100%", height: 280, backgroundColor: theme.surfaceElevated },
    cardFooter: { padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    caption: { fontSize: 14, color: theme.text, fontFamily: "Inter_400Regular", marginHorizontal: 12, marginBottom: 8 },
    likeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    likesText: { fontSize: 14, color: theme.textSecondary, fontFamily: "Inter_500Medium" },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
    emptyText: { color: theme.textSecondary, fontSize: 16, fontFamily: "Inter_400Regular" },
    modal: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 24,
    },
    sheetTitle: { fontSize: 20, fontWeight: "700" as const, color: theme.text, fontFamily: "Inter_700Bold", marginBottom: 20 },
    inputLabel: { fontSize: 13, color: theme.textSecondary, fontFamily: "Inter_500Medium", marginBottom: 8 },
    input: {
      backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14,
      paddingVertical: 12, fontSize: 15, color: theme.text,
      borderWidth: 1, borderColor: theme.border, fontFamily: "Inter_400Regular", marginBottom: 16,
    },
    postBtn: {
      backgroundColor: theme.primary, borderRadius: 14, height: 52,
      alignItems: "center", justifyContent: "center",
    },
    postBtnText: { color: theme.isDark ? "#000" : "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
    cancelBtn: { marginTop: 12, alignItems: "center" },
    cancelText: { color: theme.textSecondary, fontSize: 15, fontFamily: "Inter_400Regular" },
    grabber: { width: 40, height: 4, backgroundColor: theme.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  });

  const renderMeme = ({ item }: { item: Meme }) => (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.avatarSmall}>
          <Text style={s.avatarSmallText}>{(item.author?.displayName ?? "?")[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.authorName}>{item.author?.displayName ?? "Unknown"}</Text>
          <Text style={s.timeText}>{formatAgo(item.createdAt)}</Text>
        </View>
      </View>
      <Image source={{ uri: item.imageUrl }} style={s.memeImg} resizeMode="cover" />
      {item.caption && <Text style={s.caption}>{item.caption}</Text>}
      <View style={s.cardFooter}>
        <Pressable style={s.likeRow} onPress={() => handleLike(item)}>
          <AntDesign name={item.isLiked ? "heart" : "hearto"} size={22} color={item.isLiked ? "#FF4757" : theme.textSecondary} />
          <Text style={[s.likesText, item.isLiked && { color: "#FF4757" }]}>{item.likesCount}</Text>
        </Pressable>
        <Pressable>
          <Feather name="share-2" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Memes</Text>
        {!!token && (
          <Pressable style={s.addBtn} onPress={() => setShowPost(true)}>
            <Feather name="plus" size={20} color={theme.isDark ? "#000" : "#fff"} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={s.emptyWrap}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={memes ?? []}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderMeme}
          onRefresh={refetch}
          refreshing={false}
          scrollEnabled={!!(memes?.length)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="images-outline" size={56} color={theme.textMuted} />
              <Text style={s.emptyText}>No memes yet</Text>
              {!!token && <Text style={{ color: theme.textMuted, fontSize: 13 }}>Tap + to post the first one!</Text>}
            </View>
          }
        />
      )}

      <Modal visible={showPost} animationType="slide" transparent onRequestClose={() => setShowPost(false)}>
        <Pressable style={s.modal} onPress={() => setShowPost(false)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation?.()}>

            <View style={s.grabber} />
            <Text style={s.sheetTitle}>Post a Meme</Text>
            <Text style={s.inputLabel}>Image URL</Text>
            <TextInput
              style={s.input}
              placeholder="https://..."
              placeholderTextColor={theme.textMuted}
              value={newImageUrl}
              onChangeText={setNewImageUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={s.inputLabel}>Caption (optional)</Text>
            <TextInput
              style={s.input}
              placeholder="Add a funny caption..."
              placeholderTextColor={theme.textMuted}
              value={newCaption}
              onChangeText={setNewCaption}
              multiline
            />
            <Pressable style={s.postBtn} onPress={handlePost} disabled={posting}>
              {posting ? <ActivityIndicator color={theme.isDark ? "#000" : "#fff"} /> : <Text style={s.postBtnText}>Post Meme</Text>}
            </Pressable>
            <Pressable style={s.cancelBtn} onPress={() => setShowPost(false)}>
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
