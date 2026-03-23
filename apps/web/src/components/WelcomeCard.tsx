import { trackActivationEvent } from "../utils/analytics";

interface WelcomeCardProps {
  onAddTransaction: () => void;
  onOpenProfileSettings?: () => void;
}

const WelcomeCard = ({ onAddTransaction, onOpenProfileSettings }: WelcomeCardProps) => {
  return (
    <section className="rounded border border-brand-1/40 bg-cf-surface p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-cf-text-primary">
            Comece a organizar sua vida financeira
          </h2>
          <p className="mt-1 text-sm text-cf-text-secondary">
            Registre sua primeira transação para visualizar seu saldo, gráficos e projeção de saldo ao fim do mês.
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
                <strong className="font-semibold text-cf-text-primary">Veja seu saldo em tempo real</strong>
                {" — "}entradas menos saídas calculadas automaticamente
              </span>
            </li>
            <li className="flex items-start gap-2.5 text-sm text-cf-text-secondary">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-1/20 text-xs font-bold text-brand-1">
                3
              </span>
              <span>
                <strong className="font-semibold text-cf-text-primary">Configure seu perfil</strong>
                {" — "}salário e dia de pagamento para ativar a projeção de saldo
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
