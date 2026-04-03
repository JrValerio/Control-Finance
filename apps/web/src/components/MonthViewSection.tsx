import type { RefObject } from "react";
import type { MonthlySummary } from "../services/transactions.service";
import type { MonthOverMonthMetric, MonthOverMonthTone } from "./month-view.types";

interface MonthViewSectionProps {
  sectionRef: RefObject<HTMLElement>;
  selectedSummaryMonth: string;
  onSummaryMonthChange: (month: string) => void;
  summaryError: string;
  onRetrySummary: () => void | Promise<void>;
  isLoadingSummary: boolean;
  monthlySummary: MonthlySummary;
  momError: string;
  hasMonthlySummaryData: boolean;
  monthOverMonthMetrics: {
    balance: MonthOverMonthMetric;
    income: MonthOverMonthMetric;
    expense: MonthOverMonthMetric;
  };
  formatMonthOverMonthSummary: (metric: MonthOverMonthMetric) => string;
  momToneClassNames: Record<MonthOverMonthTone, string>;
  money: (value: number) => string;
}

const MonthViewSection = ({
  sectionRef,
  selectedSummaryMonth,
  onSummaryMonthChange,
  summaryError,
  onRetrySummary,
  isLoadingSummary,
  monthlySummary,
  momError,
  hasMonthlySummaryData,
  monthOverMonthMetrics,
  formatMonthOverMonthSummary,
  momToneClassNames,
  money,
}: MonthViewSectionProps): JSX.Element => (
  <section ref={sectionRef}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-medium text-cf-text-primary">Visão do mês</h3>
        <p className="mt-1 text-xs text-cf-text-secondary">
          Saldo, entradas e saídas de movimentações realizadas (sem pendências ou projeções).
        </p>
      </div>
      <input
        type="month"
        aria-label="Mês do resumo"
        value={selectedSummaryMonth}
        onChange={(event) => onSummaryMonthChange(event.target.value)}
        className="rounded border border-cf-border bg-cf-surface px-2 py-1 text-sm text-cf-text-primary"
      />
    </div>
    {summaryError ? (
      <div
        className="mb-3 flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        role="alert"
        aria-live="assertive"
      >
        <span>{summaryError}</span>
        <button
          type="button"
          onClick={() => void onRetrySummary()}
          className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
        >
          Tentar novamente
        </button>
      </div>
    ) : null}
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded border border-brand-1 bg-cf-bg-subtle px-4 py-3.5">
        <p className="text-xs font-medium uppercase text-cf-text-secondary">Saldo</p>
        <p className="text-xl font-semibold text-cf-text-primary">
          {isLoadingSummary ? "Carregando..." : money(monthlySummary.balance)}
        </p>
        <p
          className={`mt-1 text-xs font-medium ${
            isLoadingSummary || summaryError || momError
              ? momToneClassNames.neutral
              : momToneClassNames[monthOverMonthMetrics.balance.tone]
          }`}
          data-testid="mom-balance"
        >
          {isLoadingSummary
            ? "Vs. mês anterior: calculando..."
            : summaryError || momError
              ? "Vs. mês anterior: indisponível"
              : formatMonthOverMonthSummary(monthOverMonthMetrics.balance)}
        </p>
      </div>
      <div className="rounded border border-brand-1 bg-cf-bg-subtle px-4 py-3.5">
        <p className="text-xs font-medium uppercase text-cf-text-secondary">Entradas</p>
        <p className="text-xl font-semibold text-cf-text-primary">
          {isLoadingSummary ? "Carregando..." : money(monthlySummary.income)}
        </p>
        <p
          className={`mt-1 text-xs font-medium ${
            isLoadingSummary || summaryError || momError
              ? momToneClassNames.neutral
              : momToneClassNames[monthOverMonthMetrics.income.tone]
          }`}
          data-testid="mom-income"
        >
          {isLoadingSummary
            ? "Vs. mês anterior: calculando..."
            : summaryError || momError
              ? "Vs. mês anterior: indisponível"
              : formatMonthOverMonthSummary(monthOverMonthMetrics.income)}
        </p>
      </div>
      <div className="rounded border border-brand-1 bg-cf-bg-subtle px-4 py-3.5">
        <p className="text-xs font-medium uppercase text-cf-text-secondary">Saídas</p>
        <p className="text-xl font-semibold text-cf-text-primary">
          {isLoadingSummary ? "Carregando..." : money(monthlySummary.expense)}
        </p>
        <p
          className={`mt-1 text-xs font-medium ${
            isLoadingSummary || summaryError || momError
              ? momToneClassNames.neutral
              : momToneClassNames[monthOverMonthMetrics.expense.tone]
          }`}
          data-testid="mom-expense"
        >
          {isLoadingSummary
            ? "Vs. mês anterior: calculando..."
            : summaryError || momError
              ? "Vs. mês anterior: indisponível"
              : formatMonthOverMonthSummary(monthOverMonthMetrics.expense)}
        </p>
      </div>
    </div>
    {!isLoadingSummary && !summaryError && momError ? (
      <div className="mt-2 rounded border border-cf-border bg-cf-surface px-3 py-2 text-sm text-cf-text-secondary">
        {momError}
      </div>
    ) : null}
    {!isLoadingSummary && !summaryError && !hasMonthlySummaryData ? (
      <div className="mt-2 rounded border border-cf-border bg-cf-surface px-3 py-2 text-sm text-cf-text-secondary">
        Sem dados para o mês selecionado.
      </div>
    ) : null}
  </section>
);

export default MonthViewSection;
