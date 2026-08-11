import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import {
  listItems,
  listSections,
  createSection,
  deleteSection,
  countItemsInSection,
  toggleDone,
  type Item,
  type Section,
} from "@/db/database";
import { colors, SECTION_COLORS, SECTION_ICONS } from "@/theme";
import ItemCard from "@/components/ItemCard";

type DoneFilter = "all" | "pending" | "done";

const DONE_FILTERS: { key: DoneFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendentes" },
  { key: "done", label: "Concluídas" },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [doneFilter, setDoneFilter] = useState<DoneFilter>("all");
  const [search, setSearch] = useState("");

  // Modal de nova seção
  const [showNewSection, setShowNewSection] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState(SECTION_ICONS[0]);
  const [newColorIdx, setNewColorIdx] = useState(0);

  const sectionMap = useMemo(
    () => new Map(sections.map((s) => [s.id, s])),
    [sections]
  );

  const loadSections = useCallback(async () => {
    setSections(await listSections());
  }, []);

  const loadItems = useCallback(async () => {
    const doneParam =
      doneFilter === "all" ? null : doneFilter === "done" ? true : false;
    setItems(await listItems(selectedSection, doneParam, search));
  }, [selectedSection, doneFilter, search]);

  // Recarrega seções ao ganhar foco (volta da tela de edição)
  useFocusEffect(
    useCallback(() => {
      loadSections();
    }, [loadSections])
  );

  // Recarrega itens quando filtros mudam ou tela ganha foco
  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleToggle = async (item: Item) => {
    await toggleDone(item.id, item.done === 0);
    loadItems();
  };

  const handleCreateSection = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert("Ops", "Dá um nome para a seção 🙂");
      return;
    }
    await createSection({
      name,
      icon: newIcon,
      color: SECTION_COLORS[newColorIdx],
    });
    setNewName("");
    setNewIcon(SECTION_ICONS[0]);
    setNewColorIdx(0);
    setShowNewSection(false);
    await loadSections();
  };

  const handleLongPressSection = async (section: Section) => {
    const count = await countItemsInSection(section.id);
    Alert.alert(
      section.name,
      count > 0
        ? `Esta seção tem ${count} item${count !== 1 ? "s" : ""}. Excluir vai apagar tudo.`
        : "Excluir esta seção?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            await deleteSection(section.id);
            if (selectedSection === section.id) setSelectedSection(null);
            await loadSections();
          },
        },
      ]
    );
  };

  const sectionForItem = (item: Item): Section =>
    sectionMap.get(item.section_id) ?? {
      id: item.section_id,
      name: "?",
      icon: "📁",
      color: colors.primary,
      created_at: 0,
    };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Busca */}
      <TextInput
        style={styles.searchBox}
        placeholder="Buscar..."
        placeholderTextColor={colors.textDim}
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
      />

      {/* Chips de seção */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.sectionScroll}
        contentContainerStyle={styles.sectionScrollContent}
      >
        <Pressable
          onPress={() => setSelectedSection(null)}
          style={[styles.chip, selectedSection === null && styles.chipActive]}
        >
          <Text
            style={[
              styles.chipText,
              selectedSection === null && styles.chipTextActive,
            ]}
          >
            Tudo
          </Text>
        </Pressable>

        {sections.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => setSelectedSection(s.id)}
            onLongPress={() => handleLongPressSection(s)}
            style={[
              styles.chip,
              selectedSection === s.id && {
                backgroundColor: s.color,
                borderColor: s.color,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                selectedSection === s.id && styles.chipTextActive,
              ]}
            >
              {s.icon} {s.name}
            </Text>
          </Pressable>
        ))}

        <Pressable
          onPress={() => setShowNewSection(true)}
          style={styles.chipAdd}
        >
          <Text style={styles.chipAddText}>+ Seção</Text>
        </Pressable>
      </ScrollView>

      {/* Filtro concluído/pendente */}
      <View style={styles.doneFilterRow}>
        {DONE_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setDoneFilter(f.key)}
            style={[
              styles.doneChip,
              doneFilter === f.key && styles.doneChipActive,
            ]}
          >
            <Text
              style={[
                styles.doneChipText,
                doneFilter === f.key && styles.doneChipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Lista */}
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            section={sectionForItem(item)}
            onPress={() =>
              router.push({
                pathname: "/edit",
                params: { id: String(item.id) },
              })
            }
            onToggle={() => handleToggle(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🗂️</Text>
            <Text style={styles.emptyText}>
              {sections.length === 0
                ? "Crie uma seção para começar."
                : "Nada por aqui ainda.\nToque no + para adicionar."}
            </Text>
          </View>
        }
      />

      {/* FAB */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => {
          if (sections.length === 0) {
            Alert.alert("Crie uma seção primeiro", "Toque em '+ Seção' para criar sua primeira seção.");
            return;
          }
          router.push({
            pathname: "/edit",
            params: selectedSection
              ? { section_id: String(selectedSection) }
              : {},
          });
        }}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {/* Modal: Nova Seção */}
      <Modal
        visible={showNewSection}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewSection(false)}
      >
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.modalTitle}>Nova Seção</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Nome da seção"
              placeholderTextColor={colors.textDim}
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />

            <Text style={styles.modalLabel}>Ícone</Text>
            <View style={styles.iconGrid}>
              {SECTION_ICONS.map((icon) => (
                <Pressable
                  key={icon}
                  onPress={() => setNewIcon(icon)}
                  style={[
                    styles.iconBtn,
                    newIcon === icon && styles.iconBtnActive,
                  ]}
                >
                  <Text style={styles.iconBtnText}>{icon}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.modalLabel}>Cor</Text>
            <View style={styles.colorRow}>
              {SECTION_COLORS.map((c, idx) => (
                <Pressable
                  key={c}
                  onPress={() => setNewColorIdx(idx)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    newColorIdx === idx && styles.colorDotSelected,
                  ]}
                />
              ))}
            </View>

            {/* Preview */}
            <View
              style={[
                styles.previewChip,
                { backgroundColor: SECTION_COLORS[newColorIdx] },
              ]}
            >
              <Text style={styles.previewText}>
                {newIcon} {newName || "Nome da seção"}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setShowNewSection(false)}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.createBtn} onPress={handleCreateSection}>
                <Text style={styles.createBtnText}>Criar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  searchBox: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },

  sectionScroll: { marginTop: 12, flexGrow: 0 },
  sectionScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textDim, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#fff" },

  chipAdd: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: "dashed",
  },
  chipAddText: { color: colors.primary, fontSize: 13, fontWeight: "700" },

  doneFilterRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  doneChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
  },
  doneChipActive: { backgroundColor: colors.primarySoft },
  doneChipText: { color: colors.textDim, fontSize: 12, fontWeight: "600" },
  doneChipTextActive: { color: "#fff" },

  empty: { alignItems: "center", marginTop: 80, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: colors.textDim, textAlign: "center", fontSize: 15 },

  fab: {
    position: "absolute",
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabText: { color: "#fff", fontSize: 32, fontWeight: "300", marginTop: -2 },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  modalLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconBtnActive: { borderColor: colors.primary },
  iconBtnText: { fontSize: 22 },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: "transparent",
  },
  colorDotSelected: { borderColor: "#fff" },
  previewChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
  },
  previewText: { color: colors.bg, fontWeight: "700", fontSize: 14 },
  modalActions: { flexDirection: "row", gap: 12 },
  cancelBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
  },
  cancelBtnText: { color: colors.textDim, fontWeight: "700" },
  createBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  createBtnText: { color: "#fff", fontWeight: "800" },
});
