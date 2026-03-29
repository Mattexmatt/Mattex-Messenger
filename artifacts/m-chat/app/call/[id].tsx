import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, Pressable, Animated, Easing, StyleSheet,
  Platform, Alert, Image,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useCall, ICE_SERVERS } from "@/context/CallContext";
import * as Haptics from "expo-haptics";

// ─── Timer ─────────────────────────────────────────────────────────────────────
function useCallTimer(running: boolean) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) { setSecs(0); return; }
    const iv = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [running]);
  return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
}

// ─── Pulse Ring ────────────────────────────────────────────────────────────────
function PulseRing({ color }: { color: string }) {
  const scale1 = useRef(new Animated.Value(1)).current;
  const scale2 = useRef(new Animated.Value(1)).current;
  const opacity1 = useRef(new Animated.Value(0.5)).current;
  const opacity2 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const ring = (sv: Animated.Value, ov: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(sv, { toValue: 2.4, duration: 1600, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(ov, { toValue: 0, duration: 1600, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(sv, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(ov, { toValue: delay === 0 ? 0.5 : 0.3, duration: 0, useNativeDriver: true }),
        ]),
      ]));
    const a1 = ring(scale1, opacity1, 0);
    const a2 = ring(scale2, opacity2, 700);
    a1.start(); a2.start();
    return () => { a1.stop(); a2.stop(); };
  }, []);

  return (
    <>
      <Animated.View style={[st.pulseRing, { backgroundColor: color, transform: [{ scale: scale1 }], opacity: opacity1 }]} />
      <Animated.View style={[st.pulseRing, { backgroundColor: color, transform: [{ scale: scale2 }], opacity: opacity2 }]} />
    </>
  );
}

// ─── Control Button ────────────────────────────────────────────────────────────
function CtrlBtn({ icon, label, active, onPress }: {
  icon: string; label: string; active?: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.ctrlWrap, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[st.ctrlCircle, active && st.ctrlActive]}>
        <Feather name={icon as any} size={24} color="#fff" />
      </View>
      <Text style={st.ctrlLabel}>{label}</Text>
    </Pressable>
  );
}

