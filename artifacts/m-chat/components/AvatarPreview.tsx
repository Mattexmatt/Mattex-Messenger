import React, { useEffect, useRef } from "react";
import {
  Modal, View, Text, Image, Pressable,
  Animated, Platform, ImageSourcePropType, useWindowDimensions,
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
  const { width: screenWidth } = useWindowDimensions();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  const imgSize = Math.min(screenWidth - 80, 220);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 100, friction: 12, useNativeDriver: true }),
      ]).start();
    } else {
      opacity.setValue(0);
      scale.setValue(0.92);
    }
  }, [visible]);

  if (!imageSource) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.82)", alignItems: "center", justifyContent: "center" }} onPress={onClose}>
        <Animated.View
          style={{ alignItems: "center", opacity, transform: [{ scale }] }}
          onStartShouldSetResponder={() => true}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Image */}
          <Image
            source={imageSource as any}
            style={{ width: imgSize, height: imgSize, borderRadius: imgSize / 2, borderWidth: 3, borderColor: "rgba(255,255,255,0.15)" }}
            resizeMode="cover"
          />

          {/* Name + subtitle */}
          <View style={{ marginTop: 16, alignItems: "center", gap: 3 }}>
            <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" }}>{name}</Text>
            {subtitle ? (
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular" }}>{subtitle}</Text>
            ) : null}
          </View>
        </Animated.View>

        {/* Close button */}
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={({ pressed }) => ({
            position: "absolute",
            top: insets.top + (Platform.OS === "web" ? 72 : 14),
            right: 16,
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: pressed ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.1)",
            alignItems: "center", justifyContent: "center",
          })}
        >
          <Feather name="x" size={18} color="#fff" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
