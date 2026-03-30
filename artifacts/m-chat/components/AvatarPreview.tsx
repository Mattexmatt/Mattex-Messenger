import React, { useEffect, useRef } from "react";
import {
  Modal, View, Text, Image, Pressable,
  Animated, StatusBar, Platform, ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

interface AvatarPreviewProps {
  visible: boolean;
  onClose: () => void;
  imageSource: { uri: string } | ImageSourcePropType | null;
  name: string;
  subtitle?: string;
}

export default function AvatarPreview({ visible, onClose, imageSource, name, subtitle }: AvatarPreviewProps) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 80, friction: 10, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.88, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!imageSource) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.93)", opacity }}>

        {/* Top bar — name + close */}
        <View style={{
          paddingTop: insets.top + (Platform.OS === "web" ? 72 : 12),
          paddingHorizontal: 16, paddingBottom: 12,
          flexDirection: "row", alignItems: "center", gap: 12,
        }}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" })}
          >
            <Feather name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontFamily: "Inter_600SemiBold", color: "#fff" }} numberOfLines={1}>{name}</Text>
            {subtitle ? (
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "Inter_400Regular", marginTop: 1 }} numberOfLines={1}>{subtitle}</Text>
            ) : null}
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" })}
          >
            <Feather name="x" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Image — centered, animated */}
        <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center" }} onPress={onClose}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Image
              source={imageSource as any}
              style={{ width: 320, height: 320, borderRadius: 12 }}
              resizeMode="cover"
            />
          </Animated.View>
        </Pressable>

        {/* Bottom safe padding */}
        <View style={{ height: insets.bottom + 24 }} />
      </Animated.View>
    </Modal>
  );
}
