import { clearDemoTransactions, upsertTransactions } from "../db/database";

const iso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const TEMPLATE = [
  { day: 5,  description: "Salário",                    amount: 5200,   type: "CREDIT", category: "Renda" },
  { day: 6,  description: "Aluguel",                    amount: 1500,   type: "DEBIT",  category: "Moradia" },
  { day: 8,  description: "Supermercado Pão de Açúcar", amount: 342.87, type: "DEBIT",  category: "Alimentação" },
  { day: 10, description: "Netflix",                    amount: 44.9,   type: "DEBIT",  category: "Assinaturas" },
  { day: 11, description: "Uber",                       amount: 23.5,   type: "DEBIT",  category: "Transporte" },
  { day: 12, description: "Farmácia São João",          amount: 67.3,   type: "DEBIT",  category: "Saúde" },
  { day: 14, description: "iFood",                      amount: 58.9,   type: "DEBIT",  category: "Alimentação" },
  { day: 15, description: "PIX recebido",               amount: 300,    type: "CREDIT", category: "Transferência" },
  { day: 16, description: "Conta de luz",               amount: 189.44, type: "DEBIT",  category: "Contas" },
  { day: 18, description: "Posto de combustível",       amount: 200,    type: "DEBIT",  category: "Transporte" },
  { day: 20, description: "Academia SmartFit",          amount: 99.9,   type: "DEBIT",  category: "Saúde" },
  { day: 21, description: "Restaurante",                amount: 89,     type: "DEBIT",  category: "Alimentação" },
  { day: 22, description: "Spotify",                    amount: 21.9,   type: "DEBIT",  category: "Assinaturas" },
  { day: 25, description: "Freelance",                  amount: 800,    type: "CREDIT", category: "Renda" },
] as const;

function monthTransactions(offset: number) {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() - offset);
  const y = base.getFullYear();
  const m = base.getMonth();
  return TEMPLATE.map((t, i) => ({
    pluggy_id: `demo-${offset}-${i}`,
    account_id: "demo-cc",
    account_name: "Conta Corrente",
    description: t.description,
    amount: t.amount,
    date: iso(new Date(y, m, t.day)),
    type: t.type as "CREDIT" | "DEBIT",
    category: t.category as string | null,
  }));
}

// Popula o mês atual e o anterior
export async function seedDemoData() {
  await upsertTransactions([...monthTransactions(0), ...monthTransactions(1)]);
}

// Remove todos os dados de demonstração
export async function removeDemoData() {
  await clearDemoTransactions();
}
