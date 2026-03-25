import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { forecastService, type Forecast } from "../services/forecast.service";
import { aiService, type AiInsight } from "../services/ai.service";
import AIInsightPanel from "./AIInsightPanel";
import { formatCurrency } from "../utils/formatCurrency";

interface TrajectoryPoint {
  day: string;
  balance: number;
}

export const generateTrajectory = (forecast: Forecast): TrajectoryPoint[] => {
  const { adjustedProjectedBalance, dailyAvgSpending, daysRemaining } = forecast;
  if (daysRemaining <= 0) return [];

  const startBalance = Number(
    (adjustedProjectedBalance + dailyAvgSpending * daysRemaining).toFixed(2),
  );

  const points: TrajectoryPoint[] = [{ day: "Hoje", balance: startBalance }];

  for (let i = 1; i <= daysRemaining; i++) {
    points.push({
      day: i === daysRemaining ? "Fim" : `+${i}`,
      balance: Number((startBalance - dailyAvgSpending * i).toFixed(2)),
    });
  }

  return points;
};

const gaugeColor = (balance: number, pct: number | null): string => {
  if (balance <= 0) return "#ef4444";
  if (pct !== null && pct < 15) return "#f59e0b";
  return "#22c55e";
};

interface GaugeProps {
  percentage: number;
  color: string;
}

const Gauge = ({ percentage, color }: GaugeProps) => {
  const clamped = Math.max(0, Math.min(100, percentage));
  return (
    <svg
      viewBox="0 0 100 55"
      role="img"
      aria-label="Gauge de saúde financeira"
      className="w-full max-w-[180px]"
    >
      <path
        d="M 10 50 A 40 40 0 0 1 90 50"
        fill="none"
        stroke="#334155"
        strokeWidth={10}
        strokeLinecap="round"
        pathLength={100}
      />
      <path
        d="M 10 50 A 40 40 0 0 1 90 50"
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${clamped} 100`}
      />
    </svg>
  );
};

const TrajectoryTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value: number; payload: TrajectoryPoint }[];
}) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded border border-cf-border bg-cf-surface px-2 py-1 text-xs shadow-sm">
      <p className="font-semibold text-cf-text-primary">{payload[0].payload.day}</p>
      <p className="text-cf-text-secondary">{formatCurrency(payload[0].value)}</p>
    </div>
  );
};

const HealthOverview = (): JSX.Element | null => {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [insight, setInsight] = useState<AiInsight | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(true);

  useEffect(() => {
    void forecastService.getCurrent().then(setForecast).catch(() => undefined);
  }, []);

  useEffect(() => {
    setIsLoadingInsight(true);
    void aiService
      .getInsight()
      .then(setInsight)
      .catch(() => setInsight(null))
      .finally(() => setIsLoadingInsight(false));
  }, []);

  if (forecast === null || forecast.daysRemaining <= 0) return null;

  const trajectory = generateTrajectory(forecast);
  const { adjustedProjectedBalance, incomeExpected } = forecast;
  const gaugePct =
    incomeExpected !== null && incomeExpected > 0
      ? (adjustedProjectedBalance / incomeExpected) * 100
      : null;
  const color = gaugeColor(adjustedProjectedBalance, gaugePct);
  const isAtRisk = adjustedProjectedBalance <= 0;

  const showInsightPanel = isLoadingInsight || insight !== null;

  return (
    <div className="rounded border border-cf-border bg-cf-surface p-4">
      <h3 className="mb-4 text-sm font-semibold text-cf-text-primary">Saúde Financeira do Mês</h3>
      <div className={`grid gap-4 ${showInsightPanel ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {/* D5 — Gauge */}
        <div className="flex flex-col items-center justify-center gap-2 rounded border border-cf-border bg-cf-bg-subtle p-4">
          <p className="text-xs font-medium uppercase text-cf-text-secondary">Dinheiro Livre</p>
          {gaugePct !== null ? <Gauge percentage={gaugePct} color={color} /> : null}
          <p className={`text-xl font-bold ${isAtRisk ? "text-red-600" : "text-cf-text-primary"}`}>
            {formatCurrency(adjustedProjectedBalance)}
          </p>
          <p className="text-center text-xs text-cf-text-secondary">
            {isAtRisk ? "Projeção negativa — revise seus gastos" : "projetado ao fim do mês"}
          </p>
        </div>

        {/* AI Insight */}
        {showInsightPanel && (
          <AIInsightPanel insight={insight} isLoading={isLoadingInsight} />
        )}

        {/* D4-lite — Trajectory */}
        <div className="rounded border border-cf-border bg-cf-bg-subtle p-4">
          <p className="mb-2 text-xs font-medium uppercase text-cf-text-secondary">
            Trajetória do Mês
          </p>
          {trajectory.length >= 2 ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trajectory} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="healthAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "#94A3B8" }}
                    interval="preserveStartEnd"
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<TrajectoryTooltip />} />
                  <ReferenceLine
                    y={0}
                    stroke="#ef4444"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke={color}
                    fill="url(#healthAreaGradient)"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-cf-text-secondary">Último dia do mês.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default HealthOverview;
