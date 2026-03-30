import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, TextInput, FlatList, Platform,
  ActivityIndicator, Alert, Pressable, ScrollView,
  Animated, Easing, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import { router } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachedImageUri?: string;
  generatedImage?: { data: string; mimeType: string };
  isVoice?: boolean;
  createdAt?: string;
}

const SUGGESTIONS = [
  { icon: "zap", label: "Quick summary", prompt: "Give me a quick summary of what you can help me with" },
  { icon: "edit-3", label: "Help me write", prompt: "Help me write a short professional message" },
  { icon: "code", label: "Write code", prompt: "Help me write a simple function in JavaScript" },
  { icon: "image", label: "Generate image", prompt: "Generate an image of a futuristic city at night with neon lights" },
  { icon: "globe", label: "Explain this", prompt: "Explain how AI language models work in simple terms" },
  { icon: "trending-up", label: "Productivity", prompt: "Give me your best productivity tip for today" },
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
    const make = (a: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(a, { toValue: 1, duration: 380, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 380, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(360),
      ]));
    const loops = [make(anims[0], 0), make(anims[1], 180), make(anims[2], 360)];
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, []);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6 }}>
      {anims.map((a, i) => (
        <Animated.View key={i} style={{
          width: 8, height: 8, borderRadius: 4, backgroundColor: color,
          transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.25] }) }],
          opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
        }} />
      ))}
    </View>
  );
}

