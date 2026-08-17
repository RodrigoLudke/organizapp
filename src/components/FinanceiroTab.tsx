import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import {
  listPluggyItems,
  upsertPluggyItem,
  deletePluggyItem,
  updatePluggyLastSync,
  upsertTransactions,
  listTransactions,
  type PluggyItem,
  type Transaction,
} from "@/db/database";
import { fetchAllTransactions, getConnectToken, buildConnectHtml } from "@/lib/pluggy";
import { colors } from "@/theme";

// Sincroniza os últimos N meses
const SYNC_MONTHS = 6;
const AUTO_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 horas

function getSyncRange() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - SYNC_MONTHS);
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateLabel(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function getMonthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  return { from, to };
}

type Props = {
  extraBottom?: number;
};

export default function FinanceiroTab({ extraBottom = 0 }: Props) {
  const insets = useSafeAreaInsets();

  // Mês exibido
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  const [pluggyItems, setPluggyItems] = useState<PluggyItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // WebView do Pluggy Connect
  const [showConnect, setShowConnect] = useState(false);
  const [connectHtml, setConnectHtml] = useState("");

  const monthLabel = useMemo(
    () =>
      new Date(month.year, month.month - 1, 1).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      }),
    [month]
  );

  const { from, to } = useMemo(
    () => getMonthRange(month.year, month.month),
    [month]
  );

  const loadPluggyItems = useCallback(async () => {
    setPluggyItems(await listPluggyItems());
  }, []);

  const loadTransactions = useCallback(async () => {
    setTransactions(await listTransactions(from, to));
  }, [from, to]);

  // Sincroniza um banco específico
  const syncItem = useCallback(async (itemId: string) => {
    setSyncing(true);
    try {
      const range = getSyncRange();
      const txs = await fetchAllTransactions(itemId, range.from, range.to);
      await upsertTransactions(
        txs.map((tx) => ({
          pluggy_id: tx.id,
          account_id: tx.accountId,
          account_name: tx.accountName,
          description: tx.description,
          amount: tx.amount,
          date: tx.date,
          type: tx.type,
          category: tx.category,
        }))
      );
      await updatePluggyLastSync(itemId);
    } catch (e) {
      Alert.alert("Erro ao sincronizar", String(e));
    } finally {
      setSyncing(false);
    }
  }, []);

  // Auto-sync na abertura: sincroniza bancos cujo last_sync passou do intervalo
  const autoSync = useCallback(async () => {
    const items = await listPluggyItems();
    if (items.length === 0) return;
    const now = Date.now();
    let synced = false;
    for (const item of items) {
      if (!item.last_sync || now - item.last_sync > AUTO_SYNC_INTERVAL_MS) {
        await syncItem(item.item_id);
        synced = true;
      }
    }
    if (synced) await loadTransactions();
  }, [syncItem, loadTransactions]);

  useEffect(() => {
    loadPluggyItems();
    autoSync();
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Navegar mês
  const prevMonth = () =>
    setMonth((m) =>
      m.month === 1
        ? { year: m.year - 1, month: 12 }
        : { year: m.year, month: m.month - 1 }
    );

  const nextMonth = () =>
    setMonth((m) =>
      m.month === 12
        ? { year: m.year + 1, month: 1 }
        : { year: m.year, month: m.month + 1 }
    );

  // Resumo do mês
  const totals = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const tx of transactions) {
      if (tx.type === "CREDIT") entradas += tx.amount;
      else saidas += tx.amount;
    }
    return { entradas, saidas, saldo: entradas - saidas };
  }, [transactions]);

  // Transações agrupadas por data
  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      if (!map.has(tx.date)) map.set(tx.date, []);
      map.get(tx.date)!.push(tx);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [transactions]);

  // Abre o widget Pluggy Connect
  const openConnect = async (itemId?: string) => {
    setConnecting(true);
    try {
      const token = await getConnectToken(itemId);
      setConnectHtml(buildConnectHtml(token));
      setShowConnect(true);
    } catch (e) {
      Alert.alert("Erro", String(e));
    } finally {
      setConnecting(false);
    }
  };

  // Recebe mensagem do WebView do Pluggy Connect
  const onWebViewMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "success" && msg.itemId) {
        setShowConnect(false);
        await upsertPluggyItem(msg.itemId, msg.bankName || "Banco");
        await loadPluggyItems();
        await syncItem(msg.itemId);
        await loadTransactions();
      } else if (msg.type === "error") {
        setShowConnect(false);
        Alert.alert("Erro ao conectar banco", msg.message);
      } else if (msg.type === "close") {
        setShowConnect(false);
      }
    } catch {}
  };

  const handleDeleteBank = (item: PluggyItem) => {
    Alert.alert(
      item.bank_name,
      "Remover este banco? As transações salvas serão mantidas.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            await deletePluggyItem(item.item_id);
            await loadPluggyItems();
          },
        },
      ]
    );
  };

  const handleSyncAll = async () => {
    for (const item of pluggyItems) {
      await syncItem(item.item_id);
    }
    await loadTransactions();
  };

  // Renderiza um grupo de transações por data
  const renderDateGroup = ([date, txs]: [string, Transaction[]]) => (
    <View key={date} style={styles.dateGroup}>
      <Text style={styles.dateLabel}>{formatDateLabel(date)}</Text>
      {txs.map((tx) => (
        <View key={tx.id} style={styles.txRow}>
          <View style={styles.txLeft}>
            <Text style={styles.txDescription} numberOfLines={1}>
              {tx.description}
            </Text>
            {tx.category && (
              <Text style={styles.txCategory}>{tx.category}</Text>
            )}
          </View>
          <Text
            style={[
              styles.txAmount,
              { color: tx.type === "CREDIT" ? colors.success : colors.danger },
            ]}
          >
            {tx.type === "CREDIT" ? "+" : "-"}
            {formatCurrency(tx.amount)}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Navegador de mês */}
      <View style={styles.monthRow}>
        <Pressable onPress={prevMonth} style={styles.monthArrow}>
          <Text style={styles.monthArrowText}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable onPress={nextMonth} style={styles.monthArrow}>
          <Text style={styles.monthArrowText}>›</Text>
        </Pressable>
      </View>

      {/* Resumo */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Entradas</Text>
          <Text style={[styles.summaryCardValue, { color: colors.success }]}>
            {formatCurrency(totals.entradas)}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Saídas</Text>
          <Text style={[styles.summaryCardValue, { color: colors.danger }]}>
            {formatCurrency(totals.saidas)}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Saldo</Text>
          <Text
            style={[
              styles.summaryCardValue,
              { color: totals.saldo >= 0 ? colors.success : colors.danger },
            ]}
          >
            {formatCurrency(totals.saldo)}
          </Text>
        </View>
      </View>

      {/* Bancos conectados */}
      <View style={styles.banksRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.banksScroll}>
          {pluggyItems.map((item) => (
            <Pressable
              key={item.item_id}
              style={styles.bankChip}
              onLongPress={() => handleDeleteBank(item)}
            >
              <Text style={styles.bankChipText}>{item.bank_name}</Text>
              {item.last_sync && (
                <Text style={styles.bankChipSub}>
                  {new Date(item.last_sync).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              )}
            </Pressable>
          ))}

          <Pressable
            style={styles.addBankBtn}
            onPress={() => openConnect()}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.addBankBtnText}>+ Banco</Text>
            )}
          </Pressable>

          {pluggyItems.length > 0 && (
            <Pressable
              style={styles.syncBtn}
              onPress={handleSyncAll}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator size="small" color={colors.textDim} />
              ) : (
                <Text style={styles.syncBtnText}>↻ Sync</Text>
              )}
            </Pressable>
          )}
        </ScrollView>
      </View>

      {/* Lista de transações */}
      {pluggyItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>💳</Text>
          <Text style={styles.emptyTitle}>Nenhum banco conectado</Text>
          <Text style={styles.emptySubtitle}>
            Conecte seu banco para ver as transações automaticamente.
          </Text>
          <Pressable
            style={styles.connectCta}
            onPress={() => openConnect()}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator color="#111" />
            ) : (
              <Text style={styles.connectCtaText}>Conectar banco</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={([date]) => date}
          renderItem={({ item }) => renderDateGroup(item)}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 24 + extraBottom,
          }}
          ListEmptyComponent={
            syncing ? null : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🗓️</Text>
                <Text style={styles.emptyTitle}>Sem transações</Text>
                <Text style={styles.emptySubtitle}>
                  Nenhuma transação encontrada neste mês.
                </Text>
              </View>
            )
          }
        />
      )}

      {/* Indicador de sync */}
      {syncing && (
        <View style={styles.syncOverlay}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.syncOverlayText}>Sincronizando...</Text>
        </View>
      )}

      {/* Modal: Pluggy Connect */}
      <Modal
        visible={showConnect}
        animationType="slide"
        onRequestClose={() => setShowConnect(false)}
      >
        <View style={[styles.webViewContainer, { paddingTop: insets.top }]}>
          <View style={styles.webViewHeader}>
            <Pressable onPress={() => setShowConnect(false)}>
              <Text style={styles.webViewClose}>✕ Fechar</Text>
            </Pressable>
            <Text style={styles.webViewTitle}>Conectar banco</Text>
            <View style={{ width: 60 }} />
          </View>
          <WebView
            source={{ html: connectHtml }}
            onMessage={onWebViewMessage}
            javaScriptEnabled
            domStorageEnabled
            style={{ flex: 1, backgroundColor: "#111111" }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  monthArrow: { padding: 8 },
  monthArrowText: { color: colors.text, fontSize: 26, fontWeight: "300" },
  monthLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
    textTransform: "capitalize",
  },

  summaryRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryCardLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  summaryCardValue: {
    fontSize: 13,
    fontWeight: "800",
  },

  banksRow: {
    marginBottom: 8,
  },
  banksScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: "center",
  },
  bankChip: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bankChipText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  bankChipSub: { color: colors.textDim, fontSize: 10, marginTop: 1 },
  addBankBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: "dashed",
    minWidth: 80,
    alignItems: "center",
  },
  addBankBtnText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  syncBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
  },
  syncBtnText: { color: colors.textDim, fontSize: 13, fontWeight: "600" },

  dateGroup: { marginBottom: 16 },
  dateLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  txLeft: { flex: 1 },
  txDescription: { color: colors.text, fontSize: 14, fontWeight: "600" },
  txCategory: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: "700" },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptySubtitle: { color: colors.textDim, fontSize: 14, textAlign: "center", lineHeight: 20 },
  connectCta: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  connectCtaText: { color: "#111111", fontWeight: "800", fontSize: 15 },

  syncOverlay: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  syncOverlayText: { color: colors.textDim, fontSize: 13 },

  webViewContainer: { flex: 1, backgroundColor: "#111111" },
  webViewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  webViewClose: { color: colors.danger, fontSize: 14, fontWeight: "600", width: 60 },
  webViewTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
});
