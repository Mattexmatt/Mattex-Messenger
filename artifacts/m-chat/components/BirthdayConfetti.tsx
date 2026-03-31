import React, { useEffect, useRef, memo } from "react";
import { View, Animated, Easing, Dimensions, StyleSheet, Platform } from "react-native";

const { width: SW, height: SH } = Dimensions.get("window");

const COLORS = ["#FF6B6B", "#FFE66D", "#C77DFF", "#4FC3F7", "#52B788", "#FFB74D", "#F77F00", "#FF4D6D", "#4CC9F0"];
const COUNT = 60;

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

interface Particle {
  x: number;
  color: string;
  size: number;
  duration: number;
  delay: number;
  rotate: number;
  shape: "rect" | "circle";
  anim: Animated.Value;
  rotAnim: Animated.Value;
}

const ConfettiParticle = memo(({ p }: { p: Particle }) => {
  const translateY = p.anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, SH + 40],
  });
  const opacity = p.anim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 0.9, 0],
  });
  const rotate = p.rotAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", `${p.rotate}deg`],
  });

  const shapeStyle = p.shape === "circle"
    ? { width: p.size, height: p.size, borderRadius: p.size / 2, backgroundColor: p.color }
    : { width: p.size, height: p.size * 0.5, borderRadius: 2, backgroundColor: p.color };

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        { transform: [{ translateX: p.x }, { translateY }, { rotate }], opacity },
        shapeStyle,
      ]}
    />
  );
});

export default function BirthdayConfetti({ onDone }: { onDone?: () => void }) {
  const particles = useRef<Particle[]>([]);

  if (particles.current.length === 0) {
    for (let i = 0; i < COUNT; i++) {
      particles.current.push({
        x: randomBetween(0, SW),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: randomBetween(6, 14),
        duration: randomBetween(2400, 4000),
        delay: randomBetween(0, 1800),
        rotate: randomBetween(360, 1080) * (Math.random() > 0.5 ? 1 : -1),
        shape: Math.random() > 0.5 ? "rect" : "circle",
        anim: new Animated.Value(0),
        rotAnim: new Animated.Value(0),
      });
    }
  }

  useEffect(() => {
    const anims = particles.current.map(p =>
      Animated.parallel([
        Animated.timing(p.anim, {
          toValue: 1,
          duration: p.duration,
          delay: p.delay,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(p.rotAnim, {
          toValue: 1,
          duration: p.duration,
          delay: p.delay,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );

    Animated.stagger(30, anims).start(() => {
      onDone?.();
    });

    return () => anims.forEach(a => a.stop());
  }, []);

  if (Platform.OS === "web") return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { zIndex: 9999 }]}>
      {particles.current.map((p, i) => (
        <ConfettiParticle key={i} p={p} />
      ))}
    </View>
  );
}
