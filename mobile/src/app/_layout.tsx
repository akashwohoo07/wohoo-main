import "../global.css";
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { queryClient } from "../lib/queryClient";
import { Loading } from "../components/ui";
import { colors } from "../theme";

function RootNavigator() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onAuthScreen = segments[0] === "login";
    if (!user && !onAuthScreen) router.replace("/login");
    else if (user && onAuthScreen) router.replace("/");
  }, [user, loading, segments]);

  if (loading) return <Loading label="Loading Wohoo…" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.cream },
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="trip/[id]" options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="trip/create" options={{ presentation: "modal", headerShown: true, title: "New trip" }} />
      <Stack.Screen name="u/[username]" options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="invite/[token]" options={{ headerShown: true, title: "Trip invite" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
