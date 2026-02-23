import { useCallback, useEffect, useState } from "react";
import { forecastService, type Forecast } from "../services/forecast.service";
import { profileService } from "../services/profile.service";
import { formatCurrency } from "../utils/formatCurrency";

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
        Atencao: a projecao cruzou para negativo desde o ultimo calculo.
      </div>
    );
  }
  return (
    <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
      Otimo: a projecao voltou ao positivo desde o ultimo calculo.
    </div>
  );
};

const ForecastCard = ({
  onOpenProfileSettings,
  trialExpired = false,
  txCountSinceFreeze = 0,
}: ForecastCardProps): JSX.Element => {
  const [cardState, setCardState] = useState<CardState>("loading");
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [error, setError] = useState("");

  const loadForecast = useCallback(async () => {
    try {
      setError("");
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

      const current = await forecastService.getCurrent();

      if (current !== null) {
        setForecast(current);
        persistForecast(current);
        setCardState("active");
        return;
      }

      // No forecast yet - trigger initial compute
      const computed = await forecastService.recompute();
      setForecast(computed);
      persistForecast(computed);
      setCardState("active");
    } catch {
      setError("Nao foi possivel carregar a projecao.");
      setCardState("active");
    }
  }, [trialExpired]);

  useEffect(() => {
    void loadForecast();
  }, [loadForecast]);

  const handleRecompute = useCallback(async () => {
    if (isRecomputing) return;
    setIsRecomputing(true);
    setError("");
    try {
      const updated = await forecastService.recompute();
      setForecast(updated);
      persistForecast(updated);
    } catch {
      setError("Erro ao atualizar projecao.");
    } finally {
      setIsRecomputing(false);
    }
  }, [isRecomputing]);

  if (cardState === "loading") {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <p className="text-xs text-cf-text-secondary">Carregando projecao...</p>
      </div>
    );
  }

  if (cardState === "awaiting-profile") {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-cf-text-primary">Projecao de saldo</h3>
            <p className="mt-1 text-xs text-cf-text-secondary">
              Configure seu salario e dia de pagamento para ver sua projecao de saldo ao fim do mes.
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
              <h3 className="text-sm font-semibold text-cf-text-primary">Projecao de saldo</h3>
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                Congelado
              </span>
            </div>
            {forecast ? (
              <>
                <p className="mt-2 text-2xl font-bold text-cf-text-primary">
                  {formatCurrency(forecast.projectedBalance)}
                </p>
                <p className="mt-1 text-xs text-cf-text-secondary">
                  Projecao do mes {forecast.month} - congelada no fim do periodo de teste.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-cf-text-secondary">
                Sua ultima projecao esta congelada no plano free. Assine para continuar atualizando.
              </p>
            )}
            {txCountSinceFreeze > 0 ? (
              <p className="mt-1 text-xs text-cf-text-secondary">
                {txCountSinceFreeze}{" "}
                {txCountSinceFreeze === 1 ? "transacao registrada" : "transacoes registradas"} desde
                entao.
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

  // Active state
  return (
    <div className="rounded border border-brand-1 bg-cf-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-cf-text-primary">Projecao de saldo</h3>
        <button
          type="button"
          onClick={handleRecompute}
          disabled={isRecomputing}
          className="shrink-0 rounded border border-cf-border bg-cf-surface px-2.5 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRecomputing ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {error ? (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      ) : forecast !== null ? (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
              <p className="text-xs font-medium uppercase text-cf-text-secondary">Projecao ajustada</p>
              <p
                className={`mt-1 text-lg font-bold ${
                  forecast.adjustedProjectedBalance < 0 ? "text-red-600" : "text-cf-text-primary"
                }`}
              >
                {formatCurrency(forecast.adjustedProjectedBalance)}
              </p>
              {forecast.incomeExpected !== null ? (
                <p className="mt-0.5 text-xs text-cf-text-secondary">
                  Salario esperado: {formatCurrency(forecast.incomeExpected)}
                </p>
              ) : null}
              {forecast.billsPendingCount > 0 ? (
                <p className="mt-0.5 text-xs text-amber-600">
                  {forecast.billsPendingCount}{" "}
                  {forecast.billsPendingCount === 1 ? "pendencia incluida" : "pendencias incluidas"}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-cf-text-secondary">Sem pendencias este mes</p>
              )}
            </div>

            <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
              <p className="text-xs font-medium uppercase text-cf-text-secondary">Gasto ate agora</p>
              <p className="mt-1 text-base font-semibold text-cf-text-primary">
                {formatCurrency(forecast.spendingToDate)}
              </p>
              <p className="mt-0.5 text-xs text-cf-text-secondary">
                Media diaria: {formatCurrency(forecast.dailyAvgSpending)}/dia
              </p>
            </div>

            <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
              <p className="text-xs font-medium uppercase text-cf-text-secondary">Dias restantes</p>
              <p className="mt-1 text-base font-semibold text-cf-text-primary">
                {forecast.daysRemaining}
              </p>
              <p className="mt-0.5 text-xs text-cf-text-secondary">mes {forecast.month}</p>
            </div>

            <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
              <p className="text-xs font-medium uppercase text-cf-text-secondary">Pendencias do mes</p>
              <p
                className={`mt-1 text-base font-semibold ${
                  forecast.billsPendingCount > 0 ? "text-amber-600" : "text-cf-text-primary"
                }`}
              >
                {formatCurrency(forecast.billsPendingTotal)}
              </p>
              <p className="mt-0.5 text-xs text-cf-text-secondary">
                {forecast.billsPendingCount > 0
                  ? `${forecast.billsPendingCount} ${forecast.billsPendingCount === 1 ? "conta" : "contas"} este mes`
                  : "Nenhuma pendencia"}
              </p>
            </div>
          </div>

          {forecast.flipDetected && forecast.flipDirection ? (
            <FlipBanner direction={forecast.flipDirection} />
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export default ForecastCard;
