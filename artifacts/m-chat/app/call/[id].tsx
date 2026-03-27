import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, Pressable, Animated, Easing, StyleSheet
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import * as Haptics from "expo-haptics";

type CallState = "ringing" | "connecting" | "connected" | "ended";

function useCallTimer(running: boolean) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) { setSecs(0); return; }
    const iv = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [running]);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function PulseRing({ color }: { color: string }) {
  const scale1 = useRef(new Animated.Value(1)).current;
  const scale2 = useRef(new Animated.Value(1)).current;
  const opacity1 = useRef(new Animated.Value(0.5)).current;
  const opacity2 = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const ring = (s: Animated.Value, o: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(s, { toValue: 2.0, duration: 1500, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
            Animated.timing(o, { toValue: 0, duration: 1500, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(s, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(o, { toValue: delay === 0 ? 0.5 : 0.35, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
    const a1 = ring(scale1, opacity1, 0);
    const a2 = ring(scale2, opacity2, 600);
    a1.start(); a2.start();
    return () => { a1.stop(); a2.stop(); };
  }, []);

  return (
    <>
      <Animated.View style={[styles.pulseRing, { backgroundColor: color, transform: [{ scale: scale1 }], opacity: opacity1 }]} />
      <Animated.View style={[styles.pulseRing, { backgroundColor: color, transform: [{ scale: scale2 }], opacity: opacity2 }]} />
    </>
  );
}

function CtrlButton({ icon, label, active, danger, onPress, color }: {
  icon: string; label: string; active?: boolean; danger?: boolean; onPress: () => void; color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ctrlWrap, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[
        styles.ctrlCircle,
        active && !danger && { backgroundColor: color, borderColor: color },
        danger && styles.ctrlDanger,
      ]}>
        <Feather name={icon as any} size={26} color="#fff" />
      </View>
      <Text style={styles.ctrlLabel}>{label}</Text>
    </Pressable>
  );
}

export default function CallScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { name, username, callType } = useLocalSearchParams<{
    id: string; name: string; username: string; callType: string;
  }>();

  const isVideo = callType === "video";
  const [callState, setCallState] = useState<CallState>("ringing");
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(isVideo);
  const [cameraOn, setCameraOn] = useState(isVideo);
  const timerStr = useCallTimer(callState === "connected");

  useEffect(() => {
    const t1 = setTimeout(() => setCallState("connecting"), 2800);
    const t2 = setTimeout(() => setCallState("connected"), 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const handleEnd = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setCallState("ended");
    setTimeout(() => router.back(), 700);
  };

  const statusText = {
    ringing: "Ringing...",
    connecting: "Connecting...",
    connected: timerStr,
    ended: "Call ended",
  }[callState];

  const initials = (name ?? "?")[0].toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: "#0c1220" }}>
      {/* Ambient glow blobs */}
      <View style={[styles.blob, styles.blobTop, { backgroundColor: `${theme.primary}22` }]} />
      <View style={[styles.blob, styles.blobBot, { backgroundColor: `${theme.primary}12` }]} />

      {/* Video bg when camera is on (simulated) */}
      {isVideo && cameraOn && callState === "connected" && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0f1e35", alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="videocam-off-outline" size={40} color="rgba(255,255,255,0.1)" />
        </View>
      )}

      {/* Top bar */}
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 24 }}>
        <Pressable onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="chevron-down" size={22} color="rgba(255,255,255,0.6)" />
          <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular", fontSize: 14 }}>
            {isVideo ? "Video call" : "Voice call"}
          </Text>
        </Pressable>
      </View>

      {/* Avatar + Info */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 20 }}>
        <View style={{ alignItems: "center", justifyContent: "center", width: 120, height: 120 }}>
          {callState === "ringing" && <PulseRing color={theme.primary} />}
          <View style={[styles.avatar, { backgroundColor: `${theme.primary}55`, borderColor: `${theme.primary}99` }]}>
            <Text style={[styles.avatarText]}>{initials}</Text>
          </View>
        </View>

        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={styles.callerName}>{name}</Text>
          {!!username && (
            <Text style={styles.callerUser}>@{username}</Text>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
            {callState === "connected" && (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" }} />
            )}
            <Text style={[
              styles.callStatus,
              callState === "connected" && { color: "#22c55e", fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
            ]}>
              {statusText}
            </Text>
          </View>
        </View>

        {/* Self-view (video only) */}
        {isVideo && callState === "connected" && (
          <View style={[styles.selfView, { borderColor: `${theme.primary}88` }]}>
            <Ionicons name="person-outline" size={28} color="rgba(255,255,255,0.35)" />
            <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 4 }}>You</Text>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 24, gap: 28 }}>
        {/* Top control row */}
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          <CtrlButton
            icon={muted ? "mic-off" : "mic"}
            label={muted ? "Unmute" : "Mute"}
            active={muted}
            color={theme.primary}
            onPress={() => { setMuted(m => !m); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          />
          {isVideo ? (
            <CtrlButton
              icon={cameraOn ? "video" : "video-off"}
              label={cameraOn ? "Cam off" : "Cam on"}
              active={!cameraOn}
              color={theme.primary}
              onPress={() => { setCameraOn(c => !c); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            />
          ) : (
            <CtrlButton
              icon={speakerOn ? "volume-2" : "volume-x"}
              label={speakerOn ? "Speaker" : "Earpiece"}
              active={speakerOn}
              color={theme.primary}
              onPress={() => { setSpeakerOn(s => !s); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            />
          )}
          <CtrlButton
            icon="message-circle"
            label="Message"
            active={false}
            color={theme.primary}
            onPress={() => router.back()}
          />
        </View>

        {/* End call */}
        <View style={{ alignItems: "center" }}>
          <Pressable
            onPress={handleEnd}
            style={({ pressed }) => [styles.endBtn, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Feather name="phone-off" size={30} color="#fff" />
          </Pressable>
          <Text style={{ color: "rgba(255,255,255,0.45)", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 10 }}>
            End call
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  blob: { position: "absolute", borderRadius: 200 },
  blobTop: { width: 360, height: 360, top: -120, left: -80 },
  blobBot: { width: 280, height: 280, bottom: -60, right: -60 },
  pulseRing: { position: "absolute", width: 120, height: 120, borderRadius: 60 },
  avatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, alignItems: "center", justifyContent: "center", zIndex: 1 },
  avatarText: { color: "#fff", fontSize: 48, fontFamily: "Inter_700Bold" },
  callerName: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  callerUser: { color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "Inter_400Regular" },
  callStatus: { color: "rgba(255,255,255,0.6)", fontSize: 15, fontFamily: "Inter_400Regular" },
  selfView: {
    position: "absolute", bottom: 20, right: -130,
    width: 90, height: 130, borderRadius: 14,
    backgroundColor: "#1a2a40", borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  ctrlWrap: { alignItems: "center", gap: 8 },
  ctrlCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  ctrlDanger: { backgroundColor: "#ff4444", borderColor: "#ff4444" },
  ctrlLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular" },
  endBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: "#ff4444",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#ff4444", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 10,
  },
});
