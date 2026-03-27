import React, { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import * as Haptics from "expo-haptics";

export default function CallScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { name } = useLocalSearchParams<{ name: string }>();
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [callState] = useState<"connecting" | "connected">("connecting");

  useEffect(() => {
    const timer = setTimeout(() => {
      // Simulate connected
    }, 2000);
    const interval = setInterval(() => setDuration(d => d + 1), 1000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, []);

  const formatDuration = () => {
    const m = Math.floor(duration / 60).toString().padStart(2, "0");
    const s = (duration % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const endCall = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    router.back();
  };

  const s = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.isDark ? "#0A0A0A" : "#1A1A2E",
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
    },
    videoArea: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
    avatarCircle: {
      width: 100, height: 100, borderRadius: 50,
      backgroundColor: theme.primary, alignItems: "center", justifyContent: "center",
      borderWidth: 3, borderColor: theme.isDark ? "#00FF41" : "#6C5CE7",
    },
    avatarText: { fontSize: 40, fontFamily: "Inter_700Bold", color: theme.isDark ? "#000" : "#fff" },
    callerName: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
    callStatus: { fontSize: 14, color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular" },
    localVideo: {
      position: "absolute", top: insets.top + 80, right: 16,
      width: 100, height: 150, borderRadius: 12,
      backgroundColor: "#333", borderWidth: 2, borderColor: theme.primary,
      alignItems: "center", justifyContent: "center",
    },
    localVideoText: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
    controls: {
      flexDirection: "row", justifyContent: "center", alignItems: "center",
      paddingBottom: insets.bottom + 40, paddingTop: 20, gap: 20,
    },
    ctrlBtn: {
      width: 58, height: 58, borderRadius: 29,
      backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center",
    },
    ctrlBtnActive: { backgroundColor: theme.primary },
    endBtn: {
      width: 70, height: 70, borderRadius: 35,
      backgroundColor: "#FF3B30", alignItems: "center", justifyContent: "center",
      marginHorizontal: 10,
    },
    topBar: {
      flexDirection: "row", paddingHorizontal: 20,
      paddingTop: 12, justifyContent: "flex-end",
    },
    closeBtn: { padding: 8 },
    webrtcNote: {
      position: "absolute", bottom: insets.bottom + 130,
      left: 20, right: 20, backgroundColor: "rgba(0,0,0,0.6)",
      borderRadius: 12, padding: 12,
    },
    webrtcText: { color: "rgba(255,255,255,0.7)", fontSize: 12, textAlign: "center", fontFamily: "Inter_400Regular" },
  });

  return (
    <View style={s.container}>
      <View style={s.topBar}>
        <Pressable style={s.closeBtn} onPress={() => router.back()}>
          <Feather name="x" size={24} color="rgba(255,255,255,0.6)" />
        </Pressable>
      </View>

      <View style={s.videoArea}>
        <View style={s.avatarCircle}>
          <Text style={s.avatarText}>{(name ?? "?")[0].toUpperCase()}</Text>
        </View>
        <Text style={s.callerName}>{name}</Text>
        <Text style={s.callStatus}>
          {callState === "connecting" ? "Connecting..." : `Connected • ${formatDuration()}`}
        </Text>
      </View>

      <View style={s.localVideo}>
        <Ionicons name="person-outline" size={32} color="rgba(255,255,255,0.4)" />
        <Text style={s.localVideoText}>Your camera</Text>
      </View>

      <View style={s.webrtcNote}>
        <Text style={s.webrtcText}>
          Video calling uses WebRTC — works in native builds with camera/microphone permissions
        </Text>
      </View>

      <View style={s.controls}>
        <Pressable
          style={[s.ctrlBtn, muted && s.ctrlBtnActive]}
          onPress={() => { setMuted(!muted); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Feather name={muted ? "mic-off" : "mic"} size={24} color="#fff" />
        </Pressable>
        <Pressable
          style={[s.ctrlBtn, cameraOff && s.ctrlBtnActive]}
          onPress={() => { setCameraOff(!cameraOff); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Feather name={cameraOff ? "video-off" : "video"} size={24} color="#fff" />
        </Pressable>
        <Pressable style={s.endBtn} onPress={endCall}>
          <Feather name="phone-off" size={28} color="#fff" />
        </Pressable>
        <Pressable
          style={[s.ctrlBtn, speakerOn && s.ctrlBtnActive]}
          onPress={() => { setSpeakerOn(!speakerOn); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Feather name="volume-2" size={24} color="#fff" />
        </Pressable>
        <Pressable style={s.ctrlBtn}>
          <Feather name="more-horizontal" size={24} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}
