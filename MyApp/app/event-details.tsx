import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  RefreshControl,
  TextInput,
  Modal,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/contexts/AuthContext";
import { FirebaseService } from "@/firebase/service";
import { EventDocument, UserDocument } from "@/firebase/schema";
import * as Location from "expo-location";
import QRCode from "react-native-qrcode-svg";
import { AVATARS, DEFAULT_AVATAR } from "@/constants/avatars";
import { useFocusEffect } from '@react-navigation/native';


// Calculate distance (Haversine)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
// Format distance
const formatDistance = (distance: number): string => {
  if (distance < 1) return `${Math.round(distance * 1000)}m`;
  return `${distance.toFixed(1)}km`;
};
const EVENT_IMAGES: Record<string, any> = {
    urban: require("@/assets/event_pics/event_urban.png"),
    beach: require("@/assets/event_pics/event_beach.png"),
    forest: require("@/assets/event_pics/event_forest.png"),
    ocean: require("@/assets/event_pics/event_ocean.png"),
    climate: require("@/assets/event_pics/event_climate.png"),
    community: require("@/assets/event_pics/event_community.png"),
    education: require("@/assets/event_pics/event_education.png"),
    health: require("@/assets/event_pics/event_health.png"),
    wildlife: require("@/assets/event_pics/event_wildlife.png"),
    conservation: require("@/assets/event_pics/event_conservation.png"),
    other: require("@/assets/event_pics/event_other.png"),
    default: require("@/assets/images/main-logo.png"),
  };

