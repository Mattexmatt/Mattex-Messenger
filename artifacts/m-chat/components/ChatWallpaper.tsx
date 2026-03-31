import React, { memo } from "react";
import { View, Image, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, Pattern, Rect, Path as SvgPath, Circle as SvgCircle } from "react-native-svg";
import { useWallpaper, GRADIENT_PRESETS } from "@/context/WallpaperContext";

interface Props {
  isDark: boolean;
}

const ChatWallpaper = memo(function ChatWallpaper({ isDark }: Props) {
  const { wallpaper } = useWallpaper();

  if (wallpaper.type === "gradient") {
    const preset = GRADIENT_PRESETS.find(p => p.key === wallpaper.value);
    if (!preset) return <DefaultPattern isDark={isDark} />;
    return (
      <>
        <DefaultPattern isDark={isDark} />
        <LinearGradient
          colors={preset.colors as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { opacity: wallpaper.opacity / 100 }]}
        />
      </>
    );
  }

  if (wallpaper.type === "image" && wallpaper.value) {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <Image
          source={{ uri: wallpaper.value }}
          style={[StyleSheet.absoluteFillObject, { opacity: wallpaper.opacity / 100 }]}
          resizeMode="cover"
          blurRadius={Platform.OS !== "web" ? wallpaper.blur : 0}
        />
      </View>
    );
  }

  return <DefaultPattern isDark={isDark} />;
});

function DefaultPattern({ isDark }: { isDark: boolean }) {
  const bg = isDark ? "#0a131a" : "#dfe7ec";
  const stroke = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
  const dot = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="cwp" x="0" y="0" width="52" height="52" patternUnits="userSpaceOnUse">
            <SvgPath d="M26 3L49 26L26 49L3 26Z" stroke={stroke} strokeWidth="1" fill="none" />
            <SvgCircle cx="26" cy="26" r="2" fill={dot} />
            <SvgCircle cx="1" cy="1" r="1" fill={dot} />
            <SvgCircle cx="51" cy="1" r="1" fill={dot} />
            <SvgCircle cx="1" cy="51" r="1" fill={dot} />
            <SvgCircle cx="51" cy="51" r="1" fill={dot} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#cwp)" />
      </Svg>
    </View>
  );
}

export default ChatWallpaper;
