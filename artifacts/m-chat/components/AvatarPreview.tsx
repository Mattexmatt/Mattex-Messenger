import React, { useEffect, useRef, useState } from "react";
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

  const compact = Math.min(screenWidth - 80, 220);
  const full = screenWidth;

  const opacity = useRef(new Animated.Value(0)).current;
  const entryScale = useRef(new Animated.Value(0.92)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(false);

  // Interpolated values driven by expandAnim (0 = compact, 1 = full)
  const imgWidth  = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [compact, full] });
  const imgHeight = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [compact, full] });
  const radius    = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [compact / 2, 0] });
  const labelOp   = expandAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 0, 0] });
  const bgOp      = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 0.97] });

  useEffect(() => {
    if (visible) {
      setExpanded(false);
      expandAnim.setValue(0);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(entryScale, { toValue: 1, tension: 100, friction: 12, useNativeDriver: true }),
      ]).start();
    } else {
      opacity.setValue(0);
      entryScale.setValue(0.92);
      expandAnim.setValue(0);
      setExpanded(false);
    }
  }, [visible]);

  const handleImagePress = () => {
    if (expanded) {
      // Collapse back
      Animated.spring(expandAnim, { toValue: 0, tension: 90, friction: 12, useNativeDriver: false }).start();
      setExpanded(false);
    } else {
      // Expand
      Animated.spring(expandAnim, { toValue: 1, tension: 90, friction: 12, useNativeDriver: false }).start();
      setExpanded(true);
    }
  };

  if (!imageSource) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: "black", opacity: bgOp }}>
        <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center" }} onPress={expanded ? handleImagePress : onClose}>

          {/* Image container */}
          <Animated.View
            style={{ transform: [{ scale: entryScale }], alignItems: "center" }}
            onStartShouldSetResponder={() => true}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <Pressable onPress={handleImagePress} style={{ alignItems: "center" }}>
              <Animated.Image
                source={imageSource as any}
                style={{
                  width: imgWidth,
                  height: imgHeight,
                  borderRadius: radius,
                  borderWidth: expanded ? 0 : 3,
                  borderColor: "rgba(255,255,255,0.15)",
                }}
                resizeMode="cover"
              />
            </Pressable>

            {/* Name + subtitle — fade out on expand */}
            <Animated.View style={{ marginTop: 16, alignItems: "center", gap: 3, opacity: labelOp }}>
              <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" }}>{name}</Text>
              {subtitle ? (
                <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular" }}>{subtitle}</Text>
              ) : null}
            </Animated.View>
          </Animated.View>
        </Pressable>

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
      </Animated.View>
    </Modal>
  );
}
