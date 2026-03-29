import React from "react";
import { View, Image, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface Props {
  uri?: string | null;
  name: string;
  size: number;
  showRing?: boolean;
}

export default function OwnerAvatar({ uri, name, size, showRing = true }: Props) {
  const ring = 3;
  const gap = 2;
  const inner = size;
  const outer = inner + (ring + gap) * 2;

  return (
    <View style={{ width: outer, height: outer, alignItems: "center", justifyContent: "center" }}>
      {showRing && (
        <LinearGradient
          colors={["#FFD700", "#FFA500", "#FF8C00", "#FFD700"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{
            position: "absolute", width: outer, height: outer,
            borderRadius: outer / 2,
          }}
        />
      )}
      <View style={{
        width: inner + gap * 2, height: inner + gap * 2,
        borderRadius: (inner + gap * 2) / 2,
        backgroundColor: "#000",
        alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {uri ? (
          <Image source={{ uri }} style={{ width: inner, height: inner, borderRadius: inner / 2 }} />
        ) : (
          <LinearGradient
            colors={["#FFD700", "#FFA500"]}
            style={{ width: inner, height: inner, borderRadius: inner / 2, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#000", fontSize: inner * 0.38, fontFamily: "Inter_700Bold" }}>
              {(name || "?")[0].toUpperCase()}
            </Text>
          </LinearGradient>
        )}
      </View>
    </View>
  );
}
