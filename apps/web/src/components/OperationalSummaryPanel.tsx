import { useEffect, useState } from "react";
import { useMaskedCurrency } from "../context/DiscreetModeContext";
import { dashboardService, type DashboardSnapshot } from "../services/dashboard.service";

// ─── Tile ─────────────────────────────────────────────────────────────────────

interface TileProps {
  label: string;
  primary: string;
  secondary?: string;
  tertiary?: string;
  accent?: "default" | "warning" | "danger" | "success" | "muted";
}

const ACCENT_CLASSES: Record<NonNullable<TileProps["accent"]>, string> = {
  default: "text-cf-text-primary",
  warning: "text-amber-600",
  danger: "text-red-600",
  success: "text-emerald-600",
  muted: "text-cf-text-secondary",
};

const Tile = ({ label, primary, secondary, tertiary, accent = "default" }: TileProps) => (
  <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-cf-text-secondary">
      {label}
    </p>
    <p className={`text-sm font-semibold leading-tight ${ACCENT_CLASSES[accent]}`}>{primary}</p>
    {secondary ? (
      <p className="mt-0.5 text-xs text-cf-text-secondary">{secondary}</p>
    ) : null}
    {tertiary ? (
      <p className="text-xs text-cf-text-secondary">{tertiary}</p>
    ) : null}
  </div>
);

// ─── Loading skeleton ─────────────────────────────────────────────────────────

const SkeletonTile = () => (
  <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5 animate-pulse">
    <div className="mb-1.5 h-2 w-16 rounded bg-cf-border" />
    <div className="h-4 w-24 rounded bg-cf-border" />
    <div className="mt-1 h-3 w-20 rounded bg-cf-border" />
  </div>
);

// ─── Panel ────────────────────────────────────────────────────────────────────

const OperationalSummaryPanel = (): JSX.Element | null => {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const money = useMaskedCurrency();

  useEffect(() => {
    dashboardService
      .getSnapshot()
      .then(setSnapshot)
      .catch(() => {/* non-blocking — panel just won't render */})
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonTile key={i} />
        ))}
      </div>
    );
  }

  if (!snapshot) return null;

  const { bankBalance, bills, cards, income, forecast, consignado } = snapshot;

  // ── Tile 1: Bank balance ──────────────────────────────────────────────────
  const bankTile: TileProps = {
    label: "Conta",
    primary: money(bankBalance),
    secondary: "Saldo disponível",
    accent: bankBalance < 0 ? "danger" : "default",
  };

  // ── Tile 2: Bills ─────────────────────────────────────────────────────────
  const totalBillsCount = bills.overdueCount + bills.dueSoonCount;
  const totalBillsAmount = bills.overdueTotal + bills.dueSoonTotal;
  const billsAccent: TileProps["accent"] =
    bills.overdueCount > 0 ? "danger" : bills.dueSoonCount > 0 ? "warning" : "muted";
  const billsTile: TileProps = {
    label: "Contas a pagar",
    primary: totalBillsCount > 0 ? money(totalBillsAmount) : "—",
    secondary:
      bills.overdueCount > 0
        ? `${bills.overdueCount} vencida${bills.overdueCount > 1 ? "s" : ""}`
        : bills.dueSoonCount > 0
          ? `${bills.dueSoonCount} em 7 dias`
          : "Nenhuma pendente",
    tertiary:
      bills.overdueCount > 0 && bills.dueSoonCount > 0
        ? `+ ${bills.dueSoonCount} a vencer`
        : undefined,
    accent: billsAccent,
  };

  // ── Tile 3: Credit card ───────────────────────────────────────────────────
  const cardTotal = cards.openPurchasesTotal + cards.pendingInvoicesTotal;
  const cardTile: TileProps = {
    label: "Cartão",
    primary: cardTotal > 0 ? money(cardTotal) : "—",
    secondary:
      cards.openPurchasesTotal > 0 ? `${money(cards.openPurchasesTotal)} em aberto` : undefined,
    tertiary:
      cards.pendingInvoicesTotal > 0
        ? `${money(cards.pendingInvoicesTotal)} fatura`
        : undefined,
    accent: cards.pendingInvoicesTotal > 0 ? "warning" : "default",
  };

  // ── Tile 4: Income ────────────────────────────────────────────────────────
  const hasIncome = income.receivedThisMonth > 0 || income.pendingThisMonth > 0;
  const incomeTile: TileProps = {
    label: "Renda do mês",
    primary: hasIncome ? money(income.receivedThisMonth + income.pendingThisMonth) : "—",
    secondary:
      income.receivedThisMonth > 0
        ? `${money(income.receivedThisMonth)} recebido`
        : income.pendingThisMonth > 0
          ? "Ainda não recebido"
          : "Sem lançamento",
    tertiary:
      income.pendingThisMonth > 0 && income.receivedThisMonth > 0
        ? `${money(income.pendingThisMonth)} pendente`
        : undefined,
    accent:
      income.receivedThisMonth > 0
        ? "success"
        : income.pendingThisMonth > 0
          ? "warning"
          : "muted",
  };

  // ── Tile 5: Forecast ──────────────────────────────────────────────────────
  const forecastTile: TileProps = forecast
    ? {
        label: "Projeção",
        primary: money(forecast.projectedBalance),
        secondary: "Fechamento do mês",
        accent: forecast.projectedBalance < 0 ? "danger" : forecast.projectedBalance < 200 ? "warning" : "default",
      }
    : {
        label: "Projeção",
        primary: "—",
        secondary: "Sem dados suficientes",
        accent: "muted",
      };

  // ── Tile 6: Consignado ────────────────────────────────────────────────────
  const consignadoAccent: TileProps["accent"] =
    consignado.comprometimentoPct != null && consignado.comprometimentoPct > 35
      ? "danger"
      : consignado.comprometimentoPct != null && consignado.comprometimentoPct > 25
        ? "warning"
        : consignado.monthlyTotal > 0
          ? "default"
          : "muted";
  const consignadoTile: TileProps =
    consignado.monthlyTotal > 0
      ? {
          label: "Consignado",
          primary: money(consignado.monthlyTotal),
          secondary:
            consignado.contractsCount > 0
              ? `${consignado.contractsCount} contrato${consignado.contractsCount > 1 ? "s" : ""}`
              : "Desconto mensal",
          tertiary:
            consignado.comprometimentoPct != null
              ? `${consignado.comprometimentoPct}% da margem`
              : undefined,
          accent: consignadoAccent,
        }
      : {
          label: "Consignado",
          primary: "—",
          secondary: "Sem descontos",
          accent: "muted",
        };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Tile {...bankTile} />
      <Tile {...billsTile} />
      <Tile {...cardTile} />
      <Tile {...incomeTile} />
      <Tile {...forecastTile} />
      <Tile {...consignadoTile} />
    </div>
  );
};

export default OperationalSummaryPanel;
