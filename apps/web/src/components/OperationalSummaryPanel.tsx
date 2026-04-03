import { useEffect, useState } from "react";
import { useMaskedCurrency } from "../context/DiscreetModeContext";
import {
  buildDashboardContractView,
  dashboardService,
  type DashboardSnapshot,
} from "../services/dashboard.service";
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
  <div className="flex min-h-[124px] flex-col rounded-lg border border-cf-border bg-cf-bg-subtle px-3.5 py-3">
    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-cf-text-secondary">
      {label}
    </p>
    <p className={`text-base font-semibold leading-tight ${ACCENT_CLASSES[accent]}`}>{primary}</p>
    {secondary ? (
      <p className="mt-1 text-[11px] text-cf-text-secondary">{secondary}</p>
    ) : null}
    {tertiary ? (
      <p className="mt-0.5 text-[11px] text-cf-text-secondary">{tertiary}</p>
    ) : null}
    {actionLabel && onActionClick ? (
      <button
        type="button"
        onClick={onActionClick}
        className="mt-auto pt-1.5 text-left text-xs font-semibold text-brand-1 hover:text-brand-2"
      >
        {actionLabel} →
      </button>
    ) : null}
  </div>
);

// ─── Loading skeleton ─────────────────────────────────────────────────────────

const SkeletonTile = () => (
  <div className="animate-pulse rounded-lg border border-cf-border bg-cf-bg-subtle px-3.5 py-3">
    <div className="mb-1.5 h-2 w-16 rounded bg-cf-border" />
    <div className="h-4 w-24 rounded bg-cf-border" />
    <div className="mt-1 h-3 w-20 rounded bg-cf-border" />
  </div>
);

// ─── Panel ────────────────────────────────────────────────────────────────────

interface OperationalSummaryPanelProps {
  onOpenDueSoonBills?: () => void;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const sumAmounts = (items: Array<{ amount: number }>): number =>
  items.reduce((total, item) => total + item.amount, 0);

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
          ctaLabel={hasRetriedLoad ? "Nova tentativa indisponível" : "Recarregar resumo operacional"}
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

  const { forecast, consignado } = snapshot;
  const { balanceSnapshot, obligations } = buildDashboardContractView(snapshot);

  const nowTimestamp = Date.now();
  const dueSoonLimit = nowTimestamp + 7 * DAY_IN_MS;
  const billObligations = obligations.filter((obligation) => obligation.obligationType === "bill");
  const overdueObligations = billObligations.filter((obligation) => obligation.status === "due");
  const dueSoonObligations = billObligations.filter((obligation) => {
    if (obligation.status !== "open") {
      return false;
    }

    return Date.parse(obligation.dueDate) <= dueSoonLimit;
  });
  const upcomingObligations = billObligations.filter((obligation) => {
    if (obligation.status !== "open") {
      return false;
    }

    return Date.parse(obligation.dueDate) > dueSoonLimit;
  });

  const overdueCount = overdueObligations.length;
  const overdueTotal = sumAmounts(overdueObligations);
  const dueSoonCount = dueSoonObligations.length;
  const dueSoonTotal = sumAmounts(dueSoonObligations);
  const upcomingCount = upcomingObligations.length;
  const upcomingTotal = sumAmounts(upcomingObligations);
  const receivedThisMonth = snapshot.income.receivedThisMonth;
  const projectedThisMonth = snapshot.income.pendingThisMonth;
  const cardCycleTotal = sumAmounts(
    obligations.filter((obligation) => obligation.obligationType === "credit_card_cycle"),
  );
  const openInvoicesTotal = sumAmounts(
    obligations.filter((obligation) => obligation.obligationType === "open_invoice"),
  );

  // ── Tile 1: Bank balance ──────────────────────────────────────────────────
  const bankBalance = balanceSnapshot.bankBalance;
  const hasOverdueBills = overdueCount > 0;
  const hasDueSoonBills = dueSoonCount > 0;
  const technicalBalance = balanceSnapshot.technicalBalance;
  const shortTermBalance = technicalBalance - dueSoonTotal;
  const shouldShowShortTermBalance = hasDueSoonBills && !hasOverdueBills;

