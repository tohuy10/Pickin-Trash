import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, RefreshControl, ScrollView } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/contexts/AuthContext";
import { FirebaseService } from "@/firebase/service";
import { EventDocument } from "@/firebase/schema";
import { router } from "expo-router";
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { AVATARS, DEFAULT_AVATAR } from "@/constants/avatars";
import { db } from "@/firebase/config";

// Event image mapping based on category
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


export default function Home() {
  const { user } = useAuth();
  const [nextEvent, setNextEvent] = useState<EventDocument | null>(null);
  const [nextOrganizerEvent, setNextOrganizerEvent] = useState<EventDocument | null>(null);
  const [eventsCompleted, setEventsCompleted] = useState(0);
  const [eventsCreated, setEventsCreated] = useState(0);
  const [totalVolunteers, setTotalVolunteers] = useState(0);
  const [loading, setLoading] = useState(true);
  const avatarKey = (user?.avatarKey ?? DEFAULT_AVATAR) as keyof typeof AVATARS;

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadUserData();
    } finally {
      setRefreshing(false);
    }
  };


  useEffect(() => {
    if (user) {
      loadUserData();
    } else {
      setLoading(false);
    }
  }, [user]);

  // Refresh data when tab is focused (e.g., returning from event details)
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadUserData();
      }
    }, [user])
  );

  const loadUserData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      if (user.role === 'user') {
        // User-specific data
        const userEvents = await FirebaseService.getUserEventHistory(user.id);
        const allEvents = await FirebaseService.getAllEvents();
        
        // Count completed events
        const completedCount = userEvents.filter((event: EventDocument) => event.status === 'completed').length;
        setEventsCompleted(completedCount);

        // Find all events that user has joined (from all events, not just history)
        const userJoinedEvents = allEvents.filter((event: EventDocument) => {
          const isJoined = event.volunteers.includes(user.id);
          const isActive = event.status === 'active';
          return isJoined && isActive;
        });
        
        // Find next upcoming event (earliest future event)
        const now = new Date();
        const upcomingEvents = userJoinedEvents
          .filter((event: EventDocument) => {
            const eventDate = new Date(event.date);
            const isFuture = eventDate > now;
            return isFuture;
          })
          .sort((a: EventDocument, b: EventDocument) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        setNextEvent(upcomingEvents.length > 0 ? upcomingEvents[0] : null);
      } else {
        // Organizer-specific data
        const organizerEvents = await FirebaseService.getOrganizerEventHistory(user.id);
        const allEvents = await FirebaseService.getAllEvents();
        
        // Get all events created by this organizer (excluding cancelled ones)
        const createdEvents = allEvents.filter((event: EventDocument) => 
          event.organizerId === user.id && event.status !== 'cancelled'
        );
        
        setEventsCreated(createdEvents.length);
        
        // Calculate total volunteers across all created events
        const totalVols = createdEvents.reduce((sum, event) => sum + event.currentVolunteers, 0);
        setTotalVolunteers(totalVols);
        
        // Find next upcoming event for organizer (only active events)
        const now = new Date();
        const upcomingOrganizerEvents = createdEvents
          .filter((event: EventDocument) => {
            const eventDate = new Date(event.date);
            const isFuture = eventDate > now;
            const isActive = event.status === 'active';
            return isFuture && isActive;
          })
          .sort((a: EventDocument, b: EventDocument) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        setNextOrganizerEvent(upcomingOrganizerEvents.length > 0 ? upcomingOrganizerEvents[0] : null);
      }
      
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewEvents = () => {
    router.push('/(tabs)/events' as any);
  };

  const handleEditProfile = () => {
    router.push('/edit-profile' as any);
  }

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.welcome}>Welcome,{'\n'}{user?.name || 'User'}</Text>
          <Text style={styles.role}>{user?.role === 'organizer' ? 'Event Organizer' : 'Volunteer'}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push(`/user-profile?userId=${user?.id}`)}>
          <Image
            source={AVATARS[avatarKey]}
            style={styles.userImage}
          />
        </TouchableOpacity>
      </View>
    
      <ScrollView
        style={styles.container}
        refreshControl={ <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> }
      >
      {/* Content */}
      <TouchableOpacity 
        style={styles.filler}
        onPress={() => {
          if (user?.role === 'organizer') {
            router.push('/(tabs)/add');
          } else {
            router.push('/(tabs)/events');
          }
        }}
        activeOpacity={0.8}
      >
        <IconSymbol name="leaf.fill" size={60} color="#fff" />
        <Text style={styles.fillerText}>
          {user?.role === 'organizer' 
            ? 'Create meaningful events and make a difference in your community'
            : 'Join events, earn points, and help build a sustainable future'
          }
        </Text>
      </TouchableOpacity>

      {user?.role === 'user' && (
        <>
          {loading ? (
            <View style={styles.eventCard}>
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : nextEvent ? (
            <TouchableOpacity style={styles.eventCard} onPress={() => router.push(`/event-details?eventId=${nextEvent.id}` as any)}>
              <Image
                source={EVENT_IMAGES[nextEvent.category] || EVENT_IMAGES.default}
                style={styles.eventImage}
              />
              <View style={styles.eventDetails}>
                <Text style={styles.header}>Next Event:</Text>
                <Text style={styles.eventTitle} numberOfLines={1} ellipsizeMode="tail">{nextEvent.name}</Text>
                <Text style={styles.eventLocation} numberOfLines={1} ellipsizeMode="tail">{nextEvent.location.address}</Text>
              </View>
              <Text style={styles.eventDate}>
                {new Date(nextEvent.date).toLocaleDateString()}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.encouragementCard}>
              <IconSymbol name="calendar.badge.plus" size={40} color="#27ae60" />
              <View style={styles.encouragementContent}>
                <Text style={styles.encouragementTitle}>No Events Joined Yet</Text>
                <Text style={styles.encouragementText}>
                  Start your volunteering journey by joining events in your community!
                </Text>
                <TouchableOpacity style={styles.encouragementButton} onPress={handleViewEvents}>
                  <Text style={styles.encouragementButtonText}>Browse Events</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* InfoStats */}
          <View style={styles.infoStats}>
            <TouchableOpacity 
              style={styles.infoBox}
              onPress={() => router.push('/(tabs)/profile')}
              activeOpacity={0.7}
            >
              <Text style={styles.infoTitle}>Points</Text>
              <Text style={styles.infoVal}>{user?.points || 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.infoBox}
              onPress={() => router.push('/(tabs)/profile')}
              activeOpacity={0.7}
            >
              <Text style={styles.infoTitle}>Events Complete</Text>
              <Text style={styles.infoVal}>{eventsCompleted}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.infoBox}
              onPress={() => router.push('/(tabs)/inbox?tab=friends')}
              activeOpacity={0.7}
            >
              <Text style={styles.infoTitle}>Friends</Text>
              <Text style={styles.infoVal}>{user?.friends?.length || 0}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {user?.role === 'organizer' && (
        <>
          {loading ? (
            <View style={styles.eventCard}>
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : nextOrganizerEvent ? (
            <TouchableOpacity style={styles.eventCard} onPress={() => router.push(`/event-details?eventId=${nextOrganizerEvent.id}` as any)}>
              <Image
                source={EVENT_IMAGES[nextOrganizerEvent.category] || EVENT_IMAGES.default}
                style={styles.eventImage}
              />
              <View style={styles.eventDetails}>
                <Text style={styles.header}>Next Event:</Text>
                <Text style={styles.eventTitle} numberOfLines={1} ellipsizeMode="tail">{nextOrganizerEvent.name}</Text>
                <Text style={styles.eventLocation} numberOfLines={1} ellipsizeMode="tail">{nextOrganizerEvent.location.address}</Text>
              </View>
              <Text style={styles.eventDate}>
                {new Date(nextOrganizerEvent.date).toLocaleDateString()}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.encouragementCard}>
              <IconSymbol name="calendar.badge.plus" size={40} color="#27ae60" />
              <View style={styles.encouragementContent}>
                <Text style={styles.encouragementTitle}>No Events Created Yet</Text>
                <Text style={styles.encouragementText}>
                  Start organizing by creating your first event!
                </Text>
                <TouchableOpacity style={styles.encouragementButton} onPress={() => router.push('/(tabs)/add')}>
                  <Text style={styles.encouragementButtonText}>Create Event</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* InfoStats */}
          <View style={styles.organizerStats}>
            <TouchableOpacity style={styles.infoBox} onPress={() => {router.push('/(tabs)/profile')}}>
              <Text style={styles.infoTitle}>Events Created</Text>
              <Text style={styles.infoVal}>{eventsCreated}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.infoBox} onPress={() => {router.push('/(tabs)/inbox')}}>
              <Text style={styles.infoTitle}>Total Followers</Text>
              <Text style={styles.infoVal}>{totalVolunteers}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
    </View>
  );
}

export const options = {
  title: "Home",
  tabBarIcon: ({ color }: { color: string }) => (
    <IconSymbol size={28} name="house.fill" color={color} />
  ),
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 70,
    paddingHorizontal: 20,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    backgroundColor: "#333"
  },
  welcome: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#ddd"
  },
  role: {
    fontSize: 14,
    color: "#27ae60",
    fontWeight: "600",
    marginTop: 4,
  },
  userImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginVertical: 20,
  },

  // Filler
  filler: {
    alignItems: "center",
    height: 180,
    backgroundColor: "#27ae60",
    borderRadius: 20,
    margin: 20,
    padding: 20,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fillerText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 22,
  },

  eventCard: {
    height: 100,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginHorizontal: 20,
    marginBottom: 15,
    backgroundColor: "#92caa4ff",
    borderRadius: 20,
  },
  eventImage: {
    width: 50,
    height: 50,
    borderRadius: 10,
    marginRight: 10,
  },
  eventDetails: {
    flex: 1,
    fontSize: 16,
    justifyContent: "center",
  },
  header: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: "bold",
    flexShrink: 1,
  },
  eventLocation: {
    fontSize: 14,
    color: "#666",
    flexShrink: 1,
  },
  eventDate: {
    textAlign: "left",
    marginLeft: 10,
    fontSize: 12,
    color: "#666",
  },

  loadingText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    flex: 1,
    textAlignVertical: "center",
  },

  encouragementCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 15,
    marginHorizontal: 20,
    marginBottom: 15,
    backgroundColor: "#f8f9fa",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#27ae60",
    borderStyle: "dashed",
  },
  encouragementContent: {
    flex: 1,
    marginLeft: 15,
  },
  encouragementTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 5,
  },
  encouragementText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 10,
    lineHeight: 20,
  },
  encouragementButton: {
    backgroundColor: "#27ae60",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  encouragementButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  // InfoStats
  infoStats: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 20,
  },

  organizerStats: {
    flexDirection: "row",
    gap: 20,
    marginHorizontal: 20,
    marginTop: 2,
  },

  infoBox: {
    flex: 1,
    height: 120,
    backgroundColor: "#f0f0f0",
    borderRadius: 15,
    padding: 15,
    justifyContent: "space-evenly",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: { 
    fontSize: 16, 
    textAlign: "left",
    color: "#666",
  },
  infoVal: { 
    fontSize: 24, 
    fontWeight: "bold", 
    marginTop: 5, 
    textAlign: "right",
    color: "#27ae60",
  },
});
