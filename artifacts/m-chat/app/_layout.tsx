import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text, Pressable, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CallProvider, useCall } from "@/context/CallContext";
import { WallpaperProvider, useWallpaper } from "@/context/WallpaperContext";
import BirthdayConfetti from "@/components/BirthdayConfetti";
import { setBaseUrl } from "@workspace/api-client-react";

setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function IncomingCallOverlay() {
  const { incomingCall, acceptCall, rejectCall } = useCall();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  if (!incomingCall) return null;

  return (
    <View
      style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 9999,
        paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 16,
      }}
      pointerEvents="box-none"
    >
      <View style={{
        backgroundColor: "#1a1a2e",
        borderRadius: 20,
        padding: 18,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 20,
        elevation: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}>
        {/* Avatar */}
        <View style={{ position: "relative" }}>
          {incomingCall.fromAvatar ? (
            <Image
              source={{ uri: incomingCall.fromAvatar }}
              style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: theme.primary }}
            />
          ) : (
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontSize: 22, fontFamily: "Inter_600SemiBold" }}>
                {(incomingCall.fromDisplayName ?? incomingCall.fromUsername ?? "?")[0].toUpperCase()}
              </Text>
            </View>
          )}
          {/* Call type icon badge */}
          <View style={{
            position: "absolute", bottom: -2, right: -2,
            width: 20, height: 20, borderRadius: 10,
            backgroundColor: incomingCall.callType === "video" ? "#3b82f6" : "#22c55e",
            alignItems: "center", justifyContent: "center",
            borderWidth: 1.5, borderColor: "#1a1a2e",
          }}>
            <Feather name={incomingCall.callType === "video" ? "video" : "phone"} size={10} color="#fff" />
          </View>
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" }} numberOfLines={1}>
            {incomingCall.fromDisplayName ?? incomingCall.fromUsername}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 }}>
            Incoming {incomingCall.callType} call…
          </Text>
        </View>

        {/* Decline */}
        <Pressable
          onPress={rejectCall}
          style={({ pressed }) => ({
            width: 46, height: 46, borderRadius: 23,
            backgroundColor: pressed ? "#cc1111" : "#ff3333",
            alignItems: "center", justifyContent: "center",
          })}
        >
          <Feather name="phone-off" size={20} color="#fff" />
        </Pressable>

        {/* Accept */}
        <Pressable
          onPress={acceptCall}
          style={({ pressed }) => ({
            width: 46, height: 46, borderRadius: 23,
            backgroundColor: pressed ? "#15803d" : "#22c55e",
            alignItems: "center", justifyContent: "center",
          })}
        >
          <Feather name="phone" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

function BirthdayLayer() {
  const { isBirthday, user } = useAuth();
  const [shown, setShown] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isBirthday && user && !shown) {
      setShown(true);
      setVisible(true);
    }
  }, [isBirthday, user]);

  if (!visible) return null;
  return <BirthdayConfetti onDone={() => setVisible(false)} />;
}

function WallpaperSync() {
  const { user } = useAuth();
  const { loadWallpaper } = useWallpaper();

  useEffect(() => {
    if (user) {
      loadWallpaper({
        type: (user.chatWallpaperType ?? "none") as any,
        value: user.chatWallpaperValue ?? "",
        opacity: user.chatWallpaperOpacity ?? 85,
        blur: user.chatWallpaperBlur ?? 0,
      });
    }
  }, [user?.id]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ presentation: "modal", headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="call/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="my-profile" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="starred" options={{ headerShown: false }} />
        <Stack.Screen name="admin-dashboard" options={{ headerShown: false }} />
      </Stack>
      <IncomingCallOverlay />
      <BirthdayLayer />
      <WallpaperSync />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <WallpaperProvider>
                <CallProvider>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <KeyboardProvider>
                      <RootLayoutNav />
                    </KeyboardProvider>
                  </GestureHandlerRootView>
                </CallProvider>
              </WallpaperProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
