import { useEffect, useState } from "react";
import { forecastService } from "../services/forecast.service";
import { formatCurrency } from "../utils/formatCurrency";

const DISMISS_KEY = "cf.forecast_alert.dismissed_v1";

const FinancialAlertBanner = (): JSX.Element | null => {
  const [projectedBalance, setProjectedBalance] = useState<number | null>(null);
  const [month, setMonth] = useState<string>("");
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    void forecastService.getCurrent().then((forecast) => {
      if (forecast !== null) {
        setProjectedBalance(forecast.adjustedProjectedBalance);
        setMonth(forecast.month);
      }
    });
  }, []);

  if (dismissed || projectedBalance === null || projectedBalance >= 0) {
    return null;
  }

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore storage errors (private mode / quotas)
    }
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className="flex items-start justify-between rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-400"
    >
      <span>
        Atenção: a projeção de saldo para {month} está em{" "}
        <strong>{formatCurrency(projectedBalance)}</strong>. Revise seus gastos para evitar saldo
        negativo.
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        className="ml-4 shrink-0 opacity-60 hover:opacity-100"
        aria-label="Fechar alerta"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
};

export default FinancialAlertBanner;
