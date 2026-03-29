import React, {
  createContext, useContext, useState, useEffect, useRef,
  useCallback, ReactNode,
} from "react";
import { Platform, AppState } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface IncomingCall {
  from: number;
  fromUsername: string;
  fromDisplayName: string;
  fromAvatar?: string;
  callType: "voice" | "video";
  offer?: RTCSessionDescriptionInit;
}

interface CallContextType {
  incomingCall: IncomingCall | null;
  acceptCall: () => void;
  rejectCall: () => void;
  sendSignal: (to: number, msg: object) => void;
  onSignal: (handler: (msg: any) => void) => () => void;
  isConnected: boolean;
}

const CallContext = createContext<CallContextType>({
  incomingCall: null,
  acceptCall: () => {},
  rejectCall: () => {},
  sendSignal: () => {},
  onSignal: () => () => {},
  isConnected: false,
});

export function useCall() {
  return useContext(CallContext);
}

const WS_RECONNECT_DELAY = 3000;
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export { ICE_SERVERS };

export function CallProvider({ children }: { children: ReactNode }) {
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const signalHandlers = useRef<Set<(msg: any) => void>>(new Set());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCallRef = useRef<IncomingCall | null>(null);

  const getWsUrl = useCallback(async (token: string) => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (!domain) return null;
    const proto = Platform.OS === "web" ? (window.location.protocol === "https:" ? "wss" : "ws") : "wss";
    return `${proto}://${domain}/ws/calls?token=${encodeURIComponent(token)}`;
  }, []);

  const connect = useCallback(async () => {
    const token = await AsyncStorage.getItem("mchat_token");
    if (!token) return;

    const url = await getWsUrl(token);
    if (!url) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    ws.onmessage = async (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        const { type } = msg;

        if (type === "call-offer") {
          const call: IncomingCall = {
            from: msg.from,
            fromUsername: msg.fromUsername ?? "Unknown",
            fromDisplayName: msg.fromDisplayName ?? msg.fromUsername ?? "Unknown",
            fromAvatar: msg.fromAvatar,
            callType: msg.callType ?? "voice",
            offer: msg.offer,
          };
          pendingCallRef.current = call;
          setIncomingCall(call);
        } else if (type === "call-reject" || type === "call-end" || type === "call-busy") {
          setIncomingCall(null);
          pendingCallRef.current = null;
          signalHandlers.current.forEach((h) => h(msg));
        } else {
          signalHandlers.current.forEach((h) => h(msg));
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, WS_RECONNECT_DELAY);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [getWsUrl]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  // Connect when component mounts, reconnect when app comes to foreground
  useEffect(() => {
    connect();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") connect();
    });

    return () => {
      sub.remove();
      disconnect();
    };
  }, [connect, disconnect]);

  const sendSignal = useCallback((to: number, msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ...msg, to }));
    }
  }, []);

  const onSignal = useCallback((handler: (msg: any) => void) => {
    signalHandlers.current.add(handler);
    return () => signalHandlers.current.delete(handler);
  }, []);

  const acceptCall = useCallback(() => {
    const call = pendingCallRef.current;
    if (!call) return;
    setIncomingCall(null);
    pendingCallRef.current = null;
    router.push({
      pathname: "/call/[id]",
      params: {
        id: String(call.from),
        name: call.fromDisplayName,
        username: call.fromUsername,
        callType: call.callType,
        isIncoming: "1",
        offer: call.offer ? JSON.stringify(call.offer) : undefined,
      },
    } as any);
  }, []);

  const rejectCall = useCallback(() => {
    const call = pendingCallRef.current;
    if (call) {
      sendSignal(call.from, { type: "call-reject" });
    }
    setIncomingCall(null);
    pendingCallRef.current = null;
  }, [sendSignal]);

  return (
    <CallContext.Provider value={{ incomingCall, acceptCall, rejectCall, sendSignal, onSignal, isConnected }}>
      {children}
    </CallContext.Provider>
  );
}
