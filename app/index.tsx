import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";
import LembretesTab from "@/components/LembretesTab";
import FinanceiroTab from "@/components/FinanceiroTab";

type Tab = "lembretes" | "financeiro";

const TAB_BAR_HEIGHT = 56;

export default function Home() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("lembretes");

  const extraBottom = TAB_BAR_HEIGHT + insets.bottom;

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerTitleAlign: "center",
          headerTitle: () => (
            <Image
              source={require("../assets/logo_marca_clara.png")}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          ),
          headerRight: () => (
            <Pressable
              onPress={() => router.push("/settings")}
              style={styles.gearBtn}
              hitSlop={8}
            >
              <Ionicons name="settings-outline" size={22} color={colors.textDim} />
            </Pressable>
          ),
        }}
      />
      {/* Ambas as abas ficam montadas para preservar estado */}
      <View style={[styles.tabContent, activeTab !== "lembretes" && styles.hidden]}>
        <LembretesTab extraBottom={extraBottom} />
      </View>
      <View style={[styles.tabContent, activeTab !== "financeiro" && styles.hidden]}>
        <FinanceiroTab extraBottom={extraBottom} />
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
        <Pressable
          style={styles.tabItem}
          onPress={() => setActiveTab("lembretes")}
        >
          <Text style={[styles.tabIcon, activeTab === "lembretes" && styles.tabIconActive]}>
            📝
          </Text>
          <Text style={[styles.tabLabel, activeTab === "lembretes" && styles.tabLabelActive]}>
            Lembretes
          </Text>
        </Pressable>

        <Pressable
          style={styles.tabItem}
          onPress={() => setActiveTab("financeiro")}
        >
          <Text style={[styles.tabIcon, activeTab === "financeiro" && styles.tabIconActive]}>
            💳
          </Text>
          <Text style={[styles.tabLabel, activeTab === "financeiro" && styles.tabLabelActive]}>
            Finanças
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tabContent: { flex: 1 },
  hidden: { display: "none" },

  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: TAB_BAR_HEIGHT,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingTop: 6,
  },
  tabIcon: { fontSize: 20, opacity: 0.4 },
  tabIconActive: { opacity: 1 },
  tabLabel: { fontSize: 11, color: colors.textDim, fontWeight: "600" },
  tabLabelActive: { color: colors.text },
  gearBtn: { marginRight: 4 },
  headerLogo: { height: 40, width: 180, backgroundColor: "transparent" },
});
