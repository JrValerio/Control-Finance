import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trackPaywallEvent, type PaywallFeature, type PaywallContext } from "../utils/analytics";

interface UpgradeModalProps {
  isOpen: boolean;
  reason: string;
  feature?: PaywallFeature;
  context?: PaywallContext;
  onClose: () => void;
}

const PRICE_MONTHLY = "R$ 9,90";

const FEATURES: { label: string; free: string; pro: string }[] = [
  { label: "Transações e categorias", free: "✓", pro: "✓" },
  { label: "Metas mensais",           free: "✓", pro: "✓" },
  { label: "Histórico de analytics",  free: "6 meses", pro: "24 meses" },
  { label: "Previsão financeira",     free: "—", pro: "✓" },
  { label: "Controle salarial",       free: "—", pro: "✓" },
  { label: "Exportar CSV",            free: "—", pro: "✓" },
  { label: "Importar CSV",            free: "—", pro: "✓" },
];

const BENEFITS = [
  "Saiba quanto vai ter no saldo no fim do mês",
  "Entenda exatamente para onde seu dinheiro está indo",
  "Planeje seu salário com cálculo real de INSS e IRRF",
  "Exporte e importe transações com facilidade",
];

const UpgradeModal = ({
  isOpen,
  reason,
  feature = "unknown",
  context = "feature_gate",
  onClose,
}: UpgradeModalProps) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return;

    trackPaywallEvent({ feature, action: "viewed", context });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, feature, context, onClose]);

  if (!isOpen) return null;

  const isTrialExpired = reason.toLowerCase().includes("teste encerrado");
  const title = isTrialExpired
    ? "Seu período de teste encerrou"
    : "Desbloqueie o Control Finance Pro";
  const subtitle = isTrialExpired
    ? "Continue com acesso total por menos de R$ 0,33 por dia."
    : reason;
  const ctaLabel = isTrialExpired ? "Reativar acesso Pro" : "Começar meu plano Pro";
  const dismissLabel = isTrialExpired ? "Agora não" : "Continuar no plano gratuito";

  const handleUpgrade = () => {
    trackPaywallEvent({ feature, action: "clicked_upgrade", context });
    onClose();
    navigate("/app/settings/billing");
  };

  const handleDismiss = () => {
    trackPaywallEvent({ feature, action: "dismissed", context });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        className="w-full max-w-lg rounded-lg bg-cf-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h3
          id="upgrade-modal-title"
          className="text-xl font-semibold text-cf-text-primary"
        >
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-1 text-sm text-cf-text-secondary">{subtitle}</p>
        ) : null}

        {/* Price anchor */}
        <div className="mt-5">
          <span className="inline-block rounded bg-brand-1 px-2 py-0.5 text-xs font-medium text-white">
            Mais escolhido
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-4xl font-bold text-cf-text-primary">
              {PRICE_MONTHLY}
            </span>
            <span className="text-sm text-cf-text-secondary">/mês</span>
          </div>
          <p className="mt-0.5 text-xs text-cf-text-secondary">≈ R$ 0,33 por dia — menos que um café</p>
        </div>

        {/* Benefits */}
        <ul className="mt-3 space-y-1.5">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-sm text-cf-text-secondary">
              <span className="mt-0.5 text-brand-1 shrink-0">✓</span>
              {benefit}
            </li>
          ))}
        </ul>

        {/* Feature comparison */}
        <div className="mt-5 overflow-hidden rounded border border-cf-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cf-bg-subtle">
                <th className="px-3 py-2 text-left font-medium text-cf-text-primary">Recurso</th>
                <th className="px-3 py-2 text-center font-medium text-cf-text-secondary">Gratuito</th>
                <th className="bg-brand-1/5 px-3 py-2 text-center font-semibold text-brand-1">Pro</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((feature, index) => (
                <tr key={feature.label} className={index % 2 === 0 ? "" : "bg-cf-bg-subtle"}>
                  <td className="border-t border-cf-border px-3 py-2 text-cf-text-primary">
                    {feature.label}
                  </td>
                  <td className="border-t border-cf-border px-3 py-2 text-center text-cf-text-secondary">
                    {feature.free}
                  </td>
                  <td className="border-t border-cf-border bg-brand-1/5 px-3 py-2 text-center font-medium text-cf-text-primary">
                    {feature.pro}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* CTA */}
        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleUpgrade}
            className="w-full rounded bg-brand-1 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-2"
          >
            {ctaLabel}
          </button>
          <p className="text-center text-xs text-cf-text-secondary">
            Cancele quando quiser. Sem fidelidade.
          </p>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-center text-xs text-cf-text-secondary hover:text-cf-text-primary"
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
