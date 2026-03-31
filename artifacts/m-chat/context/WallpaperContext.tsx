import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/utils/api";

export type WallpaperType = "none" | "gradient" | "image";

export interface WallpaperConfig {
  type: WallpaperType;
  value: string;
  opacity: number;
  blur: number;
}

export interface GradientPreset {
  key: string;
  label: string;
  colors: [string, string] | [string, string, string];
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  { key: "sunset",    label: "Sunset",    colors: ["#FF6B6B", "#FFE66D"] },
  { key: "ocean",     label: "Ocean",     colors: ["#005C97", "#363795"] },
  { key: "forest",    label: "Forest",    colors: ["#134E5E", "#71B280"] },
  { key: "rose",      label: "Rose",      colors: ["#FF6FA8", "#A239CA"] },
  { key: "space",     label: "Space",     colors: ["#0F0C29", "#302B63", "#24243E"] },
  { key: "dusk",      label: "Dusk",      colors: ["#2C3E50", "#FD746C"] },
  { key: "mint",      label: "Mint",      colors: ["#00B4DB", "#0083B0"] },
  { key: "gold",      label: "Gold",      colors: ["#F7971E", "#FFD200"] },
  { key: "aurora",    label: "Aurora",    colors: ["#00C9FF", "#92FE9D"] },
  { key: "twilight",  label: "Twilight",  colors: ["#7F00FF", "#E100FF"] },
  { key: "cherry",    label: "Cherry",    colors: ["#EB3349", "#F45C43"] },
  { key: "arctic",    label: "Arctic",    colors: ["#1A2980", "#26D0CE"] },
];

export const DEFAULT_WALLPAPER: WallpaperConfig = {
  type: "none",
  value: "",
  opacity: 85,
  blur: 0,
};

const LOCAL_KEY = "mchat_wallpaper";

interface WallpaperContextType {
  wallpaper: WallpaperConfig;
  setWallpaper: (config: WallpaperConfig, token?: string) => Promise<void>;
  loadWallpaper: (userPrefs?: Partial<WallpaperConfig>, imageUri?: string | null) => void;
}

const WallpaperContext = createContext<WallpaperContextType>({
  wallpaper: DEFAULT_WALLPAPER,
  setWallpaper: async () => {},
  loadWallpaper: () => {},
});

export function WallpaperProvider({ children }: { children: ReactNode }) {
  const [wallpaper, setWallpaperState] = useState<WallpaperConfig>(DEFAULT_WALLPAPER);

  const loadWallpaper = useCallback(async (userPrefs?: Partial<WallpaperConfig>, imageUri?: string | null) => {
    try {
      const localRaw = await AsyncStorage.getItem(LOCAL_KEY);
      const local = localRaw ? JSON.parse(localRaw) : null;

      if (userPrefs?.type && userPrefs.type !== "none") {
        const merged: WallpaperConfig = {
          type: userPrefs.type as WallpaperType,
          value: userPrefs.value ?? "",
          opacity: userPrefs.opacity ?? 85,
          blur: userPrefs.blur ?? 0,
        };
        if (merged.type === "image" && imageUri) {
          merged.value = imageUri;
        } else if (merged.type === "image" && local?.type === "image") {
          merged.value = local.value;
        }
        setWallpaperState(merged);
      } else if (local) {
        setWallpaperState(local);
      } else {
        setWallpaperState(DEFAULT_WALLPAPER);
      }
    } catch {
      setWallpaperState(DEFAULT_WALLPAPER);
    }
  }, []);

  const setWallpaper = useCallback(async (config: WallpaperConfig, token?: string) => {
    setWallpaperState(config);
    try {
      await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(config));
      await apiRequest("/users/me", {
        method: "PUT",
        body: JSON.stringify({
          chatWallpaperType: config.type,
          chatWallpaperValue: config.type === "image" ? "" : config.value,
          chatWallpaperOpacity: config.opacity,
          chatWallpaperBlur: config.blur,
        }),
      });
    } catch {
      // non-fatal
    }
  }, []);

  return (
    <WallpaperContext.Provider value={{ wallpaper, setWallpaper, loadWallpaper }}>
      {children}
    </WallpaperContext.Provider>
  );
}

export function useWallpaper() {
  return useContext(WallpaperContext);
}
