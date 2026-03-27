import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather, Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "message", selected: "message.fill" }} />
        <Label>Chats</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="memes">
        <Icon sf={{ default: "photo", selected: "photo.fill" }} />
        <Label>Memes</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="podcasts">
        <Icon sf={{ default: "headphones", selected: "headphones" }} />
        <Label>Podcasts</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "dot.radiowaves.left.and.right", selected: "dot.radiowaves.left.and.right" }} />
        <Label>Updates</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const { theme } = useTheme();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.tabActive,
        tabBarInactiveTintColor: theme.tabInactive,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : theme.tabBar,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: theme.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint={theme.isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.tabBar }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="message" tintColor={color} size={24} /> : <Feather name="message-circle" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="memes"
        options={{
          title: "Memes",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="photo" tintColor={color} size={24} /> : <Ionicons name="images-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="podcasts"
        options={{
          title: "Podcasts",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="headphones" tintColor={color} size={24} /> : <Ionicons name="headset-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Updates",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="dot.radiowaves.left.and.right" tintColor={color} size={24} /> : <Ionicons name="radio-outline" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
