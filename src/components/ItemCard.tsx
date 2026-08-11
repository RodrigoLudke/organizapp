import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Item, Section } from "@/db/database";
import { colors } from "@/theme";

function formatRemind(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (sameDay) return `Hoje ${time}`;
  const date = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  return `${date} ${time}`;
}

type Props = {
  item: Item;
  section: Section;
  onPress: () => void;
  onToggle: () => void;
};

export default function ItemCard({ item, section, onPress, onToggle }: Props) {
  const isDone = item.done === 1;
  const overdue =
    item.remind_at != null && item.remind_at < Date.now() && !isDone;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Pressable onPress={onToggle} hitSlop={8} style={styles.check}>
        <View
          style={[
            styles.checkbox,
            { borderColor: section.color },
            isDone && { backgroundColor: section.color },
          ]}
        >
          {isDone && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </Pressable>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.tag, { color: section.color }]}>
            {section.icon} {section.name}
          </Text>
          {item.remind_at != null && (
            <Text style={[styles.remind, overdue && { color: colors.danger }]}>
              ⏰ {formatRemind(item.remind_at)}
            </Text>
          )}
        </View>
        <Text
          style={[styles.title, isDone && styles.doneText]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        {item.content.length > 0 && (
          <Text style={styles.content} numberOfLines={2}>
            {item.content}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  pressed: { opacity: 0.7 },
  check: { paddingTop: 2 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmark: { color: colors.bg, fontWeight: "900", fontSize: 14 },
  body: { flex: 1 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  tag: { fontSize: 12, fontWeight: "700" },
  remind: { color: colors.primarySoft, fontSize: 12, fontWeight: "600" },
  title: { color: colors.text, fontSize: 16, fontWeight: "700" },
  doneText: {
    textDecorationLine: "line-through",
    color: colors.textDim,
  },
  content: { color: colors.textDim, fontSize: 14, marginTop: 2 },
});
