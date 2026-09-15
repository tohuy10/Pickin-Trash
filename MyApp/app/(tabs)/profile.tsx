import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList, Alert, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/contexts/AuthContext";
import { router } from "expo-router";
import { FirebaseService } from "@/firebase/service";
import { EventDocument, RewardDocument, UserRewardDocument } from "@/firebase/schema";
import { AVATARS, DEFAULT_AVATAR } from "@/constants/avatars";
import { db } from "@/firebase/config";
import { addDoc, collection, updateDoc, doc, serverTimestamp, increment } from 'firebase/firestore';


export default function Profile() {
  const { user, logout, updateUser, refreshUser } = useAuth();
  const [eventHistory, setEventHistory] = useState<EventDocument[]>([]);
  const [availableRewards, setAvailableRewards] = useState<RewardDocument[]>([]);
  const [userRewards, setUserRewards] = useState<UserRewardDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [rewardsLoading, setRewardsLoading] = useState(true);
  const [eventsCreated, setEventsCreated] = useState(0);
  const [totalVolunteers, setTotalVolunteers] = useState(0);
  const [activeRewardsTab, setActiveRewardsTab] = useState<'rewards' | 'redeemed'>('rewards');
  const [refreshing, setRefreshing] = useState(false);
  const avatarKey = (user?.avatarKey ?? DEFAULT_AVATAR) as keyof typeof AVATARS;
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

  const onRefresh = async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      await refreshUser();
      await loadEventHistory();
      if (user.role === "user") {
        await loadRewards();
      } else if (user.role === "organizer") {
        await loadOrganizerStats();
      }
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadEventHistory();
    if (user?.role === 'user') {
      loadRewards();
    } else if (user?.role === 'organizer') {
      loadOrganizerStats();
    }
  }, [user]);

  const loadEventHistory = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      let history: EventDocument[];
      if (user.role === 'organizer') {
        // For organizers, get their created events that are completed/cancelled
        history = await FirebaseService.getOrganizerEventHistory(user.id);
      } else {
        // For regular users, get events they joined that are completed/cancelled
        history = await FirebaseService.getUserEventHistory(user.id);
      }
      setEventHistory(history);
    } catch (error) {
      console.error('Error loading event history:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOrganizerStats = async () => {
    if (!user || user.role !== 'organizer') return;

    try {
      const allEvents = await FirebaseService.getAllEvents();
      
      // Get all events created by this organizer (excluding cancelled ones)
      const createdEvents = allEvents.filter((event: EventDocument) => 
        event.organizerId === user.id && event.status !== 'cancelled'
      );
      
      setEventsCreated(createdEvents.length);
      
      // Calculate total volunteers across all created events
      const totalVols = createdEvents.reduce((sum, event) => sum + event.currentVolunteers, 0);
      setTotalVolunteers(totalVols);
    } catch (error) {
      console.error('Error loading organizer stats:', error);
    }
  };

  const loadRewards = async () => {
    if (!user) {
      setRewardsLoading(false);
      return;
    }

    try {
      // const [rewards, redeemed] = await Promise.all([
      //   FirebaseService.getAvailableRewards(),
      //   FirebaseService.getUserRewards(user.id)
      // ]);
      
      // For now, we'll use hardcoded rewards since they might not exist in Firebase yet
      const hardcodedRewards: RewardDocument[] = [
        {
          id: 'coffee',
          name: 'Free Coffee',
          description: 'Get a free coffee at participating locations',
          pointsCost: 200,
          category: 'food',
          isActive: true
        },
        {
          id: 'badge',
          name: 'Volunteer Badge',
          description: 'Exclusive volunteer recognition badge',
          pointsCost: 500,
          category: 'badge',
          isActive: true
        }
      ];
      
      // Only fetch redeemed rewards from Firebase
      const redeemed = await FirebaseService.getUserRewards(user.id);
      
      setAvailableRewards(hardcodedRewards);
      setUserRewards(redeemed);
    } catch (error) {
      console.error('Error loading rewards:', error);
      // Set empty array as fallback
      // setAvailableRewards([]);
      // setUserRewards([]);
    } finally {
      setRewardsLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", style: "destructive", 
          onPress: async () => {
            try {
              await logout();           // wait for Firebase sign-out + state clear
            } finally {
              // move the user off the tabs; back cannot return to protected screens
              router.replace("/login");
            }
          }, 
        },
      ]
    );
  };

  const handleEditProfile = () => {
    router.push('/edit-profile' as any);
  };

  const handleRedeemReward = async (reward: RewardDocument) => {
    if (!user) return;

    if (user.points < reward.pointsCost) {
      Alert.alert('Insufficient Points', `You need ${reward.pointsCost} points to redeem this reward. You currently have ${user.points} points.`);
      return;
    }

    Alert.alert(
      'Confirm Redemption',
      `Are you sure you want to redeem "${reward.name}" for ${reward.pointsCost} points?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            try {
              // Save redemption to Firebase directly (using hardcoded rewards)
              // Add to user_rewards collection
              await addDoc(collection(db, "user_rewards"), {
                userId: user.id,
                rewardId: reward.id,
                pointsSpent: reward.pointsCost,
                redemptionDate: serverTimestamp(),
                status: "pending",
              });

              // Update user points
              const userRef = doc(db, "users", user.id);
              await updateDoc(userRef, {
                points: (user.points || 0) - reward.pointsCost,
                pointsSpent: increment(reward.pointsCost),
                updatedAt: serverTimestamp(),
              });

              Alert.alert('Success!', `You have successfully redeemed "${reward.name}".`);
              // Reload rewards and refresh user data to update points
              loadRewards();
              // Refresh user data to get updated points
              const updatedUser = await FirebaseService.getUser(user.id);
              if (updatedUser) {
                // Update the user context with new points
                updateUser(updatedUser);
              }
            } catch (error) {
              console.error('Redemption error:', error);
              Alert.alert('Error', 'An error occurred while redeeming the reward.');
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
        {/* Top Bar */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <TouchableOpacity onPress={handleLogout}>
          <IconSymbol name="rectangle.portrait.and.arrow.right" size={24} color="#ffffffff" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Profile</Text>
        <TouchableOpacity onPress={handleEditProfile}>
          <IconSymbol name="pencil" size={24} color="#ffffffff" />
          </TouchableOpacity>
        </SafeAreaView>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        />
      }
      >

        {/* Profile Image */}
      <View style={styles.user}>
          <Image
            source={AVATARS[avatarKey]}
            style={styles.userImage}
          />
        <Text style={styles.userName}>{user?.name || 'User'}</Text>
        <Text style={styles.userRole}>{user?.role === 'organizer' ? 'Event Organizer' : 'Volunteer'}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        </View>

        {/* Info Stats */}
        <View style={styles.infoStats}>
        {user?.role === 'user' ? (
          <>
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Total Points</Text>
              {/* FIXED: Point Total instead of actual */}
              {/* FIXME: Add actual points for redeem somewhr */}
              <Text style={styles.infoVal}>{user?.points + user?.pointsSpent || 0}</Text>
            </View>
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Events Complete</Text>
              <Text style={styles.infoVal}>{eventHistory.filter(event => event.status === 'completed').length}</Text>
            </View>
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Friends</Text>
              <Text style={styles.infoVal}>{user?.friends?.length || 0}</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Events Created</Text>
              <Text style={styles.infoVal}>{eventsCreated}</Text>
            </View>
          <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Total Volunteers</Text>
              <Text style={styles.infoVal}>{totalVolunteers}</Text>
          </View>
          <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Friends</Text>
              <Text style={styles.infoVal}>{user?.friends?.length || 0}</Text>
            </View>
          </>
        )}
      </View>

      {/* Rewards Section for Users */}
      {user?.role === 'user' && (
        <View style={styles.rewardsSection}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Rewards</Text>
            <View style={styles.pointsDisplay}>
              <IconSymbol name="star.fill" size={16} color="#27ae60" />
              <Text style={styles.pointsText}>{user?.points || 0} points</Text>
            </View>
          </View>
          
          {/* Rewards Tabs */}
          <View style={styles.rewardsTabs}>
            <TouchableOpacity
              style={[styles.rewardsTab, activeRewardsTab === 'rewards' && styles.rewardsTabActive]}
              onPress={() => setActiveRewardsTab('rewards')}
            >
              <Text style={[styles.rewardsTabText, activeRewardsTab === 'rewards' && styles.rewardsTabTextActive]}>
                Available
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rewardsTab, activeRewardsTab === 'redeemed' && styles.rewardsTabActive]}
              onPress={() => setActiveRewardsTab('redeemed')}
            >
              <Text style={[styles.rewardsTabText, activeRewardsTab === 'redeemed' && styles.rewardsTabTextActive]}>
                Redeemed
              </Text>
            </TouchableOpacity>
          </View>

          {/* Rewards Content */}
          <View style={styles.rewardsContent}>
            {rewardsLoading ? (
              <Text style={styles.loadingText}>Loading rewards...</Text>
            ) : activeRewardsTab === 'rewards' ? (
              availableRewards.length === 0 ? (
                <Text style={styles.emptyText}>No rewards available</Text>
              ) : (
                availableRewards.map((reward, index) => (
                  <View key={reward.id} style={[
                    styles.rewardItem,
                    index === availableRewards.length - 1 && styles.rewardItemLast
                  ]}>
                    <IconSymbol 
                      name={reward.category === 'food' ? "cup.and.saucer.fill" : "gift.fill"} 
                      size={24} 
                      color={reward.category === 'food' ? "#8B4513" : "#FF6B6B"} 
                    />
                    <View style={styles.rewardDetails}>
                      <Text style={styles.rewardTitle}>{reward.name}</Text>
                      <Text style={styles.rewardDescription}>{reward.description}</Text>
                      <Text style={styles.rewardCost}>{reward.pointsCost} points</Text>
                    </View>
                    <TouchableOpacity 
                      style={[
                        styles.redeemButton,
                        (user?.points || 0) < reward.pointsCost && styles.redeemButtonDisabled
                      ]}
                      onPress={() => handleRedeemReward(reward)}
                      disabled={(user?.points || 0) < reward.pointsCost}
                    >
                      <Text style={[
                        styles.redeemText,
                        (user?.points || 0) < reward.pointsCost && styles.redeemTextDisabled
                      ]}>
                        {(user?.points || 0) < reward.pointsCost ? 'Not Enough' : 'Redeem'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )
            ) : (
              userRewards.length === 0 ? (
                <Text style={styles.emptyText}>No redeemed rewards yet</Text>
              ) : (
                userRewards.map((userReward) => {
                  const reward = availableRewards.find(r => r.id === userReward.rewardId);
                  return (
                    <View key={userReward.id} style={styles.rewardItem}>
                      <IconSymbol 
                        name={reward?.category === 'food' ? "cup.and.saucer.fill" : "gift.fill"} 
                        size={24} 
                        color={reward?.category === 'food' ? "#8B4513" : "#FF6B6B"} 
                      />
                      <View style={styles.rewardDetails}>
                        <Text style={styles.rewardTitle}>{reward?.name || 'Unknown Reward'}</Text>
                        <Text style={styles.rewardDescription}>Redeemed on {new Date(userReward.redemptionDate).toLocaleDateString()}</Text>
                        <Text style={styles.rewardCost}>{userReward.pointsSpent} points spent</Text>
                      </View>
                      <View style={styles.redeemedBadge}>
                        <Text style={styles.redeemedText}>Redeemed</Text>
                      </View>
                    </View>
                  );
                })
              )
            )}
          </View>
        </View>
      )}

        {/* History */}
        <View style={styles.content}>
        <Text style={styles.contentToggle}>Event History</Text>
        
        {loading ? (
          <Text style={styles.loadingText}>Loading event history...</Text>
        ) : eventHistory.length === 0 ? (
          <Text style={styles.emptyText}>No event history yet</Text>
        ) : (
          eventHistory.map((event) => (
            <View key={event.id} style={styles.eventCard}>
            <Image
                source={EVENT_IMAGES[event.category] || EVENT_IMAGES.default}
            style={styles.eventImage}
            />
              <View style={styles.eventDetails}>
                <View style={styles.titleRow}>
                  <Text style={styles.eventTitle}>{event.name}</Text>
                  <View style={[
                    styles.statusBadge,
                    event.status === 'completed' && styles.statusCompleted,
                    event.status === 'cancelled' && styles.statusCancelled,
                  ]}>
                    <Text style={[
                      styles.statusText,
                      event.status === 'completed' && styles.statusCompleted,
                      event.status === 'cancelled' && styles.statusCancelled,
                    ]}>
                      {event.status === 'completed' ? 'Completed' : 'Cancelled'}
                    </Text>
            </View>
          </View>
                <Text style={styles.eventLocation}>
                  {user?.role === 'organizer' ? `Created by you` : `Organized by ${event.organizerName}`}
                </Text>
                <Text style={styles.eventDate}>{new Date(event.date).toLocaleDateString()}</Text>
            </View>
              <View style={styles.eventPoints}>
                {user?.role === 'organizer' ? (
                  <>
                    <IconSymbol name="person.2.fill" size={16} color="#3498db" />
                    <Text style={styles.eventPointsText}>{event.currentVolunteers}</Text>
                  </>
                ) : (
                  <>
                    <IconSymbol name="star.fill" size={16} color="#f39c12" />
                    <Text style={styles.eventPointsText}>{event.pointsReward}</Text>
                  </>
                )}
          </View>          
        </View>
          ))
        )}
      </View>
      </ScrollView>
    </View>
  );
}

export const options = {
  title: "Profile",
  tabBarIcon: ({ color }: { color: string }) => (
    <IconSymbol size={28} name="person.fill" color={color} />
  ),
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingBottom: 100,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    backgroundColor: "#333",
  },

  topBarTitle: {  
    fontSize: 18, 
    fontWeight: "bold", 
    color: "#fff"
  },

  user: {
    flexDirection: "column",
    alignItems: "center",
    paddingVertical: 20,
  },
  userImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 10,
  },
  userName: {
    fontSize: 25,
    fontWeight: "bold",
    marginBottom: 4,
  },
  userRole: {
    fontSize: 16,
    color: "#27ae60",
    fontWeight: "600",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: "#666",
  },

  infoStats: {
    flexDirection: "row",
    marginBottom: 20,
    justifyContent: "space-evenly",
    paddingHorizontal: 20,
  },

  infoBox: {
    height: 100,
    width: 100,
    backgroundColor: "#f0f0f0",
    borderRadius: 15,
    padding: 15,
    justifyContent: "space-evenly",
    alignItems: "center",
  },
  infoTitle: { 
    fontSize: 14, 
    textAlign: "center",
    color: "#666",
    flexWrap: "nowrap",
  },
  infoVal: { 
    fontSize: 20, 
    fontWeight: "bold", 
    textAlign: "center",
    color: "#27ae60",
  },

  rewardsSection: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2c3e50",
  },
  pointsDisplay: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8f5e9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  pointsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#27ae60",
  },
  rewardsTabs: {
    flexDirection: "row",
    backgroundColor: "#f1f3f4",
    borderRadius: 12,
    padding: 4,
    marginBottom: 15,
  },
  rewardsTab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  rewardsTabActive: {
    backgroundColor: "#27ae60",
  },
  rewardsTabText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  rewardsTabTextActive: {
    color: "#fff",
  },
  rewardsContent: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    paddingHorizontal: 15,
  },
  rewardItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  rewardItemLast: {
    borderBottomWidth: 0,
  },
  rewardDetails: {
    flex: 1,
    marginLeft: 12,
  },
  rewardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
  },
  rewardDescription: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  rewardCost: {
    fontSize: 14,
    color: "#666",
  },
  redeemButton: {
    backgroundColor: "#27ae60",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  redeemButtonDisabled: {
    backgroundColor: "#bdc3c7",
  },
  redeemText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  redeemTextDisabled: {
    color: "#666",
  },
  redeemedBadge: {
    backgroundColor: "#3498db",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  redeemedText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },

  content: {
    flex: 1,
  },

  contentToggle: {
    fontSize: 20,
    fontFamily: "Inter",
    textAlign: "center",
    padding: 10,
    fontWeight: "bold",
  },
  eventCard: {
    paddingVertical: 15,
    marginHorizontal: 20,
    marginBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#92caa4ff",
    borderRadius: 20,
    paddingHorizontal: 15,
  },
  eventImage: {
    width: 50,
    height: 50,
    borderRadius: 10,
    marginRight: 15,
  },
  eventDetails: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
    marginRight: 8,
  },
  eventLocation: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },
  eventDate: {
    fontSize: 12,
    color: "#666",
  },
  eventPoints: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  eventPointsText: {
    marginLeft: 4,
    fontSize: 14,
    fontWeight: "bold",
    color: "#f39c12",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    padding: 20,
    fontStyle: "italic",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    alignSelf: 'flex-start',
  },
  statusCompleted: {
    backgroundColor: '#3498db',
  },
  statusCancelled: {
    backgroundColor: '#e74c3c',
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
