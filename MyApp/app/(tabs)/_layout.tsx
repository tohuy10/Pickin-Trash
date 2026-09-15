import { Tabs } from "expo-router";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { HapticTab } from "@/components/haptic-tab";
import { useAuth } from "@/contexts/AuthContext";
import { useRefresh } from "@/hooks/useRefresh";
import { useMemo } from "react";
import { opacity } from "react-native-reanimated/lib/typescript/Colors";


export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { user } = useAuth();
  const role = user?.role;
  

  const isOrganizer = user?.role === 'organizer';

    const { refreshing, onRefresh } = useRefresh(async () => {
    console.log("Refreshing all tab pages...");
  });


  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors[colorScheme ?? "light"].background,
          borderTopWidth: 0,      
          height: 95,
          paddingTop: 12,  
          paddingBottom: 10,

          // Rounding Nav Bar
          // borderTopLeftRadius: 15,
          // borderTopRightRadius: 15,
          
          // These 2 lines below cause events and event history to clip into nav bar
          //position: 'absolute',
          //overflow: 'hidden',
        },
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        tabBarInactiveTintColor: "gray",
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={32} name="house.fill" color={color} />
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={32} name="calendar" color={color} />
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: role === "organizer" ? "Create Event" : "Scan QR",
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={32}
              name={role === "organizer" ? "plus.circle.fill" : "qrcode.viewfinder"}
              color={color ?? "gray"}
            />
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={32} name="tray.fill" color={color} />
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={32} name="person.fill" color={color} />
          ),
          tabBarLabel: () => null,
        }}
      />
    </Tabs>
  );
}
