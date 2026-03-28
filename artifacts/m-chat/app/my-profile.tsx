import React, { useState } from "react";
import {
  View, Text, Pressable, ScrollView, TextInput,
  Modal, ActivityIndicator, Alert, Platform, Image
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/utils/api";

const HOBBY_COLORS = [
  "#FF6B9D", "#C77DFF", "#4FC3F7", "#52B788",
  "#FFB74D", "#F77F00", "#FF4D6D", "#4CC9F0",
  "#06D6A0", "#EF476F", "#118AB2", "#FFD166",
];

const HOBBY_SUGGESTIONS = [
  "Gaming", "Music", "Cooking", "Travel", "Reading", "Fitness",
  "Photography", "Art", "Movies", "Sports", "Coding", "Dancing",
  "Fashion", "Nature", "Yoga", "Podcasts", "Football", "Chess",
];

function hobbyColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return HOBBY_COLORS[h % HOBBY_COLORS.length];
}

function parseHobbies(raw?: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export default function MyProfileScreen() {
  const { theme } = useTheme();
  const { user, updateUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [showEdit, setShowEdit] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarUri, setAvatarUri] = useState<string>(user?.avatarUrl ?? "");
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [hobbies, setHobbies] = useState<string[]>(parseHobbies(user?.hobbies));
  const [hobbyInput, setHobbyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);

  const bg = theme.background;
  const surf = theme.surface;
  const border = theme.border;
  const primary = theme.primary;
  const txt = theme.text;
  const txtSec = theme.textSecondary;
  const txtMut = theme.textMuted;
  const accent = theme.accent;
  const danger = theme.danger;

  const joinedDate = new Date(user?.createdAt ?? Date.now()).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const currentHobbies = parseHobbies(user?.hobbies);

  const openEditModal = () => {
    setDisplayName(user?.displayName ?? "");
    setAvatarUri(user?.avatarUrl ?? "");
    setAvatarChanged(false);
    setBio(user?.bio ?? "");
    setHobbies(parseHobbies(user?.hobbies));
    setHobbyInput("");
    setShowEdit(true);
  };

  const pickImage = async () => {
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow access to your photos to set a profile picture.");
        return;
      }
    }
    setPickingImage(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          setAvatarUri(`data:image/jpeg;base64,${asset.base64}`);
        } else {
          setAvatarUri(asset.uri);
        }
        setAvatarChanged(true);
      }
    } finally {
      setPickingImage(false);
    }
  };

  const addHobby = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || hobbies.some(h => h.toLowerCase() === trimmed.toLowerCase())) return;
    setHobbies(prev => [...prev, trimmed]);
    setHobbyInput("");
  };

  const removeHobby = (name: string) => {
    setHobbies(prev => prev.filter(h => h !== name));
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert("Name required", "Please enter your display name.");
      return;
    }
    setSaving(true);

    // Optimistically close the modal and update local state immediately
    const optimisticUser = {
      ...user!,
      displayName: displayName.trim(),
      bio: bio.trim() || null,
      hobbies: JSON.stringify(hobbies),
      ...(avatarChanged ? { avatarUrl: avatarUri.trim() || null } : {}),
    };
    updateUser(optimisticUser);
    setShowEdit(false);

    try {
      const body: Record<string, unknown> = {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        hobbies: JSON.stringify(hobbies),
      };
      // Only include avatar if it was actually changed (base64 is large — skip if unchanged)
      if (avatarChanged) {
        body.avatarUrl = avatarUri.trim() || null;
      }
      const updated = await apiRequest("/users/me", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      updateUser(updated);
    } catch (e: any) {
      // Rollback on error
      updateUser(user!);
      Alert.alert("Error", e.message ?? "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + (Platform.OS === "web" ? 72 : 16),
        paddingHorizontal: 20, paddingBottom: 16,
        backgroundColor: theme.gradientTop,
        flexDirection: "row", alignItems: "center",
      }}>
        <Pressable
          style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}
          onPress={() => router.back()}
        >
          <Feather name="chevron-left" size={22} color={primary} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "Inter_700Bold", color: txt, marginLeft: 12 }}>My Profile</Text>
        <Pressable
          style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: `${primary}22`, borderRadius: 12 }}
          onPress={openEditModal}
        >
          <Text style={{ color: primary, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Edit</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>

        {/* Hero / Avatar Section */}
        <LinearGradient
          colors={[theme.gradientTop, theme.gradientBottom ?? bg]}
          style={{ alignItems: "center", paddingVertical: 36, paddingHorizontal: 24 }}
        >
          <Pressable onPress={openEditModal} style={{ position: "relative" }}>
            {user.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={{ width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: primary }} />
            ) : (
              <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: `${primary}22`, borderWidth: 3, borderColor: primary, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 48, fontFamily: "Inter_700Bold", color: primary }}>{user.displayName[0].toUpperCase()}</Text>
              </View>
            )}
            <View style={{ position: "absolute", bottom: 4, right: 4, width: 32, height: 32, borderRadius: 16, backgroundColor: primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.gradientTop }}>
              <Feather name="camera" size={15} color={bg} />
            </View>
          </Pressable>

          <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: txt, marginTop: 16 }}>{user.displayName}</Text>
          <Text style={{ fontSize: 15, color: txtSec, fontFamily: "Inter_400Regular", marginTop: 4 }}>@{user.username}</Text>

          {user.isOwner && (
            <View style={{ marginTop: 10, backgroundColor: primary, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 10 }}>
              <Text style={{ color: bg, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Owner · Allan Matt Tech</Text>
            </View>
          )}
        </LinearGradient>

        {/* Bio */}
        <View style={{ marginHorizontal: 16, marginTop: 20 }}>
          <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginLeft: 4 }}>Bio</Text>
          <Pressable
            onPress={openEditModal}
            style={{ backgroundColor: surf, borderRadius: 14, borderWidth: 1, borderColor: border, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "flex-start", gap: 12 }}
          >
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${accent}22`, alignItems: "center", justifyContent: "center" }}>
              <Feather name="file-text" size={17} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              {user.bio ? (
                <Text style={{ fontSize: 15, color: txt, fontFamily: "Inter_400Regular", lineHeight: 22 }}>{user.bio}</Text>
              ) : (
                <Text style={{ fontSize: 15, color: txtMut, fontFamily: "Inter_400Regular", fontStyle: "italic" }}>Tap to add a bio…</Text>
              )}
            </View>
            <Feather name="edit-2" size={15} color={txtMut} style={{ marginTop: 2 }} />
          </Pressable>
        </View>

        {/* Hobbies */}
        <View style={{ marginHorizontal: 16, marginTop: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginLeft: 4 }}>
            <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase" }}>Hobbies & Interests</Text>
            <Pressable onPress={openEditModal} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Feather name="plus-circle" size={15} color={primary} />
              <Text style={{ color: primary, fontSize: 13, fontFamily: "Inter_500Medium" }}>Add</Text>
            </Pressable>
          </View>

          {currentHobbies.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {currentHobbies.map((h) => {
                const c = hobbyColor(h);
                return (
                  <View key={h} style={{ backgroundColor: `${c}22`, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: `${c}55` }}>
                    <Text style={{ color: c, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{h}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Pressable
              onPress={openEditModal}
              style={{ backgroundColor: surf, borderRadius: 14, borderWidth: 1, borderColor: border, paddingVertical: 18, alignItems: "center", gap: 8, flexDirection: "row", justifyContent: "center" }}
            >
              <Feather name="heart" size={18} color={txtMut} />
              <Text style={{ color: txtMut, fontFamily: "Inter_400Regular", fontSize: 14 }}>Add your hobbies and interests</Text>
            </Pressable>
          )}
        </View>

        {/* Info */}
        <View style={{ marginHorizontal: 16, marginTop: 24 }}>
          <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginLeft: 4 }}>Info</Text>
          <View style={{ backgroundColor: surf, borderRadius: 14, borderWidth: 1, borderColor: border, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 14 }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${primary}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={17} color={primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>Username</Text>
                <Text style={{ fontSize: 15, color: txt, fontFamily: "Inter_500Medium", marginTop: 2 }}>@{user.username}</Text>
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: border, marginLeft: 64 }} />
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 14 }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${theme.success}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="calendar" size={17} color={theme.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>Member since</Text>
                <Text style={{ fontSize: 15, color: txt, fontFamily: "Inter_500Medium", marginTop: 2 }}>{joinedDate}</Text>
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: border, marginLeft: 64 }} />
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 14 }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${accent}22`, alignItems: "center", justifyContent: "center" }}>
                <Feather name="message-circle" size={17} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: txtMut, fontFamily: "Inter_400Regular" }}>App</Text>
                <Text style={{ fontSize: 15, color: txt, fontFamily: "Inter_500Medium", marginTop: 2 }}>M Chat by Allan Matt Tech</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEdit} animationType="slide" transparent onRequestClose={() => setShowEdit(false)}>
        <View style={{ flex: 1 }}>
          {/* Backdrop — separate from the content so it doesn't block touches inside the sheet */}
          <Pressable
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)" }}
            onPress={() => setShowEdit(false)}
          />
          {/* Content sheet — sibling of the backdrop, not a child */}
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 28, maxHeight: "92%" }}>
            <View style={{ width: 40, height: 4, backgroundColor: border, borderRadius: 2, alignSelf: "center", marginBottom: 18 }} />

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Avatar picker */}
              <View style={{ alignItems: "center", marginBottom: 22 }}>
                <Pressable onPress={pickImage} disabled={pickingImage}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: primary }} />
                  ) : (
                    <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: `${primary}22`, borderWidth: 3, borderColor: primary, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 38, fontFamily: "Inter_700Bold", color: primary }}>{displayName[0]?.toUpperCase() ?? "?"}</Text>
                    </View>
                  )}
                  <View style={{ position: "absolute", bottom: 2, right: 2, width: 30, height: 30, borderRadius: 15, backgroundColor: primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: surf }}>
                    {pickingImage ? <ActivityIndicator size="small" color={bg} /> : <Feather name="camera" size={14} color={bg} />}
                  </View>
                </Pressable>
                <Pressable onPress={pickImage} disabled={pickingImage} style={{ marginTop: 10 }}>
                  <Text style={{ color: primary, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Change profile photo</Text>
                </Pressable>
              </View>

              {/* Display Name */}
              <Text style={{ fontSize: 13, color: txtSec, fontFamily: "Inter_600SemiBold", marginBottom: 6 }}>Display Name</Text>
              <TextInput
                style={{ backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular", marginBottom: 16 }}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor={txtMut}
              />

              {/* Bio */}
              <Text style={{ fontSize: 13, color: txtSec, fontFamily: "Inter_600SemiBold", marginBottom: 6 }}>Bio</Text>
              <TextInput
                style={{ backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular", marginBottom: 16, minHeight: 90, textAlignVertical: "top" }}
                value={bio}
                onChangeText={(t) => { if (t.length <= 200) setBio(t); }}
                placeholder="Tell people about yourself…"
                placeholderTextColor={txtMut}
                multiline
                numberOfLines={4}
              />
              <Text style={{ fontSize: 11, color: txtMut, fontFamily: "Inter_400Regular", textAlign: "right", marginTop: -12, marginBottom: 16 }}>{bio.length}/200</Text>

              {/* Hobbies */}
              <Text style={{ fontSize: 13, color: txtSec, fontFamily: "Inter_600SemiBold", marginBottom: 10 }}>Hobbies & Interests</Text>

              {/* Current hobbies as removable chips */}
              {hobbies.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {hobbies.map((h) => {
                    const c = hobbyColor(h);
                    return (
                      <Pressable key={h} onPress={() => removeHobby(h)} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: `${c}22`, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: `${c}55` }}>
                        <Text style={{ color: c, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{h}</Text>
                        <Feather name="x" size={12} color={c} />
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Input to add hobby */}
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                <TextInput
                  style={{ flex: 1, backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: txt, borderWidth: 1, borderColor: border, fontFamily: "Inter_400Regular" }}
                  value={hobbyInput}
                  onChangeText={setHobbyInput}
                  placeholder="Type a hobby…"
                  placeholderTextColor={txtMut}
                  onSubmitEditing={() => addHobby(hobbyInput)}
                  returnKeyType="done"
                  maxLength={30}
                />
                <Pressable
                  onPress={() => addHobby(hobbyInput)}
                  disabled={!hobbyInput.trim()}
                  style={{ paddingHorizontal: 16, borderRadius: 12, backgroundColor: hobbyInput.trim() ? primary : `${primary}44`, alignItems: "center", justifyContent: "center" }}
                >
                  <Feather name="plus" size={20} color={bg} />
                </Pressable>
              </View>

              {/* Quick-add suggestions */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 24 }}>
                {HOBBY_SUGGESTIONS.filter(s => !hobbies.some(h => h.toLowerCase() === s.toLowerCase())).slice(0, 12).map((s) => (
                  <Pressable key={s} onPress={() => addHobby(s)} style={{ backgroundColor: `${primary}14`, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: `${primary}33` }}>
                    <Text style={{ color: primary, fontFamily: "Inter_400Regular", fontSize: 12 }}>+ {s}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={{ backgroundColor: primary, borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center" }}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={bg} /> : <Text style={{ color: bg, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>Save Changes</Text>}
              </Pressable>

            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
