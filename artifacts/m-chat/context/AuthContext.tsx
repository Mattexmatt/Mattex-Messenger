import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { setToken, apiRequest } from "@/utils/api";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionWsRef = useRef<WebSocket | null>(null);
  const sessionWsReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

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
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      return;
    }

    sessionWsRef.current = ws;

    ws.onopen = () => {};

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string };
        if (msg.type === "force_logout") {
          if (!mountedRef.current) return;
          doLogout();
          setTimeout(() => {
            try { router.replace("/(auth)/login"); } catch {}
          }, 100);
        }
      } catch {}
    };

    ws.onclose = (event) => {
      if (sessionWsRef.current === ws) sessionWsRef.current = null;
      if (!mountedRef.current) return;
      if (event.code === 1000) return;
      const t = tokenRef.current;
      if (t) {
        sessionWsReconnectRef.current = setTimeout(() => {
          const cur = tokenRef.current;
          if (cur && mountedRef.current) connectSessionWs(cur);
        }, 5000);
      }
    };

    ws.onerror = () => {};
  };

  const doLogout = async () => {
    stopHeartbeat();
    disconnectSessionWs();
    tokenRef.current = null;
    await AsyncStorage.removeItem("mchat_token");
    await AsyncStorage.removeItem("mchat_user");
    setToken(null);
    setTokenState(null);
    setUser(null);
  };

  useEffect(() => {
    mountedRef.current = true;
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
        registerForPushNotifications().then((pt) => {
          if (pt) sendPushTokenToServer(pt);
        });
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
    registerForPushNotifications().then((pt) => {
      if (pt) sendPushTokenToServer(pt);
    });
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
