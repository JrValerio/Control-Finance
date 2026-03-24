import PropTypes from "prop-types";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "../utils/formatCurrency";

const PALETTE = [
  "#6741D9",
  "#5B37BD",
  "#7C5CE0",
  "#4D2FA5",
  "#9177E7",
  "#A692EE",
  "#B0A0F0",
  "#C4B5F9",
];

const TreeCell = ({ x, y, width, height, name, colorIndex, value, total }) => {
  const color = PALETTE[(colorIndex ?? 0) % PALETTE.length];
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
  const showLabel = width > 55 && height > 28;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        stroke="#0f172a"
        strokeWidth={2}
        rx={3}
      />
      {showLabel ? (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 7}
            textAnchor="middle"
            fill="#fff"
            fontSize={11}
            fontWeight={600}
          >
            {name.length > 13 ? `${name.slice(0, 12)}…` : name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 9}
            textAnchor="middle"
            fill="rgba(255,255,255,0.75)"
            fontSize={10}
          >
            {pct}%
          </text>
        </>
      ) : null}
    </g>
  );
};

TreeCell.propTypes = {
  x: PropTypes.number,
  y: PropTypes.number,
  width: PropTypes.number,
  height: PropTypes.number,
  name: PropTypes.string,
  colorIndex: PropTypes.number,
  value: PropTypes.number,
  total: PropTypes.number,
};

TreeCell.defaultProps = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  name: "",
  colorIndex: 0,
  value: 0,
  total: 0,
};

const CustomTooltip = ({ active, payload, total }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const item = payload[0];
  const value = Number(item.value || 0);
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="rounded border border-cf-border bg-cf-surface px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-cf-text-primary">{item.name}</p>
      <p className="text-cf-text-secondary">
        {formatCurrency(value)} · {pct}%
      </p>
    </div>
  );
};

CustomTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.number, name: PropTypes.string })),
  total: PropTypes.number,
};

CustomTooltip.defaultProps = {
  active: false,
  payload: [],
  total: 0,
};

const CategoryTreemap = ({ data }) => {
  const totalExpense = data.reduce((sum, item) => sum + item.expense, 0);

  if (data.length === 0 || totalExpense === 0) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4 text-center text-sm text-cf-text-secondary">
        Sem gastos por categoria neste período.
      </div>
    );
  }

  const treemapData = data.map((item, colorIndex) => ({
    name: item.categoryName,
    size: item.expense,
    colorIndex,
    total: totalExpense,
  }));

  return (
    <div className="rounded border border-cf-border bg-cf-surface p-3">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-cf-text-secondary">
        Despesas por categoria
      </h4>
      <div className="h-52 w-full">
        <ResponsiveContainer>
          <Treemap data={treemapData} dataKey="size" content={<TreeCell total={totalExpense} />}>
            <Tooltip content={<CustomTooltip total={totalExpense} />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

CategoryTreemap.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      categoryId: PropTypes.number,
      categoryName: PropTypes.string.isRequired,
      expense: PropTypes.number.isRequired,
    }),
  ).isRequired,
};

export default CategoryTreemap;
