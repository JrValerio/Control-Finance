import { useEffect, useMemo, useState } from "react";
import { useMaskedCurrency } from "../context/DiscreetModeContext";
import { creditCardsService, type CreditCardItem } from "../services/credit-cards.service";

interface CreditCardsSummaryWidgetProps {
  onOpenCreditCards?: () => void;
}

interface CreditCardsAggregate {
  cardsCount: number;
  availableTotal: number;
  openPurchasesTotal: number;
  pendingInvoicesTotal: number;
  pendingInvoicesCount: number;
}

const buildAggregate = (items: CreditCardItem[]): CreditCardsAggregate =>
  items.reduce<CreditCardsAggregate>(
    (aggregate, card) => ({
      cardsCount: aggregate.cardsCount + 1,
      availableTotal: aggregate.availableTotal + card.usage.available,
      openPurchasesTotal: aggregate.openPurchasesTotal + card.openPurchasesTotal,
      pendingInvoicesTotal: aggregate.pendingInvoicesTotal + card.pendingInvoicesTotal,
      pendingInvoicesCount: aggregate.pendingInvoicesCount + card.pendingInvoicesCount,
    }),
    {
      cardsCount: 0,
      availableTotal: 0,
      openPurchasesTotal: 0,
      pendingInvoicesTotal: 0,
      pendingInvoicesCount: 0,
    },
  );

const CreditCardsSummaryWidget = ({
  onOpenCreditCards,
}: CreditCardsSummaryWidgetProps): JSX.Element | null => {
  const [cards, setCards] = useState<CreditCardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const money = useMaskedCurrency();

  useEffect(() => {
    creditCardsService
      .list()
      .then((result) => {
        setCards(result.items);
        setHasError(false);
      })
      .catch(() => {
        setCards([]);
        setHasError(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const aggregate = useMemo(() => buildAggregate(cards), [cards]);

  if (isLoading) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <p className="text-xs text-cf-text-secondary">Carregando cartões...</p>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-cf-text-primary">Cartões</h3>
          {onOpenCreditCards ? (
            <button
              type="button"
              onClick={onOpenCreditCards}
              className="text-xs text-brand-1 hover:underline"
            >
              Ver cartões →
            </button>
          ) : null}
        </div>
        <p className="text-sm text-cf-text-secondary">
          Não foi possível carregar o resumo de cartões agora.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-cf-border bg-cf-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-cf-text-primary">Cartões</h3>
          <p className="text-xs text-cf-text-secondary">
            {aggregate.cardsCount === 0
              ? "Nenhum cartão cadastrado ainda."
              : aggregate.cardsCount === 1
                ? "1 cartão ativo"
                : `${aggregate.cardsCount} cartões ativos`}
          </p>
        </div>
        {onOpenCreditCards ? (
          <button
            type="button"
            onClick={onOpenCreditCards}
            className="text-xs text-brand-1 hover:underline"
          >
            Ver cartões →
          </button>
        ) : null}
      </div>

      {aggregate.cardsCount === 0 ? (
        <div className="rounded border border-dashed border-cf-border bg-cf-bg-subtle px-3 py-3 text-sm text-cf-text-secondary">
          Cadastre um cartão para acompanhar limite disponível, compras abertas e faturas pendentes.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
            <p className="text-xs font-medium uppercase text-cf-text-secondary">Disponível</p>
            <p className="text-sm font-semibold text-cf-text-primary">
              {money(aggregate.availableTotal)}
            </p>
            <p className="text-xs text-cf-text-secondary">Soma dos limites livres</p>
          </div>

          <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
            <p className="text-xs font-medium uppercase text-cf-text-secondary">Compras abertas</p>
            <p className="text-sm font-semibold text-cf-text-primary">
              {money(aggregate.openPurchasesTotal)}
            </p>
            <p className="text-xs text-cf-text-secondary">Ainda não fechadas em fatura</p>
          </div>

          <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
            <p className="text-xs font-medium uppercase text-cf-text-secondary">Faturas pendentes</p>
            <p
              className={`text-sm font-semibold ${
                aggregate.pendingInvoicesCount > 0 ? "text-amber-700" : "text-cf-text-primary"
              }`}
            >
              {money(aggregate.pendingInvoicesTotal)}
            </p>
            <p
              className={`text-xs ${
                aggregate.pendingInvoicesCount > 0 ? "text-amber-700" : "text-cf-text-secondary"
              }`}
            >
              {aggregate.pendingInvoicesCount}{" "}
              {aggregate.pendingInvoicesCount === 1 ? "fatura" : "faturas"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditCardsSummaryWidget;
