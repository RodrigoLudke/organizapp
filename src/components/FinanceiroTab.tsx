import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  upsertTransactions,
  listTransactions,
  type Transaction,
  getSetting,
  setSetting,
} from "@/db/database";
import { fetchAllTransactions, hasPluggyCredentials } from "@/lib/pluggy";
import { removeDemoData, seedDemoData } from "@/lib/demoData";
import { router } from "expo-router";
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

  const [hasCredentials, setHasCredentials] = useState<boolean | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);

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

  const loadTransactions = useCallback(async () => {
    const result = await listTransactions(from, to);
    console.log(`[DB] listTransactions(${from}, ${to}): ${result.length} resultado(s)`);
    setTransactions(result);
  }, [from, to]);

  // Sincroniza usando o item ID das configurações
  const syncItem = useCallback(async () => {
    const itemId = await getSetting("pluggy_item_id");
    if (!itemId) {
      console.log("[Sync] Item ID não configurado, sincronização ignorada");
      return;
    }
    setSyncing(true);
    try {
      const range = getSyncRange();
      console.log(`[Sync] Buscando transações de ${range.from} até ${range.to}`);
      const txs = await fetchAllTransactions(itemId, range.from, range.to);
      console.log(`[Sync] ${txs.length} transação(ões) retornada(s) pela API`);
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
      setLastSync(Date.now());
    } catch (e) {
      console.error("[Sync] Erro:", e);
      Alert.alert("Erro ao sincronizar", String(e));
    } finally {
      setSyncing(false);
    }
  }, []);

  // Auto-sync: roda ao montar e verifica se há credenciais configuradas
  const autoSync = useCallback(async () => {
    const demo = await getSetting("demo_mode");
    if (demo === "1") {
      setIsDemoMode(true);
      setHasCredentials(true);
      await seedDemoData();
      await loadTransactions();
      return;
    }
    const creds = await hasPluggyCredentials();
    const itemId = await getSetting("pluggy_item_id");
    setHasCredentials(!!(creds && itemId));
    if (!creds || !itemId) return;
    await syncItem();
    await loadTransactions();
  }, [syncItem, loadTransactions]);

  useEffect(() => {
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

  const handleSync = async () => {
    await syncItem();
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

      {/* Sync */}
      {hasCredentials && (
        <View style={styles.banksRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.banksScroll}>
            {lastSync && (
              <View style={styles.bankChip}>
                <Text style={styles.bankChipText}>Pluggy</Text>
                <Text style={styles.bankChipSub}>
                  {new Date(lastSync).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            )}
            <Pressable
              style={styles.syncBtn}
              onPress={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator size="small" color={colors.textDim} />
              ) : (
                <Text style={styles.syncBtnText}>↻ Sync</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      )}

      {/* Lista de transações */}
      {hasCredentials === false ? (
        <ScrollView
          contentContainerStyle={[styles.tutorialContainer, { paddingBottom: 24 + extraBottom }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.tutorialTitle}>Como conectar seu banco</Text>
          <Text style={styles.tutorialSubtitle}>
            O OrganizApp usa o Pluggy para sincronizar suas transações bancárias de
            forma segura. Para uso pessoal é 100% gratuito!
          </Text>

          <Text style={[styles.tutorialSubtitle, { fontWeight: "700", marginBottom: 4 }]}>
            Parte 1 — Client ID e Client Secret
          </Text>

          {[
            { step: "1", text: "Crie uma conta gratuita em meu.pluggy.ai — seu Data Passport pessoal" },
            { step: "2", text: "Conecte suas contas bancárias no Meu Pluggy (Nubank, Itaú, Bradesco, Inter e mais)" },
            { step: "3", text: "Acesse dashboard.pluggy.ai, entre na aplicação demo e conecte seus itens do Meu Pluggy como proxy" },
            { step: "4", text: 'Copie o "Client ID" e o "Client Secret" da aplicação demo' },
          ].map(({ step, text }) => (
            <View key={step} style={styles.tutorialStep}>
              <View style={styles.tutorialStepBadge}>
                <Text style={styles.tutorialStepNum}>{step}</Text>
              </View>
              <Text style={styles.tutorialStepText}>{text}</Text>
            </View>
          ))}

          <Text style={[styles.tutorialSubtitle, { fontWeight: "700", marginBottom: 4, marginTop: 12 }]}>
            Parte 2 — Item ID (sua conta real)
          </Text>

          {[
            { step: "5", text: 'Dentro do dashboard da Pluggy, solicite acesso à "Demonstração com dados reais"' },
            { step: "6", text: "Após aprovação, conecte sua conta bancária pela demonstração e copie o Item ID gerado" },
            { step: "7", text: 'Toque em "Configurações" abaixo, cole o Client ID, Client Secret e Item ID, e salve' },
          ].map(({ step, text }) => (
            <View key={step} style={styles.tutorialStep}>
              <View style={styles.tutorialStepBadge}>
                <Text style={styles.tutorialStepNum}>{step}</Text>
              </View>
              <Text style={styles.tutorialStepText}>{text}</Text>
            </View>
          ))}

          <Pressable
            style={styles.tutorialBtn}
            onPress={() => router.push("/settings")}
          >
            <Text style={styles.tutorialBtnText}>Ir para Configurações</Text>
          </Pressable>

          <Pressable
            style={[styles.tutorialBtn, { backgroundColor: colors.surface, marginTop: 10 }]}
            onPress={async () => {
              await setSetting("demo_mode", "1");
              setIsDemoMode(true);
              setHasCredentials(true);
              await seedDemoData();
              await loadTransactions();
            }}
          >
            <Text style={[styles.tutorialBtnText, { color: colors.text }]}>Ver demonstração (dados de exemplo)</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <>
          {isDemoMode && (
            <Pressable
              style={styles.demoBanner}
              onPress={async () => {
                await setSetting("demo_mode", "0");
                await removeDemoData();
                setIsDemoMode(false);
                setHasCredentials(false);
                setTransactions([]);
              }}
            >
              <Text style={styles.demoBannerText}>Modo demonstração  •  Toque para sair</Text>
            </Pressable>
          )}
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
        </>
      )}

      {/* Indicador de sync */}
      {syncing && (
        <View style={styles.syncOverlay}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.syncOverlayText}>Sincronizando...</Text>
        </View>
      )}

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

  tutorialContainer: {
    padding: 20,
    gap: 0,
  },
  tutorialTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 10,
  },
  tutorialSubtitle: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 28,
  },
  tutorialStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 18,
  },
  tutorialStepBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  tutorialStepNum: { color: "#111111", fontWeight: "800", fontSize: 14 },
  tutorialStepText: { color: colors.text, fontSize: 14, lineHeight: 21, flex: 1 },
  tutorialBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  tutorialBtnText: { color: "#111111", fontWeight: "800", fontSize: 15 },
  demoBanner: {
    backgroundColor: colors.warning,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  demoBannerText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
});
