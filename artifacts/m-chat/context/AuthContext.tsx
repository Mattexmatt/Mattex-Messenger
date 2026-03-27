import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setToken } from "@/utils/api";

export interface UserData {
  id: number;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
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

  useEffect(() => {
    (async () => {
      const savedToken = await AsyncStorage.getItem("mchat_token");
      const savedUser = await AsyncStorage.getItem("mchat_user");
      if (savedToken && savedUser) {
        setToken(savedToken);
        setTokenState(savedToken);
        setUser(JSON.parse(savedUser));
      }
      setIsLoading(false);
    })();
  }, []);

  const login = async (t: string, u: UserData) => {
    await AsyncStorage.setItem("mchat_token", t);
    await AsyncStorage.setItem("mchat_user", JSON.stringify(u));
    setToken(t);
    setTokenState(t);
    setUser(u);
  };

  const logout = async () => {
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
