import { useEffect, useState } from "react";
import { useMaskedCurrency } from "../context/DiscreetModeContext";
import { dashboardService, type DashboardSnapshot } from "../services/dashboard.service";
import { getApiErrorMessage } from "../utils/apiError";
import { logWidgetFallbackError } from "../utils/widgetFallbackTelemetry";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasRetriedLoad, setHasRetriedLoad] = useState(false);
  const money = useMaskedCurrency();

  const loadSnapshot = async (retryAttempt = false) => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await dashboardService
        .getSnapshot({ feature: "dashboard", widget: "operational-summary-panel", operation: retryAttempt ? "retry-load" : "load" });
      setSnapshot(data);
    } catch (error) {
      setSnapshot(null);
      setLoadError(getApiErrorMessage(error, "Não foi possível carregar o resumo operacional."));
      logWidgetFallbackError({
        widget: "operational-summary-panel",
        operation: retryAttempt ? "retry-load" : "load",
        error,
        fallbackRendered: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const handleRetry = () => {
    if (hasRetriedLoad) {
      return;
    }

    setHasRetriedLoad(true);
    void loadSnapshot(true);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonTile key={i} />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        <p>{loadError}</p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={hasRetriedLoad}
            className="rounded border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {hasRetriedLoad ? "Nova tentativa indisponível" : "Tentar novamente"}
          </button>
          {hasRetriedLoad ? (
            <span className="text-xs text-red-600">Limite de 1 nova tentativa atingido.</span>
          ) : null}
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface px-4 py-3 text-sm text-cf-text-secondary">
        Resumo operacional indisponível no momento.
      </div>
    );
  }

  const { bankBalance, bills, cards, income, forecast, consignado } = snapshot;

  // ── Tile 1: Bank balance ──────────────────────────────────────────────────
  const hasOverdueBills = bills.overdueCount > 0;
  const hasDueSoonBills = bills.dueSoonCount > 0;
  const technicalBalance = bankBalance - bills.overdueTotal;
  const shortTermBalance = technicalBalance - bills.dueSoonTotal;
  const shouldShowShortTermBalance = hasDueSoonBills && !hasOverdueBills;

  const bankTileSecondary = hasOverdueBills
    ? `Saldo técnico: ${money(technicalBalance)}`
    : shouldShowShortTermBalance
      ? `Saldo em 7 dias: ${money(shortTermBalance)}`
      : "Saldo disponível";

  const bankTileDetails: string[] = [];
  if (hasOverdueBills) {
    bankTileDetails.push(
      `${bills.overdueCount} vencida${bills.overdueCount > 1 ? "s" : ""} somam ${money(bills.overdueTotal)}`,
    );
  }
  if (hasDueSoonBills) {
    bankTileDetails.push(
      `${bills.dueSoonCount} em 7 dias somam ${money(bills.dueSoonTotal)}`,
    );
  }

  const bankTile: TileProps = {
    label: "Conta",
    primary: money(bankBalance),
    secondary: bankTileSecondary,
    tertiary: bankTileDetails.length > 0 ? bankTileDetails.join(" • ") : undefined,
    accent:
      shortTermBalance < 0
        ? "danger"
        : hasOverdueBills || hasDueSoonBills
          ? "warning"
          : bankBalance < 0
            ? "danger"
            : "default",
  };

  // ── Tile 2: Bills ─────────────────────────────────────────────────────────
  const totalImmediateBillsCount = bills.overdueCount + bills.dueSoonCount;
  const totalImmediateBillsAmount = bills.overdueTotal + bills.dueSoonTotal;
  const hasUpcomingBills = bills.upcomingCount > 0;
  const shouldHighlightImmediateBills = totalImmediateBillsCount > 0;
  const billsPrimaryAmount = shouldHighlightImmediateBills
    ? totalImmediateBillsAmount
    : hasUpcomingBills
      ? bills.upcomingTotal
      : 0;
  const billsAccent: TileProps["accent"] =
    bills.overdueCount > 0 ? "danger" : bills.dueSoonCount > 0 ? "warning" : "muted";
  const billsTertiaryTokens: string[] = [];
  if (bills.dueSoonCount > 0) {
    billsTertiaryTokens.push(
      `Urgência 7d: ${bills.dueSoonCount} conta${bills.dueSoonCount > 1 ? "s" : ""} • ${money(bills.dueSoonTotal)}`,
    );
  }
  if (hasUpcomingBills) {
    billsTertiaryTokens.push(
      `${bills.upcomingCount} próxima${bills.upcomingCount > 1 ? "s" : ""}`,
    );
  }
  const billsTile: TileProps = {
    label: "Contas a pagar",
    primary: shouldHighlightImmediateBills || hasUpcomingBills ? money(billsPrimaryAmount) : "—",
    secondary:
      bills.overdueCount > 0
        ? `${bills.overdueCount} vencida${bills.overdueCount > 1 ? "s" : ""}`
        : bills.dueSoonCount > 0
          ? `${bills.dueSoonCount} em 7 dias`
          : hasUpcomingBills
            ? `${bills.upcomingCount} próxima${bills.upcomingCount > 1 ? "s" : ""}`
          : "Nenhuma pendente",
    tertiary: billsTertiaryTokens.length > 0 ? `+ ${billsTertiaryTokens.join(" • ")}` : undefined,
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
