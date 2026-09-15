import { Stack , router } from "expo-router";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useEffect, useRef } from "react";


function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const didRoute = useRef(false);

  useEffect(() => {
    if (isLoading || didRoute.current) return;
  didRoute.current = true;
  router.replace(user ? "/(tabs)" : "/login");
  }, [isLoading, user]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
