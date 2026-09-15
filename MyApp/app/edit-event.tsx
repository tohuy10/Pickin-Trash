import React, { useRef, useState, useEffect } from "react";
import {
  Alert,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/contexts/AuthContext";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import DateTimePicker from '@react-native-community/datetimepicker';
import { FirebaseService } from "@/firebase/service";
import { EventDocument } from "@/firebase/schema";
import { GOOGLE_MAPS_API_KEY } from "@/constants/maps";



export default function EditEvent() {
  const router = useRouter();
  const { user } = useAuth();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  // Event state
  const [event, setEvent] = useState<EventDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [eventName, setEventName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState({
    latitude: -33.888,
    longitude: 151.187,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [locationAddress, setLocationAddress] = useState("");
  const [locationInputValue, setLocationInputValue] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [duration, setDuration] = useState("");
  const [maxVolunteers, setMaxVolunteers] = useState("");
  const [pointsReward, setPointsReward] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Category options
  const categoryOptions = [
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

  useEffect(() => {
    if (eventId) {
      loadEvent();
    }
  }, [eventId]);

  const loadEvent = async () => {
    if (!eventId) return;

    try {
      setLoading(true);
      const eventData = await FirebaseService.getEvent(eventId);
      
      if (!eventData) {
        Alert.alert('Error', 'Event not found');
        router.back();
        return;
      }

      // Check if user is the organizer
      if (user?.id !== eventData.organizerId) {
        Alert.alert('Error', 'You can only edit your own events');
        router.back();
        return;
      }

      setEvent(eventData);
      
      // Populate form fields
      setEventName(eventData.name);
      setDescription(eventData.description);
      setLocation({
        latitude: eventData.location.latitude,
        longitude: eventData.location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      setLocationAddress(eventData.location.address);
      setLocationInputValue(eventData.location.address);
      setSelectedDate(new Date(eventData.date));
      setDuration(eventData.duration.toString());
      setMaxVolunteers(eventData.maxVolunteers.toString());
      setPointsReward(eventData.pointsReward.toString());
      setSelectedCategory(eventData.category);
    } catch (error) {
      console.error('Error loading event:', error);
      Alert.alert('Error', 'Failed to load event');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleLocationInputChange = async (text: string) => {
    setLocationInputValue(text);
    
    if (text.length > 2) {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${GOOGLE_MAPS_API_KEY}&types=establishment|geocode`
        );
        const data = await response.json();
        setLocationSuggestions(data.predictions || []);
        setShowSuggestions(true);
      } catch (error) {
        console.error('Error fetching suggestions:', error);
      }
    } else {
      setLocationSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionSelect = async (suggestion: any) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${suggestion.place_id}&key=${GOOGLE_MAPS_API_KEY}&fields=geometry,formatted_address`
      );
      const data = await response.json();
      
      if (data.result) {
        const { lat, lng } = data.result.geometry.location;
        setLocation({
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        setLocationAddress(data.result.formatted_address);
        setLocationInputValue(data.result.formatted_address);
      }
    } catch (error) {
      console.error('Error fetching place details:', error);
    }
    
    setShowSuggestions(false);
  };

  const handleLocationSearch = async () => {
    if (!locationInputValue.trim()) return;

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationInputValue)}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const { lat, lng } = data.results[0].geometry.location;
        setLocation({
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        setLocationAddress(data.results[0].formatted_address);
        setLocationInputValue(data.results[0].formatted_address);
      }
    } catch (error) {
      console.error('Error searching location:', error);
    }
    
    setShowSuggestions(false);
  };

  const handleSave = async () => {
    if (!user || !event) return;

    // Validation
    if (!eventName.trim()) {
      Alert.alert('Error', 'Event name is required');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Event description is required');
      return;
    }

    if (!locationAddress.trim()) {
      Alert.alert('Error', 'Event location is required');
      return;
    }

    if (!duration.trim() || isNaN(Number(duration)) || Number(duration) <= 0) {
      Alert.alert('Error', 'Please enter a valid duration');
      return;
    }

    if (!selectedCategory) {
      Alert.alert('Error', 'Please select a category');
      return;
    }

    if (!maxVolunteers.trim() || isNaN(Number(maxVolunteers)) || Number(maxVolunteers) <= 0) {
      Alert.alert('Error', 'Please enter a valid number of volunteers');
      return;
    }

    if (!pointsReward.trim() || isNaN(Number(pointsReward)) || Number(pointsReward) < 0) {
      Alert.alert('Error', 'Please enter a valid points reward');
      return;
    }

    // Check if event is at least 1 hour away from current time
    const now = new Date();
    const eventTime = new Date(selectedDate);
    const timeDifference = eventTime.getTime() - now.getTime();
    const oneHourInMs = 60 * 60 * 1000; // 1 hour in milliseconds

    if (timeDifference < oneHourInMs) {
      Alert.alert('Error', 'Events must be scheduled at least 1 hour in advance');
      return;
    }

    setSaving(true);

    try {
      const updatedEventData = {
        name: eventName.trim(),
        description: description.trim(),
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          address: locationAddress.trim(),
        },
        date: selectedDate,
        duration: Number(duration),
        maxVolunteers: Number(maxVolunteers),
        pointsReward: Number(pointsReward),
        category: selectedCategory as any,
        organizerId: user.id,
        organizerName: user.name,
        currentVolunteers: event.currentVolunteers, // Keep existing volunteers
        volunteers: event.volunteers, // Keep existing volunteers
        status: event.status, // Keep existing status
        qrCode: event.qrCode, // Keep existing QR code
      };

      await FirebaseService.updateEvent(eventId!, updatedEventData);
      
      Alert.alert('Success', 'Event updated successfully', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      console.error('Error updating event:', error);
      Alert.alert('Error', 'Failed to update event. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Discard Changes',
      'Are you sure you want to discard your changes?',
      [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading event...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Event not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Top Bar */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <TouchableOpacity onPress={handleCancel}>
          <IconSymbol name="xmark" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Edit Event</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.saveButton, saving && styles.saveButtonDisabled]}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <TouchableWithoutFeedback onPress={() => setShowSuggestions(false)}>
          <View>
            {/* Event Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Event Name *</Text>
              <TextInput
                style={styles.input}
                value={eventName}
                onChangeText={setEventName}
                placeholder="Enter event name"
                placeholderTextColor="#999"
              />
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe your event..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Category */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Category *</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowCategoryPicker(true)}
              >
                <Text style={styles.pickerButtonText}>
                  {selectedCategory ? categoryOptions.find(cat => cat.value === selectedCategory)?.label : 'Select Category'}
                </Text>
                <IconSymbol name="chevron.down" size={16} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Duration */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Duration (hours) *</Text>
              <TextInput
                style={styles.input}
                value={duration}
                onChangeText={setDuration}
                placeholder="e.g., 3"
                placeholderTextColor="#999"
                keyboardType="numeric"
              />
            </View>

            {/* Max Volunteers */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Max Volunteers *</Text>
              <TextInput
                style={styles.input}
                value={maxVolunteers}
                onChangeText={setMaxVolunteers}
                placeholder="e.g., 20"
                placeholderTextColor="#999"
                keyboardType="numeric"
              />
            </View>

            {/* Points Reward */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Points Reward *</Text>
              <TextInput
                style={styles.input}
                value={pointsReward}
                onChangeText={setPointsReward}
                placeholder="e.g., 50"
                placeholderTextColor="#999"
                keyboardType="numeric"
              />
            </View>

            {/* Date & Time */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Date & Time *</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.pickerButtonText}>
                  {selectedDate.toLocaleDateString()} at {selectedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <IconSymbol name="calendar" size={16} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Location Search */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Location *</Text>
              <View style={styles.searchContainer}>
                <View style={styles.searchInputContainer}>
                  <TextInput
                    style={styles.searchInput}
                    value={locationInputValue}
                    onChangeText={handleLocationInputChange}
                    placeholder="Search for location..."
                    placeholderTextColor="#999"
                  />
                  <TouchableOpacity onPress={handleLocationSearch}>
                    <IconSymbol name="magnifyingglass" size={20} color="#666" />
                  </TouchableOpacity>
                </View>
                
                {showSuggestions && locationSuggestions.length > 0 && (
                  <View style={styles.suggestionsContainer}>
                    <ScrollView style={styles.suggestionsList}>
                      {locationSuggestions.map((suggestion, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.suggestionItem}
                          onPress={() => handleSuggestionSelect(suggestion)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.suggestionText}>{suggestion.description}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>

            {/* Map */}
            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                provider={PROVIDER_GOOGLE}
                region={location}
                onPress={(event) => {
                  const { latitude, longitude } = event.nativeEvent.coordinate;
                  setLocation({
                    latitude,
                    longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  });
                }}
              >
                <Marker
                  coordinate={{ latitude: location.latitude, longitude: location.longitude }}
                  title="Event Location"
                />
              </MapView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </ScrollView>

      {/* Category Picker Modal */}
      {showCategoryPicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                <IconSymbol name="xmark.circle.fill" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.categoryList}>
              {categoryOptions.map((category) => (
                <TouchableOpacity
                  key={category.value}
                  style={[
                    styles.categoryItem,
                    selectedCategory === category.value && styles.categoryItemSelected
                  ]}
                  onPress={() => {
                    setSelectedCategory(category.value);
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text style={[
                    styles.categoryText,
                    selectedCategory === category.value && styles.categoryTextSelected
                  ]}>
                    {category.label}
                  </Text>
                  {selectedCategory === category.value && (
                    <IconSymbol name="checkmark.circle.fill" size={20} color="#27ae60" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="datetime"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              setSelectedDate(selectedDate);
            }
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#27ae60',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  saveButton: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  inputGroup: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#333',
  },
  searchContainer: {
    position: 'relative',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    maxHeight: 200,
    zIndex: 1000,
  },
  suggestionsList: {
    maxHeight: 200,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionText: {
    fontSize: 14,
    color: '#333',
  },
  mapContainer: {
    height: 200,
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 8,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  categoryList: {
    maxHeight: 300,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  categoryItemSelected: {
    backgroundColor: '#e8f5e8',
  },
  categoryText: {
    fontSize: 16,
    color: '#333',
  },
  categoryTextSelected: {
    color: '#27ae60',
    fontWeight: '600',
  },
});
