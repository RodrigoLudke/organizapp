import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import mobileAds, {
  AdsConsent,
  AdsConsentStatus,
} from "react-native-google-mobile-ads";
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  PermissionStatus,
} from "expo-tracking-transparency";
import { initDatabase } from "@/db/database";
import { setupNotifications } from "@/lib/notifications";
import { colors } from "@/theme";
import {
  incrementAppOpenCount,
  shouldShowAppOpenAd,
  showAppOpenAd,
  recordAdShown,
} from "@/ads/appOpenAd";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await initDatabase();
      await setupNotifications();

      try {
        // ATT — iOS only; no-op on Android
        const { status } = await getTrackingPermissionsAsync();
        if (status === PermissionStatus.UNDETERMINED) {
          await requestTrackingPermissionsAsync();
        }

        await mobileAds().initialize();

        // UMP consent (LGPD — never blocks boot on failure)
        try {
          const consentInfo = await AdsConsent.requestInfoUpdate();
          if (
            consentInfo.isConsentFormAvailable &&
            consentInfo.status === AdsConsentStatus.REQUIRED
          ) {
            await AdsConsent.showForm();
          }
        } catch {
          // Consent unavailable — proceed with non-personalized ads
        }

        await incrementAppOpenCount();
        if (await shouldShowAppOpenAd()) {
          await showAppOpenAd();
          await recordAdShown();
        }
      } catch {
        // Ads SDK failure must never prevent the app from opening
      }

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