type CallState = "calling" | "ringing" | "connecting" | "connected" | "ended";

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function CallScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { sendSignal, onSignal } = useCall();

  const {
    id: otherIdParam,
    name,
    username,
    callType: callTypeParam,
    isIncoming,
    offer: offerParam,
    avatarUrl,
  } = useLocalSearchParams<{
    id: string; name: string; username: string; callType: string;
    isIncoming?: string; offer?: string; avatarUrl?: string;
  }>();

  const otherId = Number(otherIdParam);
  const isVideo = callTypeParam === "video";
  const incoming = isIncoming === "1";

  const [callState, setCallState] = useState<CallState>(incoming ? "connecting" : "calling");
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(isVideo);
  const [cameraOn, setCameraOn] = useState(isVideo);
  const [hasRemote, setHasRemote] = useState(false);

  const timerStr = useCallTimer(callState === "connected");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const hungUpRef = useRef(false);

  const isWebRTC = Platform.OS === "web" && typeof RTCPeerConnection !== "undefined";

  const hangup = useCallback((notifyRemote = true) => {
    if (hungUpRef.current) return;
    hungUpRef.current = true;
    if (notifyRemote) sendSignal(otherId, { type: "call-end" });
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setCallState("ended");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setTimeout(() => { if (router.canGoBack()) router.back(); }, 900);
  }, [otherId, sendSignal]);

  const buildPC = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS as RTCIceServer[] });

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(otherId, { type: "ice-candidate", candidate: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;
      setHasRemote(true);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") {
        setCallState("connected");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else if (st === "failed" || st === "disconnected") {
        hangup(false);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [otherId, sendSignal, hangup]);

  const getMedia = useCallback(async (): Promise<MediaStream | null> => {
    if (!isWebRTC) return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current && isVideo) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch(() => {});
      }
      return stream;
    } catch (err: any) {
      Alert.alert("Permission Error", err.message ?? "Could not access microphone/camera.");
      return null;
    }
  }, [isWebRTC, isVideo]);

  // Outgoing call
  useEffect(() => {
    if (incoming) return;

    if (!isWebRTC) {
      setCallState("ringing");
      return;
    }

    let mounted = true;
    (async () => {
      const pc = buildPC();
      const stream = await getMedia();
      if (!mounted) return;
      if (!stream) { hangup(false); return; }

      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendSignal(otherId, {
        type: "call-offer",
        callType: callTypeParam,
        fromDisplayName: user?.displayName,
        fromUsername: user?.username,
        fromAvatar: user?.avatarUrl,
        offer: pc.localDescription,
      });
      if (mounted) setCallState("ringing");
    })();

    return () => { mounted = false; };
  }, []);

  // Incoming call
  useEffect(() => {
    if (!incoming) return;

    if (!isWebRTC) {
      setCallState("connected");
      return;
    }

    let mounted = true;
    (async () => {
      const pc = buildPC();
      const stream = await getMedia();
      if (!mounted) return;
      if (!stream) { hangup(false); return; }

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      if (offerParam) {
        try {
          const offerObj = JSON.parse(offerParam);
          await pc.setRemoteDescription(new RTCSessionDescription(offerObj));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(otherId, { type: "call-answer", answer: pc.localDescription });
          if (mounted) setCallState("connecting");
        } catch (err: any) {
          hangup(false);
        }
      }
    })();

    return () => { mounted = false; };
  }, []);

  // Signal messages
  useEffect(() => {
    const unsub = onSignal(async (msg: any) => {
      const pc = pcRef.current;

      if (msg.type === "call-answer" && msg.answer && pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
          setCallState("connecting");
        } catch {}
      } else if (msg.type === "ice-candidate" && msg.candidate && pc) {
        try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch {}
      } else if (msg.type === "call-reject") {
        Alert.alert("Call Declined", `${name ?? username} declined your call`);
        hangup(false);
      } else if (msg.type === "call-end") {
        hangup(false);
      }
    });
    return unsub;
  }, [onSignal, name, username, hangup]);

  // Controls
  const toggleMute = () => {
    setMuted(m => {
      const next = !m;
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const toggleCamera = () => {
    setCameraOn(c => {
      const next = !c;
      localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = next; });
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const accentColor = isVideo ? "#6366f1" : theme.primary;

  const stateLabel: Record<CallState, string> = {
    calling: "Calling…",
    ringing: "Ringing…",
    connecting: "Connecting…",
    connected: timerStr,
    ended: "Call ended",
  };

  return (
    <View style={[st.screen, { backgroundColor: "#0f172a" }]}>

      {/* Remote video (web + video calls) */}
      {isVideo && Platform.OS === "web" && (
        <video
          ref={remoteVideoRef as any}
          autoPlay
          playsInline
          style={{
            position: "absolute", inset: 0 as any,
            width: "100%" as any, height: "100%" as any,
            objectFit: "cover" as any, zIndex: 0,
            display: hasRemote ? "block" : "none",
          } as any}
        />
      )}

      {/* Dark gradient overlay */}
      <View style={[StyleSheet.absoluteFill, { zIndex: 1, justifyContent: "flex-end" }]}>
        <View style={{ height: 280, backgroundColor: "rgba(0,0,0,0.6)" }} />
      </View>

      <View style={[st.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32, zIndex: 2 }]}>

        {/* Header bar */}
        <View style={st.topBar}>
          <Pressable onPress={() => hangup()} style={st.downBtn}>
            <Feather name="chevron-down" size={30} color="rgba(255,255,255,0.65)" />
          </Pressable>
          <Text style={st.topTitle}>{isVideo ? "Video Call" : "Voice Call"}</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Avatar zone */}
        <View style={st.avatarZone}>
          <View style={st.avatarContainer}>
            {(callState === "calling" || callState === "ringing") && (
              <PulseRing color={accentColor} />
            )}
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={st.avatar} />
            ) : (
              <View style={[st.avatar, { backgroundColor: accentColor, alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: "#fff", fontSize: 42, fontFamily: "Inter_700Bold" }}>
                  {((name ?? username) ?? "?")[0].toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={st.callerName} numberOfLines={1}>{name ?? username}</Text>
          <Text style={st.callStatus}>{stateLabel[callState]}</Text>
        </View>

        <View style={{ flex: 1 }} />

        {/* Local video pip */}
        {isVideo && Platform.OS === "web" && (
          <View style={st.localPip} pointerEvents="none">
            <video
              ref={localVideoRef as any}
              autoPlay
              playsInline
              muted
              style={{ width: "100%" as any, height: "100%" as any, objectFit: "cover" as any, borderRadius: 12, transform: "scaleX(-1)" as any } as any}
            />
          </View>
        )}

        {/* Controls */}
        <View style={st.controls}>
          <View style={st.controlRow}>
            <CtrlBtn icon={muted ? "mic-off" : "mic"} label={muted ? "Unmute" : "Mute"} active={muted} onPress={toggleMute} />
            <CtrlBtn icon={speakerOn ? "volume-2" : "volume-x"} label="Speaker" active={speakerOn} onPress={() => { setSpeakerOn(v => !v); }} />
            {isVideo && (
              <CtrlBtn icon={cameraOn ? "video" : "video-off"} label="Camera" active={!cameraOn} onPress={toggleCamera} />
            )}
          </View>

          <Pressable
            onPress={() => hangup()}
            style={({ pressed }) => [st.endBtn, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Feather name="phone-off" size={30} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, alignItems: "center" },
  topBar: {
    width: "100%", flexDirection: "row",
    alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12,
  },
  downBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topTitle: { color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "Inter_500Medium" },
  avatarZone: { alignItems: "center", marginTop: 44, gap: 16 },
  avatarContainer: { width: 130, height: 130, alignItems: "center", justifyContent: "center" },
  pulseRing: { position: "absolute", width: 130, height: 130, borderRadius: 65 },
  avatar: { width: 118, height: 118, borderRadius: 59, borderWidth: 3, borderColor: "rgba(255,255,255,0.2)" },
  callerName: {
    color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold",
    textAlign: "center", paddingHorizontal: 24,
  },
  callStatus: { color: "rgba(255,255,255,0.5)", fontSize: 15, fontFamily: "Inter_400Regular" },
  localPip: {
    position: "absolute", right: 20, bottom: 210,
    width: 100, height: 140, borderRadius: 12,
    overflow: "hidden", backgroundColor: "#1e293b",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.15)",
  },
  controls: { width: "100%", alignItems: "center", gap: 28, paddingHorizontal: 24 },
  controlRow: { flexDirection: "row", gap: 28, justifyContent: "center" },
  ctrlWrap: { alignItems: "center", gap: 8, minWidth: 72 },
  ctrlCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  ctrlActive: { backgroundColor: "rgba(255,255,255,0.28)" },
  ctrlLabel: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: "Inter_400Regular" },
  endBtn: {
    width: 74, height: 74, borderRadius: 37,
    backgroundColor: "#ef4444",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#ef4444", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55, shadowRadius: 14, elevation: 10,
  },
});
