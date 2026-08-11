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
import { cancelReminder, scheduleReminder } from "@/lib/notifications";
import { colors } from "@/theme";

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
  const [remindAt, setRemindAt] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [existingNotifId, setExistingNotifId] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editing ? "Editar" : "Novo" });

    listSections().then((list) => {
      setSections(list);
      // Se não veio section_id no param, pega o primeiro disponível
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
        setRemindAt(it.remind_at ? new Date(it.remind_at) : null);
        setExistingNotifId(it.notification_id);
      });
    }
  }, [itemId]);

  const openPicker = (mode: "date" | "time") => {
    if (!remindAt) setRemindAt(defaultReminderDate());
    setPickerMode(mode);
    setShowPicker(true);
  };

  const onPickerChange = (event: any, selected?: Date) => {
    setShowPicker(Platform.OS === "ios");
    if (event.type === "dismissed" || !selected) return;
    const base = remindAt ?? defaultReminderDate();
    const next = new Date(base);
    if (pickerMode === "date") {
      next.setFullYear(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate()
      );
    } else {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    }
    setRemindAt(next);
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

    await cancelReminder(existingNotifId);
    let notifId: string | null = null;
    if (remindAt) {
      if (remindAt.getTime() <= Date.now()) {
        Alert.alert(
          "Data no passado",
          "Escolha uma data futura para receber o lembrete."
        );
        return;
      }
      notifId = await scheduleReminder(title.trim(), content.trim(), remindAt);
    }

    const payload = {
      section_id: sectionId,
      title: title.trim(),
      content: content.trim(),
      remind_at: remindAt ? remindAt.getTime() : null,
      notification_id: notifId,
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
                    active && { color: colors.bg },
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

      {/* Lembrete (opcional para qualquer item) */}
      <View style={styles.reminderBox}>
        <Text style={styles.label}>Lembrete (opcional)</Text>
        <View style={styles.dateRow}>
          <Pressable style={styles.dateBtn} onPress={() => openPicker("date")}>
            <Text style={styles.dateBtnText}>
              📅 {remindAt ? remindAt.toLocaleDateString("pt-BR") : "Data"}
            </Text>
          </Pressable>
          <Pressable style={styles.dateBtn} onPress={() => openPicker("time")}>
            <Text style={styles.dateBtnText}>
              🕐{" "}
              {remindAt
                ? remindAt.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Hora"}
            </Text>
          </Pressable>
        </View>
        {remindAt && (
          <Pressable onPress={() => setRemindAt(null)} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Remover lembrete</Text>
          </Pressable>
        )}
        {showPicker && (
          <DateTimePicker
            value={remindAt ?? defaultReminderDate()}
            mode={pickerMode}
            onChange={onPickerChange}
            minimumDate={pickerMode === "date" ? new Date() : undefined}
          />
        )}
      </View>

      {/* Salvar */}
      <Pressable style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Salvar</Text>
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
  dateRow: { flexDirection: "row", gap: 12 },
  dateBtn: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  dateBtnText: { color: colors.text, fontWeight: "600" },
  clearBtn: { marginTop: 12, alignSelf: "flex-start" },
  clearBtnText: { color: colors.danger, fontWeight: "600" },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 28,
  },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  deleteBtn: { padding: 16, alignItems: "center", marginTop: 8 },
  deleteBtnText: { color: colors.danger, fontWeight: "700" },
});
