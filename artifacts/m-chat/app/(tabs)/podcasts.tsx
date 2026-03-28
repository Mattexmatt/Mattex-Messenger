import React, { useState, useRef } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, Modal,
  TextInput, ActivityIndicator, Alert, Platform, Image
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";

interface Podcast {
  id: number; title: string; description?: string | null;
  audioUrl: string; thumbnailUrl?: string | null; duration?: number | null; createdAt: string;
}

function formatDuration(secs?: number | null) {
  if (!secs) return "--:--";
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function PodcastsScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [playing, setPlaying] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [posting, setPosting] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const { data: podcasts, isLoading, refetch } = useQuery<Podcast[]>({
    queryKey: ["podcasts"],
    queryFn: () => apiRequest("/podcasts"),
  });

  const playPodcast = async (podcast: Podcast) => {
    if (Platform.OS === "web") {
      Alert.alert("Audio", "Audio playback available in Expo Go on your device");
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (playing === podcast.id) {
        setPlaying(null);
        return;
      }
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: podcast.audioUrl },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            setPosition(status.positionMillis ?? 0);
            setDuration(status.durationMillis ?? 0);
            if (status.didJustFinish) setPlaying(null);
          }
        }
      );
      soundRef.current = sound;
      setPlaying(podcast.id);
    } catch (e) {
      Alert.alert("Error", "Could not play this podcast");
    }
  };

  const handleAddPodcast = async () => {
    if (!title.trim() || !audioUrl.trim()) {
      Alert.alert("Title and audio URL are required");
      return;
    }
    setPosting(true);
    try {
      await apiRequest("/podcasts", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), description: desc.trim() || undefined, audioUrl: audioUrl.trim() }),
      });
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
      setShowAdd(false);
      setTitle(""); setDesc(""); setAudioUrl("");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setPosting(false); }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 14, backgroundColor: theme.background,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    title: { fontSize: 28, fontWeight: "800" as const, color: theme.text, fontFamily: "Inter_700Bold" },
    addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" },
    card: {
      backgroundColor: theme.surface, marginHorizontal: 16, marginVertical: 6,
      borderRadius: 16, padding: 14, flexDirection: "row", gap: 14,
      borderWidth: 1, borderColor: theme.border, alignItems: "center",
    },
    thumbnail: { width: 64, height: 64, borderRadius: 12, backgroundColor: theme.surfaceElevated, alignItems: "center", justifyContent: "center" },
    thumbImg: { width: 64, height: 64, borderRadius: 12 },
    info: { flex: 1 },
    podTitle: { fontSize: 15, fontWeight: "600" as const, color: theme.text, fontFamily: "Inter_600SemiBold" },
    podDesc: { fontSize: 13, color: theme.textSecondary, fontFamily: "Inter_400Regular", marginTop: 4 },
    podMeta: { fontSize: 12, color: theme.textMuted, fontFamily: "Inter_400Regular", marginTop: 6 },
    playBtn: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: theme.primary, alignItems: "center", justifyContent: "center",
    },
    progressBar: {
      height: 3, backgroundColor: theme.border,
      marginHorizontal: 16, marginTop: 2, borderRadius: 2,
    },
    progressFill: { height: 3, backgroundColor: theme.primary, borderRadius: 2 },
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
      borderWidth: 1, borderColor: theme.border, fontFamily: "Inter_400Regular", marginBottom: 14,
    },
    postBtn: { backgroundColor: theme.primary, borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center" },
    postBtnText: { color: theme.isDark ? "#000" : "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
    cancelBtn: { marginTop: 12, alignItems: "center" },
    cancelText: { color: theme.textSecondary, fontSize: 15 },
    grabber: { width: 40, height: 4, backgroundColor: theme.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  });

  const renderPodcast = ({ item }: { item: Podcast }) => {
    const isNowPlaying = playing === item.id;
    const prog = isNowPlaying && duration > 0 ? position / duration : 0;
    return (
      <View>
        <View style={s.card}>
          <View style={s.thumbnail}>
            {item.thumbnailUrl ? (
              <Image source={{ uri: item.thumbnailUrl }} style={s.thumbImg} />
            ) : (
              <Ionicons name="headset" size={28} color={theme.primary} />
            )}
          </View>
          <View style={s.info}>
            <Text style={s.podTitle} numberOfLines={2}>{item.title}</Text>
            {item.description && <Text style={s.podDesc} numberOfLines={1}>{item.description}</Text>}
            <Text style={s.podMeta}>{formatDate(item.createdAt)} · {formatDuration(item.duration)}</Text>
          </View>
          <Pressable style={s.playBtn} onPress={() => playPodcast(item)}>
            <Ionicons name={isNowPlaying ? "pause" : "play"} size={22} color={theme.isDark ? "#000" : "#fff"} />
          </Pressable>
        </View>
        {isNowPlaying && (
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${prog * 100}%` }]} />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Podcasts</Text>
        {user?.isOwner && (
          <Pressable style={s.addBtn} onPress={() => setShowAdd(true)}>
            <Feather name="plus" size={20} color={theme.isDark ? "#000" : "#fff"} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={s.emptyWrap}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={podcasts ?? []}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderPodcast}
          onRefresh={refetch}
          refreshing={false}
          scrollEnabled={!!(podcasts?.length)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80, paddingTop: 4 }}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="headset-outline" size={56} color={theme.textMuted} />
              <Text style={s.emptyText}>No podcasts yet</Text>
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>Allan Matt Tech will publish content here</Text>
            </View>
          }
        />
      )}

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <Pressable style={s.modal} onPress={() => setShowAdd(false)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation?.()}>
            <View style={s.grabber} />
            <Text style={s.sheetTitle}>Add Podcast Episode</Text>
            <Text style={s.inputLabel}>Title</Text>
            <TextInput style={s.input} placeholder="Episode title" placeholderTextColor={theme.textMuted} value={title} onChangeText={setTitle} />
            <Text style={s.inputLabel}>Description (optional)</Text>
            <TextInput style={s.input} placeholder="What's this episode about?" placeholderTextColor={theme.textMuted} value={desc} onChangeText={setDesc} multiline />
            <Text style={s.inputLabel}>Audio URL</Text>
            <TextInput style={s.input} placeholder="https://..." placeholderTextColor={theme.textMuted} value={audioUrl} onChangeText={setAudioUrl} autoCapitalize="none" />
            <Pressable style={s.postBtn} onPress={handleAddPodcast} disabled={posting}>
              {posting ? <ActivityIndicator color={theme.isDark ? "#000" : "#fff"} /> : <Text style={s.postBtnText}>Publish Episode</Text>}
            </Pressable>
            <Pressable style={s.cancelBtn} onPress={() => setShowAdd(false)}>
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
