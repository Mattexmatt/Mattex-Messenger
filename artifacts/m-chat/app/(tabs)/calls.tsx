import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, ActivityIndicator,
  RefreshControl, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

interface CallLog {
  id: number;
  callerId: number;
  calleeId: number;
  type: "audio" | "video";
  status: "missed" | "completed" | "rejected" | "cancelled";
  duration: number;
  createdAt: string;
  caller: { id: number; displayName: string; username: string; avatarUrl?: string | null } | null;
  otherUser: { id: number; displayName: string; username: string; avatarUrl?: string | null } | null;
}

function formatDuration(secs?: number | null) {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTime(date: string) {
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function groupByDate(logs: CallLog[]) {
  const groups: { label: string; data: CallLog[] }[] = [];
  const dateMap: Record<string, CallLog[]> = {};

  for (const log of logs) {
    const d = new Date(log.createdAt);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    let label: string;
    if (diffDays === 0) label = "Today";
    else if (diffDays === 1) label = "Yesterday";
    else if (diffDays < 7) label = d.toLocaleDateString([], { weekday: "long" });
    else label = d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });

    if (!dateMap[label]) { dateMap[label] = []; groups.push({ label, data: dateMap[label] }); }
    dateMap[label].push(log);
  }

  return groups;
}

export default function CallsTab() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: logs, isLoading } = useQuery<CallLog[]>({
    queryKey: ["call-logs"],
    queryFn: () => apiRequest("/calls"),
    refetchInterval: 15000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["call-logs"] });
    setRefreshing(false);
  }, [queryClient]);

  const groups = logs ? groupByDate(logs) : [];
  const flatData: (CallLog | { type: "header"; label: string })[] = [];
  for (const group of groups) {
    flatData.push({ type: "header", label: group.label });
    flatData.push(...group.data);
  }

  const isDark = !!(theme as any).isDark;

  const renderItem = ({ item }: { item: CallLog | { type: "header"; label: string } }) => {
    if ("type" in item && item.type === "header") {
      return (
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: theme.textMuted, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {item.label}
        </Text>
      );
    }

    const log = item as CallLog;
    const isOutgoing = log.callerId === user?.id;
    const other = log.otherUser;
    const isMissed = log.status === "missed";
    const iconColor = isMissed ? "#ef4444" : isOutgoing ? theme.primary : "#22c55e";

    return (
      <Pressable
        onPress={() => {
          if (other) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        }}
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center",
          paddingHorizontal: 20, paddingVertical: 12,
          backgroundColor: pressed ? theme.surfaceElevated : "transparent",
          gap: 14,
        })}
      >
        <View style={{ position: "relative" }}>
          {other?.avatarUrl ? (
            <Image source={{ uri: other.avatarUrl }} style={{ width: 52, height: 52, borderRadius: 26 }} />
          ) : (
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: `${theme.primary}22`, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: theme.primary }}>
                {(other?.displayName ?? "?")[0]?.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: theme.text }} numberOfLines={1}>
            {other?.displayName ?? "Unknown"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Feather
              name={isOutgoing ? "arrow-up-right" : "arrow-down-left"}
              size={13}
              color={iconColor}
            />
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: isMissed ? "#ef4444" : theme.textSecondary }}>
              {log.type === "video" ? "Video call" : "Voice call"}
              {log.status === "missed" ? " · Missed" : log.status === "rejected" ? " · Declined" : log.status === "cancelled" ? " · Cancelled" : ""}
              {log.duration ? ` · ${formatDuration(log.duration)}` : ""}
            </Text>
          </View>
        </View>

        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>
            {formatTime(log.createdAt)}
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
            style={{ padding: 2 }}
          >
            <Feather name={log.type === "video" ? "video" : "phone"} size={18} color={theme.primary} />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 12,
        paddingBottom: 12,
        paddingHorizontal: 20,
        backgroundColor: theme.background,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <Text style={{ fontSize: 28, fontFamily: "Inter_700Bold", color: theme.text }}>Calls</Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable style={{ padding: 4 }}>
            <Feather name="phone-missed" size={22} color={theme.primary} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : flatData.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: `${theme.primary}15`, alignItems: "center", justifyContent: "center" }}>
            <Feather name="phone" size={36} color={theme.textMuted} />
          </View>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: theme.text }}>No calls yet</Text>
          <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textSecondary, textAlign: "center", lineHeight: 20 }}>
            Your call history will appear here. Open a chat and tap the phone icon to start a call.
          </Text>
        </View>
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={(item, i) => ("type" in item && item.type === "header" ? `h-${item.label}` : `log-${(item as CallLog).id}`)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        />
      )}

      {/* Missed calls badge */}
      {(logs?.filter(l => l.status === "missed" && l.calleeId === user?.id).length ?? 0) > 0 && (
        <View style={{
          position: "absolute", bottom: insets.bottom + 104, right: 20,
          backgroundColor: "#ef4444", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
          flexDirection: "row", alignItems: "center", gap: 6,
          shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
        }}>
          <Feather name="phone-missed" size={14} color="#fff" />
          <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
            {logs!.filter(l => l.status === "missed" && l.calleeId === user?.id).length} missed
          </Text>
        </View>
      )}
    </View>
  );
}
