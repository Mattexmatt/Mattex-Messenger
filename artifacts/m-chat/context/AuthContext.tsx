import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startHeartbeat = () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    // Send immediately, then every 30s
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

  useEffect(() => {
    (async () => {
      const savedToken = await AsyncStorage.getItem("mchat_token");
      const savedUser = await AsyncStorage.getItem("mchat_user");
      if (savedToken && savedUser) {
        setToken(savedToken);
        setTokenState(savedToken);
        setUser(JSON.parse(savedUser));
        // Start heartbeat once token is loaded
        setTimeout(startHeartbeat, 500);
      }
      setIsLoading(false);
    })();

    return () => stopHeartbeat();
  }, []);

  const login = async (t: string, u: UserData) => {
    await AsyncStorage.setItem("mchat_token", t);
    await AsyncStorage.setItem("mchat_user", JSON.stringify(u));
    setToken(t);
    setTokenState(t);
    setUser(u);
    startHeartbeat();
  };

  const logout = async () => {
    stopHeartbeat();
    await AsyncStorage.removeItem("mchat_token");
    await AsyncStorage.removeItem("mchat_user");
    setToken(null);
    setTokenState(null);
    setUser(null);
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
