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
  if (!accountsRes.ok) throw new Error("Falha ao buscar contas");
  const { results: accounts } = await accountsRes.json();

  const all: PluggyTransaction[] = [];
  for (const account of accounts ?? []) {
    let page = 1;
    while (true) {
      const txRes = await fetch(
        `${BASE}/transactions?accountId=${account.id}&from=${from}&to=${to}&pageSize=100&page=${page}`,
        { headers: { "X-API-KEY": apiKey } }
      );
      if (!txRes.ok) break;
      const { results, totalPages } = await txRes.json();
      for (const tx of results ?? []) {
        all.push({
          id: tx.id,
          description: tx.description ?? "",
          amount: Math.abs(tx.amount),
          date: (tx.date as string).split("T")[0],
          type: tx.type,
          category: tx.category ?? null,
          accountId: account.id,
          accountName: account.name ?? "",
        });
      }
      if (page >= (totalPages ?? 1) || (results?.length ?? 0) < 100) break;
      page++;
    }
  }
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
