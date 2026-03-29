import React from "react";
import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type BadgeSize = "sm" | "md" | "lg";

interface Props {
  isOwner: boolean;
  role?: string;
  size?: BadgeSize;
}

const SIZES: Record<BadgeSize, { fontSize: number; px: number; py: number; radius: number; gap: number; icon: number }> = {
  sm: { fontSize: 9,  px: 6,  py: 2,  radius: 6,  gap: 3, icon: 10 },
  md: { fontSize: 11, px: 8,  py: 3,  radius: 7,  gap: 4, icon: 12 },
  lg: { fontSize: 14, px: 12, py: 5,  radius: 10, gap: 6, icon: 16 },
};

export default function UserBadge({ isOwner, role, size = "sm" }: Props) {
  const s = SIZES[size];

  if (isOwner) {
    return (
      <LinearGradient
        colors={["#FFD700", "#FFA500", "#FF8C00"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{
          flexDirection: "row", alignItems: "center", gap: s.gap,
          paddingHorizontal: s.px, paddingVertical: s.py,
          borderRadius: s.radius,
        }}
      >
        <Text style={{ fontSize: s.icon }}>👑</Text>
        <Text style={{ fontSize: s.fontSize, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 0.5 }}>
          FOUNDER
        </Text>
      </LinearGradient>
    );
  }

  if (role === "vip") {
    return (
      <View style={{
        flexDirection: "row", alignItems: "center", gap: s.gap,
        backgroundColor: "#A855F722",
        borderWidth: 1, borderColor: "#A855F755",
        paddingHorizontal: s.px, paddingVertical: s.py,
        borderRadius: s.radius,
      }}>
        <Text style={{ fontSize: s.icon }}>💎</Text>
        <Text style={{ fontSize: s.fontSize, fontFamily: "Inter_700Bold", color: "#A855F7", letterSpacing: 0.3 }}>
          VIP
        </Text>
      </View>
    );
  }

  return null;
}
