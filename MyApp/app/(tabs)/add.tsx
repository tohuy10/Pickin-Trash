import React, { useRef, useState } from "react";
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
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/contexts/AuthContext";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import DateTimePicker from "@react-native-community/datetimepicker";
import { FirebaseService } from "@/firebase/service";
import { GOOGLE_MAPS_API_KEY } from "@/constants/maps";

export default function AddScreen() {
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [permission, requestPermission] = useCameraPermissions();
  const router = useRouter();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  // Event creation state
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
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    return twoHoursLater;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [duration, setDuration] = useState("");
  const [maxVolunteers, setMaxVolunteers] = useState("");
  const [pointsReward, setPointsReward] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Camera state
  const [facing] = useState<CameraType>("back");
  const cameraRef = useRef<CameraView>(null);
  const scanLock = useRef(false);

  const isOrganizer = user?.role === "organizer";

  // Category options
  const categories = [
    { value: "urban", label: "Urban" },
    { value: "beach", label: "Beach" },
    { value: "forest", label: "Forest" },
    { value: "ocean", label: "Ocean" },
    { value: "climate", label: "Climate" },
    { value: "community", label: "Community" },
    { value: "education", label: "Education" },
    { value: "health", label: "Health" },
    { value: "wildlife", label: "Wildlife" },
    { value: "conservation", label: "Conservation" },
    { value: "other", label: "Other" },
  ];

  if (!permission) return <SafeAreaView />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? "#000" : "#fff" }]}>
        <AlertPermission requestPermission={requestPermission} />
      </SafeAreaView>
    );
  }

  const handleBarCodeScanned = async ({
    type,
    data,
  }: {
    type: string;
    data: string;
  }) => {
    if (scanLock.current || !data || !user) return;

    scanLock.current = true;

    try {
      const events = await FirebaseService.getAllEvents();
      const event = events.find((e) => e.qrCode === data);

      if (!event) {
        Alert.alert("Invalid QR Code", "This QR code is not associated with any event.", [
          { text: "OK", onPress: () => (scanLock.current = false) },
        ]);
        return;
      }

      if (!event.volunteers.includes(user.id)) {
        Alert.alert("Not Joined", `You must join "${event.name}" before checking in.`, [
          { text: "OK", onPress: () => (scanLock.current = false) },
        ]);
        return;
      }

      const isCheckedIn = await FirebaseService.getUserCheckInStatus(event.id, user.id);
      if (isCheckedIn) {
        Alert.alert("Already Checked In", `You have already checked in to "${event.name}".`, [
          { text: "OK", onPress: () => (scanLock.current = false) },
        ]);
        return;
      }

      const success = await FirebaseService.checkInToEvent(event.id, user.id, "qr_code");
      if (success) {
        Alert.alert("Check-in Successful!", `You have successfully checked in to "${event.name}".`, [
          { text: "OK", onPress: () => (scanLock.current = false) },
        ]);
      } else {
        Alert.alert("Check-in Failed", "Unable to check in. Please try again.", [
          { text: "OK", onPress: () => (scanLock.current = false) },
        ]);
      }
    } catch (error) {
      console.error("QR scan error:", error);
      Alert.alert("Error", "Failed to process QR code. Please try again.", [
        { text: "OK", onPress: () => (scanLock.current = false) },
      ]);
    }
  };

  const handleLocationInputChange = async (text: string) => {
    setLocationInputValue(text);

    if (text.length > 2) {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
            text
          )}&key=${GOOGLE_MAPS_API_KEY}&types=establishment|geocode`
        );
        const data = await response.json();

        if (data.predictions) {
          setLocationSuggestions(data.predictions);
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error("Location suggestions error:", error);
        setLocationSuggestions([]);
        setShowSuggestions(false);
      }
    } else {
      setLocationSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionSelect = async (suggestion: any) => {
    setLocationInputValue(suggestion.description);
    setLocationAddress(suggestion.description);
    setShowSuggestions(false);

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${
          suggestion.place_id
        }&key=${GOOGLE_MAPS_API_KEY}&fields=geometry,formatted_address`
      );
      const data = await response.json();

      if (data.result) {
        const coords = data.result.geometry.location;

        setLocation({
          latitude: coords.lat,
          longitude: coords.lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });

        setLocationInputValue(data.result.formatted_address);
        setLocationAddress(data.result.formatted_address);
      }
    } catch (error) {
      console.error("Place details error:", error);
    }
  };

  const hideSuggestions = () => setShowSuggestions(false);

  const handleLocationSearch = async (query: string) => {
    if (!query.trim()) return;

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          query
        )}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const coords = result.geometry.location;

        setLocation({
          latitude: coords.lat,
          longitude: coords.lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        setLocationInputValue(result.formatted_address);
        setLocationAddress(result.formatted_address);
      } else {
        Alert.alert("Error", "Location not found. Please try a different search term.");
      }
    } catch (error) {
      console.error("Location search error:", error);
      Alert.alert("Error", "Failed to search location. Please try again.");
    }
  };

  const handleCreateEvent = async () => {
    if (
      !eventName ||
      !description ||
      !maxVolunteers ||
      !pointsReward ||
      !duration ||
      !selectedCategory ||
      !locationAddress
    ) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (!user) {
      Alert.alert("Error", "User not authenticated");
      return;
    }

    const now = new Date();
    const eventTime = new Date(selectedDate);
    const timeDifference = eventTime.getTime() - now.getTime();
    const oneHourInMs = 60 * 60 * 1000;

    if (timeDifference < oneHourInMs) {
      Alert.alert("Error", "Events must be scheduled at least 1 hour in advance");
      return;
    }

    try {
      const eventData = {
        name: eventName,
        description,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          address: locationAddress,
        },
        date: selectedDate,
        duration: parseInt(duration),
        maxVolunteers: parseInt(maxVolunteers),
        currentVolunteers: 0,
        pointsReward: parseInt(pointsReward),
        organizerId: user.id,
        organizerName: user.name,
        status: "active" as const,
        volunteers: [],
        category: selectedCategory as
          | "urban"
          | "beach"
          | "forest"
          | "ocean"
          | "climate"
          | "community"
          | "education"
          | "health"
          | "wildlife"
          | "conservation"
          | "other",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { eventId, checkInCode } = await FirebaseService.createEvent(eventData);

    Alert.alert(
        "Success",
        `Event created successfully!\n\nCheck-in Code: ${checkInCode}\n\nShare this code with volunteers for manual check-in.`,
      [
        {
            text: "OK",
          onPress: () => {
              setEventName("");
              setDescription("");
              setMaxVolunteers("");
              setPointsReward("");
              router.push(`/event-details?eventId=${eventId}`);
            },
          },
        ]
      );
    } catch (error) {
      console.error("Create event error:", error);
      Alert.alert("Error", "Failed to create event. Please try again.");
    }
  };

  const onDateChange = (event: any, picked?: Date) => {
    setShowDatePicker(false);
    if (picked) setSelectedDate(picked);
  };

  // Organizer view (form)
  if (isOrganizer) {
    const headerBg = isDark ? "#0b0b0b" : "#fff";
    const headerText = isDark ? "#fff" : "#111";
    const headerBorder = isDark ? "#222" : "#ddd";

    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: "#fff" }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={[
            styles.topBar,
            { backgroundColor: headerBg, borderBottomColor: headerBorder },
          ]}
        >
          <Text style={[styles.topBarTitle, { color: headerText }]}>Create Event</Text>
        </View>

        <ScrollView style={[styles.scrollContainer, { backgroundColor: "#fff" }]} contentInsetAdjustmentBehavior="automatic">
          <TouchableWithoutFeedback onPress={hideSuggestions}>
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Event Name</Text>
                <TextInput
                  style={styles.input}
                  value={eventName}
                  onChangeText={setEventName}
                  placeholder="Enter event name"
                  placeholderTextColor={"#aaa"}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe your event"
                  placeholderTextColor={"#aaa"}
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Category</Text>
                <TouchableOpacity style={styles.pickerButton} onPress={() => setShowCategoryPicker(true)}>
                  <Text style={styles.pickerButtonText}>
                    {selectedCategory ? categories.find((c) => c.value === selectedCategory)?.label : "Select Category"}
                  </Text>
                  <IconSymbol name="chevron.down" size={16} color="#666" />
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Event Location</Text>

                {/* Search row */}
                <View style={styles.searchContainer}>
                  <View style={styles.searchInputContainer}>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search for location (e.g., Bondi Beach, Sydney)"
                      placeholderTextColor={"#aaa"}
                      value={locationInputValue}
                      onChangeText={handleLocationInputChange}
                      onSubmitEditing={() => handleLocationSearch(locationInputValue)}
                      onFocus={() => {
                        if (locationSuggestions.length > 0) setShowSuggestions(true);
                      }}
                    />

                    {showSuggestions && locationSuggestions.length > 0 && (
                      <View style={styles.suggestionsContainer}>
                        <ScrollView style={styles.suggestionsList} nestedScrollEnabled>
                          {locationSuggestions.slice(0, 5).map((suggestion) => (
                            <TouchableOpacity
                              key={suggestion.place_id}
                              style={styles.suggestionItem}
                              onPress={() => handleSuggestionSelect(suggestion)}
                              activeOpacity={0.7}
                            >
                              <IconSymbol name="location.fill" size={16} color="#666" />
                              <Text style={styles.suggestionText} numberOfLines={1}>
                                {suggestion.description}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    style={styles.searchButton}
                    onPress={() => handleLocationSearch(locationInputValue)}
                  >
                    <IconSymbol name="magnifyingglass" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>

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
                      coordinate={{
                        latitude: location.latitude,
                        longitude: location.longitude,
                      }}
                      title="Event Location"
                    />
                  </MapView>
                </View>
                <Text style={styles.mapHint}>
                  Search for location above or tap on the map to set event location
                </Text>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Event Date & Time</Text>
                <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                  <IconSymbol name="calendar" size={20} color="#666" />
                  <Text style={styles.dateText}>
                    {selectedDate.toLocaleDateString()} at {selectedDate.toLocaleTimeString()}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <View style={styles.datePickerContainer}>
                    <DateTimePicker value={selectedDate} mode="datetime" display="default" onChange={onDateChange} />
                  </View>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Duration (hours)</Text>
                <TextInput
                  style={styles.input}
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="2"
                  placeholderTextColor={"#aaa"}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.rowContainer}>
                <View style={styles.halfInput}>
                  <Text style={styles.label}>Max Volunteers</Text>
                  <TextInput
                    style={styles.input}
                    value={maxVolunteers}
                    onChangeText={setMaxVolunteers}
                    placeholder="50"
                    placeholderTextColor={"#aaa"}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfInput}>
                  <Text style={styles.label}>Points Reward</Text>
                  <TextInput
                    style={styles.input}
                    value={pointsReward}
                    onChangeText={setPointsReward}
                    placeholder="100"
                    placeholderTextColor={"#aaa"}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.createButton} onPress={handleCreateEvent}>
                <Text style={styles.createButtonText}>Create Event</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </ScrollView>

        {/* Category Picker Modal */}
        {showCategoryPicker && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <ScrollView style={styles.categoryList}>
                {categories.map((category) => (
                  <TouchableOpacity
                    key={category.value}
                    style={[
                      styles.categoryItem,
                      selectedCategory === category.value && styles.categoryItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedCategory(category.value);
                      setShowCategoryPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        selectedCategory === category.value && styles.categoryTextSelected,
                      ]}
                    >
                      {category.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowCategoryPicker(false)}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    );
  }

  // Volunteer QR Scanner View (edge-to-edge, no white gaps)
  return (
    // Use a plain View so no top/bottom safe-area paddings create bands.
    <View style={[styles.cameraScreen, { backgroundColor: "#000" }]}>
      {isFocused && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleBarCodeScanned}
        />
      )}

      {/* Overlay */}
      <View pointerEvents="none" style={styles.overlayRoot}>
        <View style={styles.maskRow} />
        <View style={styles.maskCenterRow}>
          <View style={styles.maskSide} />
          <View style={styles.frameWrapper}>
            <View style={styles.scannerFrame} />
          </View>
          <View style={styles.maskSide} />
        </View>
        <View style={styles.maskRow} />
        <Text style={styles.scannerText}>Position QR code within the frame</Text>
      </View>
    </View>
  );
}

function AlertPermission({ requestPermission }: { requestPermission: () => void }) {
  React.useEffect(() => {
    Alert.alert("Camera permission", "We need your permission to use the camera for QR scanning.", [
      { text: "Grant permission", onPress: requestPermission },
    ]);
  }, [requestPermission]);
  return null;
}

const FRAME_SIZE = 260;
const FRAME_RADIUS = 0;
const MASK_COLOR = "rgba(0,0,0,0.5)";
const MASK_RADIUS = 16;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Themed header (organizer form)
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 70,
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },

  // --- CAMERA (Volunteer) ---
  cameraScreen: {
    flex: 1,
    // No padding/margins so the camera truly fills behind the tab bar/status bar
  },
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },

  // Dimmed mask around the frame (works in dark & light modes)
  maskRow: {
    flex: 1,
    width: "100%",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  maskCenterRow: {
    width: "100%",
    height: 260,
    flexDirection: "row",
    alignItems: "center",
  },
  maskSide: {
    flex: 1,
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.5)",
  },

  // Shadow wrapper -> same size and radius as the frame
  frameWrapper: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderRadius: FRAME_RADIUS,
    alignItems: "center",
    justifyContent: "center",

    // iOS shadow
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 14,     // tweak as desired
    shadowOffset: { width: 0, height: 6 },

    // Android shadow
    elevation: 10,
    backgroundColor: "transparent",
  },

  scannerFrame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderWidth: 2,
    borderColor: "#27ae60",
    backgroundColor: "transparent",
    borderRadius: FRAME_RADIUS,
  },
  scannerText: {
    position: "absolute",
    bottom: 40, // sits above the tab bar
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },

  // --- FORM (Organizer) ---
  scrollContainer: { flex: 1 },
  form: { padding: 20 },
  inputContainer: { marginBottom: 24 },
  rowContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  halfInput: { flex: 1, marginHorizontal: 5 },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2c3e50",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#f8f9fa",
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  mapContainer: {
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  map: { flex: 1 },
  mapHint: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#f8f9fa",
  },
  dateText: {
    marginLeft: 12,
    fontSize: 16,
    color: "#2c3e50",
  },
  datePickerContainer: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 8,
  },
  createButton: {
    backgroundColor: "#27ae60",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
  },
  createButtonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  // Picker / search
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  pickerButtonText: { fontSize: 16, color: "#333" },

  searchContainer: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  searchInputContainer: { flex: 1, position: "relative" },
  searchInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  suggestionsContainer: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    zIndex: 1000,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  suggestionsList: { maxHeight: 200 },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  suggestionText: { marginLeft: 8, fontSize: 14, color: "#333", flex: 1 },

  searchButton: {
    backgroundColor: "#3498db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginLeft: 8,
  },

  // Modal
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "80%",
    maxHeight: "60%",
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 15, textAlign: "center" },
  categoryList: { maxHeight: 300 },
  categoryItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  categoryItemSelected: { backgroundColor: "#3498db" },
  categoryText: { fontSize: 16, color: "#333" },
  categoryTextSelected: { color: "#fff", fontWeight: "bold" },
  modalCloseButton: { marginTop: 15, paddingVertical: 10, alignItems: "center" },
  modalCloseText: { fontSize: 16, color: "#666" },
});
