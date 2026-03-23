import { useContext } from "react";
import PropTypes from "prop-types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ThemeContext } from "../context/theme-context";
import { formatCurrency } from "../utils/formatCurrency";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const value = Number(payload[0].value || 0);

  return (
    <div className="rounded border border-cf-border bg-cf-surface px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-cf-text-primary">{label}</p>
      <p className="text-cf-text-secondary">{formatCurrency(value)}</p>
    </div>
  );
};

CustomTooltip.propTypes = {
  active: PropTypes.bool,
  label: PropTypes.string,
  payload: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.number,
    }),
  ),
};

CustomTooltip.defaultProps = {
  active: false,
  label: "",
  payload: [],
};

const TransactionChart = ({ data }) => {
  const themeCtx = useContext(ThemeContext);
  const isDark = themeCtx?.theme === "dark";
  const axisStroke = isDark ? "#94A3B8" : "#495057";
  const gridStroke = isDark ? "#334155" : "#ADB5BD";

  const hasAnyValue = data.some((item) => item.total > 0);

  if (!hasAnyValue) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4 text-center text-sm text-cf-text-primary">
        Sem dados suficientes para exibir o gráfico no período selecionado.
      </div>
    );
  }

  return (
    <div className="rounded border border-cf-border bg-cf-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-cf-text-primary">
        Receita x Despesa no período
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="name" stroke={axisStroke} />
            <YAxis stroke={axisStroke} width={90} tickFormatter={formatCurrency} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="total" fill="#6741D9" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

TransactionChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      total: PropTypes.number.isRequired,
    }),
  ).isRequired,
};

export default TransactionChart;
