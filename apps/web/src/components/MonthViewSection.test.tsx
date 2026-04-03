import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MonthViewSection from "./MonthViewSection";

const buildProps = () => ({
  sectionRef: { current: null },
  selectedSummaryMonth: "2026-04",
  onSummaryMonthChange: vi.fn(),
  summaryError: "",
  onRetrySummary: vi.fn(),
  isLoadingSummary: false,
  monthlySummary: {
    month: "2026-04",
    income: 1200,
    expense: 600,
    balance: 600,
    byCategory: [],
  },
  momError: "",
  hasMonthlySummaryData: true,
  monthOverMonthMetrics: {
    balance: { delta: 50, deltaPercent: 9.1, direction: "up" as const, tone: "good" as const },
    income: { delta: 100, deltaPercent: 11.2, direction: "up" as const, tone: "good" as const },
    expense: { delta: -80, deltaPercent: -7.5, direction: "down" as const, tone: "good" as const },
  },
  formatMonthOverMonthSummary: () => "Vs. mês anterior: subiu 10,0% (+R$ 50,00)",
  momToneClassNames: {
    good: "text-green-200",
    bad: "text-red-200",
    neutral: "text-ui-200",
  },
  money: (value: number) => `R$ ${value.toFixed(2)}`,
});

describe("MonthViewSection", () => {
  it("renderiza resumo mensal com labels e valores", () => {
    render(<MonthViewSection {...buildProps()} />);

    expect(screen.getByText("Visão do mês")).toBeInTheDocument();
    expect(screen.getByText("Saldo")).toBeInTheDocument();
    expect(screen.getByText("Entradas")).toBeInTheDocument();
    expect(screen.getByText("Saídas")).toBeInTheDocument();
    expect(screen.getByLabelText("Mês do resumo")).toHaveValue("2026-04");
  });

  it("dispara mudança de mês", () => {
    const props = buildProps();
    render(<MonthViewSection {...props} />);

    fireEvent.change(screen.getByLabelText("Mês do resumo"), {
      target: { value: "2026-05" },
    });

    expect(props.onSummaryMonthChange).toHaveBeenCalledWith("2026-05");
  });

  it("exibe erro e permite retry", () => {
    const props = buildProps();
    props.summaryError = "Falha ao carregar resumo";
    render(<MonthViewSection {...props} />);

    expect(screen.getByText("Falha ao carregar resumo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(props.onRetrySummary).toHaveBeenCalledTimes(1);
  });
});
