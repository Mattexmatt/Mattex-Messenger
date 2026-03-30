import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

let authToken: string | null = null;
let deviceId: string | null = null;

export function initApi(domain: string) {
  setBaseUrl(`https://${domain}`);
}

export function setToken(token: string | null) {
  authToken = token;
  setAuthTokenGetter(() => authToken);
}

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export async function getOrCreateDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  try {
    const stored = Platform.OS === "web"
      ? localStorage.getItem("mchat_device_id")
      : await AsyncStorage.getItem("mchat_device_id");
    if (stored) { deviceId = stored; return stored; }
    const id = generateUUID();
    if (Platform.OS === "web") {
      localStorage.setItem("mchat_device_id", id);
    } else {
      await AsyncStorage.setItem("mchat_device_id", id);
    }
    deviceId = id;
    return id;
  } catch {
    const id = generateUUID();
    deviceId = id;
    return id;
  }
}

export async function apiRequest(path: string, options: RequestInit = {}) {
  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  const dId = await getOrCreateDeviceId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Device-ID": dId,
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}
