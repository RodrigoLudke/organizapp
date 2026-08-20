import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { getSetting, setSetting } from "@/db/database";
import { colors } from "@/theme";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [itemId, setItemId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const id = await getSetting("pluggy_client_id");
      const secret = await getSetting("pluggy_client_secret");
      const item = await getSetting("pluggy_item_id");
      if (id) setClientId(id);
      if (secret) setClientSecret(secret);
      if (item) setItemId(item);
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    const id = clientId.trim();
    const secret = clientSecret.trim();
    const item = itemId.trim();
    if (!id || !secret || !item) {
      Alert.alert("Campos obrigatórios", "Preencha o Client ID, Client Secret e Item ID.");
      return;
    }
    await setSetting("pluggy_client_id", id);
    await setSetting("pluggy_client_secret", secret);
    await setSetting("pluggy_item_id", item);
    Alert.alert("Salvo!", "As credenciais foram salvas com sucesso.", [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  const handleClear = () => {
    Alert.alert(
      "Remover credenciais",
      "Quer remover as chaves do Pluggy? A sincronização de dados bancários será desativada.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            await setSetting("pluggy_client_id", "");
            await setSetting("pluggy_client_secret", "");
            await setSetting("pluggy_item_id", "");
            setClientId("");
            setClientSecret("");
            setItemId("");
          },
        },
      ]
    );
  };

  if (loading) return null;

  const hasSaved = clientId.length > 0 && clientSecret.length > 0 && itemId.length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Seção Pluggy */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Integração Pluggy</Text>
        <Text style={styles.sectionDesc}>
          As chaves abaixo conectam o app à sua conta no Pluggy para sincronizar
          as transações bancárias. Você pode criá-las gratuitamente no dashboard
          do Pluggy para uso pessoal.
        </Text>

        <Text style={styles.label}>Client ID</Text>
        <TextInput
          style={styles.input}
          placeholder="Cole seu Client ID aqui"
          placeholderTextColor={colors.textDim}
          value={clientId}
          onChangeText={setClientId}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Client Secret</Text>
        <TextInput
          style={styles.input}
          placeholder="Cole seu Client Secret aqui"
          placeholderTextColor={colors.textDim}
          value={clientSecret}
          onChangeText={setClientSecret}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        <Text style={styles.label}>Item ID</Text>
        <TextInput
          style={styles.input}
          placeholder="Cole seu Item ID aqui"
          placeholderTextColor={colors.textDim}
          value={itemId}
          onChangeText={setItemId}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <Pressable style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Salvar</Text>
      </Pressable>

      {hasSaved && (
        <Pressable style={styles.clearBtn} onPress={handleClear}>
          <Text style={styles.clearBtnText}>Remover credenciais</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  sectionDesc: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  label: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
  },
  saveBtnText: { color: "#111111", fontWeight: "800", fontSize: 16 },
  clearBtn: { padding: 16, alignItems: "center", marginTop: 4 },
  clearBtnText: { color: colors.danger, fontWeight: "700" },
});
