import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import THEMES, { ThemeName, Theme } from "@/constants/colors";

export type DisplayMode = "system" | "light" | "dark";

const DARK_THEMES: ThemeName[] = ["midnight", "synthwave", "cyberpunk", "ocean", "volcanic", "galaxy", "arctic"];

interface ThemeContextType {
  themeName: ThemeName;
  theme: Theme;
  setTheme: (name: ThemeName) => void;
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  themeName: "midnight",
  theme: THEMES.midnight,
  setTheme: () => {},
  displayMode: "system",
  setDisplayMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [darkThemeName, setDarkThemeName] = useState<ThemeName>("midnight");
  const [displayMode, setDisplayModeState] = useState<DisplayMode>("system");

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem("mchat_theme"),
      AsyncStorage.getItem("mchat_display_mode"),
    ]).then(([savedTheme, savedMode]) => {
      if (savedTheme && DARK_THEMES.includes(savedTheme as ThemeName)) {
        setDarkThemeName(savedTheme as ThemeName);
      }
      if (savedMode && ["system", "light", "dark"].includes(savedMode)) {
        setDisplayModeState(savedMode as DisplayMode);
      }
    });
  }, []);

  const resolvedThemeName: ThemeName = (() => {
    if (displayMode === "light") return "light";
    if (displayMode === "dark") return darkThemeName;
    return systemColorScheme === "light" ? "light" : darkThemeName;
  })();

  const setTheme = async (name: ThemeName) => {
    if (DARK_THEMES.includes(name)) {
      setDarkThemeName(name);
      await AsyncStorage.setItem("mchat_theme", name);
    }
  };

  const setDisplayMode = async (mode: DisplayMode) => {
    setDisplayModeState(mode);
    await AsyncStorage.setItem("mchat_display_mode", mode);
  };

  return (
    <ThemeContext.Provider value={{
      themeName: resolvedThemeName,
      theme: THEMES[resolvedThemeName],
      setTheme,
      displayMode,
      setDisplayMode,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
