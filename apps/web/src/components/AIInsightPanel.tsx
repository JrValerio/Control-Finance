import type { AiInsight } from "../services/ai.service";

interface AIInsightPanelProps {
  insight: AiInsight | null;
  isLoading: boolean;
}

const typeStyles: Record<AiInsight["type"], string> = {
  warning: "border-amber-400/30 bg-amber-400/10 text-amber-600 dark:text-amber-400",
  info: "border-blue-400/30 bg-blue-400/10 text-blue-600 dark:text-blue-400",
  success: "border-green-400/30 bg-green-400/10 text-green-600 dark:text-green-400",
};

const typeIconLabel: Record<AiInsight["type"], string> = {
  warning: "⚠",
  info: "ℹ",
  success: "✓",
};

const AIInsightPanel = ({ insight, isLoading }: AIInsightPanelProps): JSX.Element | null => {
  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Carregando dica do especialista"
        className="rounded border border-cf-border bg-cf-bg-subtle p-4"
      >
        <div className="mb-3 h-3 w-28 animate-pulse rounded bg-cf-border" />
        <div className="space-y-2">
          <div className="h-2.5 w-full animate-pulse rounded bg-cf-border" />
          <div className="h-2.5 w-4/5 animate-pulse rounded bg-cf-border" />
          <div className="h-2.5 w-3/5 animate-pulse rounded bg-cf-border" />
        </div>
      </div>
    );
  }

  if (!insight) return null;

  const styleClass = typeStyles[insight.type];
  const icon = typeIconLabel[insight.type];

  return (
    <div className={`rounded border p-4 ${styleClass}`}>
      <p className="mb-2 text-xs font-medium uppercase opacity-70">
        {icon} {insight.title}
      </p>
      <p className="text-sm leading-relaxed">{insight.message}</p>
    </div>
  );
};

export default AIInsightPanel;
