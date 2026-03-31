import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { setToken, apiRequest } from "@/utils/api";
import { setupNotifications } from "@/utils/notificationSetup";

export interface UserData {
  id: number;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  hobbies?: string | null;
  status?: string | null;
  statusUpdatedAt?: string | null;
  isOwner: boolean;
  role?: string;
  email?: string | null;
  emailVerified?: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: UserData | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: UserData) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: UserData) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  updateUser: () => {},
});

// Show notifications even when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!Device.isDevice) return null;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
  }
}

async function sendPushTokenToServer(pushToken: string) {
  try {
    await apiRequest("/sessions/push-token", {
      method: "PUT",
      body: JSON.stringify({ expoPushToken: pushToken }),
    });
  } catch {}
}

// Handle Quick Reply, Mark as Read, and notification-tap navigation
function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const { actionIdentifier, notification, userText } = response as Notifications.NotificationResponse & { userText?: string };
  const data = notification.request.content.data as Record<string, string> | undefined;
  if (!data) return;

  const { type, conversationId, memeId } = data;

  if (actionIdentifier === "REPLY" && conversationId && userText?.trim()) {
    apiRequest(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: userText.trim(), type: "text" }),
    }).catch(() => {});
    return;
  }

  if (actionIdentifier === "MARK_READ" && conversationId) {
    apiRequest(`/conversations/${conversationId}/read`, { method: "POST" }).catch(() => {});
    return;
  }

  if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER || actionIdentifier === "VIEW") {
    if (type === "message" && conversationId) {
      setTimeout(() => {
        try { router.push({ pathname: "/chat/[id]", params: { id: conversationId } }); } catch {}
      }, 300);
    } else if (type === "meme" || memeId) {
      setTimeout(() => {
        try { router.push("/(tabs)/memes"); } catch {}
      }, 300);
    } else if (type === "new_login") {
      setTimeout(() => {
        try { router.push("/settings"); } catch {}
      }, 300);
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionWsRef = useRef<WebSocket | null>(null);
  const sessionWsReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const notifListenersRef = useRef<{ remove: () => void }[]>([]);

  const startHeartbeat = () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    apiRequest("/presence/heartbeat", { method: "POST" }).catch(() => {});
    heartbeatRef.current = setInterval(() => {
      apiRequest("/presence/heartbeat", { method: "POST" }).catch(() => {});
    }, 30_000);
  };

  const stopHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  const disconnectSessionWs = () => {
    if (sessionWsReconnectRef.current) {
      clearTimeout(sessionWsReconnectRef.current);
      sessionWsReconnectRef.current = null;
    }
    if (sessionWsRef.current) {
      try { sessionWsRef.current.close(1000, "Logout"); } catch {}
      sessionWsRef.current = null;
    }
  };

  const connectSessionWs = (t: string) => {
    if (Platform.OS === "web" && typeof WebSocket === "undefined") return;
    disconnectSessionWs();

    const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
    if (!domain) return;
    const wsUrl = `wss://${domain}/ws/sessions?token=${encodeURIComponent(t)}`;

    let ws: WebSocket;
    try { ws = new WebSocket(wsUrl); } catch { return; }

    sessionWsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string };
        if (msg.type === "force_logout") {
          if (!mountedRef.current) return;
          doLogout();
          setTimeout(() => { try { router.replace("/(auth)/login"); } catch {} }, 100);
        }
      } catch {}
    };

    ws.onclose = (event) => {
      if (sessionWsRef.current === ws) sessionWsRef.current = null;
      if (!mountedRef.current || event.code === 1000) return;
      const cur = tokenRef.current;
      if (cur) {
        sessionWsReconnectRef.current = setTimeout(() => {
          const latest = tokenRef.current;
          if (latest && mountedRef.current) connectSessionWs(latest);
        }, 5000);
      }
    };

    ws.onerror = () => {};
  };

  const doLogout = async () => {
    stopHeartbeat();
    disconnectSessionWs();
    removeNotifListeners();
    tokenRef.current = null;
    await AsyncStorage.removeItem("mchat_token");
    await AsyncStorage.removeItem("mchat_user");
    setToken(null);
    setTokenState(null);
    setUser(null);
  };

  const removeNotifListeners = () => {
    for (const l of notifListenersRef.current) { try { l.remove(); } catch {} }
    notifListenersRef.current = [];
  };

  const attachNotifListeners = () => {
    removeNotifListeners();
    // Response listener: fires when user taps or acts on a notification (foreground, background, killed)
    const responseListener = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    notifListenersRef.current.push(responseListener);
  };

  const initPush = async (t: string) => {
    const pt = await registerForPushNotifications();
    if (pt) sendPushTokenToServer(pt);
  };

  useEffect(() => {
    mountedRef.current = true;

    // Set up notification channels + categories before requesting permission
    setupNotifications().catch(() => {});

    (async () => {
      const savedToken = await AsyncStorage.getItem("mchat_token");
      const savedUser = await AsyncStorage.getItem("mchat_user");
      if (savedToken && savedUser) {
        tokenRef.current = savedToken;
        setToken(savedToken);
        setTokenState(savedToken);
        const cached: UserData = JSON.parse(savedUser);
        setUser(cached);
        setTimeout(startHeartbeat, 500);
        connectSessionWs(savedToken);
        attachNotifListeners();
        initPush(savedToken);
        try {
          const fresh = await apiRequest("/users/me");
          const merged: UserData = { ...cached, ...fresh };
          if (mountedRef.current) setUser(merged);
          await AsyncStorage.setItem("mchat_user", JSON.stringify(merged));
        } catch {}
      }
      if (mountedRef.current) setIsLoading(false);
    })();

    return () => {
      mountedRef.current = false;
      stopHeartbeat();
      disconnectSessionWs();
      removeNotifListeners();
    };
  }, []);

  const login = async (t: string, u: UserData) => {
    await AsyncStorage.setItem("mchat_token", t);
    await AsyncStorage.setItem("mchat_user", JSON.stringify(u));
    tokenRef.current = t;
    setToken(t);
    setTokenState(t);
    setUser(u);
    startHeartbeat();
    connectSessionWs(t);
    attachNotifListeners();
    initPush(t);
  };

  const logout = async () => {
    await doLogout();
  };

  const updateUser = (u: UserData) => {
    setUser(u);
    AsyncStorage.setItem("mchat_user", JSON.stringify(u));
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
