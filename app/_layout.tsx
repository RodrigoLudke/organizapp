import { useEffect, useRef, useState } from "react";
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
  const bootRan = useRef(false);

  useEffect(() => {
    if (bootRan.current) return;
    bootRan.current = true;
    (async () => {
      try {
        console.log("[boot] iniciando DB e notificações");
        await initDatabase();
        console.log("[boot] DB ok");
        await setupNotifications();
        console.log("[boot] notificações ok");
      } catch (e) {
        console.log("[boot] DB/notificações erro:", e);
      }

      // Renderiza o app e esconde a splash assim que o essencial está pronto.
      // Formulário de consentimento e anúncio aparecem como overlays por cima.
      setReady(true);
      await SplashScreen.hideAsync();

      try {
        console.log("[boot] tracking permission");
        const { status } = await getTrackingPermissionsAsync();
        if (status === PermissionStatus.UNDETERMINED) {
          await requestTrackingPermissionsAsync();
        }
        console.log("[boot] tracking ok:", status);

        let nonPersonalizedOnly = true;
        try {
          if (__DEV__) await AdsConsent.reset();
          console.log("[boot] requestInfoUpdate...");
          const consentInfo = await AdsConsent.requestInfoUpdate();
          console.log("[boot] consentInfo:", consentInfo.status, "formAvailable:", consentInfo.isConsentFormAvailable);
          if (
            consentInfo.isConsentFormAvailable &&
            consentInfo.status === AdsConsentStatus.REQUIRED
          ) {
            console.log("[boot] mostrando formulário de consentimento");
            const updated = await AdsConsent.showForm();
            console.log("[boot] formulário respondido:", updated.status);
            nonPersonalizedOnly = updated.status !== AdsConsentStatus.OBTAINED;
          } else {
            nonPersonalizedOnly =
              consentInfo.status !== AdsConsentStatus.OBTAINED &&
              consentInfo.status !== AdsConsentStatus.NOT_REQUIRED;
          }
        } catch (e) {
          console.log("[boot] consent erro:", e);
        }

        console.log("[boot] mobileAds initialize...");
        await mobileAds().initialize();
        console.log("[boot] mobileAds ok");

        await incrementAppOpenCount();
        const show = await shouldShowAppOpenAd();
        console.log("[boot] shouldShowAppOpenAd:", show);
        if (show) {
          console.log("[boot] mostrando app open ad...");
          await showAppOpenAd(nonPersonalizedOnly);
          await recordAdShown();
          console.log("[boot] ad fechado");
        }
      } catch (e) {
        console.log("[boot] ads erro:", e);
      }

      console.log("[boot] pronto");
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
