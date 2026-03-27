import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import THEMES, { ThemeName, Theme } from "@/constants/colors";

interface ThemeContextType {
  themeName: ThemeName;
  theme: Theme;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  themeName: "midnight",
  theme: THEMES.midnight,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>("midnight");

  useEffect(() => {
    AsyncStorage.getItem("mchat_theme").then((saved) => {
      if (saved && THEMES[saved as ThemeName]) {
        setThemeName(saved as ThemeName);
      }
    });
  }, []);

  const setTheme = async (name: ThemeName) => {
    setThemeName(name);
    await AsyncStorage.setItem("mchat_theme", name);
  };

  return (
    <ThemeContext.Provider value={{ themeName, theme: THEMES[themeName], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
