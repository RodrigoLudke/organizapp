import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { initDatabase } from "@/db/database";
import { setupNotifications } from "@/lib/notifications";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await initDatabase();
      await setupNotifications();
      setReady(true);
      await SplashScreen.hideAsync();
    })();
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "OrganizApp" }} />
        <Stack.Screen
          name="edit"
          options={{ title: "Novo", presentation: "modal" }}
        />
        <Stack.Screen
          name="settings"
          options={{ title: "Configurações", presentation: "modal" }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
