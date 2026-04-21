import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { fetchRecentTransactions, fetchSnapshot } from "../services/dashboard.service";
import type { DashboardSnapshot, Transaction } from "../services/dashboard.service";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function SummaryCard({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

function TransactionRow({ item }: { item: Transaction }) {
  const isIncome = item.type === "Entrada";
  return (
    <View style={styles.txRow}>
      <View style={styles.txLeft}>
        <Text style={styles.txDescription} numberOfLines={1}>
          {item.description}
        </Text>
        <Text style={styles.txMeta}>
          {item.category?.name ?? "Sem categoria"} · {item.date.slice(0, 10)}
        </Text>
      </View>
      <Text style={[styles.txValue, isIncome ? styles.income : styles.expense]}>
        {isIncome ? "+" : "-"}
        {formatCurrency(Math.abs(item.value))}
      </Text>
    </View>
  );
}

export default function DashboardScreen() {
  const { logout } = useAuth();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [snap, txs] = await Promise.all([
        fetchSnapshot(),
        fetchRecentTransactions(10),
      ]);
      setSnapshot(snap);
      setTransactions(txs);
    } catch {
      setError("Não foi possível carregar os dados.");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6741d9" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#6741d9"
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Visão geral</Text>
              <Pressable onPress={logout} hitSlop={12}>
                <Text style={styles.logoutText}>Sair</Text>
              </Pressable>
            </View>

            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : snapshot ? (
              <View style={styles.summaryGrid}>
                <SummaryCard
                  label="Saldo atual"
                  value={formatCurrency(snapshot.bankBalance)}
                />
                <SummaryCard
                  label="Entradas"
                  value={formatCurrency(snapshot.semanticCore.realized.confirmedInflowTotal)}
                  valueColor="#4ade80"
                />
                <SummaryCard
                  label="Saídas"
                  value={formatCurrency(snapshot.semanticCore.realized.settledOutflowTotal)}
                  valueColor="#f87171"
                />
                <SummaryCard
                  label="Projeção"
                  value={formatCurrency(snapshot.semanticCore.projection.projectedBalance)}
                />
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Transações recentes</Text>
          </>
        }
        renderItem={({ item }) => <TransactionRow item={item} />}
        ListEmptyComponent={
          !error ? (
            <Text style={styles.emptyText}>Nenhuma transação encontrada.</Text>
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  centered: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingBottom: 32,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    color: "#f1f5f9",
    fontSize: 22,
    fontWeight: "800",
  },
  logoutText: {
    color: "#94a3b8",
    fontSize: 14,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  summaryCard: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    gap: 4,
    padding: 16,
    width: "47%",
  },
  summaryLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryValue: {
    color: "#f1f5f9",
    fontSize: 18,
    fontWeight: "700",
  },
  sectionTitle: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 20,
    textTransform: "uppercase",
  },
  txRow: {
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  txLeft: {
    flex: 1,
    marginRight: 12,
  },
  txDescription: {
    color: "#f1f5f9",
    fontSize: 14,
    fontWeight: "600",
  },
  txMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2,
  },
  txValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  income: {
    color: "#4ade80",
  },
  expense: {
    color: "#f87171",
  },
  errorText: {
    color: "#f87171",
    fontSize: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
