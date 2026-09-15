import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  createItem,
  deleteItem,
  getItem,
  listSections,
  updateItem,
  type Section,
} from "@/db/database";
import {
  cancelReminder,
  scheduleReminder,
  scheduleRecurringReminder,
  type Recurrence,
} from "@/lib/notifications";
import { colors } from "@/theme";

function getContrastColor(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 140 ? "#111111" : "#ffffff";
}

// 1=Dom, 2=Seg, 3=Ter, 4=Qua, 5=Qui, 6=Sex, 7=Sáb (padrão expo-notifications)
const WEEK_DAYS = [
  { label: "Dom", value: 1 },
  { label: "Seg", value: 2 },
  { label: "Ter", value: 3 },
  { label: "Qua", value: 4 },
  { label: "Qui", value: 5 },
  { label: "Sex", value: 6 },
  { label: "Sáb", value: 7 },
];

type ReminderMode = "none" | "once" | "recurring";
type RecurringType = "daily" | "weekly";

export default function EditScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { id, section_id: sectionIdParam } =
    useLocalSearchParams<{ id?: string; section_id?: string }>();
  const editing = !!id;
  const itemId = id ? Number(id) : null;

  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState<number | null>(
    sectionIdParam ? Number(sectionIdParam) : null
  );
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [existingNotifId, setExistingNotifId] = useState<string | null>(null);

  // Modo do lembrete
  const [reminderMode, setReminderMode] = useState<ReminderMode>("none");

  // Lembrete pontual
  const [remindAt, setRemindAt] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");

  // Lembrete recorrente
  const [recurringType, setRecurringType] = useState<RecurringType>("daily");
  const [recurringHour, setRecurringHour] = useState(8);
  const [recurringMinute, setRecurringMinute] = useState(0);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: editing ? "Editar" : "Novo" });

    listSections().then((list) => {
      setSections(list);
      if (!sectionIdParam && !itemId && list.length > 0) {
        setSectionId(list[0].id);
      }
    });

    if (itemId) {
      getItem(itemId).then((it) => {
        if (!it) return;
        setSectionId(it.section_id);
        setTitle(it.title);
        setContent(it.content);
        setExistingNotifId(it.notification_id);

        if (it.recurrence) {
          const rec = JSON.parse(it.recurrence) as Recurrence;
          setReminderMode("recurring");
          setRecurringType(rec.type);
          setRecurringHour(rec.hour);
          setRecurringMinute(rec.minute);
          if (rec.type === "weekly") setRecurringDays(rec.days);
        } else if (it.remind_at) {
          setReminderMode("once");
          setRemindAt(new Date(it.remind_at));
        }
      });
    }
  }, [itemId]);

  const openOncePicker = (mode: "date" | "time") => {
    if (!remindAt) setRemindAt(defaultReminderDate());
    setPickerMode(mode);
    setShowPicker(true);
  };

  const onOncePicker = (event: any, selected?: Date) => {
    setShowPicker(Platform.OS === "ios");
    if (event.type === "dismissed" || !selected) return;
    const base = remindAt ?? defaultReminderDate();
    const next = new Date(base);
    if (pickerMode === "date") {
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    } else {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    }
    setRemindAt(next);
  };

  const onTimePicker = (event: any, selected?: Date) => {
    setShowTimePicker(Platform.OS === "ios");
    if (event.type === "dismissed" || !selected) return;
    setRecurringHour(selected.getHours());
    setRecurringMinute(selected.getMinutes());
  };

  const toggleDay = (day: number) => {
    setRecurringDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Ops", "Dá um título pelo menos 🙂");
      return;
    }
    if (!sectionId) {
      Alert.alert("Ops", "Selecione uma seção 🙂");
      return;
    }

    // Validações de recorrência
    if (reminderMode === "recurring" && recurringType === "weekly" && recurringDays.length === 0) {
      Alert.alert("Ops", "Selecione pelo menos um dia da semana.");
      return;
    }

    await cancelReminder(existingNotifId);
    let notifId: string | null = null;
    let recurrenceJson: string | null = null;
    let remindAtMs: number | null = null;

    if (reminderMode === "once") {
      if (!remindAt) {
        Alert.alert("Ops", "Escolha a data e hora do lembrete.");
        return;
      }
      if (remindAt.getTime() <= Date.now()) {
        Alert.alert("Data no passado", "Escolha uma data futura para receber o lembrete.");
        return;
      }
      notifId = await scheduleReminder(title.trim(), content.trim(), remindAt);
      remindAtMs = remindAt.getTime();
    } else if (reminderMode === "recurring") {
      const recurrence: Recurrence =
        recurringType === "daily"
          ? { type: "daily", hour: recurringHour, minute: recurringMinute }
          : { type: "weekly", days: recurringDays, hour: recurringHour, minute: recurringMinute };
      notifId = await scheduleRecurringReminder(title.trim(), content.trim(), recurrence);
      recurrenceJson = JSON.stringify(recurrence);
    }

    const payload = {
      section_id: sectionId,
      title: title.trim(),
      content: content.trim(),
      remind_at: remindAtMs,
      notification_id: notifId,
      recurrence: recurrenceJson,
    };

    if (itemId) {
      await updateItem(itemId, payload);
    } else {
      await createItem(payload);
    }
    router.back();
  };

  const handleDelete = () => {
    Alert.alert("Excluir", "Tem certeza que quer excluir?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          if (itemId) {
            await cancelReminder(existingNotifId);
            await deleteItem(itemId);
          }
          router.back();
        },
      },
    ]);
  };

  const recurringTimeLabel = `${String(recurringHour).padStart(2, "0")}:${String(recurringMinute).padStart(2, "0")}`;

  const sectionColor =
    sections.find((s) => s.id === sectionId)?.color ?? colors.primary;
  const sectionContrastColor = getContrastColor(sectionColor);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Seletor de seção */}
      <Text style={styles.label}>Seção</Text>
      {sections.length === 0 ? (
        <Text style={styles.noSections}>
          Nenhuma seção criada. Volte e crie uma seção primeiro.
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sectionRow}
        >
          {sections.map((s) => {
            const active = sectionId === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => setSectionId(s.id)}
                style={[
                  styles.sectionChip,
                  active && {
                    backgroundColor: s.color,
                    borderColor: s.color,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sectionChipText,
                    active && { color: getContrastColor(s.color) },
                  ]}
                >
                  {s.icon} {s.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Título */}
      <Text style={styles.label}>Título</Text>
      <TextInput
        style={styles.input}
        placeholder="Sobre o que é?"
        placeholderTextColor={colors.textDim}
        value={title}
        onChangeText={setTitle}
        multiline
        textAlignVertical="top"
      />

      {/* Detalhes */}
      <Text style={styles.label}>Detalhes</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Escreva aqui..."
        placeholderTextColor={colors.textDim}
        value={content}
        onChangeText={setContent}
        multiline
        textAlignVertical="top"
      />

      {/* Lembrete */}
      <View style={styles.reminderBox}>
        <Text style={styles.label}>Lembrete</Text>

        {/* Seletor de modo */}
        <View style={styles.modeRow}>
          {(["none", "once", "recurring"] as ReminderMode[]).map((m) => {
            const active = reminderMode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setReminderMode(m)}
                style={[
                  styles.modeChip,
                  active && { backgroundColor: sectionColor, borderColor: sectionColor },
                ]}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    active && { color: sectionContrastColor },
                  ]}
                >
                  {m === "none" ? "Sem lembrete" : m === "once" ? "Uma vez" : "Repetir"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Lembrete pontual */}
        {reminderMode === "once" && (
          <View style={styles.onceSection}>
            <View style={styles.dateRow}>
              <Pressable style={styles.dateBtn} onPress={() => openOncePicker("date")}>
                <Text style={styles.dateBtnText}>
                  📅 {remindAt ? remindAt.toLocaleDateString("pt-BR") : "Data"}
                </Text>
              </Pressable>
              <Pressable style={styles.dateBtn} onPress={() => openOncePicker("time")}>
                <Text style={styles.dateBtnText}>
                  🕐{" "}
                  {remindAt
                    ? remindAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                    : "Hora"}
                </Text>
              </Pressable>
            </View>
            {showPicker && (
              <DateTimePicker
                value={remindAt ?? defaultReminderDate()}
                mode={pickerMode}
                onChange={onOncePicker}
                minimumDate={pickerMode === "date" ? new Date() : undefined}
              />
            )}
          </View>
        )}

        {/* Lembrete recorrente */}
        {reminderMode === "recurring" && (
          <View style={styles.recurringSection}>
            {/* Tipo: todo dia vs dias da semana */}
            <View style={styles.recTypeRow}>
              <Pressable
                onPress={() => setRecurringType("daily")}
                style={[
                  styles.recTypeChip,
                  recurringType === "daily" && { backgroundColor: sectionColor, borderColor: sectionColor },
                ]}
              >
                <Text style={[styles.recTypeText, recurringType === "daily" && { color: sectionContrastColor }]}>
                  Todo dia
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setRecurringType("weekly")}
                style={[
                  styles.recTypeChip,
                  recurringType === "weekly" && { backgroundColor: sectionColor, borderColor: sectionColor },
                ]}
              >
                <Text style={[styles.recTypeText, recurringType === "weekly" && { color: sectionContrastColor }]}>
                  Dias da semana
                </Text>
              </Pressable>
            </View>

            {/* Seleção de dias da semana */}
            {recurringType === "weekly" && (
              <View style={styles.daysRow}>
                {WEEK_DAYS.map((d) => {
                  const selected = recurringDays.includes(d.value);
                  return (
                    <Pressable
                      key={d.value}
                      onPress={() => toggleDay(d.value)}
                      style={[styles.dayChip, selected && { backgroundColor: sectionColor, borderColor: sectionColor }]}
                    >
                      <Text style={[styles.dayChipText, selected && { color: sectionContrastColor }]}>
                        {d.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Horário */}
            <Pressable style={styles.timeBtn} onPress={() => setShowTimePicker(true)}>
              <Text style={styles.timeBtnLabel}>Horário</Text>
              <Text style={styles.timeBtnValue}>🕐 {recurringTimeLabel}</Text>
            </Pressable>

            {showTimePicker && (
              <DateTimePicker
                value={(() => {
                  const d = new Date();
                  d.setHours(recurringHour, recurringMinute, 0, 0);
                  return d;
                })()}
                mode="time"
                onChange={onTimePicker}
              />
            )}
          </View>
        )}
      </View>

      {/* Salvar */}
      <Pressable
        style={[styles.saveBtn, { backgroundColor: sectionColor }]}
        onPress={handleSave}
      >
        <Text style={[styles.saveBtnText, { color: sectionContrastColor }]}>Salvar</Text>
      </Pressable>

      {editing && (
        <Pressable style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnText}>Excluir</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function defaultReminderDate(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  label: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  noSections: {
    color: colors.textDim,
    fontSize: 14,
    fontStyle: "italic",
    marginBottom: 8,
  },
  sectionRow: { gap: 8, paddingBottom: 4 },
  sectionChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sectionChipText: { color: colors.text, fontWeight: "600", fontSize: 14 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  multiline: { minHeight: 120 },

  reminderBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Seletor de modo
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  modeChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  modeChipText: { color: colors.textDim, fontSize: 12, fontWeight: "700" },
  modeChipTextActive: { color: colors.text },

  // Lembrete pontual
  onceSection: {},
  dateRow: { flexDirection: "row", gap: 12 },
  dateBtn: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  dateBtnText: { color: colors.text, fontWeight: "600" },

  // Lembrete recorrente
  recurringSection: { gap: 14 },
  recTypeRow: { flexDirection: "row", gap: 10 },
  recTypeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  recTypeChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  recTypeText: { color: colors.textDim, fontWeight: "700", fontSize: 13 },
  recTypeTextActive: { color: colors.text },

  daysRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  dayChip: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipText: { color: colors.textDim, fontSize: 11, fontWeight: "700" },
  dayChipTextActive: { color: "#111111" },

  timeBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  timeBtnLabel: { color: colors.textDim, fontSize: 13, fontWeight: "700" },
  timeBtnValue: { color: colors.text, fontWeight: "700", fontSize: 15 },

  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 28,
  },
  saveBtnText: { color: "#111111", fontWeight: "800", fontSize: 16 },
  deleteBtn: { padding: 16, alignItems: "center", marginTop: 8 },
  deleteBtnText: { color: colors.danger, fontWeight: "700" },
});
