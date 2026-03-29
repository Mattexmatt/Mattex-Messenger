import React, { useState } from "react";
import {
  View, Text, ScrollView, Pressable, TextInput,
  Image, Modal, ActivityIndicator, Alert, Platform, RefreshControl
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

interface AdminStats {
  users: { total: number; banned: number; vip: number; newToday: number };
  messages: { total: number; today: number; thisWeek: number };
  conversations: { total: number };
  memes: { total: number; official: number; flagged: number; removed: number };
  generatedAt: string;
}

interface AdminUser {
  id: number; username: string; displayName: string; avatarUrl?: string | null;
  isOwner: boolean; role: string; warnCount: number; isBanned: boolean;
  createdAt: string; messageCount: number;
}

function StatCard({ label, value, sub, color, icon }: { label: string; value: number | string; sub?: string; color: string; icon: string }) {
  return (
    <View style={{ flex: 1, minWidth: 130, backgroundColor: `${color}10`, borderRadius: 16, borderWidth: 1.5, borderColor: `${color}25`, padding: 16, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${color}20`, alignItems: "center", justifyContent: "center" }}>
          <Feather name={icon as any} size={16} color={color} />
        </View>
      </View>
      <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color, marginTop: 4 }}>{value}</Text>
      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color, opacity: 0.8 }}>{label}</Text>
      {sub && <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color, opacity: 0.6 }}>{sub}</Text>}
    </View>
  );
}

export default function AdminDashboard() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const isDark = !!(theme as any).isDark;

  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastCaption, setBroadcastCaption] = useState("");
  const [broadcastImage, setBroadcastImage] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [actingOn, setActingOn] = useState<number | null>(null);

  const txt = theme.text; const txtMut = theme.textMuted; const txtSec = theme.textSecondary;
  const surf = theme.surface; const border = theme.border; const bg = theme.background;
  const primary = theme.primary; const danger = (theme as any).danger ?? "#ef4444";
  const success = (theme as any).success ?? "#22c55e";

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => apiRequest("/admin/stats"),
    refetchInterval: 30000,
  });

  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: () => apiRequest("/admin/users"),
  });

  const filteredUsers = (users ?? []).filter(u =>
    !userSearch.trim() ||
    u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.username.toLowerCase().includes(userSearch.toLowerCase())
  );

  const patchUser = async (id: number, patch: object, successMsg: string) => {
    setActingOn(id);
    try {
      await apiRequest(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await refetchUsers();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Done", successMsg);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Action failed.");
    } finally {
      setActingOn(null);
      setSelectedUser(null);
    }
  };

  const pickBroadcastImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, base64: true });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      if (a.base64) {
        const ext = a.mimeType?.includes("png") ? "png" : "jpeg";
        setBroadcastImage(`data:image/${ext};base64,${a.base64}`);
      } else if (a.uri) setBroadcastImage(a.uri);
    }
  };

  const sendBroadcast = async () => {
    if (!broadcastImage) { Alert.alert("Pick an image first"); return; }
    setBroadcasting(true);
    try {
      await apiRequest("/admin/broadcast", { method: "POST", body: JSON.stringify({ imageUrl: broadcastImage, caption: broadcastCaption.trim() || undefined }) });
      qc.invalidateQueries({ queryKey: ["memes"] });
      setShowBroadcast(false);
      setBroadcastImage(null);
      setBroadcastCaption("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Broadcast sent!", "Your official announcement is now live.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not send broadcast.");
    } finally {
      setBroadcasting(false);
    }
  };

  function roleLabel(u: AdminUser) {
    if (u.isOwner) return "Founder";
    if (u.role === "vip") return "VIP";
    return "Member";
  }
  function roleColor(u: AdminUser) {
    if (u.isOwner) return "#FFD700";
    if (u.role === "vip") return "#A855F7";
    return txtMut;
  }

  if (!user?.isOwner) {
    return (
      <View style={{ flex: 1, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <Feather name="lock" size={48} color={danger} />
        <Text style={{ color: danger, fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 16 }}>Access Denied</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20, backgroundColor: primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: isDark ? "#000" : "#fff", fontFamily: "Inter_600SemiBold" }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <LinearGradient
        colors={["#1a0a00", "#2d1500", "#1a0a00"]}
        style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingBottom: 20, paddingHorizontal: 20 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,215,0,0.12)", alignItems: "center", justifyContent: "center" }}>
            <Feather name="arrow-left" size={18} color="#FFD700" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: "#FFD700" }}>Admin Dashboard</Text>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,215,0,0.6)", marginTop: 1 }}>M Chat Control Center · Founder Access Only</Text>
          </View>
          <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: "#FFD700", alignItems: "center", justifyContent: "center", backgroundColor: "#FFD70022" }}>
            <Text style={{ fontSize: 18 }}>👑</Text>
          </View>
        </View>

        {/* Quick action bar */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {[
            { icon: "radio", label: "Broadcast", onPress: () => setShowBroadcast(true), color: "#FFD700" },
            { icon: "refresh-cw", label: "Refresh", onPress: () => { refetchStats(); refetchUsers(); }, color: "#4FC3F7" },
          ].map((a, i) => (
            <Pressable key={i} onPress={a.onPress} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: `${a.color}18`, borderRadius: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: `${a.color}35` }}>
              <Feather name={a.icon as any} size={16} color={a.color} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: a.color }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 20, gap: 20 }}
        refreshControl={<RefreshControl refreshing={statsLoading || usersLoading} onRefresh={() => { refetchStats(); refetchUsers(); }} tintColor="#FFD700" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats grid */}
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#FFD700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>📊 System Overview</Text>
          {statsLoading ? (
            <ActivityIndicator color="#FFD700" />
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <StatCard label="Total Users" value={stats?.users.total ?? "—"} sub={`+${stats?.users.newToday ?? 0} today`} color="#4FC3F7" icon="users" />
              <StatCard label="Messages" value={stats?.messages.total ?? "—"} sub={`${stats?.messages.today ?? 0} today`} color="#22c55e" icon="message-circle" />
              <StatCard label="Chats" value={stats?.conversations.total ?? "—"} color="#A855F7" icon="message-square" />
              <StatCard label="Memes" value={stats?.memes.total ?? "—"} sub={`${stats?.memes.official ?? 0} official`} color="#F59E0B" icon="image" />
              <StatCard label="VIP Users" value={stats?.users.vip ?? "—"} color="#A855F7" icon="star" />
              <StatCard label="Banned" value={stats?.users.banned ?? "—"} color={danger} icon="slash" />
              <StatCard label="Flagged Memes" value={stats?.memes.flagged ?? "—"} color="#F59E0B" icon="flag" />
              <StatCard label="This Week" value={stats?.messages.thisWeek ?? "—"} sub="messages" color="#4FC3F7" icon="activity" />
            </View>
          )}
        </View>

        {/* User roster */}
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#FFD700", textTransform: "uppercase", letterSpacing: 1 }}>👥 User Roster</Text>
            <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>{users?.length ?? 0} accounts</Text>
          </View>

          {/* Search */}
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: surf, borderRadius: 14, borderWidth: 1, borderColor: border, paddingHorizontal: 14, paddingVertical: 10, gap: 10, marginBottom: 12 }}>
            <Feather name="search" size={16} color={txtMut} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: txt, fontFamily: "Inter_400Regular" }}
              placeholder="Search users…"
              placeholderTextColor={txtMut}
              value={userSearch}
              onChangeText={setUserSearch}
            />
            {userSearch.length > 0 && (
              <Pressable onPress={() => setUserSearch("")}>
                <Feather name="x" size={16} color={txtMut} />
              </Pressable>
            )}
          </View>

          {usersLoading ? <ActivityIndicator color="#FFD700" /> : (
            <View style={{ gap: 8 }}>
              {filteredUsers.map(u => (
                <Pressable
                  key={u.id}
                  onPress={() => u.isOwner ? null : setSelectedUser(u)}
                  style={({ pressed }) => ({
                    backgroundColor: pressed && !u.isOwner ? `${surf}dd` : surf,
                    borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
                    borderWidth: 1.5,
                    borderColor: u.isOwner ? "#FFD70044" : u.isBanned ? `${danger}33` : border,
                  })}
                >
                  {/* Avatar */}
                  {u.avatarUrl ? (
                    <View style={{ position: "relative" }}>
                      <Image source={{ uri: u.avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: u.isOwner ? 2 : 0, borderColor: "#FFD700" }} />
                      {u.isOwner && <Text style={{ position: "absolute", bottom: -4, right: -4, fontSize: 14 }}>👑</Text>}
                    </View>
                  ) : (
                    <View style={{ position: "relative" }}>
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: u.isOwner ? "#FFD70022" : `${primary}22`, alignItems: "center", justifyContent: "center", borderWidth: u.isOwner ? 2 : 0, borderColor: "#FFD700" }}>
                        <Text style={{ color: u.isOwner ? "#FFD700" : primary, fontSize: 18, fontFamily: "Inter_700Bold" }}>{u.displayName[0].toUpperCase()}</Text>
                      </View>
                      {u.isOwner && <Text style={{ position: "absolute", bottom: -4, right: -4, fontSize: 12 }}>👑</Text>}
                    </View>
                  )}

                  {/* Info */}
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: u.isOwner ? "#FFD700" : txt }}>{u.displayName}</Text>
                      {u.isBanned && <View style={{ backgroundColor: `${danger}22`, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: danger }}>BANNED</Text>
                      </View>}
                    </View>
                    <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>@{u.username} · {roleLabel(u)} · {u.messageCount} msgs</Text>
                    {u.warnCount > 0 && !u.isOwner && (
                      <Text style={{ fontSize: 11, color: "#F59E0B", fontFamily: "Inter_500Medium" }}>⚠️ {u.warnCount}/3 warnings</Text>
                    )}
                  </View>

                  {/* Role color dot */}
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: roleColor(u) }} />
                  {!u.isOwner && <Feather name="chevron-right" size={16} color={txtMut} />}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* User Action Sheet */}
      {selectedUser && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setSelectedUser(null)}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" }} onPress={() => setSelectedUser(null)}>
            <View style={{ backgroundColor: surf, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 28 }} onStartShouldSetResponder={() => true}>
              <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 20 }} />

              {/* User summary */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 22, padding: 14, backgroundColor: bg, borderRadius: 18, borderWidth: 1, borderColor: border }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: primary, fontSize: 22, fontFamily: "Inter_700Bold" }}>{selectedUser.displayName[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: txt }}>{selectedUser.displayName}</Text>
                  <Text style={{ fontSize: 13, color: txtMut, fontFamily: "Inter_400Regular" }}>@{selectedUser.username} · {roleLabel(selectedUser)}</Text>
                  <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular", marginTop: 2 }}>{selectedUser.messageCount} messages · {selectedUser.warnCount}/3 warnings</Text>
                </View>
              </View>

              <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#FFD700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Actions</Text>

              {actingOn === selectedUser.id ? (
                <ActivityIndicator color="#FFD700" style={{ marginVertical: 20 }} />
              ) : (
                <View style={{ gap: 8 }}>
                  {/* VIP toggle */}
                  {selectedUser.role !== "vip" ? (
                    <ActionBtn icon="star" label="Grant VIP Status" color="#A855F7"
                      onPress={() => patchUser(selectedUser.id, { role: "vip" }, `${selectedUser.displayName} is now VIP!`)} />
                  ) : (
                    <ActionBtn icon="star" label="Revoke VIP Status" color={txtSec}
                      onPress={() => patchUser(selectedUser.id, { role: "user" }, `VIP removed from ${selectedUser.displayName}.`)} />
                  )}

                  {/* Warn */}
                  <ActionBtn icon="alert-triangle" label={`Issue Warning (${selectedUser.warnCount}/3)`} color="#F59E0B"
                    onPress={() => {
                      const next = selectedUser.warnCount + 1;
                      const autoBan = next >= 3;
                      patchUser(selectedUser.id, { warnCount: next, ...(autoBan ? { isBanned: true } : {}) },
                        autoBan ? `${selectedUser.displayName} auto-banned after 3 warnings.` : `Warning issued (${next}/3).`);
                    }} />

                  {/* Clear warnings */}
                  {selectedUser.warnCount > 0 && (
                    <ActionBtn icon="refresh-cw" label="Clear All Warnings" color={success}
                      onPress={() => patchUser(selectedUser.id, { warnCount: 0 }, `Warnings cleared for ${selectedUser.displayName}.`)} />
                  )}

                  {/* Ban / Unban */}
                  {selectedUser.isBanned ? (
                    <ActionBtn icon="user-check" label="Unban User" color={success}
                      onPress={() => patchUser(selectedUser.id, { isBanned: false }, `${selectedUser.displayName} has been unbanned.`)} />
                  ) : (
                    <ActionBtn icon="user-x" label="Ban User" color={danger}
                      onPress={() => Alert.alert(`Ban ${selectedUser.displayName}?`, "They won't be able to post memes.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Ban", style: "destructive", onPress: () => patchUser(selectedUser.id, { isBanned: true }, `${selectedUser.displayName} has been banned.`) },
                      ])} />
                  )}
                </View>
              )}

              <Pressable onPress={() => setSelectedUser(null)} style={{ marginTop: 14, alignItems: "center", paddingVertical: 10 }}>
                <Text style={{ color: txtSec, fontSize: 15, fontFamily: "Inter_400Regular" }}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Broadcast modal */}
      <Modal visible={showBroadcast} animationType="slide" transparent onRequestClose={() => setShowBroadcast(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }} onPress={() => setShowBroadcast(false)}>
          <View style={{ backgroundColor: surf, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 28 }} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 20 }} />

            <LinearGradient colors={["#FFD700", "#FFA500"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, padding: 14, marginBottom: 20 }}>
              <Feather name="radio" size={20} color="#000" />
              <View>
                <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: "#000" }}>Official Broadcast</Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(0,0,0,0.6)" }}>Posts to all users as M Chat Official</Text>
              </View>
            </LinearGradient>

            <Pressable onPress={pickBroadcastImage}
              style={{ borderRadius: 16, borderWidth: 2, borderColor: broadcastImage ? "#FFD700" : border, borderStyle: broadcastImage ? "solid" : "dashed", height: broadcastImage ? 200 : 120, alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 14, backgroundColor: broadcastImage ? "transparent" : "#FFD70008" }}>
              {broadcastImage ? (
                <>
                  <Image source={{ uri: broadcastImage }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  <Pressable onPress={() => setBroadcastImage(null)} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="x" size={14} color="#fff" />
                  </Pressable>
                </>
              ) : (
                <View style={{ alignItems: "center", gap: 8 }}>
                  <Feather name="image" size={28} color="#FFD700" />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFD700" }}>Choose Image</Text>
                </View>
              )}
            </Pressable>

            <TextInput
              style={{ backgroundColor: bg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular", marginBottom: 16, minHeight: 60 }}
              placeholder="Broadcast message (optional)…"
              placeholderTextColor={txtMut}
              value={broadcastCaption}
              onChangeText={setBroadcastCaption}
              multiline
            />

            <Pressable onPress={sendBroadcast} disabled={broadcasting} style={{ opacity: broadcasting ? 0.7 : 1 }}>
              <LinearGradient colors={["#FFD700", "#FFA500"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ borderRadius: 16, height: 52, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 }}>
                {broadcasting ? <ActivityIndicator color="#000" /> : <>
                  <Feather name="radio" size={18} color="#000" />
                  <Text style={{ color: "#000", fontSize: 16, fontFamily: "Inter_700Bold" }}>Send Broadcast</Text>
                </>}
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => setShowBroadcast(false)} style={{ marginTop: 12, alignItems: "center" }}>
              <Text style={{ color: txtSec, fontSize: 15, fontFamily: "Inter_400Regular" }}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function ActionBtn({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 14, backgroundColor: pressed ? `${color}18` : `${color}10`, borderWidth: 1, borderColor: `${color}30` })}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${color}18`, alignItems: "center", justifyContent: "center" }}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color }}>{label}</Text>
    </Pressable>
  );
}
