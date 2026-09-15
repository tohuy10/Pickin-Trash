import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Alert, ActivityIndicator } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/contexts/AuthContext";
import { router, useLocalSearchParams } from "expo-router";
import { FirebaseService } from "@/firebase/service";
import { UserDocument } from "@/firebase/schema";
import { AVATARS, DEFAULT_AVATAR } from "@/constants/avatars";

export default function UserProfile() {
  const { user: currentUser } = useAuth();
  const [profileUser, setProfileUser] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);

  // Friend/follow states
  const [friendRequestStatus, setFriendRequestStatus] = useState<
    "none" | "pending" | "accepted" | "friends" | "received"
  >("none");
  const [isFollowingOrganizer, setIsFollowingOrganizer] = useState(false);

  // Organizer/volunteer stats
  const [eventsCreated, setEventsCreated] = useState(0);
  const [eventsCompleted, setEventsCompleted] = useState(0);

  const { userId } = useLocalSearchParams<{ userId: string }>();
  const isOwnProfile = currentUser?.id === userId;

  const avatarKey =
    profileUser?.avatarKey && AVATARS[profileUser.avatarKey]
      ? (profileUser.avatarKey as keyof typeof AVATARS)
      : (DEFAULT_AVATAR as keyof typeof AVATARS);

  useEffect(() => {
    if (userId) {
      loadUserProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadUserProfile = async () => {
    if (!userId) return;

    try {
      setLoading(true);

      // Load user profile
      const userData = await FirebaseService.getUser(userId);
      setProfileUser(userData);

      // Load events stats
      if (userData) {
        await loadEventsData(userData);
      }

      // Load friendship/follow status if not your own profile
      if (currentUser && currentUser.id !== userId && userData) {
        if (userData.role === "organizer") {
          // Organizer profile -> use follow system
          try {
            const following = await FirebaseService.isFollowing?.(
              currentUser.id,
              userId
            );
            if (typeof following === "boolean") {
              setIsFollowingOrganizer(following);
            }
          } catch {
            // ignore
          }
          // We still auto-add friends on follow, but UI will show "Following" instead of "Friends"
          setFriendRequestStatus("none");
        } else {
          // Volunteer profile -> use friend request flow
          await checkFriendRequestStatus();
        }
      }
    } catch (error) {
      console.error("Error loading user profile:", error);
      Alert.alert("Error", "Failed to load user profile");
    } finally {
      setLoading(false);
    }
  };

  const loadEventsData = async (userData: UserDocument) => {
    try {
      if (userData.role === "organizer") {
        // Created = all their non-cancelled events
        const all = await FirebaseService.getAllEvents();
        setEventsCreated(
          all.filter((e) => e.organizerId === userData.id && e.status !== "cancelled").length
        );
      } else {
        // Completed = events they joined and are completed
        const history = await FirebaseService.getUserEventHistory(userData.id);
        setEventsCompleted(history.filter((e) => e.status === "completed").length);
      }
    } catch (error) {
      console.error("Error loading events data:", error);
    }
  };

  const checkFriendRequestStatus = async () => {
    if (!currentUser || !userId) return;

    try {
      const areFriends = await FirebaseService.areUsersFriends(currentUser.id, userId);
      if (areFriends) {
        setFriendRequestStatus("friends");
        return;
      }

      const sent = await FirebaseService.getFriendRequestsSent(currentUser.id);
      const received = await FirebaseService.getFriendRequestsReceived(currentUser.id);
      const sentReq = sent.find((r) => r.toUserId === userId);
      const recvReq = received.find((r) => r.fromUserId === userId);

      if (sentReq) setFriendRequestStatus("pending");
      else if (recvReq) setFriendRequestStatus("accepted"); // waiting for your accept/decline
      else setFriendRequestStatus("none");
    } catch (error) {
      console.error("Error checking friend request status:", error);
    }
  };

  // ----- Volunteer friend actions -----
  const handleSendFriendRequest = async () => {
    if (!currentUser || !userId) return;

    try {
      const ok = await FirebaseService.sendFriendRequest(currentUser.id, userId);
      if (ok) {
        setFriendRequestStatus("pending");
        Alert.alert("Success", "Friend request sent!");
      } else {
        Alert.alert("Error", "Failed to send friend request");
      }
    } catch (error) {
      console.error("Error sending friend request:", error);
      Alert.alert("Error", "Failed to send friend request");
    }
  };

  const handleAcceptFriendRequest = async () => {
    if (!currentUser || !userId) return;

    try {
      const received = await FirebaseService.getFriendRequestsReceived(currentUser.id);
      const req = received.find((r) => r.fromUserId === userId);
      if (req) {
        await FirebaseService.acceptFriendRequest(req.id);
        setFriendRequestStatus("friends");
        Alert.alert("Success", "Friend request accepted!");
      }
    } catch (error) {
      console.error("Error accepting friend request:", error);
      Alert.alert("Error", "Failed to accept friend request");
    }
  };

  const handleDeclineFriendRequest = async () => {
    if (!currentUser || !userId) return;

    try {
      const received = await FirebaseService.getFriendRequestsReceived(currentUser.id);
      const req = received.find((r) => r.fromUserId === userId);
      if (req) {
        await FirebaseService.declineFriendRequest(req.id);
        setFriendRequestStatus("none");
        Alert.alert("Success", "Friend request declined");
      }
    } catch (error) {
      console.error("Error declining friend request:", error);
      Alert.alert("Error", "Failed to decline friend request");
    }
  };

  // ----- Organizer follow/unfollow (auto-friend) -----
  const handleFollowPress = () => {
    if (!currentUser || !userId || !profileUser) return;

    if (!isFollowingOrganizer) {
      Alert.alert(
        "Follow Organizer",
        "Do you want to follow this event organizer?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm",
            style: "default",
            onPress: async () => {
              try {
                // Keep follow lists (optional)
                await FirebaseService.followUser?.(currentUser.id, userId);

                // Auto-add friendship
                const ok = await FirebaseService.addFriendship?.(currentUser.id, userId);

                if (ok || ok === undefined) {
                  setIsFollowingOrganizer(true);
                  Alert.alert("Following", "You’re now following this organizer.");
                } else {
                  Alert.alert("Error", "Unable to follow organizer. Please try again.");
                }
              } catch (e) {
                console.error("follow/auto-friend error:", e);
                Alert.alert("Error", "Unable to follow organizer. Please try again.");
              }
            },
          },
        ]
      );
    } else {
      Alert.alert(
        "Unfollow Organizer",
        "Are you sure you want to unfollow this organizer?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unfollow",
            style: "destructive",
            onPress: async () => {
              try {
                await FirebaseService.unfollowUser?.(currentUser.id, userId);

                // Also remove friendship on unfollow (same behavior as event-details)
                await FirebaseService.removeFriend?.(currentUser.id, userId);

                setIsFollowingOrganizer(false);
                Alert.alert("Unfollowed", "You are no longer following this organizer.");
              } catch (e) {
                console.error("unfollow/removeFriend error:", e);
                Alert.alert("Error", "Unable to unfollow organizer. Please try again.");
              }
            },
          },
        ]
      );
    }
  };

  const handleStartChat = () => {
    if (!currentUser || !userId) return;
    router.push(`/chat?userId=${userId}` as any);
  };

  const handleRemoveFriend = async () => {
    if (!currentUser || !userId) return;

    Alert.alert(
      "Remove Friend",
      `Are you sure you want to remove ${profileUser?.name ?? "this user"} from friends?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const ok = await FirebaseService.removeFriend?.(currentUser.id, userId);
              if (ok || ok === undefined) {
                setFriendRequestStatus("none");
                Alert.alert("Removed", `${profileUser?.name ?? "User"} has been removed from your friends.`);
              } else {
                Alert.alert("Error", "Failed to remove friend.");
              }
            } catch (e) {
              console.error("Remove friend error:", e);
              Alert.alert("Error", "Failed to remove friend. Please try again.");
            }
          },
        },
      ]
    );
  };

  // ----- UI States -----
  const showChatButton =
    !isOwnProfile &&
    ((profileUser?.role === "organizer" && isFollowingOrganizer) ||
      (profileUser?.role !== "organizer" && friendRequestStatus === "friends"));

  const renderActionSection = () => {
    if (isOwnProfile || !profileUser) return null;

    // Organizer profile -> Follow/Following UI
    if (profileUser.role === "organizer") {
      return (
        <View style={styles.actionButtons}>
          {showChatButton && (
            <TouchableOpacity style={styles.chatButton} onPress={handleStartChat}>
              <IconSymbol name="message.fill" size={20} color="#fff" />
              <Text style={styles.chatButtonText}>Start Chat</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.friendButton, isFollowingOrganizer && { backgroundColor: "#2ecc71" }]}
            onPress={handleFollowPress}
          >
            <IconSymbol name={isFollowingOrganizer ? "checkmark" : "plus"} size={20} color="#fff" />
            <Text style={styles.friendButtonText}>
              {isFollowingOrganizer ? "Following" : "Follow"}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Volunteer profile -> Friend request UI
    return (
      <View style={styles.actionButtons}>
        {showChatButton && (
          <TouchableOpacity style={styles.chatButton} onPress={handleStartChat}>
            <IconSymbol name="message.fill" size={20} color="#fff" />
            <Text style={styles.chatButtonText}>Start Chat</Text>
          </TouchableOpacity>
        )}

        {friendRequestStatus === "none" && (
          <TouchableOpacity style={styles.friendButton} onPress={handleSendFriendRequest}>
            <IconSymbol name="person.badge.plus" size={20} color="#fff" />
            <Text style={styles.friendButtonText}>Add Friend</Text>
          </TouchableOpacity>
        )}

        {friendRequestStatus === "pending" && (
          <View style={styles.pendingContainer}>
            <IconSymbol name="clock.fill" size={20} color="#f39c12" />
            <Text style={styles.pendingText}>Request Sent</Text>
          </View>
        )}

        {friendRequestStatus === "received" && (
          <View style={styles.receivedContainer}>
            <IconSymbol name="envelope.fill" size={20} color="#9b59b6" />
            <Text style={styles.receivedText}>Received</Text>
          </View>
        )}

        {friendRequestStatus === "accepted" && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.acceptButton} onPress={handleAcceptFriendRequest}>
              <IconSymbol name="checkmark.circle.fill" size={20} color="#fff" />
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.declineButton} onPress={handleDeclineFriendRequest}>
              <IconSymbol name="xmark.circle.fill" size={20} color="#fff" />
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}

        {friendRequestStatus === "friends" && (
          <>
            <View style={styles.friendsContainer}>
              <IconSymbol name="checkmark.circle.fill" size={20} color="#27ae60" />
              <Text style={styles.friendsText}>Friends</Text>
            </View>

            {/* NEW: Remove Friend button */}
            <TouchableOpacity style={styles.declineButton} onPress={handleRemoveFriend}>
              <IconSymbol name="minus.circle" size={20} color="#fff" />
              <Text style={styles.declineButtonText}>Remove Friend</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };

  // ----- Render -----
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol name="arrow.left" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#27ae60" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  if (!profileUser) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol name="arrow.left" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <IconSymbol name="person.circle" size={80} color="#ccc" />
          <Text style={styles.errorText}>User not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.profileHeader}>
          <Image source={AVATARS[avatarKey]} style={styles.profileImage} />
          <Text style={styles.profileName}>{profileUser.name}</Text>
          <View style={styles.roleContainer}>
            <IconSymbol
              name={profileUser.role === "organizer" ? "person.2.fill" : "person.fill"}
              size={16}
              color="#27ae60"
            />
            <Text style={styles.roleText}>
              {profileUser.role === "organizer" ? "Event Organizer" : "Volunteer"}
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{profileUser.points}</Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {profileUser.role === "organizer" ? eventsCreated : eventsCompleted}
            </Text>
            <Text style={styles.statLabel}>
              {profileUser.role === "organizer" ? "Events Created" : "Events Completed"}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{profileUser.friends.length}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Information</Text>

          {profileUser?.bio ? (
            <View style={styles.infoRow}>
              <IconSymbol name="heart.fill" size={20} color="#666" />
              <Text style={styles.infoText}>{profileUser.bio}</Text>
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <IconSymbol name="envelope.fill" size={20} color="#666" />
            <Text style={styles.infoText}>{profileUser.email}</Text>
          </View>

          {Boolean(profileUser.organizationName) && (
            <View style={styles.infoRow}>
              <IconSymbol name="building.2.fill" size={20} color="#666" />
              <Text style={styles.infoText}>{profileUser.organizationName}</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        {renderActionSection()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 70,
    paddingHorizontal: 15,
    paddingVertical: 15,
    backgroundColor: "#27ae60",
  },
  topBarTitle: { fontSize: 18, fontWeight: "bold", color: "#fff" },

  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 16, fontSize: 16, color: "#666" },
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { marginTop: 16, fontSize: 16, color: "#666" },

  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  profileHeader: {
    alignItems: "center",
    paddingVertical: 30,
    backgroundColor: "#fff",
    marginBottom: 1,
  },
  profileImage: { width: 120, height: 120, borderRadius: 60, marginBottom: 16 },
  profileName: { fontSize: 24, fontWeight: "bold", color: "#333", marginBottom: 8 },
  roleContainer: { flexDirection: "row", alignItems: "center", gap: 6 },
  roleText: { fontSize: 16, color: "#27ae60", fontWeight: "500" },

  statsContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingVertical: 20,
    marginBottom: 1,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 24, fontWeight: "bold", color: "#333" },
  statLabel: { fontSize: 14, color: "#666", marginTop: 4 },

  infoSection: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 20,
    marginBottom: 1,
  },
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: "#333", marginBottom: 16 },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 12 },
  infoText: { fontSize: 16, color: "#333", flex: 1 },

  actionButtons: { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 20 },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3498db",
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  chatButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  friendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#27ae60",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  friendButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  pendingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef9e7",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  pendingText: { color: "#f39c12", fontSize: 16, fontWeight: "600" },

  receivedContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f0ff",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  receivedText: { color: "#9b59b6", fontSize: 16, fontWeight: "600" },

  actionRow: { flexDirection: "row", gap: 12 },
  acceptButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#27ae60",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  acceptButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  declineButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e74c3c",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 12
  },
  declineButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  friendsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e8f5e8",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  friendsText: { color: "#27ae60", fontSize: 16, fontWeight: "600" },
});
