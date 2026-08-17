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
import { colors } from "@/theme";
import ItemCard from "@/components/ItemCard";
import ColorPicker from "react-native-wheel-color-picker";

type DoneFilter = "all" | "pending" | "done";

const DONE_FILTERS: { key: DoneFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendentes" },
  { key: "done", label: "Concluídas" },
];

type Props = {
  extraBottom?: number;
};

export default function LembretesTab({ extraBottom = 0 }: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [sectionPath, setSectionPath] = useState<Section[]>([]);
  const [doneFilter, setDoneFilter] = useState<DoneFilter>("all");
  const [search, setSearch] = useState("");

  const [showNewSection, setShowNewSection] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(colors.primary);

  const [showSectionPicker, setShowSectionPicker] = useState(false);

  const currentSection = sectionPath.at(-1) ?? null;
  const currentParentId = currentSection?.id ?? null;

  const sectionMap = useMemo(
    () => new Map(allSections.map((s) => [s.id, s])),
    [allSections]
  );

  const visibleSections = useMemo(
    () => allSections.filter((s) => s.parent_id === currentParentId),
    [allSections, currentParentId]
  );

  const loadSections = useCallback(async () => {
    setAllSections(await listSections());
  }, []);

  const loadItems = useCallback(async () => {
    const doneParam =
      doneFilter === "all" ? null : doneFilter === "done" ? true : false;
    setItems(await listItems(currentSection?.id ?? null, doneParam, search));
  }, [currentSection, doneFilter, search]);

  useFocusEffect(
    useCallback(() => {
      loadSections();
    }, [loadSections])
  );

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleToggle = async (item: Item) => {
    await toggleDone(item.id, item.done === 0);
    loadItems();
  };

  const enterSection = (section: Section) => {
    setSectionPath((prev) => [...prev, section]);
  };

  const navigateToLevel = (level: number) => {
    setSectionPath((prev) => (level < 0 ? [] : prev.slice(0, level + 1)));
  };

  const handleCreateSection = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert("Ops", "Dá um nome para a seção 🙂");
      return;
    }
    await createSection({
      name,
      icon: "",
      color: newColor,
      parent_id: currentParentId,
    });
    setNewName("");
    setNewColor(colors.primary);
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
            if (sectionPath.some((s) => s.id === section.id)) {
              setSectionPath([]);
            }
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
      parent_id: null,
      created_at: 0,
    };

  const isAtRoot = sectionPath.length === 0;

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

      {/* Breadcrumb */}
      {!isAtRoot && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.breadcrumbScroll}
          contentContainerStyle={styles.breadcrumbContent}
        >
          <Pressable onPress={() => navigateToLevel(-1)}>
            <Text style={styles.breadcrumbItem}>Tudo</Text>
          </Pressable>
          {sectionPath.map((s, idx) => (
            <View key={s.id} style={styles.breadcrumbStep}>
              <Text style={styles.breadcrumbSep}> › </Text>
              <Pressable onPress={() => navigateToLevel(idx)}>
                <Text
                  style={[
                    styles.breadcrumbItem,
                    idx === sectionPath.length - 1 &&
                      styles.breadcrumbItemCurrent,
                  ]}
                >
                  {s.icon} {s.name}
                </Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Seletor de seção compacto */}
      <View style={styles.sectionRow}>
        <Pressable
          onPress={() => setShowSectionPicker(true)}
          style={[
            styles.sectionPickerBtn,
            currentSection && { borderColor: currentSection.color },
          ]}
        >
          <Text style={styles.sectionPickerText}>
            {currentSection
              ? `${currentSection.icon} ${currentSection.name}`
              : "Todas"}
          </Text>
          <Text style={styles.sectionPickerArrow}>▾</Text>
        </Pressable>

        <Pressable
          onPress={() => setShowNewSection(true)}
          style={styles.chipAdd}
        >
          <Text style={styles.chipAddText}>+ Seção</Text>
        </Pressable>
      </View>

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
        contentContainerStyle={{ padding: 16, paddingBottom: 120 + extraBottom }}
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
              {allSections.length === 0
                ? "Crie uma seção para começar."
                : isAtRoot
                ? "Nada por aqui ainda.\nToque no + para adicionar."
                : visibleSections.length > 0
                ? "Nenhum item nesta seção.\nEntre em uma sub-seção ou toque no +."
                : "Nada por aqui ainda.\nToque no + para adicionar."}
            </Text>
          </View>
        }
      />

      {/* FAB */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 + extraBottom }]}
        onPress={() => {
          if (allSections.length === 0) {
            Alert.alert(
              "Crie uma seção primeiro",
              "Toque em '+ Seção' para criar sua primeira seção."
            );
            return;
          }
          router.push({
            pathname: "/edit",
            params: currentSection
              ? { section_id: String(currentSection.id) }
              : {},
          });
        }}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {/* Modal: Seletor de Seção */}
      <Modal
        visible={showSectionPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSectionPicker(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setShowSectionPicker(false)}
        >
          <Pressable
            style={[styles.modalBox, { paddingBottom: insets.bottom + 20 }]}
            onPress={() => {}}
          >
            <Text style={styles.modalTitle}>Seções</Text>

            <Pressable
              style={[
                styles.sectionPickerItem,
                isAtRoot && styles.sectionPickerItemActive,
              ]}
              onPress={() => {
                setSectionPath([]);
                setShowSectionPicker(false);
              }}
            >
              <View
                style={[styles.sectionPickerDot, { backgroundColor: colors.primary }]}
              />
              <Text style={styles.sectionPickerItemText}>Todas</Text>
              {isAtRoot && (
                <Text style={styles.sectionPickerCheck}>✓</Text>
              )}
            </Pressable>

            {allSections
              .filter((s) => s.parent_id === null)
              .map((s) => (
                <Pressable
                  key={s.id}
                  style={[
                    styles.sectionPickerItem,
                    currentSection?.id === s.id &&
                      styles.sectionPickerItemActive,
                  ]}
                  onPress={() => {
                    setSectionPath([s]);
                    setShowSectionPicker(false);
                  }}
                  onLongPress={() => {
                    setShowSectionPicker(false);
                    handleLongPressSection(s);
                  }}
                >
                  <View
                    style={[
                      styles.sectionPickerDot,
                      { backgroundColor: s.color },
                    ]}
                  />
                  <Text style={styles.sectionPickerItemText}>
                    {s.icon} {s.name}
                  </Text>
                  {currentSection?.id === s.id && (
                    <Text style={styles.sectionPickerCheck}>✓</Text>
                  )}
                </Pressable>
              ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Nova Seção */}
      <Modal
        visible={showNewSection}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewSection(false)}
      >
        <View style={styles.overlay}>
          <View
            style={[styles.modalBox, { paddingBottom: insets.bottom + 20 }]}
          >
            <Text style={styles.modalTitle}>
              {currentSection
                ? `Sub-seção em ${currentSection.icon} ${currentSection.name}`
                : "Nova Seção"}
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Nome da seção  (pode incluir emoji 📁)"
              placeholderTextColor={colors.textDim}
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />

            <Text style={styles.modalLabel}>Cor</Text>
            <View style={styles.colorPickerWrap}>
              <ColorPicker
                color={newColor}
                onColorChange={setNewColor}
                thumbSize={24}
                sliderSize={24}
                noSnap
                row={false}
                swatches={false}
              />
            </View>

            <View style={[styles.previewChip, { backgroundColor: newColor }]}>
              <Text style={styles.previewText}>
                {newName || "Nome da seção"}
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

  breadcrumbScroll: { marginTop: 10, flexGrow: 0 },
  breadcrumbContent: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  breadcrumbStep: { flexDirection: "row", alignItems: "center" },
  breadcrumbSep: { color: colors.textDim, fontSize: 13 },
  breadcrumbItem: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  breadcrumbItemCurrent: { color: colors.text },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  sectionPickerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionPickerText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  sectionPickerArrow: { color: colors.textDim, fontSize: 12, marginLeft: 6 },

  sectionPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  sectionPickerItemActive: { opacity: 1 },
  sectionPickerDot: { width: 12, height: 12, borderRadius: 6 },
  sectionPickerItemText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "500" },
  sectionPickerCheck: { color: colors.primary, fontSize: 16, fontWeight: "700" },

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
  doneChipTextActive: { color: "#111111" },

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
  fabText: { color: "#111111", fontSize: 32, fontWeight: "300", marginTop: -2 },

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
  colorPickerWrap: {
    height: 220,
    marginBottom: 16,
  },
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
  createBtnText: { color: "#111111", fontWeight: "800" },
});