function RecordingTimer({ color }: { color: string }) {
  const [seconds, setSeconds] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.3, duration: 600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    anim.start();
    return () => { clearInterval(t); anim.stop(); };
  }, []);
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444", transform: [{ scale: pulse }] }} />
      <Text style={{ color, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>{m}:{s}</Text>
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
  const [pendingImage, setPendingImage] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [processingVoice, setProcessingVoice] = useState(false);
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

  // ── Image picker ──────────────────────────────────────────────
  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow access to photos to attach images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? "image/jpeg";
      const base64 = asset.base64 ?? "";
      setPendingImage({ uri: asset.uri, base64, mimeType });
    }
  }, []);

  // ── Voice recording ───────────────────────────────────────────
  const startRecording = useCallback(async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow microphone access to use voice input.");
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await rec.startAsync();
    setRecording(rec);
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recording) return;
    setIsRecording(false);
    setProcessingVoice(true);
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) throw new Error("No audio URI");

      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });

      // Add a placeholder user voice message
      const voiceUserMsg: Message = {
        id: `vu-${Date.now()}`,
        role: "user",
        content: "🎤 Voice message (transcribing…)",
        isVoice: true,
      };
      setMessages(prev => [...prev, voiceUserMsg]);
      setLoading(true);
      scrollToEnd();

      const { transcript, reply } = await apiRequest("/mattex/transcribe", {
        method: "POST",
        body: JSON.stringify({ audioBase64: b64, mimeType: "audio/m4a" }),
      });

      // Replace placeholder with real transcript
      setMessages(prev => prev.map(m =>
        m.id === voiceUserMsg.id ? { ...m, content: `🎤 "${transcript}"` } : m
      ));
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => prev.filter(m => !m.isVoice || m.content !== "🎤 Voice message (transcribing…)"));
      Alert.alert("Voice error", "Could not process your voice message. Please try again.");
    } finally {
      setLoading(false);
      setProcessingVoice(false);
      scrollToEnd();
    }
  }, [recording, scrollToEnd]);

  // ── Send text (± image) ───────────────────────────────────────
  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if ((!msg && !pendingImage) || loading) return;
    const displayText = msg || "What's in this image?";

    setInput("");
    const imgSnapshot = pendingImage;
    setPendingImage(null);

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: displayText,
      attachedImageUri: imgSnapshot?.uri,
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    scrollToEnd();

    try {
      const body: any = { message: displayText };
      if (imgSnapshot) {
        body.imageBase64 = imgSnapshot.base64;
        body.imageMimeType = imgSnapshot.mimeType;
      }

      const data = await apiRequest("/mattex/chat", { method: "POST", body: JSON.stringify(body) });

      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.reply,
        generatedImage: data.generatedImage,
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  }, [input, pendingImage, loading, scrollToEnd]);

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
            setPendingImage(null);
          } catch {
            Alert.alert("Error", "Could not clear history.");
          } finally { setClearing(false); }
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
          <View style={{ maxWidth: "80%", gap: 6 }}>
            {item.attachedImageUri && (
              <Image
                source={{ uri: item.attachedImageUri }}
                style={{ width: 200, height: 150, borderRadius: 14, alignSelf: "flex-end" }}
                resizeMode="cover"
              />
            )}
            {item.content ? (
              <View style={{
                backgroundColor: theme.surface, borderRadius: 22, borderBottomRightRadius: 6,
                paddingHorizontal: 16, paddingVertical: 11,
                borderWidth: 1, borderColor: theme.border,
              }}>
                <Text style={{ fontSize: 15, color: theme.text, fontFamily: item.isVoice ? "Inter_500Medium" : "Inter_400Regular", lineHeight: 22 }}>
                  {item.content}
                </Text>
              </View>
            ) : null}
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
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.primary }}>Mattex AI</Text>
          {item.content ? (
            <Text style={{ fontSize: 15, color: theme.text, fontFamily: "Inter_400Regular", lineHeight: 24 }}>
              {item.content}
            </Text>
          ) : null}
          {item.generatedImage && (
            <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: theme.border }}>
              <Image
                source={{ uri: `data:${item.generatedImage.mimeType};base64,${item.generatedImage.data}` }}
                style={{ width: "100%", aspectRatio: 1 }}
                resizeMode="cover"
              />
              <View style={{ padding: 8, backgroundColor: `${theme.primary}10`, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="image" size={12} color={theme.primary} />
                <Text style={{ fontSize: 11, color: theme.primary, fontFamily: "Inter_500Medium" }}>Generated by Mattex AI</Text>
              </View>
            </View>
          )}
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
          <LinearGradient colors={["#8B5CF6", "#6366F1", "#3B82F6"]} style={{ width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
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
            <Text style={{ fontSize: 11, color: theme.primary, fontFamily: "Inter_400Regular" }}>Vision · Voice · Image Gen</Text>
          </View>
        </View>
        {hasMessages && (
          <Pressable
            onPress={clearHistory} disabled={clearing}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 12, backgroundColor: pressed ? `${theme.primary}20` : `${theme.primary}10`, alignItems: "center", justifyContent: "center" })}
            hitSlop={8}
          >
            {clearing ? <ActivityIndicator size="small" color={theme.primary} /> : <Feather name="trash-2" size={16} color={theme.primary} />}
          </Pressable>
        )}
      </View>

      {/* ── Loading ── */}
      {!historyLoaded ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
          <LinearGradient colors={["#8B5CF6", "#6366F1", "#3B82F6"]} style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 26, color: "#fff" }}>✦</Text>
          </LinearGradient>
          <ActivityIndicator color={theme.primary} />
          <Text style={{ color: theme.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" }}>Loading conversations…</Text>
        </View>
      ) : !hasMessages ? (
        /* ── WELCOME STATE ── */
        <ScrollView contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 120 : insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
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
            {/* Capability badges */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
              {[{ icon: "image", label: "Attach photo" }, { icon: "mic", label: "Voice input" }, { icon: "cpu", label: "Image gen" }].map(c => (
                <View key={c.label} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: `${theme.primary}12`, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: `${theme.primary}25` }}>
                  <Feather name={c.icon as any} size={12} color={theme.primary} />
                  <Text style={{ fontSize: 12, color: theme.primary, fontFamily: "Inter_500Medium" }}>{c.label}</Text>
                </View>
              ))}
            </View>
          </View>
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
            (loading || processingVoice) ? (
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

      {/* ── Pending image preview ── */}
      {pendingImage && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={{ position: "relative", alignSelf: "flex-start" }}>
            <Image source={{ uri: pendingImage.uri }} style={{ width: 80, height: 80, borderRadius: 12, borderWidth: 2, borderColor: theme.primary }} resizeMode="cover" />
            <Pressable
              onPress={() => setPendingImage(null)}
              style={{ position: "absolute", top: -8, right: -8, width: 22, height: 22, borderRadius: 11, backgroundColor: theme.danger, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="x" size={12} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Input bar ── */}
      <View style={{
        paddingHorizontal: 16, paddingTop: 8,
        paddingBottom: Platform.OS === "web" ? 96 : Math.max(insets.bottom + 8, 16),
        backgroundColor: theme.background,
      }}>
        {isRecording ? (
          /* Recording state */
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 12,
            backgroundColor: theme.surface, borderRadius: 28,
            borderWidth: 1.5, borderColor: "#EF444466",
            paddingHorizontal: 18, paddingVertical: 14,
          }}>
            <RecordingTimer color={theme.text} />
            <Text style={{ flex: 1, color: theme.textMuted, fontFamily: "Inter_400Regular", fontSize: 14 }}>Recording… tap ■ to send</Text>
            <Pressable
              onPress={stopRecording}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" }}
            >
              <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: "#fff" }} />
            </Pressable>
          </View>
        ) : (
          /* Normal input */
          <View style={{
            flexDirection: "row", alignItems: "flex-end", gap: 8,
            backgroundColor: theme.surface, borderRadius: 28,
            borderWidth: 1.5,
            borderColor: input.trim() || pendingImage ? `${theme.primary}66` : theme.border,
            paddingHorizontal: 6, paddingVertical: 6,
          }}>
            {/* Image attach button */}
            <Pressable
              onPress={pickImage}
              style={({ pressed }) => ({
                width: 38, height: 38, borderRadius: 19, marginBottom: 1,
                backgroundColor: pressed ? `${theme.primary}30` : `${theme.primary}12`,
                alignItems: "center", justifyContent: "center",
              })}
            >
              <Feather name="image" size={17} color={theme.primary} />
            </Pressable>

            <TextInput
              ref={inputRef}
              style={{
                flex: 1, fontSize: 15, color: theme.text,
                maxHeight: 120, minHeight: 36,
                fontFamily: "Inter_400Regular",
                paddingTop: Platform.OS === "ios" ? 9 : 6,
                paddingBottom: Platform.OS === "ios" ? 9 : 6,
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

            {/* Mic button (only shown when input is empty and no image pending) */}
            {!input.trim() && !pendingImage ? (
              <Pressable
                onPress={startRecording}
                disabled={loading || processingVoice}
                style={({ pressed }) => ({
                  width: 38, height: 38, borderRadius: 19, marginBottom: 1,
                  backgroundColor: pressed ? `${theme.primary}40` : `${theme.primary}20`,
                  alignItems: "center", justifyContent: "center",
                  opacity: loading || processingVoice ? 0.4 : 1,
                })}
              >
                <Feather name="mic" size={17} color={theme.primary} />
              </Pressable>
            ) : (
              /* Send button */
              <Pressable
                onPress={() => sendMessage()}
                disabled={(!input.trim() && !pendingImage) || loading}
                style={({ pressed }) => ({
                  width: 38, height: 38, borderRadius: 19, marginBottom: 1,
                  backgroundColor: (input.trim() || pendingImage) && !loading ? theme.primary : `${theme.primary}30`,
                  alignItems: "center", justifyContent: "center",
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                {loading
                  ? <ActivityIndicator size="small" color={theme.primary} />
                  : <Feather name="arrow-up" size={18} color={(input.trim() || pendingImage) ? theme.background : theme.textMuted} />
                }
              </Pressable>
            )}
          </View>
        )}
        <Text style={{ textAlign: "center", fontSize: 10, color: theme.textMuted, fontFamily: "Inter_400Regular", marginTop: 7 }}>
          Mattex AI · Vision, Voice & Image Generation
        </Text>
      </View>
    </View>
  );
}
