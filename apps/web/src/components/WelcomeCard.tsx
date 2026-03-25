import { useEffect, useRef } from "react";
import { trackActivationEvent } from "../utils/analytics";

interface WelcomeCardProps {
  onAddTransaction: () => void;
  onOpenProfileSettings?: () => void;
}

const WelcomeCard = ({ onAddTransaction, onOpenProfileSettings }: WelcomeCardProps) => {
  const tracked = useRef(false);
  useEffect(() => {
    // "cf_activation_welcome_viewed_v1": sessionStorage key that prevents re-firing on reload.
    // Bump the version suffix (v2, v3…) whenever the WelcomeCard logic changes in a way
    // that requires re-showing the card to users who have already seen it.
    if (!tracked.current && !sessionStorage.getItem("cf_activation_welcome_viewed_v2")) {
      tracked.current = true;
      sessionStorage.setItem("cf_activation_welcome_viewed_v2", "1");
      trackActivationEvent("welcome_card_viewed");
    }
  }, []);

  return (
    <section className="rounded border border-brand-1/40 bg-cf-surface p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-cf-text-primary">
            Comece a pilotar sua vida financeira
          </h2>
          <p className="mt-1 text-sm text-cf-text-secondary">
            Registre sua primeira transação e deixe o Especialista IA guiar você do extrato de hoje até as metas de amanhã.
          </p>

          <ol className="mt-4 space-y-2">
            <li className="flex items-start gap-2.5 text-sm text-cf-text-secondary">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-1 text-xs font-bold text-white">
                1
              </span>
              <span>
                <strong className="font-semibold text-cf-text-primary">Registre uma transação</strong>
                {" — "}uma entrada (salário, freelance) ou saída (conta, compra)
              </span>
            </li>
            <li className="flex items-start gap-2.5 text-sm text-cf-text-secondary">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-1/20 text-xs font-bold text-brand-1">
                2
              </span>
              <span>
                <strong className="font-semibold text-cf-text-primary">Configure seu perfil</strong>
                {" — "}salário e dia de pagamento para ativar a projeção de saldo do mês
              </span>
            </li>
            <li className="flex items-start gap-2.5 text-sm text-cf-text-secondary">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-1/20 text-xs font-bold text-brand-1">
                3
              </span>
              <span>
                <strong className="font-semibold text-cf-text-primary">Defina suas metas de poupança</strong>
                {" — "}viagem, casa, reserva de emergência — acompanhe o progresso mês a mês
              </span>
            </li>
            <li className="flex items-start gap-2.5 text-sm text-cf-text-secondary">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-1/20 text-xs font-bold text-brand-1">
                4
              </span>
              <span>
                <strong className="font-semibold text-cf-text-primary">Ouça o Especialista IA</strong>
                {" — "}análise automática do seu cenário com dicas personalizadas e alertas de risco
              </span>
            </li>
          </ol>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <button
            type="button"
            onClick={() => {
              trackActivationEvent("welcome_cta_clicked");
              onAddTransaction();
            }}
            className="rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2 whitespace-nowrap"
          >
            + Registrar primeira transação
          </button>
          {onOpenProfileSettings ? (
            <button
              type="button"
              onClick={onOpenProfileSettings}
              className="rounded border border-cf-border px-4 py-2 text-sm font-semibold text-cf-text-secondary hover:bg-cf-bg-subtle whitespace-nowrap"
            >
              Configurar perfil
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default WelcomeCard;
