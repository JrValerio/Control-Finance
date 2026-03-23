import { useCallback, useEffect, useState } from "react";
import {
  billingService,
  type SubscriptionSummary,
} from "../services/billing.service";

interface ApiLikeError {
  response?: {
    data?: {
      message?: string;
    };
    status?: number;
  };
  message?: string;
}

const getApiErrorMessage = (error: unknown, fallbackMessage: string): string => {
  const normalizedError = error as ApiLikeError;
  return (
    normalizedError?.response?.data?.message ||
    normalizedError?.message ||
    fallbackMessage
  );
};

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

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  prepaid_active: "Ativo (pre-pago)",
  trialing: "Em teste",
  past_due: "Pagamento pendente",
  canceled: "Cancelado",
  unpaid: "Não pago",
};

const STATUS_CLASSES: Record<string, string> = {
  active: "border-green-200 bg-green-50 text-green-700",
  prepaid_active: "border-green-200 bg-green-50 text-green-700",
  trialing: "border-blue-200 bg-blue-50 text-blue-700",
  past_due: "border-amber-200 bg-amber-50 text-amber-700",
  canceled: "border-gray-200 bg-gray-50 text-gray-600",
  unpaid: "border-red-200 bg-red-50 text-red-700",
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
      const status = (error as ApiLikeError)?.response?.status;
      if (status === 422) {
        setActionError(
          "Portal de gerenciamento indisponivel. Entre em contato com o suporte.",
        );
      } else {
        setActionError(
          getApiErrorMessage(error, "Não foi possível abrir o portal. Tente novamente."),
        );
      }
      setIsActionLoading(false);
    }
  };

  const isPro = Boolean(summary?.subscription);
  const statusKey = summary?.subscription?.status ?? "";
  const statusLabel = STATUS_LABELS[statusKey] ?? "";
  const statusClass = STATUS_CLASSES[statusKey] ?? "";
  const isPrepaid = statusKey === "prepaid_active";
  const periodEnd = summary?.subscription?.currentPeriodEnd;
  const cancelAtPeriodEnd = summary?.subscription?.cancelAtPeriodEnd;
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
                  Pagamento recebido. Confirmando liberacao do plano Pro. Em metodos como boleto, a confirmacao pode levar alguns minutos.
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
                    {isPro && statusLabel ? (
                      <span
                        className={`mt-1 inline-block rounded border px-2 py-0.5 text-xs font-semibold ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                    ) : null}
                    {!isPro ? (
                      <span className="mt-1 inline-block rounded border border-cf-border px-2 py-0.5 text-xs font-semibold text-cf-text-secondary">
                        Gratuito
                      </span>
                    ) : null}
                  </div>

                  {!isPro ? (
                    <button
                      type="button"
                      onClick={handleSubscribe}
                      disabled={isActionLoading}
                      className="rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isActionLoading ? "Aguarde..." : "Assinar PRO"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleManage}
                      disabled={isActionLoading}
                      className="rounded border border-cf-border bg-cf-surface px-4 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isActionLoading ? "Aguarde..." : "Gerenciar assinatura"}
                    </button>
                  )}
                </div>

                {isPro && periodEnd ? (
                  <p className="mt-3 text-xs text-cf-text-secondary">
                    {isPrepaid
                      ? `Expira em: ${formatDate(periodEnd)}`
                      : cancelAtPeriodEnd
                      ? `Cancela em: ${formatDate(periodEnd)}`
                      : `Renovacao em: ${formatDate(periodEnd)}`}
                  </p>
                ) : null}
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
