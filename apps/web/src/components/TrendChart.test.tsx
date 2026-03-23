import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TrendChart from "./TrendChart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({
    children,
    className,
    data,
    onClick,
  }: {
    children: React.ReactNode;
    className?: string;
    data?: Array<{ month?: string }>;
    onClick?: (payload: { activeLabel?: string }) => void;
  }) => (
    <button
      type="button"
      data-testid="line-chart"
      className={className}
      onClick={() => onClick?.({ activeLabel: data?.[1]?.month })}
    >
      {children}
    </button>
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Legend: () => <div data-testid="legend" />,
  Line: ({ name }: { name?: string }) => <div>{name}</div>,
  ReferenceLine: ({ x, label }: { x?: string; label?: { value?: string } }) => (
    <div data-testid="reference-line">{`${x || ""}|${label?.value || ""}`}</div>
  ),
  Tooltip: ({ content }: { content?: React.ReactElement }) => (
    <div data-testid="tooltip">
      {content
        ? React.cloneElement(content, {
            active: true,
            label: "2025-10",
            payload: [
              { dataKey: "income", name: "Entradas", value: 2000, color: "#16a34a" },
              { dataKey: "expense", name: "Saídas", value: 700, color: "#dc2626" },
            ],
          })
        : null}
    </div>
  ),
  XAxis: ({ tickFormatter }: { tickFormatter?: (value: string) => string }) => (
    <div data-testid="x-axis-label">{tickFormatter ? tickFormatter("2025-10") : "2025-10"}</div>
  ),
  YAxis: ({ tickFormatter }: { tickFormatter?: (value: number) => string }) => (
    <div data-testid="y-axis-label">{tickFormatter ? tickFormatter(1234.5) : "1234.5"}</div>
  ),
}));

const trendData = [
  { month: "2025-09", income: 1800, expense: 600, balance: 1200 },
  { month: "2025-10", income: 2000, expense: 700, balance: 1300 },
];

describe("TrendChart", () => {
  it("renders empty state when all values are zero", () => {
    render(
      <TrendChart
        data={[{ month: "2025-10", income: 0, expense: 0, balance: 0 }]}
      />,
    );

    expect(
      screen.getByText("Sem dados suficientes para exibir a evolução histórica."),
    ).toBeInTheDocument();
  });

  it("renders chart heading, month label formatting, and click hint", () => {
    render(<TrendChart data={trendData} onMonthClick={vi.fn()} />);

    expect(screen.getByText("Evolução (últimos 6 meses)")).toBeInTheDocument();
    expect(screen.getByText("— clique em um mês para navegar")).toBeInTheDocument();
    expect(screen.getByTestId("x-axis-label")).toHaveTextContent("Out/25");
  });

  it("calls onMonthClick when chart is clicked on a month", () => {
    const onMonthClick = vi.fn();

    render(<TrendChart data={trendData} onMonthClick={onMonthClick} />);
    fireEvent.click(screen.getByTestId("line-chart"));

    expect(onMonthClick).toHaveBeenCalledWith("2025-10");
  });

  it("shows selected month marker when selectedMonth is in data range", () => {
    render(<TrendChart data={trendData} selectedMonth="2025-10" />);

    expect(screen.getByTestId("reference-line")).toHaveTextContent("2025-10|Out/25");
  });

  it("shows absolute values and month-over-month deltas in tooltip", () => {
    render(<TrendChart data={trendData} />);

    expect(screen.getByText("Entradas: R$ 2.000,00")).toBeInTheDocument();
    expect(screen.getByText("+R$ 200,00", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Saídas: R$ 700,00")).toBeInTheDocument();
    expect(screen.getByText("+R$ 100,00", { exact: false })).toBeInTheDocument();
  });
});
