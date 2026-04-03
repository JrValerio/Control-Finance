import ForecastCard from "./ForecastCard";
import BankAccountsWidget from "./BankAccountsWidget";
import BillsSummaryWidget from "./BillsSummaryWidget";
import UtilityBillsWidget from "./UtilityBillsWidget";
import CreditCardsSummaryWidget from "./CreditCardsSummaryWidget";
import SalaryWidget from "./SalaryWidget";
import ConsignadoOverviewWidget from "./ConsignadoOverviewWidget";
import OperationalSummaryPanel from "./OperationalSummaryPanel";

interface OperationalWidgetsSectionProps {
  onOpenDueSoonBills: () => void;
  onOpenProfileSettings: () => void;
  onOpenBills: () => void;
  onOpenCreditCards: () => void;
  onOpenIncomeSources: () => void;
}

const OperationalWidgetsSection = ({
  onOpenDueSoonBills,
  onOpenProfileSettings,
  onOpenBills,
  onOpenCreditCards,
  onOpenIncomeSources,
}: OperationalWidgetsSectionProps): JSX.Element => (
  <>
    <section className="space-y-4" aria-labelledby="operational-overview-title">
      <div>
        <h3 id="operational-overview-title" className="text-sm font-medium text-cf-text-primary">
          Painel operacional
        </h3>
        <p className="mt-1 text-xs text-cf-text-secondary">
          O que pede ação agora: projeção, pendências, cartões, renda principal e sinais de risco.
        </p>
        <p className="mt-1 text-xs text-cf-text-secondary">
          Níveis operacionais padronizados: normal, atenção e risco.
        </p>
      </div>

      <OperationalSummaryPanel onOpenDueSoonBills={onOpenDueSoonBills} />

      <section className="space-y-3" aria-labelledby="critical-cards-title">
        <div className="flex items-center justify-between gap-2">
          <h4
            id="critical-cards-title"
            className="text-xs font-semibold uppercase tracking-wide text-cf-text-secondary"
          >
            Cards críticos
          </h4>
          <span className="text-xs text-cf-text-secondary">Prioridade de triagem</span>
        </div>

        <div className="flex flex-col gap-5">
          <ForecastCard onOpenProfileSettings={onOpenProfileSettings} />
          <BillsSummaryWidget onOpenBills={onOpenBills} />
          <CreditCardsSummaryWidget onOpenCreditCards={onOpenCreditCards} />
        </div>
      </section>

      <UtilityBillsWidget />
    </section>

    <section className="space-y-4" aria-labelledby="income-structure-title">
      <div>
        <h3 id="income-structure-title" className="text-sm font-medium text-cf-text-primary">
          Renda e estrutura
        </h3>
        <p className="mt-1 text-xs text-cf-text-secondary">
          Base do mês: benefício líquido, descontos estruturais e caixa em conta.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <BankAccountsWidget />
        <SalaryWidget />
        <ConsignadoOverviewWidget onOpenIncomeSources={onOpenIncomeSources} />
      </div>
    </section>
  </>
);

export default OperationalWidgetsSection;