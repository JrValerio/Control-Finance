export type OperationalSeverity = "normal" | "atencao" | "risco";

const SEVERITY_LABELS: Record<OperationalSeverity, string> = {
  normal: "Normal",
  atencao: "Atenção",
  risco: "Risco",
};

const BADGE_CLASSNAMES: Record<OperationalSeverity, string> = {
  normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
  atencao: "border-amber-200 bg-amber-50 text-amber-700",
  risco: "border-red-200 bg-red-50 text-red-700",
};

const PANEL_CLASSNAMES: Record<OperationalSeverity, string> = {
  normal: "border-cf-border bg-cf-surface text-cf-text-secondary",
  atencao: "border-amber-200 bg-amber-50/70 text-amber-800",
  risco: "border-red-200 bg-red-50/70 text-red-800",
};

const BUTTON_CLASSNAMES: Record<OperationalSeverity, string> = {
  normal: "border-cf-border text-cf-text-primary hover:bg-cf-bg-subtle",
  atencao: "border-amber-300 text-amber-700 hover:bg-amber-100",
  risco: "border-red-300 text-red-700 hover:bg-red-100",
};

interface OperationalSeverityBadgeProps {
  severity: OperationalSeverity;
}

export const OperationalSeverityBadge = ({ severity }: OperationalSeverityBadgeProps): JSX.Element => (
  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BADGE_CLASSNAMES[severity]}`}>
    {SEVERITY_LABELS[severity]}
  </span>
);

interface OperationalStateBlockProps {
  severity: OperationalSeverity;
  title: string;
  happened: string;
  impact: string;
  nextStep: string;
  ctaLabel?: string;
  onCta?: () => void;
  ctaDisabled?: boolean;
  ctaDisabledLabel?: string;
  allowNormalCta?: boolean;
}

export const OperationalStateBlock = ({
  severity,
  title,
  happened,
  impact,
  nextStep,
  ctaLabel,
  onCta,
  ctaDisabled = false,
  ctaDisabledLabel,
  allowNormalCta = false,
}: OperationalStateBlockProps): JSX.Element => {
  const canRenderCta =
    Boolean(ctaLabel && onCta) && (severity !== "normal" || allowNormalCta);

  return (
    <div
      className={`rounded border px-3 py-2.5 text-xs ${PANEL_CLASSNAMES[severity]}`}
      role={severity === "risco" ? "alert" : "status"}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <OperationalSeverityBadge severity={severity} />
        <p className="font-semibold">{title}</p>
      </div>
      <p>
        <span className="font-semibold">O que aconteceu:</span> {happened}
      </p>
      <p>
        <span className="font-semibold">Impacto:</span> {impact}
      </p>
      <p>
        <span className="font-semibold">Próximo passo:</span> {nextStep}
      </p>

      {canRenderCta ? (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onCta}
            disabled={ctaDisabled}
            className={`rounded border bg-white px-2 py-1 text-left text-xs font-semibold leading-tight whitespace-normal break-words disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_CLASSNAMES[severity]}`}
          >
            {ctaLabel}
          </button>
          {ctaDisabled && ctaDisabledLabel ? <span className="text-[11px]">{ctaDisabledLabel}</span> : null}
        </div>
      ) : null}
    </div>
  );
};
