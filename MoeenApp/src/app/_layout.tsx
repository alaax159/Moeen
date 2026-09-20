import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  useSegments,
} from "expo-router";

import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { Colors } from "@/constants/theme";
import { AuthProvider, useAuth } from "@/context/AuthContext";

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const colorScheme = useColorScheme();
  const colors = colorScheme === "dark" ? Colors.dark : Colors.light;
  const { user, loading, authError, clearAuthError } = useAuth();
  const [rootSegment] = useSegments();
  const isPublicEmergencyRoute = String(rootSegment) === "e";

  useEffect(() => {
    if (!authError || isPublicEmergencyRoute) {
      return;
    }

    Alert.alert("Sign-in problem", authError, [
      { text: "OK", onPress: clearAuthError },
    ]);
  }, [authError, clearAuthError, isPublicEmergencyRoute]);

  // Keep a visible, useful state while Firebase and the API validate the
  // session. Returning null here leaves a physical device on a white screen
  // whenever its backend connection is slow or unavailable.
  if (loading && !isPublicEmergencyRoute) {
    return (
      <View
        accessibilityLabel="Connecting to Moeen"
        accessibilityRole="progressbar"
        style={[styles.loadingScreen, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.loadingTitle, { color: colors.text }]}>Moeen</Text>
        <Text style={[styles.loadingMessage, { color: colors.textSecondary }]}>
          Connecting to your account…
        </Text>
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Root entry: redirects a normal launch away from the public "/e" page */}
        <Stack.Screen name="index" />
        <Stack.Screen name="e" />
        {/* User is NOT logged in */}
        <Stack.Protected guard={!user}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        {/* User IS logged in */}
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>

      <AnimatedSplashOverlay />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <KeyboardProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  loadingTitle: {
    marginTop: 20,
    fontSize: 28,
    fontWeight: "800",
  },
  loadingMessage: {
    marginTop: 8,
    fontSize: 15,
    textAlign: "center",
  },
});
