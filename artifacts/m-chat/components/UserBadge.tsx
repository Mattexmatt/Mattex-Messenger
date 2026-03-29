import React from "react";
import { View, Text } from "react-native";

type BadgeSize = "sm" | "md" | "lg";

interface Props {
  isOwner: boolean;
  role?: string;
  size?: BadgeSize;
}

const SIZES: Record<BadgeSize, { fontSize: number; px: number; py: number; radius: number; gap: number }> = {
  sm: { fontSize: 9,  px: 5,  py: 2,  radius: 5,  gap: 3 },
  md: { fontSize: 11, px: 7,  py: 3,  radius: 6,  gap: 4 },
  lg: { fontSize: 13, px: 10, py: 4,  radius: 8,  gap: 5 },
};

export default function UserBadge({ isOwner, role, size = "sm" }: Props) {
  const s = SIZES[size];

  if (isOwner) {
    return (
      <View style={{
        flexDirection: "row", alignItems: "center", gap: s.gap,
        backgroundColor: "#FFD70022",
        borderWidth: 1, borderColor: "#FFD70055",
        paddingHorizontal: s.px, paddingVertical: s.py,
        borderRadius: s.radius,
      }}>
        <Text style={{ fontSize: s.fontSize + 1 }}>👑</Text>
        <Text style={{ fontSize: s.fontSize, fontFamily: "Inter_700Bold", color: "#FFD700", letterSpacing: 0.3 }}>
          OWNER
        </Text>
      </View>
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
        <Text style={{ fontSize: s.fontSize + 1 }}>💎</Text>
        <Text style={{ fontSize: s.fontSize, fontFamily: "Inter_700Bold", color: "#A855F7", letterSpacing: 0.3 }}>
          VIP
        </Text>
      </View>
    );
  }

  return null;
}