export default function EventDetails() {
  const { eventId, lat, lng } =
    useLocalSearchParams<{ eventId: string; lat?: string; lng?: string }>();
  const { user } = useAuth();

  const [event, setEvent] = useState<EventDocument | null>(null);
  const [organizer, setOrganizer] = useState<UserDocument | null>(null);
  const [volunteers, setVolunteers] = useState<UserDocument[]>([]);
  const [friendRequestStatus, setFriendRequestStatus] = useState<{
    [userId: string]:
      | "pending"
      | "accepted"
      | "declined"
      | "none"
      | "friends"
      | "received";
  }>({});

  // Organizer follow state
  const [isFollowingOrganizer, setIsFollowingOrganizer] =
    useState<boolean>(false);

  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [distance, setDistance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checkInCodeInput, setCheckInCodeInput] = useState("");
  const [showCheckInInput, setShowCheckInInput] = useState(false);

  useEffect(() => {
    if (eventId) {
      if (lat && lng) {
        setCurrentLocation({
          latitude: parseFloat(lat),
          longitude: parseFloat(lng),
        });
      } else {
        getCurrentLocation();
      }
      loadEventDetails();
    }
  }, [eventId, lat, lng]);

  useEffect(() => {
    if (currentLocation && event) {
      setDistance(
        calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          event.location.latitude,
          event.location.longitude
        )
      );
    }
  }, [currentLocation, event]);

  useFocusEffect(
    React.useCallback(() => {
      if (eventId) {
        // get the freshest data every time we return to this screen
        loadEventDetails();
      }
      // no cleanup needed here
    }, [eventId, user?.id])   // include deps that should trigger a re-fetch pattern
  );

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("Location permission denied");
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error("Error getting location:", error);
    }
  };

  const loadEventDetails = async () => {
    if (!eventId) return;
    try {
      setLoading(true);

      // Event
      const eventData = await FirebaseService.getEvent(eventId);
      if (!eventData) {
        Alert.alert("Error", "Event not found");
        router.back();
        return;
      }
      setEvent(eventData);

      // Organizer
      const organizerData = await FirebaseService.getUser(eventData.organizerId);
      setOrganizer(organizerData);

      // Volunteers
      const volunteerData = await Promise.all(
        eventData.volunteers.map((volunteerId) => FirebaseService.getUser(volunteerId))
      );
      const validVolunteers = volunteerData.filter((v) => v !== null) as UserDocument[];
      setVolunteers(validVolunteers);

      // Friend request status for volunteers
      if (user) {
        const statusPromises: Promise<
          [string, "pending" | "accepted" | "declined" | "none" | "friends"]
        >[] = [];

        validVolunteers.forEach((volunteer) => {
          statusPromises.push(
            Promise.all([
              FirebaseService.checkFriendRequestStatus(user.id, volunteer.id),
              FirebaseService.areUsersFriends(user.id, volunteer.id),
            ]).then(([requestStatus, areFriends]) => {
              const finalStatus = areFriends ? "friends" : requestStatus;
              return [volunteer.id, finalStatus] as [
                string,
                "pending" | "accepted" | "declined" | "none" | "friends"
              ];
            })
          );
        });

        const statusResults = await Promise.all(statusPromises);
        const statusMap: {
          [id: string]: "pending" | "accepted" | "declined" | "none" | "friends";
        } = {};
        statusResults.forEach(([uid, status]) => {
          statusMap[uid] = status;
        });
        setFriendRequestStatus(statusMap);

        // Check-in status (if joined)
        if (eventData.volunteers.includes(user.id)) {
          const checkInStatus = await FirebaseService.getUserCheckInStatus(eventId, user.id);
          setIsCheckedIn(checkInStatus);
        }

        // Following state for organizer (we keep the "following" list too)
        if (organizerData) {
          try {
            const following = await FirebaseService.isFollowing?.(user.id, organizerData.id);
            if (typeof following === "boolean") setIsFollowingOrganizer(following);
          } catch {
            // ignore if not implemented
          }
        }
      }
    } catch (error) {
      console.error("Error loading event details:", error);
      Alert.alert("Error", "Failed to load event details");
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEventDetails();
    setRefreshing(false);
  };

  // JOIN with confirm dialog + reload to refresh Volunteers row
  const handleJoinEvent = async () => {
    if (!user || !event) return;

    Alert.alert(
      "Join Event",
      "Do you confirm to join?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: "default",
          onPress: async () => {
            try {
              const success = await FirebaseService.joinEvent(event.id, user.id);
              if (success) {
                Alert.alert("Success", "You have joined this event!");
                await loadEventDetails(); // refresh to update volunteers row
              } else {
                Alert.alert(
                  "Error",
                  "Unable to join this event. It may be full or you may have already joined."
                );
              }
            } catch (error) {
              console.error("Join event error:", error);
              Alert.alert("Error", "Failed to join event. Please try again.");
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // LEAVE with confirm dialog + reload to refresh Volunteers row
  const handleLeaveEvent = async () => {
    if (!user || !event) return;

    Alert.alert(
      "Leave Event",
      "Are you sure you want to leave this event?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              const success = await FirebaseService.unjoinEvent(event.id, user.id);
              if (success) {
                Alert.alert("Success", "You have left this event");
                setIsCheckedIn(false);
                await loadEventDetails(); // refresh to update volunteers row
              } else {
                Alert.alert("Error", "Unable to leave this event");
              }
            } catch (error) {
              console.error("Leave event error:", error);
              Alert.alert("Error", "Failed to leave event. Please try again.");
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleViewProfile = (userId: string) => {
    router.push(`/user-profile?userId=${userId}` as any);
  };

  // Follow/unfollow organizer = AUTO-ADD FRIEND
  const handleFollowPress = () => {
    if (!user || !organizer) return;

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
                await FirebaseService.followUser?.(user.id, organizer.id);
                const ok = await FirebaseService.addFriendship?.(user.id, organizer.id);

                if (ok || ok === undefined) {
                  setIsFollowingOrganizer(true);
                  Alert.alert("Following", "Successfully following.");
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
                await FirebaseService.unfollowUser?.(user.id, organizer.id);
                await FirebaseService.removeFriend?.(user.id, organizer.id);
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

  // Volunteer friend actions (unchanged)
  const confirmAddFriend = (targetUserId: string, targetUserName: string) => {
    if (!user) return;
    Alert.alert("Add Friend", `Do you want to add ${targetUserName} as a friend?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        style: "default",
        onPress: async () => {
          try {
            const success = await FirebaseService.sendFriendRequest(user.id, targetUserId);
            if (success) {
              setFriendRequestStatus((prev) => ({
                ...prev,
                [targetUserId]: "pending",
              }));
              Alert.alert("Success", `Friend request sent to ${targetUserName}!`);
            } else {
              Alert.alert("Error", "Failed to send friend request. You may have already sent one.");
            }
          } catch (error) {
            console.error("Send friend request error:", error);
            Alert.alert("Error", "Failed to send friend request. Please try again.");
          }
        },
      },
    ]);
  };

  const confirmRemoveFriend = (targetUserId: string, targetUserName: string) => {
    if (!user) return;
    Alert.alert(
      "Remove Friend",
      `Are you sure you want to remove ${targetUserName} from friends?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const ok = await FirebaseService.removeFriend?.(user.id, targetUserId);
              if (ok || ok === undefined) {
                setFriendRequestStatus((prev) => ({
                  ...prev,
                  [targetUserId]: "none",
                }));
                Alert.alert("Removed", `${targetUserName} has been removed from your friends.`);
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

  const handleCheckIn = async () => {
    if (!user || !event) return;
    if (!event.volunteers.includes(user.id)) {
      Alert.alert("Error", "You must join the event before checking in");
      return;
    }
    setShowCheckInInput(true);
  };

  const handleSubmitCheckIn = async () => {
    if (!user || !event) return;
    if (!checkInCodeInput.trim()) {
      Alert.alert("Error", "Please enter the check-in code");
      return;
    }
    try {
      const success = await FirebaseService.checkInWithCode(
        event.id,
        user.id,
        checkInCodeInput.trim().toUpperCase()
      );
      if (success) {
        setIsCheckedIn(true);
        setShowCheckInInput(false);
        setCheckInCodeInput("");
        Alert.alert("Success", "You have successfully checked in to this event!");
      } else {
        Alert.alert("Error", "Invalid check-in code or you have already checked in");
      }
    } catch (error) {
      console.error("Check-in error:", error);
      Alert.alert("Error", "Failed to check in. Please try again.");
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol name="chevron.left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Event Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading event details...</Text>
        </View>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol name="chevron.left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Event Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Event not found</Text>
        </View>
      </View>
    );
  }

  const isJoined = user ? event.volunteers.includes(user.id) : false;
  const canJoin = user?.role === "user" && event.status === "active" && !isJoined;
  const canLeave = user?.role === "user" && event.status === "active" && isJoined;

  const organizerAvatarKey =
    organizer?.avatarKey && AVATARS[organizer.avatarKey]
      ? (organizer.avatarKey as keyof typeof AVATARS)
      : DEFAULT_AVATAR;

  const statusLabel =
    event.status === "active" ? "Active" : event.status === "completed" ? "Completed" : "Cancelled";

  const statusColor =
    event.status === "cancelled" ? "#e74c3c" : event.status === "completed" ? "#3b82f6" : "#777";

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Event Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#27ae60"]}
            tintColor="#27ae60"
          />
        }
      >
        {/* Event Header */}
        <View style={styles.eventHeader}>
          <Image
            source={EVENT_IMAGES[event.category] || EVENT_IMAGES.default}
            style={styles.eventImage}
          />
          <View style={styles.eventInfo}>
            <View style={styles.titleRow}>
              <Text style={styles.eventTitle}>{event.name}</Text>
            </View>
            <Text style={[styles.statusTag, { color: statusColor }]}>🏷️ {statusLabel}</Text>
          </View>
        </View>

        {/* Event Details */}
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>Event Information</Text>

          <View style={styles.detailRow}>
            <IconSymbol name="calendar" size={20} color="#666" />
            <Text style={styles.detailText}>
              {new Date(event.date).toLocaleDateString()} at {new Date(event.date).toLocaleTimeString()}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <IconSymbol name="clock.fill" size={20} color="#9b59b6" />
            <Text style={styles.detailText}>
              {event.duration} hour{event.duration !== 1 ? "s" : ""}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <IconSymbol name="tag.fill" size={20} color="#e67e22" />
            <Text style={styles.detailText}>
              {event.category.charAt(0).toUpperCase() + event.category.slice(1)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <IconSymbol name="location.fill" size={20} color="#666" />
            <Text style={styles.detailText}>{event.location.address}</Text>
          </View>

          {distance > 0 && (
            <View style={styles.detailRow}>
              <IconSymbol name="location.circle.fill" size={20} color="#3498db" />
              <Text style={styles.detailText}>{formatDistance(distance)} away</Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <IconSymbol name="person.2.fill" size={20} color="#666" />
            <Text style={styles.detailText}>
              {event.currentVolunteers}/{event.maxVolunteers} volunteers
            </Text>
          </View>

          <View style={styles.detailRow}>
            <IconSymbol name="star.fill" size={20} color="#f39c12" />
            <Text style={styles.detailText}>{event.pointsReward} points reward</Text>
          </View>

          {/* Description */}
          <View style={styles.descriptionContainer}>
            <Text style={styles.descriptionTitle}>Description</Text>
            <Text style={styles.descriptionText}>{event.description}</Text>
          </View>

          {/* Primary actions right under Description */}
          {user?.role === "user" && event.status === "active" && (
            <View style={{ gap: 12, marginTop: 16 }}>
              {canJoin && (
                <TouchableOpacity style={styles.joinButton} onPress={handleJoinEvent}>
                  <Text style={styles.joinButtonText}>Join Event</Text>
                </TouchableOpacity>
              )}

              {/* Joined -> Check-in block appears here (no divider) */}
              {isJoined && (
                <View style={styles.checkInSectionInline}>
                  {isCheckedIn ? (
                    <View style={styles.checkedInContainer}>
                      <IconSymbol name="checkmark.circle.fill" size={24} color="#27ae60" />
                      <Text style={styles.checkedInText}>You are checked in!</Text>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.checkInButton} onPress={handleCheckIn}>
                      <IconSymbol name="qrcode" size={20} color="#fff" />
                      <Text style={styles.checkInButtonText}>Check In</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Organizer Check-in Code Display */}
        {user?.role === 'organizer' && user.id === event.organizerId && (
          <View style={styles.checkInCodeSection}>
            <Text style={styles.sectionTitle}>Check-in Code & QR Code</Text>
            <View style={styles.checkInCodeContainer}>
              <Text style={styles.checkInCodeLabel}>Share this code with volunteers:</Text>
              <Text style={styles.checkInCode}>{event.checkInCode}</Text>
              <Text style={styles.checkInCodeHint}>Volunteers can enter this code to check in</Text>

              {/* QR Code */}
              <View style={styles.qrCodeDisplay}>
                <Text style={styles.qrCodeLabel}>Or scan this QR code:</Text>
                <View style={styles.qrCodeContainer}>
                  <QRCode
                    value={event.qrCode}
                    size={150}
                    color="#000"
                    backgroundColor="#fff"
                  />
                </View>
                <Text style={styles.qrCodeHint}>Volunteers can scan this QR code to check in</Text>
              </View>
            </View>
          </View>
        )}

        {/* Organizer Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Event Organizer</Text>
          {organizer && (
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.organizerCard}
              onPress={() => handleViewProfile(organizer.id)}
            >
              <Image source={AVATARS[organizerAvatarKey]} style={styles.profileImage} />
              <View style={styles.profileInfo}>
                <Text style={styles.profileName} numberOfLines={2} ellipsizeMode="tail">
                  {organizer.name}
                </Text>
                <Text style={styles.profileRole}>Event Organizer</Text>
              </View>

              {/* Follow button (auto-friend) */}
              {user && user.id !== organizer.id && (
                <TouchableOpacity
                  style={[styles.followButton, isFollowingOrganizer && styles.followButtonActive]}
                  onPress={handleFollowPress}
                  activeOpacity={0.9}
                >
                  <IconSymbol name={isFollowingOrganizer ? "checkmark" : "plus"} size={16} color="#fff" />
                  <Text style={styles.followButtonText}>
                    {isFollowingOrganizer ? "Following" : "Follow"}
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Volunteers Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Volunteers ({volunteers.length})</Text>

          {volunteers.length === 0 ? (
            <Text style={styles.emptyText}>No volunteers yet</Text>
          ) : (
            volunteers.map((volunteer) => {
              const volKey =
                volunteer.avatarKey && AVATARS[volunteer.avatarKey]
                  ? (volunteer.avatarKey as keyof typeof AVATARS)
                  : DEFAULT_AVATAR;

              const frStatus = friendRequestStatus[volunteer.id];
              const isFriend = frStatus === "friends" || frStatus === "accepted";
              const showAddButton = frStatus === "none" || frStatus === "declined";

              return (
                <TouchableOpacity
                  key={volunteer.id}
                  style={styles.volunteerCard}
                  activeOpacity={0.8}
                  onPress={() => handleViewProfile(volunteer.id)}
                >
                  <Image source={AVATARS[volKey]} style={styles.profileImage} />
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName} numberOfLines={2} ellipsizeMode="tail">
                      {volunteer.name}
                    </Text>
                    <Text style={styles.profilePoints}>{volunteer.points} points</Text>
                  </View>

                  {user && user.id !== volunteer.id && (
                    <>
                      {isFriend && (
                        <TouchableOpacity
                          style={[styles.friendButton, styles.friendButtonRemove]}
                          onPress={() => confirmRemoveFriend(volunteer.id, volunteer.name)}
                          activeOpacity={0.9}
                        >
                          <IconSymbol name="minus.circle" size={16} color="#fff" />
                          {/* <Text style={styles.friendButtonText}>Remove Friend\\</Text> */}
                        </TouchableOpacity>
                      )}

                      {showAddButton && (
                        <TouchableOpacity
                          style={styles.friendButton}
                          onPress={() => confirmAddFriend(volunteer.id, volunteer.name)}
                          activeOpacity={0.9}
                        >
                          <IconSymbol name="person.badge.plus" size={16} color="#fff" />
                          {/* <Text style={styles.friendButtonText}>Add Friend</Text> */}
                        </TouchableOpacity>
                      )}

                      {frStatus === "pending" && (
                        <View style={[styles.friendButton, styles.friendButtonPending, { opacity: 0.9 }]}>
                          <IconSymbol name="clock" size={16} color="#fff" />
                          {/* <Text style={styles.friendButtonText}>Request Sent</Text> */}
                        </View>
                      )}

                      {frStatus === "received" && (
                        <View style={[styles.friendButton, styles.friendButtonReceived, { opacity: 0.9 }]}>
                          <IconSymbol name="tray.and.arrow.down" size={16} color="#fff" />
                          <Text style={styles.friendButtonText}>Received</Text>
                        </View>
                      )}
                    </>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Organizer-only block (unchanged) */}
        {user?.role === "organizer" &&
          user.id === event.organizerId &&
          event.status === "active" && (
            <View style={styles.actionSection}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => router.push(`/edit-event?eventId=${event.id}` as any)}
              >
                <Text style={styles.editButtonText}>Edit Event</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.completeButton}
                onPress={() => {
                  Alert.alert(
                    "Mark Event as Completed",
                    "Are you sure you want to mark this event as completed?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Complete",
                        style: "default",
                        onPress: async () => {
                          const success = await FirebaseService.markEventCompleted(event.id);
                          if (success) {
                            Alert.alert("Success", "Event marked as completed");
                            loadEventDetails();
                          } else {
                            Alert.alert("Error", "Failed to mark event as completed");
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <Text style={styles.completeButtonText}>Mark Complete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  Alert.alert(
                    "Cancel Event",
                    "Are you sure you want to cancel this event? This action cannot be undone.",
                    [
                      { text: "Keep Event", style: "cancel" },
                      {
                        text: "Cancel Event",
                        style: "destructive",
                        onPress: async () => {
                          const success = await FirebaseService.cancelEvent(event.id);
                          if (success) {
                            Alert.alert("Success", "Event has been cancelled");
                            loadEventDetails();
                          } else {
                            Alert.alert("Error", "Failed to cancel event");
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel Event</Text>
              </TouchableOpacity>
            </View>
          )}

        {/* Leave Event at the very end */}
        {canLeave && (
          <View style={[styles.actionSection, { paddingTop: 20, paddingBottom: 32 }]}>
            <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveEvent}>
              <Text style={styles.leaveButtonText}>Leave Event</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Check-in Code Input Modal */}
      <Modal
        visible={showCheckInInput}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCheckInInput(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter Check-in Code</Text>
            <TextInput
              style={styles.codeInput}
              value={checkInCodeInput}
              onChangeText={setCheckInCodeInput}
              placeholder="Enter 8-character code"
              placeholderTextColor="#999"
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowCheckInInput(false);
                  setCheckInCodeInput("");
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitButton}
                onPress={handleSubmitCheckIn}
              >
                <Text style={styles.modalSubmitText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 70,
    paddingHorizontal: 15,
    paddingVertical: 15,
    backgroundColor: "#333",
  },
  topBarTitle: { fontSize: 18, fontWeight: "bold", color: "#fff" },

  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { fontSize: 16, color: "#666" },

  scrollView: { flex: 1 },

  eventHeader: {
    flexDirection: "row",
    padding: 20,
    backgroundColor: "#f8f9fa",
    alignItems: "center",
  },
  eventImage: { width: 80, height: 80, borderRadius: 15, marginRight: 15 },
  eventInfo: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2c3e50",
    flex: 1,
    marginRight: 12,
  },

  statusTag: { fontSize: 13, marginTop: 0, fontWeight: "bold" },

  detailsSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#2c3e50",
  },
  detailRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  detailText: { fontSize: 16, marginLeft: 12, color: "#555" },

  descriptionContainer: { marginTop: 15 },
  descriptionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#2c3e50",
  },
  descriptionText: { fontSize: 14, lineHeight: 20, color: "#666" },

  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },

  organizerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    padding: 15,
    borderRadius: 12,
  },
  volunteerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },

  profileImage: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontWeight: "bold", marginBottom: 4, color: "#2c3e50" },
  profileRole: { fontSize: 14, color: "#27ae60", marginBottom: 2 },
  profilePoints: { fontSize: 12, color: "#f39c12" },

  followButton: {
    backgroundColor: "#27ae60",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  followButtonActive: { backgroundColor: "#2ecc71" },
  followButtonText: { color: "#fff", fontSize: 12, fontWeight: "bold" },

  friendButton: {
    backgroundColor: "#27ae60",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  friendButtonRemove: { backgroundColor: "#e74c3c" },
  friendButtonText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  friendButtonPending: { backgroundColor: "#f39c12" },
  friendButtonReceived: { backgroundColor: "#9b59b6" },

  checkInCodeSection: {
    padding: 20,
    backgroundColor: "#fff",
  },
  checkInCodeContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
  checkInCodeLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2c3e50",
    marginBottom: 12,
    textAlign: "center",
  },
  checkInCode: {
    fontSize: 32,
    fontWeight: "bold",
    letterSpacing: 4,
    color: "#27ae60",
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#27ae60",
    marginBottom: 8,
  },
  checkInCodeHint: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
  qrCodeDisplay: {
    marginTop: 24,
    alignItems: "center",
  },
  qrCodeLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2c3e50",
    marginBottom: 16,
  },
  qrCodeContainer: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e0e0e0",
  },
  qrCodeHint: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 12,
  },

  emptyText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
    padding: 20,
  },

  actionSection: { padding: 20, gap: 12 },

  joinButton: {
    backgroundColor: "#27ae60",
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  joinButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  leaveButton: {
    backgroundColor: "#e74c3c",
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  leaveButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  editButton: {
    backgroundColor: "#3498db",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  editButtonText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  completeButton: {
    backgroundColor: "#27ae60",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  completeButtonText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  cancelButton: {
    backgroundColor: "#e74c3c",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButtonText: { color: "#fff", fontSize: 14, fontWeight: "bold" },

  // No divider above check-in; clean inline section
  checkInSectionInline: {
    backgroundColor: "#fff",
    paddingTop: 0,
  },
  checkedInContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e8f5e8",
    padding: 15,
    borderRadius: 8,
    gap: 10,
  },
  checkedInText: { fontSize: 16, fontWeight: "600", color: "#27ae60" },
  checkInButton: {
    backgroundColor: "#3498db",
    paddingVertical: 15,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  checkInButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "80%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 20,
    textAlign: "center",
  },
  codeInput: {
    borderWidth: 2,
    borderColor: "#3498db",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 4,
    textAlign: "center",
    marginBottom: 20,
  },
  modalButtons: { flexDirection: "row", gap: 12 },
  modalCancelButton: {
    flex: 1,
    backgroundColor: "#e0e0e0",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalCancelText: { color: "#666", fontSize: 16, fontWeight: "600" },
  modalSubmitButton: {
    flex: 1,
    backgroundColor: "#3498db",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalSubmitText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
