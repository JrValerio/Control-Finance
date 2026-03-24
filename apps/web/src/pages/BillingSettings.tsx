import { useCallback, useEffect, useState } from "react";
import {
  billingService,
  type SubscriptionSummary,
} from "../services/billing.service";
import { getApiErrorMessage, getApiErrorStatus } from "../utils/apiError";

const formatDate = (isoString: string | null | undefined): string => {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
};

const resolveCheckoutStatus = (): string => {
  if (typeof window === "undefined") {
    return "";
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("checkout")?.trim().toLowerCase() || "";
};

const daysRemaining = (isoDate: string | null | undefined): number => {
  if (!isoDate) return 0;
  const ms = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};

type PlanBadge = { label: string; className: string };

const resolvePlanBadge = (summary: import("../services/billing.service").SubscriptionSummary): PlanBadge => {
  const source = summary.entitlementSource;

  if (source === "trial") {
    const days = daysRemaining(summary.trialEndsAt);
    return {
      label: `Trial — ${days} dia${days !== 1 ? "s" : ""} restante${days !== 1 ? "s" : ""}`,
      className: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }

  if (source === "subscription") {
    const canceling = Boolean(summary.subscription?.cancelAtPeriodEnd);
    const date = formatDate(summary.subscription?.currentPeriodEnd);
    return canceling
      ? { label: `Pro ativo — acesso até ${date}`, className: "border-amber-200 bg-amber-50 text-amber-700" }
      : { label: `Pro ativo — renova em ${date}`, className: "border-green-200 bg-green-50 text-green-700" };
  }

  if (source === "subscription_grace") {
    return {
      label: `Pagamento pendente — acesso até ${formatDate(summary.graceEndsAt)}`,
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (source === "prepaid") {
    return {
      label: `Pro prepago — válido até ${formatDate(summary.proExpiresAt)}`,
      className: "border-green-200 bg-green-50 text-green-700",
    };
  }

  // source === "free"
  if (summary.trialExpired) {
    return {
      label: "Trial encerrado",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Gratuito",
    className: "border-cf-border bg-cf-bg-subtle text-cf-text-secondary",
  };
};

interface BillingSettingsProps {
  onBack?: () => void;
  onLogout?: () => void;
}

const BillingSettings = ({
  onBack = undefined,
  onLogout = undefined,
}: BillingSettingsProps): JSX.Element => {
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await billingService.getSubscription();
      setSummary(data);
    } catch (error) {
      setLoadError(
        getApiErrorMessage(error, "Não foi possível carregar os dados da assinatura."),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  const handleSubscribe = async () => {
    setIsActionLoading(true);
    setActionError(null);
    try {
      const { url } = await billingService.createCheckout();
      window.location.href = url;
    } catch (error) {
      setActionError(
        getApiErrorMessage(error, "Não foi possível iniciar o checkout. Tente novamente."),
      );
      setIsActionLoading(false);
    }
  };

  const handleManage = async () => {
    setIsActionLoading(true);
    setActionError(null);
    try {
      const { url } = await billingService.createPortal();
      window.location.href = url;
    } catch (error) {
      const status = getApiErrorStatus(error);
      if (status === 422) {
        setActionError(
          "Portal de gerenciamento indisponível. Entre em contato com o suporte.",
        );
      } else {
        setActionError(
          getApiErrorMessage(error, "Não foi possível abrir o portal. Tente novamente."),
        );
      }
      setIsActionLoading(false);
    }
  };

  const source = summary?.entitlementSource ?? "free";
  const isPro = source === "subscription" || source === "subscription_grace" || source === "prepaid";
  const planBadge = summary ? resolvePlanBadge(summary) : null;
  const checkoutStatus = resolveCheckoutStatus();
  const showCheckoutPendingNotice =
    checkoutStatus === "success" && !isLoading && !loadError && !isPro;
  const showCheckoutCanceledNotice = checkoutStatus === "cancel";

  return (
    <div className="min-h-screen bg-cf-bg-page py-6">
      <main className="mx-auto w-full max-w-4xl space-y-4 px-4 sm:px-6">
        <section className="rounded border border-cf-border bg-cf-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-cf-text-primary">
                Settings - Assinatura
              </h1>
              <p className="mt-1 text-sm text-cf-text-secondary">
                Gerencie seu plano e assinatura.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                className="rounded border border-cf-border bg-cf-surface px-3 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
              >
                Voltar ao dashboard
              </button>
              {onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded border border-cf-border bg-cf-surface px-3 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                >
                  Sair
                </button>
              ) : null}
            </div>
          </div>

          {isLoading ? (
            <div className="mt-4 space-y-3" role="status" aria-live="polite">
              <div className="h-20 animate-pulse rounded border border-cf-border bg-cf-bg-subtle" />
              <span className="sr-only">Carregando dados da assinatura...</span>
            </div>
          ) : null}

          {!isLoading && loadError ? (
            <div
              className="mt-4 flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              <span>{loadError}</span>
              <button
                type="button"
                onClick={loadSubscription}
                className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Tentar novamente
              </button>
            </div>
          ) : null}

          {!isLoading && !loadError && summary ? (
            <div className="mt-4 space-y-4">
              {showCheckoutPendingNotice ? (
                <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  Pagamento recebido. Confirmando liberação do plano Pro. Em métodos como boleto, a confirmação pode levar alguns minutos.
                </div>
              ) : null}

              {showCheckoutCanceledNotice ? (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Checkout cancelado. Nenhuma cobranca foi confirmada.
                </div>
              ) : null}

              {/* Plan card */}
              <div className="rounded border border-cf-border bg-cf-bg-subtle p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-cf-text-secondary">
                      Plano atual
                    </p>
                    <p className="mt-0.5 text-lg font-bold text-cf-text-primary">
                      {summary.displayName}
                    </p>
                    {planBadge ? (
                      <span
                        className={`mt-1 inline-block rounded border px-2 py-0.5 text-xs font-semibold ${planBadge.className}`}
                      >
                        {planBadge.label}
                      </span>
                    ) : null}
                  </div>

                  {isPro ? (
                    <button
                      type="button"
                      onClick={handleManage}
                      disabled={isActionLoading}
                      className="rounded border border-cf-border bg-cf-surface px-4 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isActionLoading ? "Aguarde..." : "Gerenciar assinatura"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubscribe}
                      disabled={isActionLoading}
                      className="rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isActionLoading
                        ? "Aguarde..."
                        : source === "trial"
                        ? "Assinar PRO agora"
                        : source === "free" && summary?.trialExpired
                        ? "Reativar acesso Pro"
                        : "Assinar PRO"}
                    </button>
                  )}
                </div>

              </div>

              {actionError ? (
                <div
                  className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                  role="alert"
                >
                  {actionError}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
};

export default BillingSettings;
