import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ScrollView, RefreshControl, TextInput, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as Location from 'expo-location';
import { useAuth } from "@/contexts/AuthContext";
import { FirebaseService } from "@/firebase/service";
import { EventDocument } from "@/firebase/schema";
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from "react-native-safe-area-context";


// Haversine
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const formatShortDate = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-AU", { month: "short" }).toUpperCase();
  return { day, month };
};

const formatPlace = (item: Partial<Location.LocationGeocodedAddress>) => {
  const parts = [item.name, item.city || item.subregion, item.region].filter(Boolean);
  return parts.join(", ");
};

type SortMode = 'distance' | 'date';

export default function Events() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);

  const [userLocation, setUserLocation] = useState({
    latitude: -33.888,
    longitude: 151.187,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  // reverse-geocode cache (only if address is missing)
  const [placeNames, setPlaceNames] = useState<Record<string, string>>({});

  const [currentLocation, setCurrentLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [events, setEvents] = useState<EventDocument[]>([]);
  const [myEvents, setMyEvents] = useState<EventDocument[]>([]);
  const [allEvents, setAllEvents] = useState<EventDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'nearby' | 'myEvents'>('nearby');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [checkInStatuses, setCheckInStatuses] = useState<{[eventId: string]: boolean}>({});
  const [locationUpdateKey, setLocationUpdateKey] = useState(0);
  const [markersCleared, setMarkersCleared] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('distance');
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


  const locationRef = useRef<{latitude: number, longitude: number} | null>(null);

  // Category options (chips)
  const categoryOptions = [
    { value: 'all', label: 'All Categories' },
    { value: 'urban', label: 'Urban' },
    { value: 'beach', label: 'Beach' },
    { value: 'forest', label: 'Forest' },
    { value: 'ocean', label: 'Ocean' },
    { value: 'climate', label: 'Climate' },
    { value: 'community', label: 'Community' },
    { value: 'education', label: 'Education' },
    { value: 'health', label: 'Health' },
    { value: 'wildlife', label: 'Wildlife' },
    { value: 'conservation', label: 'Conservation' },
    { value: 'other', label: 'Other' }
  ];

  // Make list location text match details screen
  const getEventLocationText = (event: EventDocument) => {
    const addr = event?.location?.address;
    if (addr && typeof addr === "string" && addr.trim().length > 0) return addr;
    return placeNames[event.id] || "Locating…";
  };

  // Sorting helper (applies current sort mode)
  const sortEvents = (arr: EventDocument[], locationToUse: {latitude: number, longitude: number} | null) => {
    const copy = [...arr];
    if (sortMode === 'distance' && locationToUse) {
      copy.sort((a, b) =>
        calculateDistance(locationToUse.latitude, locationToUse.longitude, a.location.latitude, a.location.longitude) -
        calculateDistance(locationToUse.latitude, locationToUse.longitude, b.location.latitude, b.location.longitude)
      );
    } else if (sortMode === 'date') {
      copy.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    return copy;
  };

  useEffect(() => {
    if (user) {
      getCurrentLocation();
      loadEvents();
    }
  }, [user]);

  // Re-sort on sortMode change
  useEffect(() => {
    const locationToUse = currentLocation || locationRef.current;
    
    // Clear markers to force redraw
    setMarkersCleared(true);
    setTimeout(() => setMarkersCleared(false), 100);
    
    // Re-sort events
    setEvents(prev => sortEvents(prev, locationToUse));
    setMyEvents(prev => sortEvents(prev, locationToUse));
    setAllEvents(prev => sortEvents(prev, locationToUse));
  }, [sortMode]); // eslint-disable-line

  // Force marker redraw when tab changes
  // useEffect(() => {
  //   setMarkersCleared(true);
  //   setTimeout(() => setMarkersCleared(false), 100);
  // }, [activeTab]);

  useEffect(() => {
    if (currentLocation && user) {
      // Force marker redraw when location changes
      setMarkersCleared(true);
      setTimeout(() => setMarkersCleared(false), 100);
      loadEvents();
    }
  }, [currentLocation, user]);

  useEffect(() => {
    if (locationUpdateKey > 0) {
      setMarkersCleared(true);
      setTimeout(() => setMarkersCleared(false), 100);
    }
  }, [locationUpdateKey]);

  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        if (!currentLocation) {
          getCurrentLocation();
        } else {
          loadEvents();
        }
      }
    }, [user, currentLocation])
  );

  const loadEvents = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        // Force marker redraw when refreshing
        setMarkersCleared(true);
        setTimeout(() => setMarkersCleared(false), 100);
      }
      const locationToUse = currentLocation || locationRef.current;

      if (user?.role === 'organizer') {
        const activeEvents = await FirebaseService.getEvents();
        setEvents(sortEvents(activeEvents, locationToUse));
        setAllEvents(sortEvents(activeEvents, locationToUse));

        const organizerEvents = await FirebaseService.getOrganizerEvents(user.id);
        const activeOrganizerEvents = organizerEvents.filter(e => e.status === 'active');
        setMyEvents(sortEvents(activeOrganizerEvents, locationToUse));
      } else {
        const nearbyEvents = await FirebaseService.getEvents();
        setEvents(sortEvents(nearbyEvents, locationToUse));
        setAllEvents(sortEvents(nearbyEvents, locationToUse));

        if (user) {
          const all = await FirebaseService.getAllEvents();
          const joinedActive = all.filter(e => e.volunteers.includes(user.id) && e.status === 'active');
          setMyEvents(sortEvents(joinedActive, locationToUse));

          const allToCheck = [...nearbyEvents, ...joinedActive];
          const uniqueIds = [...new Set(allToCheck.map(e => e.id))];
          const checkIn = await Promise.all(
            uniqueIds.map(async (id) => ({ eventId: id, isCheckedIn: await FirebaseService.getUserCheckInStatus(id, user.id) }))
          );
          const map: {[id: string]: boolean} = {};
          checkIn.forEach(({eventId, isCheckedIn}) => { map[eventId] = isCheckedIn; });
          setCheckInStatuses(map);
        }
      }
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  };

  const onRefresh = () => loadEvents(true);

  const getCurrentLocation = async () => {
    try {
      if (currentLocation || locationRef.current) {
        if (!currentLocation && locationRef.current) {
          setCurrentLocation(locationRef.current);
          setUserLocation({ ...locationRef.current, latitudeDelta: 0.05, longitudeDelta: 0.05 });
        }
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required to show nearby events');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const coords = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      setCurrentLocation(coords);
      locationRef.current = coords;
      setUserLocation({ ...coords, latitudeDelta: 0.05, longitudeDelta: 0.05 });
      setLocationUpdateKey(prev => prev + 1);
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  // NEW: recenter map (top-left button)
  const recenterMap = async () => {
    try {
      if (!currentLocation && !locationRef.current) {
        await getCurrentLocation();
      }
      const coords = currentLocation || locationRef.current;
      if (coords) {
        const region = { ...coords, latitudeDelta: 0.05, longitudeDelta: 0.05 };
        setUserLocation(region);
        mapRef.current?.animateToRegion(region, 600);
      }
    } catch (e) {
      // noop
    }
  };

  const handleEditEvent = (eventId: string) => {
    router.push(`/edit-event?eventId=${eventId}` as any);
  };

  const handleMarkEventCompleted = async (eventId: string) => {
    Alert.alert('Mark Event as Completed', 'Are you sure you want to mark this event as completed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: async () => {
          const success = await FirebaseService.markEventCompleted(eventId);
          if (success) {
            Alert.alert('Success', 'Event marked as completed');
            loadEvents();
          } else {
            Alert.alert('Error', 'Failed to mark event as completed');
          }
        }
      }
    ]);
  };

  const handleCancelEvent = async (eventId: string) => {
    Alert.alert('Cancel Event', 'Are you sure you want to cancel this event? This action cannot be undone.', [
      { text: 'Keep Event', style: 'cancel' },
      {
        text: 'Cancel Event',
        style: 'destructive',
        onPress: async () => {
          const success = await FirebaseService.cancelEvent(eventId);
          if (success) {
            Alert.alert('Success', 'Event has been cancelled');
            loadEvents();
          } else {
            Alert.alert('Error', 'Failed to cancel event');
          }
        }
      }
    ]);
  };

  const handleEventPress = (eventId: string) => {
    const locationToUse = currentLocation || locationRef.current;
    const locationParam = locationToUse ? `&lat=${locationToUse.latitude}&lng=${locationToUse.longitude}` : '';
    router.push(`/event-details?eventId=${eventId}${locationParam}` as any);
  };

  const getFilteredEvents = (eventsList: EventDocument[]) =>
    eventsList.filter(e => {
      const matchesSearch =
        searchQuery === '' ||
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || e.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

  const filteredEvents = getFilteredEvents(activeTab === 'nearby' ? events : myEvents);
  const filteredAllEvents = getFilteredEvents(allEvents);

  // Reverse-geocode only when no address is stored
  useEffect(() => {
    let cancelled = false;
    const fetchNames = async () => {
      const toFetch = filteredEvents.filter(
        e => e.location && (!e.location.address || e.location.address.trim().length === 0) && !placeNames[e.id]
      );
      for (const e of toFetch) {
        try {
          const res = await Location.reverseGeocodeAsync({
            latitude: e.location.latitude,
            longitude: e.location.longitude,
          });
          const pretty = res[0] ? formatPlace(res[0]) : "";
          if (!cancelled && pretty) {
            setPlaceNames(prev => ({ ...prev, [e.id]: pretty }));
          }
        } catch {
          // ignore
        }
      }
    };
    fetchNames();
    return () => { cancelled = true; };
  }, [filteredEvents, placeNames]);

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        {/* Left: recenter map */}
        <TouchableOpacity onPress={recenterMap}>
          <IconSymbol name="location.fill" size={24} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.topBarTitle}>
          {user?.role === 'organizer' ? 'Event Management' : 'Events'}
        </Text>

        {/* Right: Sort button */}
        <TouchableOpacity onPress={() => setShowSortModal(true)}>
          <IconSymbol name="arrow.up.arrow.down" size={22} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Map */}
      <View style={styles.map}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          region={userLocation}
          showsUserLocation
          showsMyLocationButton
        >
          <Marker
            coordinate={{ latitude: userLocation.latitude, longitude: userLocation.longitude }}
            title="Your Location"
            pinColor="blue"
          />
          {(() => {
            if (markersCleared) return null;
            return filteredEvents.map((event) => (
              <Marker
                key={`${event.id}-${selectedCategory}-${searchQuery}-${locationUpdateKey}-${currentLocation ? `${currentLocation.latitude.toFixed(3)}-${currentLocation.longitude.toFixed(3)}` : 'no-location'}-${activeTab}`}
                coordinate={event.location}
                title={event.name}
                description={`${event.currentVolunteers}/${event.maxVolunteers} volunteers`}
                pinColor="green"
              />
            ));
          })()}
        </MapView>
      </View>

      {/* Search + Category chips */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <IconSymbol name="magnifyingglass" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search events..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#666"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <IconSymbol name="xmark.circle.fill" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryChipsRow}
        >
          {categoryOptions.map((cat) => {
            const selected = selectedCategory === cat.value;
            return (
              <TouchableOpacity
                key={cat.value}
                onPress={() => setSelectedCategory(cat.value)}
                style={[styles.chip, selected && styles.chipSelected]}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.content}>
        {/* CENTERED, SMALLER SEGMENTED TOGGLE */}
        <View style={styles.segmentWrap}>
          <TouchableOpacity
            style={[styles.segmentHalf, activeTab === 'nearby' && styles.segmentActive]}
            onPress={() => setActiveTab('nearby')}
            activeOpacity={0.9}
          >
            <Text style={[styles.segmentText, activeTab === 'nearby' && styles.segmentTextActive]}>
              {user?.role === 'organizer' ? 'All Events' : 'Nearby Events'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentHalf, activeTab === 'myEvents' && styles.segmentActive]}
            onPress={() => setActiveTab('myEvents')}
            activeOpacity={0.9}
          >
            <Text style={[styles.segmentText, activeTab === 'myEvents' && styles.segmentTextActive]}>
              My Events
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.eventsScrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.eventsScrollContent]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#27ae60']}
              tintColor="#27ae60"
            />
          }
        >
          {filteredEvents.map((event) => {
            const locationToUse = currentLocation || locationRef.current;
            return (
              <TouchableOpacity
                key={`${event.id}-${locationToUse ? `${locationToUse.latitude.toFixed(3)}-${locationToUse.longitude.toFixed(3)}` : 'no-location'}`}
                style={styles.eventCard}
                onPress={() => handleEventPress(event.id)}
              >
                <Image
                  source={EVENT_IMAGES[event.category] || EVENT_IMAGES.default}
                  style={styles.eventImage}
                />

                <View style={styles.eventMain}>
                  <Text style={styles.eventTitle} numberOfLines={1} ellipsizeMode="tail">
                    {event.name}
                  </Text>
                  <Text style={styles.eventLocation} numberOfLines={1} ellipsizeMode="tail">
                    {getEventLocationText(event)}
                  </Text>
                </View>

                <View style={styles.eventRight}>
                  {(() => {
                    const { day, month } = formatShortDate(event.date);
                    return (
                      <View style={styles.datePill}>
                        <Text style={styles.dateDay}>{day}</Text>
                        <Text style={styles.dateMonth}>{month}</Text>
                      </View>
                    );
                  })()}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Sort Modal */}
      <Modal
        visible={showSortModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sort Events</Text>

            <View style={styles.sortOptionsRow}>
              {(['distance', 'date'] as SortMode[]).map((mode) => {
                const selected = sortMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.chip, selected && styles.chipSelected, { marginBottom: 8 }]}
                    onPress={() => { setSortMode(mode); setShowSortModal(false); }}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {mode === 'distance' ? 'By Distance' : 'By Date'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.chip, { alignSelf: 'flex-end' }]}
              onPress={() => setShowSortModal(false)}
              activeOpacity={0.9}
            >
              <Text style={styles.chipText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export const options = {
  title: "Events",
  tabBarIcon: ({ color }: { color: string }) => (
    <IconSymbol size={28} name="paperplane.fill" color={color} />
  ),
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    backgroundColor: "#333"
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff"
  },

  map: { height: 200, width: "100%" },

  content: { flex: 1 },

  // Search section (no divider line)
  searchContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8, // ~ height 40–44 total with font
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 16, color: '#333' },

  // Category chips
  categoryChipsRow: {
    paddingTop: 10,
    paddingBottom: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  chipSelected: {
    backgroundColor: '#27ae60',
    borderColor: '#27ae60',
  },
  chipText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#fff',
  },

  // SMALLER centered segmented toggle (similar height to search)
  segmentWrap: {
    alignSelf: 'center',
    width: '92%',
    maxWidth: 520,
    height: 39,               // smaller height ~ search input
    backgroundColor: '#e6e6e6',
    borderRadius: 22,
    flexDirection: 'row',
    marginTop: 0,
    marginBottom: 12,
    padding: 3,
  },
  segmentHalf: {
    flex: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#27ae60',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
  segmentTextActive: {
    color: '#fff',
  },

  // List
  eventsScrollView: { flex: 1 },
  eventsScrollContent: { paddingBottom: 3 },

  // Card
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 15,
    marginHorizontal: 20,
    marginBottom: 15,
    backgroundColor: "#92caa4ff",
    borderRadius: 20,
    minHeight: 82,
  },
  eventImage: { width: 50, height: 50, borderRadius: 10, marginRight: 10 },
  eventMain: { flex: 1, justifyContent: "center", minWidth: 0 },
  eventTitle: { fontSize: 16, fontWeight: "700", lineHeight: 20 },
  eventLocation: { marginTop: 2, fontSize: 12, color: "#555" },
  eventRight: { alignItems: "flex-end", justifyContent: "center", marginLeft: 10 },
  datePill: {
    width: 52, height: 52, borderRadius: 12, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
    elevation: 1, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  dateDay: { fontSize: 16, fontWeight: "800", lineHeight: 18 },
  dateMonth: { fontSize: 10, fontWeight: "700", color: "#666", marginTop: -2 },

  // Sort modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    width: "100%",
    maxWidth: 420,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 12,
  },
  sortOptionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
});
