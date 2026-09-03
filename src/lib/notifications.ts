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

// 1 = Domingo, 2 = Segunda, ..., 7 = Sábado (padrão expo-notifications)
export type Recurrence =
  | { type: "daily"; hour: number; minute: number }
  | { type: "weekly"; days: number[]; hour: number; minute: number };

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

export async function scheduleRecurringReminder(
  title: string,
  body: string,
  recurrence: Recurrence
): Promise<string | null> {
  if (!N) return null;

  const content = {
    title: title || "Lembrete",
    body: body || "Você tem um lembrete!",
    sound: true,
  };

  if (recurrence.type === "daily") {
    const id = await N.scheduleNotificationAsync({
      content,
      trigger: {
        type: N.SchedulableTriggerInputTypes.DAILY,
        hour: recurrence.hour,
        minute: recurrence.minute,
        channelId: "reminders",
      },
    });
    return id;
  } else {
    // weekly: uma notificação por dia selecionado
    const ids: string[] = [];
    for (const weekday of recurrence.days) {
      const id = await N.scheduleNotificationAsync({
        content,
        trigger: {
          type: N.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: recurrence.hour,
          minute: recurrence.minute,
          channelId: "reminders",
        },
      });
      ids.push(id);
    }
    return ids.length > 0 ? JSON.stringify(ids) : null;
  }
}

export async function cancelReminder(id: string | null): Promise<void> {
  if (!N || !id) return;
  try {
    if (id.startsWith("[")) {
      // JSON array — recorrência com múltiplos dias
      const ids = JSON.parse(id) as string[];
      for (const singleId of ids) {
        await N.cancelScheduledNotificationAsync(singleId).catch(() => {});
      }
    } else {
      await N.cancelScheduledNotificationAsync(id);
    }
  } catch {
    // já pode ter disparado/expirado — sem problema
  }
}
