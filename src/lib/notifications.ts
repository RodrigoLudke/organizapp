import { Platform } from "react-native";
import Constants from "expo-constants";

// No Expo Go (SDK 53+), expo-notifications crasha ao importar.
// Usamos require() dinâmico com try/catch para evitar o crash.
const isExpoGo = Constants.appOwnership === "expo";

type NotificationsModule = typeof import("expo-notifications");
let N: NotificationsModule | null = null;

if (!isExpoGo) {
  try {
    N = require("expo-notifications") as NotificationsModule;
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // não deve acontecer fora do Expo Go, mas protege por via das dúvidas
  }
}

export async function setupNotifications(): Promise<boolean> {
  if (!N) return false;

  if (Platform.OS === "android") {
    await N.setNotificationChannelAsync("reminders", {
      name: "Lembretes",
      importance: N.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6C5CE7",
    });
  }

  const settings = await N.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted) {
    const req = await N.requestPermissionsAsync();
    granted = req.granted;
  }
  return granted;
}

export async function scheduleReminder(
  title: string,
  body: string,
  date: Date
): Promise<string | null> {
  if (!N || date.getTime() <= Date.now()) return null;

  return N.scheduleNotificationAsync({
    content: {
      title: title || "Lembrete",
      body: body || "Você tem um lembrete!",
      sound: true,
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: "reminders",
    },
  });
}

export async function cancelReminder(id: string | null): Promise<void> {
  if (!N || !id) return;
  try {
    await N.cancelScheduledNotificationAsync(id);
  } catch {
    // já pode ter disparado/expirado — sem problema
  }
}
