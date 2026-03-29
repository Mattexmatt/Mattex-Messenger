import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather, Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";

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
      <NativeTabs.Trigger name="ai">
        <Icon sf={{ default: "sparkles", selected: "sparkles" }} />
        <Label>Mattex AI</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calls">
        <Icon sf={{ default: "phone", selected: "phone.fill" }} />
        <Label>Calls</Label>
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
  const { user, token } = useAuth();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  const { data: callLogs } = useQuery<any[]>({
    queryKey: ["call-logs"],
    queryFn: () => apiRequest("/calls"),
    enabled: !!token,
    refetchInterval: 15000,
  });
  const missedCount = callLogs?.filter(l => l.status === "missed" && l.calleeId === user?.id).length ?? 0;

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
        name="ai"
        options={{
          title: "Mattex AI",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="sparkles" tintColor={color} size={24} /> : <Ionicons name="sparkles-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          title: "Calls",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="phone" tintColor={color} size={24} /> : <Feather name="phone" size={22} color={color} />,
          tabBarBadge: missedCount > 0 ? missedCount : undefined,
          tabBarBadgeStyle: { backgroundColor: "#ef4444", fontSize: 11 },
        }}
      />
      <Tabs.Screen
        name="podcasts"
        options={{
          href: null,
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
