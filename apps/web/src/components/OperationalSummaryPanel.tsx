import { useEffect, useState } from "react";
import { useMaskedCurrency } from "../context/DiscreetModeContext";
import { dashboardService, type DashboardSnapshot } from "../services/dashboard.service";
import { getApiErrorMessage } from "../utils/apiError";
import { logWidgetFallbackError } from "../utils/widgetFallbackTelemetry";
import { OperationalSeverityBadge, OperationalStateBlock } from "./OperationalStateBlock";

// ─── Tile ─────────────────────────────────────────────────────────────────────

interface TileProps {
  label: string;
  primary: string;
  secondary?: string;
  tertiary?: string;
  actionLabel?: string;
  onActionClick?: () => void;
  accent?: "default" | "warning" | "danger" | "success" | "muted";
}

const ACCENT_CLASSES: Record<NonNullable<TileProps["accent"]>, string> = {
  default: "text-cf-text-primary",
  warning: "text-amber-600",
  danger: "text-red-600",
  success: "text-emerald-600",
  muted: "text-cf-text-secondary",
};

const Tile = ({ label, primary, secondary, tertiary, actionLabel, onActionClick, accent = "default" }: TileProps) => (
  <div className="flex min-h-[132px] flex-col rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
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
    {actionLabel && onActionClick ? (
      <button
        type="button"
        onClick={onActionClick}
        className="mt-auto pt-1 text-left text-xs font-semibold text-brand-1 hover:text-brand-2"
      >
        {actionLabel} →
      </button>
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

interface OperationalSummaryPanelProps {
  onOpenDueSoonBills?: () => void;
}

const OperationalSummaryPanel = ({ onOpenDueSoonBills }: OperationalSummaryPanelProps): JSX.Element | null => {
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonTile key={i} />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded border border-red-200 bg-cf-surface p-3">
        <OperationalStateBlock
          severity="risco"
          title="Resumo operacional com falha de carregamento"
          happened={loadError}
          impact="A triagem inicial perde parte dos sinais de risco e prioridade do mês."
          nextStep={
            hasRetriedLoad
              ? "Recarregue a página para realizar nova sincronização do resumo operacional."
              : "Use a nova tentativa para carregar os indicadores operacionais agora."
          }
          ctaLabel={hasRetriedLoad ? "Nova tentativa indisponível" : "Tentar novamente"}
          onCta={handleRetry}
          ctaDisabled={hasRetriedLoad}
          ctaDisabledLabel={hasRetriedLoad ? "Limite de 1 nova tentativa atingido." : undefined}
        />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded border border-amber-200 bg-cf-surface p-3">
        <OperationalStateBlock
          severity="atencao"
          title="Resumo operacional sem base suficiente"
          happened="Resumo operacional indisponível no momento."
          impact="Os blocos críticos podem não refletir o cenário completo desta competência."
          nextStep="Registre movimentações e contas do mês para liberar a leitura consolidada."
        />
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
    actionLabel: bills.dueSoonCount > 0 && onOpenDueSoonBills ? "Ver contas em 7 dias" : undefined,
    onActionClick: bills.dueSoonCount > 0 && onOpenDueSoonBills ? onOpenDueSoonBills : undefined,
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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-cf-text-secondary">Severidade</span>
        <OperationalSeverityBadge severity="normal" />
        <OperationalSeverityBadge severity="atencao" />
        <OperationalSeverityBadge severity="risco" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile {...bankTile} />
        <Tile {...billsTile} />
        <Tile {...cardTile} />
        <Tile {...incomeTile} />
        <Tile {...forecastTile} />
        <Tile {...consignadoTile} />
      </div>
    </div>
  );
};

export default OperationalSummaryPanel;
