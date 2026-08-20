import { getSetting } from "../db/database";

const BASE = "https://api.pluggy.ai";

export async function hasPluggyCredentials(): Promise<boolean> {
  const clientId = await getSetting("pluggy_client_id");
  const clientSecret = await getSetting("pluggy_client_secret");
  return !!(clientId && clientSecret);
}

async function getApiKey(): Promise<string> {
  const clientId = await getSetting("pluggy_client_id");
  const clientSecret = await getSetting("pluggy_client_secret");
  if (!clientId || !clientSecret) {
    throw new Error("Credenciais do Pluggy não configuradas. Acesse as configurações para adicionar.");
  }
  const res = await fetch(`${BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok) throw new Error("Autenticação Pluggy falhou");
  const data = await res.json();
  return data.apiKey;
}

export async function getConnectToken(itemId?: string): Promise<string> {
  const apiKey = await getApiKey();
  const res = await fetch(`${BASE}/connect_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify(itemId ? { itemId } : {}),
  });
  if (!res.ok) throw new Error("Falha ao gerar connect token");
  const data = await res.json();
  return data.accessToken;
}

export type PluggyTransaction = {
  id: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  type: "DEBIT" | "CREDIT";
  category: string | null;
  accountId: string;
  accountName: string;
};

export async function fetchAllTransactions(
  itemId: string,
  from: string,
  to: string
): Promise<PluggyTransaction[]> {
  const apiKey = await getApiKey();

  const accountsRes = await fetch(`${BASE}/accounts?itemId=${itemId}`, {
    headers: { "X-API-KEY": apiKey },
  });
  if (!accountsRes.ok) {
    const body = await accountsRes.text().catch(() => "");
    throw new Error(`Falha ao buscar contas (${accountsRes.status}): ${body}`);
  }
  const accountsData = await accountsRes.json();
  const accounts: { id: string; name: string }[] = accountsData.results ?? [];
  console.log(`[Pluggy] ${accounts.length} conta(s) encontrada(s) para o item ${itemId}`);

  if (accounts.length === 0) {
    throw new Error("Nenhuma conta encontrada para este item. Verifique se o banco foi conectado corretamente no Pluggy.");
  }

  const all: PluggyTransaction[] = [];
  for (const account of accounts) {
    let cursor: string | null = null;
    let pageNum = 1;
    while (true) {
      const params = new URLSearchParams({
        accountId: account.id,
        from,
        to,
        pageSize: "100",
      });
      if (cursor) params.set("cursor", cursor);

      const txRes = await fetch(`${BASE}/v2/transactions?${params}`, {
        headers: { "X-API-KEY": apiKey },
      });
      if (!txRes.ok) {
        const body = await txRes.text().catch(() => "");
        throw new Error(`Falha ao buscar transações da conta ${account.name} (${txRes.status}): ${body}`);
      }
      const txData = await txRes.json();
      const results: Record<string, unknown>[] = txData.results ?? [];
      // A v2 usa cursor para paginação — campo pode ser "cursor" ou "next"
      const nextCursor: string | null = txData.cursor ?? txData.next ?? null;
      console.log(`[Pluggy] Conta "${account.name}" página ${pageNum}: ${results.length} transação(ões), próximo cursor: ${nextCursor ?? "nenhum"}`);

      for (const tx of results) {
        const rawDate = tx.date as string | undefined;
        const date = rawDate ? rawDate.split("T")[0] : "";
        all.push({
          id: tx.id as string,
          description: (tx.description as string | undefined) ?? "",
          amount: Math.abs(tx.amount as number),
          date,
          type: tx.type as "DEBIT" | "CREDIT",
          category: (tx.category as string | undefined) ?? null,
          accountId: account.id,
          accountName: account.name ?? "",
        });
      }

      if (!nextCursor || results.length === 0) break;
      cursor = nextCursor;
      pageNum++;
    }
  }
  console.log(`[Pluggy] Total: ${all.length} transação(ões) sincronizada(s)`);
  return all;
}

// HTML do widget Pluggy Connect para usar no WebView
// Verifique a versão mais recente em: https://docs.pluggy.ai/docs/pluggy-connect
export function buildConnectHtml(connectToken: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; background: #111111; }
  </style>
</head>
<body>
  <script src="https://cdn.pluggy.ai/pluggy-connect/v2.1.0/pluggy-connect.min.js"></script>
  <script>
    var connect = new PluggyConnect({
      connectToken: "${connectToken}",
      onSuccess: function(data) {
        var itemId = data && data.item ? data.item.id : null;
        var bankName = data && data.item && data.item.connector ? data.item.connector.name : 'Banco';
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', itemId: itemId, bankName: bankName }));
        }
      },
      onError: function(err) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(err) }));
        }
      },
      onClose: function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'close' }));
        }
      }
    });
    connect.init();
  </script>
</body>
</html>`;
}