  const bankTileSecondary = hasOverdueBills
    ? `Saldo técnico: ${money(technicalBalance)}`
    : shouldShowShortTermBalance
      ? `Saldo em 7 dias: ${money(shortTermBalance)}`
      : "Saldo disponível";

  const bankTileDetails: string[] = [];
  if (hasOverdueBills) {
    bankTileDetails.push(
      `${overdueCount} vencida${overdueCount > 1 ? "s" : ""} somam ${money(overdueTotal)}`,
    );
  }
  if (hasDueSoonBills) {
    bankTileDetails.push(
      `${dueSoonCount} em 7 dias somam ${money(dueSoonTotal)}`,
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
  const totalImmediateBillsCount = overdueCount + dueSoonCount;
  const totalImmediateBillsAmount = overdueTotal + dueSoonTotal;
  const hasUpcomingBills = upcomingCount > 0;
  const shouldHighlightImmediateBills = totalImmediateBillsCount > 0;
  const billsPrimaryAmount = shouldHighlightImmediateBills
    ? totalImmediateBillsAmount
    : hasUpcomingBills
      ? upcomingTotal
      : 0;
  const billsAccent: TileProps["accent"] =
    overdueCount > 0 ? "danger" : dueSoonCount > 0 ? "warning" : "muted";
  const billsTertiaryTokens: string[] = [];
  if (dueSoonCount > 0) {
    billsTertiaryTokens.push(
      `Urgência 7d: ${dueSoonCount} conta${dueSoonCount > 1 ? "s" : ""} • ${money(dueSoonTotal)}`,
    );
  }
  if (hasUpcomingBills) {
    billsTertiaryTokens.push(
      `${upcomingCount} próxima${upcomingCount > 1 ? "s" : ""}`,
    );
  }
  const billsTile: TileProps = {
    label: "Contas a pagar",
    primary: shouldHighlightImmediateBills || hasUpcomingBills ? money(billsPrimaryAmount) : "—",
    secondary:
      overdueCount > 0
        ? `${overdueCount} vencida${overdueCount > 1 ? "s" : ""}`
        : dueSoonCount > 0
          ? `${dueSoonCount} em 7 dias`
          : hasUpcomingBills
            ? `${upcomingCount} próxima${upcomingCount > 1 ? "s" : ""}`
          : "Nenhuma pendente",
    tertiary: billsTertiaryTokens.length > 0 ? `+ ${billsTertiaryTokens.join(" • ")}` : undefined,
    actionLabel: dueSoonCount > 0 && onOpenDueSoonBills ? "Ver contas em 7 dias" : undefined,
    onActionClick: dueSoonCount > 0 && onOpenDueSoonBills ? onOpenDueSoonBills : undefined,
    accent: billsAccent,
  };

  // ── Tile 3: Credit card ───────────────────────────────────────────────────
  const hasCardCycle = cardCycleTotal > 0;
  const hasOpenInvoices = openInvoicesTotal > 0;
  const cardTile: TileProps = {
    label: "Cartão",
    primary: hasOpenInvoices ? money(openInvoicesTotal) : hasCardCycle ? money(cardCycleTotal) : "—",
    secondary:
      hasOpenInvoices
        ? `Faturas a pagar: ${money(openInvoicesTotal)}`
        : hasCardCycle
          ? `Gastos no ciclo: ${money(cardCycleTotal)}`
          : "Sem movimentação",
    tertiary:
      hasOpenInvoices && hasCardCycle
        ? `Gastos no ciclo: ${money(cardCycleTotal)}`
        : undefined,
    accent: hasOpenInvoices ? "warning" : hasCardCycle ? "default" : "muted",
  };

  // ── Tile 4: Income ────────────────────────────────────────────────────────
  const hasConfirmedIncome = receivedThisMonth > 0;
  const hasProjectedIncome = projectedThisMonth > 0;
  const incomeTile: TileProps = {
    label: "Renda do mês",
    primary: money(receivedThisMonth),
    secondary: "Recebido",
    tertiary: `Previsto: ${money(projectedThisMonth)}`,
    accent:
      hasConfirmedIncome
        ? "success"
        : hasProjectedIncome
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-cf-text-secondary">Severidade</span>
        <OperationalSeverityBadge severity="normal" />
        <OperationalSeverityBadge severity="atencao" />
        <OperationalSeverityBadge severity="risco" />
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
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
