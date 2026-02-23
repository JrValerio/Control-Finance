import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface UpgradeModalProps {
  isOpen: boolean;
  reason: string;
  onClose: () => void;
}

const FEATURES = [
  { label: "Controle de metas", free: "✓", pro: "✓" },
  { label: "Analytics (histórico)", free: "6 meses", pro: "24 meses" },
  { label: "Exportar CSV", free: "—", pro: "✓" },
  { label: "Importar CSV", free: "—", pro: "✓" },
];

const UpgradeModal = ({ isOpen, reason, onClose }: UpgradeModalProps) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isTrialExpired = reason.toLowerCase().includes("teste encerrado");
  const title = isTrialExpired ? "Seu período de teste encerrou" : "Recurso disponível no plano Pro";

  const handleUpgrade = () => {
    onClose();
    navigate("/app/settings/billing");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-100 bg-opacity-50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        className="w-full max-w-md rounded bg-cf-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="upgrade-modal-title" className="text-base font-semibold text-cf-text-primary">
          {title}
        </h3>

        {reason ? (
          <p className="mt-1 text-sm text-cf-text-secondary">{reason}</p>
        ) : null}

        <div className="mt-4 overflow-hidden rounded border border-cf-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cf-bg-subtle">
                <th className="px-3 py-2 text-left font-medium text-cf-text-primary">Recurso</th>
                <th className="px-3 py-2 text-center font-medium text-cf-text-secondary">Gratuito</th>
                <th className="px-3 py-2 text-center font-medium text-brand-1">Pro</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((feature, index) => (
                <tr key={feature.label} className={index % 2 === 0 ? "" : "bg-cf-bg-subtle"}>
                  <td className="border-t border-cf-border px-3 py-2 text-cf-text-primary">{feature.label}</td>
                  <td className="border-t border-cf-border px-3 py-2 text-center text-cf-text-secondary">{feature.free}</td>
                  <td className="border-t border-cf-border px-3 py-2 text-center font-medium text-cf-text-primary">{feature.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-cf-border px-3 py-1.5 text-sm font-semibold text-cf-text-secondary hover:bg-cf-bg-subtle"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleUpgrade}
            className="rounded bg-brand-1 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2"
          >
            Ativar plano Pro
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
