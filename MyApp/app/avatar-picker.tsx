import React, { useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, Image, StyleSheet, Alert } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { FirebaseService } from "@/firebase/service";
import { AVATARS, DEFAULT_AVATAR } from "@/constants/avatars";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AvatarPickerScreen() {
  const { user, updateUser } = useAuth();

  const items = useMemo(
    () => Object.keys(AVATARS) as (keyof typeof AVATARS)[],
    []
  );

  const currentKey = (user?.avatarKey && AVATARS[user.avatarKey]
    ? (user.avatarKey as keyof typeof AVATARS)
    : DEFAULT_AVATAR) as keyof typeof AVATARS;

  const [selectedKey, setSelectedKey] = useState<keyof typeof AVATARS | null>(null);
  const effectiveKey = selectedKey ?? currentKey; // what we visually highlight

  const onBack = () => router.back();
  const onCancel = () => router.back();

  const onConfirm = async () => {
    if (!user) return;
    const newKey = selectedKey ?? currentKey;
    if (newKey === currentKey) {
      router.back(); // nothing changed
      return;
    }

    // Optional extra confirmation dialog (remove if you prefer silent confirm)
    Alert.alert("Confirm change", "Use this profile picture?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes",
        style: "default",
        onPress: async () => {
          try {
            await FirebaseService.updateUser(user.id, {
              avatarKey: newKey,
              updatedAt: new Date(),
            });
            updateUser({ ...user, avatarKey: newKey });
            router.back();
          } catch (e) {
            console.error("Failed to update avatar:", e);
            Alert.alert("Error", "Could not update profile picture. Please try again.");
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={[styles.topBtn, styles.topBtnGhost]}>
          <Text style={styles.topBtnText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Choose Your Profile Picture</Text>
        <View style={{ width: 72 }} />{/* spacer to balance Back button width */}
      </View>

      {/* Grid */}
      <FlatList
        data={items}
        numColumns={4}
        keyExtractor={(k) => k}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => {
          const isSelected = item === effectiveKey;
          return (
            <Pressable onPress={() => setSelectedKey(item)} style={styles.tile}>
              <Image
                source={AVATARS[item]}
                style={[
                  styles.avatar,
                  isSelected && styles.avatarSelected,
                ]}
              />
            </Pressable>
          );
        }}
      />

      {/* Footer Actions */}
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <Pressable onPress={onCancel} style={[styles.actionBtn, styles.cancelBtn]}>
          <Text style={[styles.actionText, styles.cancelText]}>Cancel</Text>
        </Pressable>

        <Pressable
          onPress={onConfirm}
          disabled={(selectedKey ?? currentKey) === currentKey}
          style={[
            styles.actionBtn,
            styles.confirmBtn,
            (selectedKey ?? currentKey) === currentKey && styles.confirmBtnDisabled,
          ]}
        >
          <Text style={styles.confirmText}>Confirm</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const AVATAR_SIZE = 76;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  topBar: {
    paddingTop: 52,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  topBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  topBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e5e5",
  },
  topBtnText: { fontSize: 14, fontWeight: "600", color: "#444" },
  title: { fontSize: 16, fontWeight: "700", color: "#111" },

  grid: { paddingVertical: 12, paddingHorizontal: 8, paddingBottom: 24 },
  tile: { width: "25%", alignItems: "center", paddingVertical: 12, paddingHorizontal: 6 },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  avatarSelected: {
    borderColor: "#27ae60",
    borderWidth: 2,
  },

  footer: {
    padding: 16,
    flexDirection: "row",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eee",
    backgroundColor: "#fff",
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: { backgroundColor: "#f4f4f5" },
  cancelText: { color: "#111", fontWeight: "700" },
  confirmBtn: { backgroundColor: "#27ae60" },
  confirmBtnDisabled: { backgroundColor: "#9ad8b7" },
  actionText: { fontSize: 16 },
  confirmText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
