import { useContext } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "../services/analytics.service";
import { ThemeContext } from "../context/theme-context";
import { formatCurrency } from "../utils/formatCurrency";

const MONTH_NAMES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const formatMonthLabel = (value: string): string => {
  if (typeof value !== "string" || !value) return value;
  const [year, month] = value.split("-");
  const monthIndex = Number(month) - 1;
  if (!year || monthIndex < 0 || monthIndex > 11) return value;
  return `${MONTH_NAMES_PT[monthIndex]}/${year.slice(2)}`;
};

const formatDelta = (delta: number): string => {
  if (delta > 0) return `+${formatCurrency(delta)} ▲`;
  if (delta < 0) return `-${formatCurrency(Math.abs(delta))} ▼`;
  return "";
};

type PointDelta = { income: number; expense: number; balance: number };

// points must be sorted ascending by month (API contract); delta is undefined for the first point
const buildDeltaMap = (points: TrendPoint[]): Map<string, PointDelta> => {
  const map = new Map<string, PointDelta>();
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    map.set(curr.month, {
      income: curr.income - prev.income,
      expense: curr.expense - prev.expense,
      balance: curr.balance - prev.balance,
    });
  }
  return map;
};

interface TooltipEntry {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  deltaMap?: Map<string, PointDelta>;
}

const CustomTooltip = ({ active, payload, label, deltaMap }: CustomTooltipProps) => {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const deltas = label && deltaMap ? deltaMap.get(label) : undefined;

  return (
    <div className="rounded border border-cf-border bg-cf-surface px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-semibold text-cf-text-primary">{formatMonthLabel(String(label || ""))}</p>
      {payload.map((entry) => {
        const delta =
          deltas && entry.dataKey && entry.dataKey in deltas
            ? (deltas as Record<string, number>)[entry.dataKey]
            : undefined;
        return (
          <p key={entry.dataKey} style={{ color: entry.color }}>
            {entry.name}: {formatCurrency(Number(entry.value || 0))}
            {delta !== undefined && delta !== 0 && (
              <span className="ml-1 opacity-70">{formatDelta(delta)}</span>
            )}
          </p>
        );
      })}
    </div>
  );
};

interface ChartClickData {
  activeLabel?: string;
}

interface TrendChartProps {
  data: TrendPoint[];
  onMonthClick?: (month: string) => void;
  selectedMonth?: string;
}

const TrendChart = ({ data, onMonthClick, selectedMonth }: TrendChartProps) => {
  const themeCtx = useContext(ThemeContext);
  const isDark = themeCtx?.theme === "dark";
  const axisStroke = isDark ? "#94A3B8" : "#495057";
  const gridStroke = isDark ? "#334155" : "#ADB5BD";
  const legendColor = isDark ? "#F1F5F9" : "#212529";

  const hasAnyValue = data.some(
    (point) => point.income > 0 || point.expense > 0 || point.balance !== 0,
  );

  if (!hasAnyValue) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4 text-center text-sm text-cf-text-primary">
        Adicione transações para acompanhar sua evolução financeira mês a mês.
      </div>
    );
  }

  const deltaMap = buildDeltaMap(data);
  const isSelectedInRange = selectedMonth
    ? data.some((point) => point.month === selectedMonth)
    : false;

  return (
    <div className="rounded border border-cf-border bg-cf-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-cf-text-primary">
        Evolução (últimos 6 meses)
        {onMonthClick && (
          <span className="ml-2 text-xs font-normal text-cf-text-secondary">
            — clique em um mês para navegar
          </span>
        )}
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
          onClick={(chartData: ChartClickData) => {
            const month = chartData?.activeLabel;
            if (typeof month === "string" && month && onMonthClick) {
              onMonthClick(month);
            }
          }}
          className={onMonthClick ? "cursor-pointer" : undefined}
        >
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="month" stroke={axisStroke} tickFormatter={formatMonthLabel} />
            <YAxis stroke={axisStroke} width={90} tickFormatter={formatCurrency} />
            <Tooltip content={<CustomTooltip deltaMap={deltaMap} />} />
            <Legend wrapperStyle={{ color: legendColor }} />
            {isSelectedInRange && (
              <ReferenceLine
                x={selectedMonth}
                stroke="#6741D9"
                strokeDasharray="4 2"
                strokeWidth={2}
                label={{ value: formatMonthLabel(selectedMonth!), fill: "#6741D9", fontSize: 11 }}
              />
            )}
            <Line
              type="monotone"
              dataKey="income"
              name="Entradas"
              stroke="#16a34a"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="expense"
              name="Saídas"
              stroke="#dc2626"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="balance"
              name="Saldo"
              stroke="#6741D9"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrendChart;
