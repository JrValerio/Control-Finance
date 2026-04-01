import { useCallback, useEffect, useState } from "react";
import { forecastService, type Forecast } from "../services/forecast.service";
import { profileService } from "../services/profile.service";
import { useMaskedCurrency } from "../context/DiscreetModeContext";
import { logWidgetFallbackError } from "../utils/widgetFallbackTelemetry";
import { OperationalSeverityBadge, OperationalStateBlock, type OperationalSeverity } from "./OperationalStateBlock";

interface ForecastCardProps {
  onOpenProfileSettings?: () => void;
  trialExpired?: boolean;
  txCountSinceFreeze?: number;
}

type CardState = "loading" | "awaiting-profile" | "active" | "frozen";

const FORECAST_CACHE_KEY = "cf.forecast.last";

const loadCachedForecast = (): Forecast | null => {
  try {
    const raw = window.localStorage.getItem(FORECAST_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Forecast;
  } catch {
    return null;
  }
};

const persistForecast = (forecast: Forecast) => {
  try {
    window.localStorage.setItem(FORECAST_CACHE_KEY, JSON.stringify(forecast));
  } catch {
    // Ignore storage errors (private mode / quotas)
  }
};

const FlipBanner = ({ direction }: { direction: "pos_to_neg" | "neg_to_pos" }) => {
  if (direction === "pos_to_neg") {
    return (
      <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
        Atenção: a projeção cruzou para negativo desde o último cálculo.
      </div>
    );
  }
  return (
    <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
      Ótimo: a projeção voltou ao positivo desde o último cálculo.
    </div>
  );
};

const BankLimitPanel = ({ forecast, money }: { forecast: Forecast; money: (value: unknown) => string }) => {
  const bankLimit = forecast.bankLimit;
  if (!bankLimit) return null;

  const statusTone =
    bankLimit.status === "exceeded"
      ? "border-red-200 bg-red-50 text-red-700"
      : bankLimit.alertTriggered
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-cf-border bg-cf-bg-subtle text-cf-text-secondary";

  const headline =
    bankLimit.status === "exceeded"
      ? `A projeção ultrapassa o limite em ${money(bankLimit.exceededBy)}.`
      : bankLimit.status === "using"
        ? `A projeção usa ${money(bankLimit.used)} do limite da conta.`
        : "A projeção do mês não entra no limite da conta.";

  return (
    <div className={`mt-3 rounded border px-3 py-2.5 ${statusTone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase">Limite bancário</p>
          <p className="mt-1 text-sm font-semibold">{headline}</p>
          <p className="mt-0.5 text-xs">
            Total {money(bankLimit.total)} · disponível {money(bankLimit.remaining)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase">Uso projetado</p>
          <p className="mt-1 text-base font-semibold">
            {money(bankLimit.used)}
          </p>
          <p className="mt-0.5 text-xs">
            {bankLimit.usagePct.toFixed(0)}% do limite
          </p>
        </div>
      </div>
    </div>
  );
};

const ForecastCard = ({
  onOpenProfileSettings,
  trialExpired = false,
  txCountSinceFreeze = 0,
}: ForecastCardProps): JSX.Element => {
  const money = useMaskedCurrency();
  const [cardState, setCardState] = useState<CardState>("loading");
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [error, setError] = useState("");
  const [hasLoadError, setHasLoadError] = useState(false);
  const [hasRetriedLoad, setHasRetriedLoad] = useState(false);

  const loadForecast = useCallback(async (retryAttempt = false) => {
    try {
      setError("");
      setHasLoadError(false);
      const me = await profileService.getMe();

      const hasProfile =
        me.profile !== null &&
        me.profile.salaryMonthly !== null &&
        me.profile.payday !== null;

      if (!hasProfile) {
        setCardState("awaiting-profile");
        return;
      }

      const trialEnded = Boolean(me.trialExpired || trialExpired);
      if (trialEnded) {
        setForecast(loadCachedForecast());
        setCardState("frozen");
        return;
      }

      const current = await forecastService.getCurrent({
        feature: "forecast",
        widget: "forecast-card",
        operation: "load",
      });

      if (current !== null) {
        setForecast(current);
        persistForecast(current);
        setCardState("active");
        return;
      }

      // No forecast yet - trigger initial compute
      const computed = await forecastService.recompute({
        feature: "forecast",
        widget: "forecast-card",
        operation: "initial-recompute",
      });
      setForecast(computed);
      persistForecast(computed);
      setCardState("active");
    } catch (loadError) {
      setHasLoadError(true);
      logWidgetFallbackError({
        widget: "forecast-card",
        operation: retryAttempt ? "retry-load" : "load",
        error: loadError,
        fallbackRendered: true,
      });
      setCardState("active");
    }
  }, [trialExpired]);

  useEffect(() => {
    void loadForecast();
  }, [loadForecast]);

  const handleRetryLoad = useCallback(() => {
    if (hasRetriedLoad) {
      return;
    }

    setHasRetriedLoad(true);
    setCardState("loading");
    void loadForecast(true);
  }, [hasRetriedLoad, loadForecast]);

  const handleRecompute = useCallback(async () => {
    if (isRecomputing) return;
    setIsRecomputing(true);
    setError("");
    try {
      const updated = await forecastService.recompute({
        feature: "forecast",
        widget: "forecast-card",
        operation: "manual-recompute",
      });
      setForecast(updated);
      persistForecast(updated);
    } catch (recomputeError) {
      logWidgetFallbackError({
        widget: "forecast-card",
        operation: "manual-recompute",
        error: recomputeError,
        fallbackRendered: true,
      });
      setError("Erro ao atualizar projeção.");
    } finally {
      setIsRecomputing(false);
    }
  }, [isRecomputing]);

  if (cardState === "loading") {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <p className="text-xs text-cf-text-secondary">Carregando projeção...</p>
      </div>
    );
  }

  if (cardState === "awaiting-profile") {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-cf-text-primary">Projeção de saldo</h3>
            <p className="mt-1 text-xs text-cf-text-secondary">
              Configure seu salário e dia de pagamento para ver sua projeção de saldo ao fim do mês.
            </p>
          </div>
          {onOpenProfileSettings ? (
            <button
              type="button"
              onClick={onOpenProfileSettings}
              className="shrink-0 rounded border border-brand-1 bg-brand-3 px-3 py-1.5 text-xs font-semibold text-brand-1 hover:bg-brand-2 hover:text-white"
            >
              Configurar perfil
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (cardState === "frozen") {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4 opacity-80">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-cf-text-primary">Projeção de saldo</h3>
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                Congelado
              </span>
            </div>
            {forecast ? (
              <>
                <p className="mt-2 text-2xl font-bold text-cf-text-primary">
                  {money(forecast.projectedBalance)}
                </p>
                <p className="mt-1 text-xs text-cf-text-secondary">
                  Projeção do mês {forecast.month} - congelada no fim do período de teste.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-cf-text-secondary">
                Sua última projeção está congelada no plano free. Assine para continuar atualizando.
              </p>
            )}
            {txCountSinceFreeze > 0 ? (
              <p className="mt-1 text-xs text-cf-text-secondary">
                {txCountSinceFreeze}{" "}
                {txCountSinceFreeze === 1 ? "transação registrada" : "transações registradas"} desde
                então.
              </p>
            ) : null}
          </div>
          {onOpenProfileSettings ? (
            <button
              type="button"
              onClick={onOpenProfileSettings}
              className="shrink-0 rounded bg-brand-1 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-2"
            >
              Ativar plano
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const hasNegativeProjection = forecast !== null && forecast.adjustedProjectedBalance < 0;
  const hasPendingBills = forecast !== null && forecast.billsPendingCount > 0;
  const severityLevel: OperationalSeverity = hasNegativeProjection
    ? "risco"
    : hasPendingBills
      ? "atencao"
      : "normal";
  const cardToneClass =
    severityLevel === "risco"
      ? "border-red-300"
      : severityLevel === "atencao"
        ? "border-amber-300"
        : "border-brand-1";

  // Active state
  return (
    <div className={`rounded border bg-cf-surface p-4 ${cardToneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-cf-text-primary">Projeção de saldo</h3>
          <p className="mt-1 text-xs text-cf-text-secondary">
            Saldo estimado até o fim do mês com lançamentos e pendências atuais.
          </p>
        </div>
        <OperationalSeverityBadge severity={severityLevel} />
        <button
          type="button"
          onClick={handleRecompute}
          disabled={isRecomputing}
          className="shrink-0 rounded border border-cf-border bg-cf-surface px-2.5 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRecomputing ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {hasLoadError ? (
        <div className="mt-3">
          <OperationalStateBlock
            severity="risco"
            title="Fallback da projeção em uso"
            happened="Parte dos dados da projeção não carregou nesta tentativa."
            impact="A leitura principal continua, mas pode estar incompleta para decisões de fechamento."
            nextStep={
              hasRetriedLoad
                ? "Recarregue a página em instantes para tentar uma nova sincronização."
                : "Recarregue a projeção para tentar recuperar os dados faltantes agora."
            }
            ctaLabel={hasRetriedLoad ? "Nova tentativa indisponível" : "Recarregar projeção"}
            onCta={handleRetryLoad}
            ctaDisabled={hasRetriedLoad}
            ctaDisabledLabel={hasRetriedLoad ? "Limite de 1 nova tentativa atingido." : undefined}
          />
        </div>
      ) : error ? (
        <div className="mt-3">
          <OperationalStateBlock
            severity="atencao"
            title="Atualização manual não concluída"
            happened={error}
            impact="A projeção continua visível, mas sem o recálculo solicitado agora."
            nextStep="Tente novamente em alguns segundos para atualizar o cenário do mês."
            ctaLabel="Atualizar projeção"
            onCta={() => {
              void handleRecompute();
            }}
          />
        </div>
      ) : forecast !== null ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
              <p className="text-xs font-medium uppercase text-cf-text-secondary">Projeção ajustada</p>
              <p
                className={`mt-1 text-lg font-bold ${
                  forecast.adjustedProjectedBalance < 0 ? "text-red-600" : "text-cf-text-primary"
                }`}
              >
                {money(forecast.adjustedProjectedBalance)}
              </p>
              {forecast.incomeExpected !== null ? (
                <p className="mt-0.5 text-xs text-cf-text-secondary">
                  Salário esperado: {money(forecast.incomeExpected)}
                </p>
              ) : null}
              {forecast.billsPendingCount > 0 ? (
                <p className="mt-0.5 text-xs text-amber-600">
                  {forecast.billsPendingCount}{" "}
                  {forecast.billsPendingCount === 1 ? "pendência incluída" : "pendências incluídas"}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-cf-text-secondary">Sem pendências este mês</p>
              )}
            </div>

            <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
              <p className="text-xs font-medium uppercase text-cf-text-secondary">Gasto até agora</p>
              <p className="mt-1 text-base font-semibold text-cf-text-primary">
                {money(forecast.spendingToDate)}
              </p>
              <p className="mt-0.5 text-xs text-cf-text-secondary">
                Media diaria: {money(forecast.dailyAvgSpending)}/dia
              </p>
            </div>

            <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
              <p className="text-xs font-medium uppercase text-cf-text-secondary">Dias restantes</p>
              <p className="mt-1 text-base font-semibold text-cf-text-primary">
                {forecast.daysRemaining}
              </p>
              <p className="mt-0.5 text-xs text-cf-text-secondary">mês {forecast.month}</p>
            </div>

            <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
              <p className="text-xs font-medium uppercase text-cf-text-secondary">Pendências do mês</p>
              <p
                className={`mt-1 text-base font-semibold ${
                  forecast.billsPendingCount > 0 ? "text-amber-600" : "text-cf-text-primary"
                }`}
              >
                {money(forecast.billsPendingTotal)}
              </p>
              <p className="mt-0.5 text-xs text-cf-text-secondary">
                {forecast.billsPendingCount > 0
                  ? `${forecast.billsPendingCount} ${forecast.billsPendingCount === 1 ? "conta" : "contas"} este mês`
                  : "Nenhuma pendência"}
              </p>
            </div>
          </div>

          {forecast.flipDetected && forecast.flipDirection ? (
            <FlipBanner direction={forecast.flipDirection} />
          ) : null}

          <BankLimitPanel forecast={forecast} money={money} />
        </>
      ) : (
        <div className="mt-3">
          <OperationalStateBlock
            severity="atencao"
            title="Projeção ainda indisponível"
            happened="Ainda não há dados suficientes para montar a projeção do mês."
            impact="Sem essa leitura, fica mais difícil antecipar risco de fechamento negativo."
            nextStep="Registre lançamentos e contas do mês para liberar o cálculo desta projeção."
          />
        </div>
      )}
    </div>
  );
};

export default ForecastCard;
