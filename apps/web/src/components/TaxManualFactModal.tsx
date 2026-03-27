import { useEffect, useState, type FormEvent, type MouseEvent } from "react";

interface TaxManualFactModalProps {
  isOpen: boolean;
  taxYear: number;
  isSubmitting?: boolean;
  errorMessage?: string;
  onClose: () => void;
  onSubmit: (payload: {
    taxYear: number;
    factType: string;
    subcategory: string;
    payerName: string;
    payerDocument: string;
    referencePeriod: string;
    amount: number;
    note: string;
  }) => Promise<void> | void;
}

const FACT_TYPE_OPTIONS = [
  { value: "taxable_income", label: "Rendimento tributável" },
  { value: "exempt_income", label: "Rendimento isento" },
  { value: "exclusive_tax_income", label: "Tributação exclusiva" },
  { value: "withheld_tax", label: "IR retido na fonte" },
  { value: "asset_balance", label: "Bens e direitos" },
  { value: "debt_balance", label: "Dívidas e ônus" },
  { value: "medical_deduction", label: "Dedução médica" },
  { value: "education_deduction", label: "Dedução de instrução" },
  { value: "other", label: "Outro fato fiscal" },
] as const;

const DEFAULT_FACT_TYPE = FACT_TYPE_OPTIONS[0].value;

const parseMoney = (value: string) => Number(value.replace(",", "."));

const TaxManualFactModal = ({
  isOpen,
  taxYear,
  isSubmitting = false,
  errorMessage = "",
  onClose,
  onSubmit,
}: TaxManualFactModalProps): JSX.Element | null => {
  const [factType, setFactType] = useState<string>(DEFAULT_FACT_TYPE);
  const [subcategory, setSubcategory] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerDocument, setPayerDocument] = useState("");
  const [referencePeriod, setReferencePeriod] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setFactType(DEFAULT_FACT_TYPE);
    setSubcategory("");
    setPayerName("");
    setPayerDocument("");
    setReferencePeriod("");
    setAmount("");
    setNote("");
    setLocalError("");
  }, [isOpen]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const parsedAmount = parseMoney(amount);

    if (!subcategory.trim()) {
      setLocalError("Informe a descrição do fato fiscal.");
      return;
    }

    if (!referencePeriod.trim()) {
      setLocalError("Informe o período de referência.");
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setLocalError("Informe um valor válido.");
      return;
    }

    setLocalError("");

    await onSubmit({
      taxYear,
      factType,
      subcategory: subcategory.trim(),
      payerName: payerName.trim(),
      payerDocument: payerDocument.trim(),
      referencePeriod: referencePeriod.trim(),
      amount: Number(parsedAmount.toFixed(2)),
      note: note.trim(),
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-black/50 p-4 sm:p-6"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="flex min-h-full items-center justify-center">
        <div className="flex w-full max-w-2xl max-h-[min(92vh,900px)] flex-col overflow-hidden rounded-lg border border-cf-border bg-cf-surface shadow-xl">
          <div className="flex items-start justify-between gap-4 border-b border-cf-border px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-cf-text-primary">Adicionar fato manual</h2>
              <p className="mt-1 text-sm text-cf-text-secondary">
                Exercício {taxYear}. Use quando a informação do IRPF ainda não entrou por documento
                ou sincronização.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-sm font-semibold text-cf-text-secondary hover:text-cf-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Fechar
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-3 text-sm text-cf-text-secondary">
                O fato entra como <span className="font-semibold text-cf-text-primary">pendente</span> na fila de revisão.
                Depois você aprova, corrige ou rejeita na própria Central do Leão.
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-cf-text-primary">
                    Tipo de fato fiscal
                  </span>
                  <select
                    value={factType}
                    onChange={(event) => setFactType(event.target.value)}
                    disabled={isSubmitting}
                    className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
                  >
                    {FACT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-cf-text-primary">
                    Período de referência
                  </span>
                  <input
                    type="text"
                    value={referencePeriod}
                    onChange={(event) => setReferencePeriod(event.target.value)}
                    disabled={isSubmitting}
                    placeholder="Ex.: 2025, 2025-12 ou 2025-12-31"
                    className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-cf-text-primary">
                  Descrição ou subcategoria fiscal
                </span>
                <input
                  type="text"
                  value={subcategory}
                  onChange={(event) => setSubcategory(event.target.value)}
                  disabled={isSubmitting}
                  placeholder="Ex.: aluguel recebido, plano de saúde, INSS complementar"
                  className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-cf-text-primary">
                    Fonte pagadora / origem
                  </span>
                  <input
                    type="text"
                    value={payerName}
                    onChange={(event) => setPayerName(event.target.value)}
                    disabled={isSubmitting}
                    placeholder="Ex.: INSS, Banco XYZ, ACME LTDA"
                    className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-cf-text-primary">
                    Documento da fonte (opcional)
                  </span>
                  <input
                    type="text"
                    value={payerDocument}
                    onChange={(event) => setPayerDocument(event.target.value)}
                    disabled={isSubmitting}
                    placeholder="CNPJ ou CPF da fonte"
                    className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-cf-text-primary">Valor</span>
                <input
                  type="text"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={isSubmitting}
                  placeholder="0,00"
                  className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-cf-text-primary">
                  Observação (opcional)
                </span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={isSubmitting}
                  rows={4}
                  placeholder="Contexto para a revisão fiscal deste fato."
                  className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
                />
              </label>

              {localError ? (
                <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                  {localError}
                </div>
              ) : null}

              {!localError && errorMessage ? (
                <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                  {errorMessage}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-cf-border px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded border border-cf-border bg-cf-bg-subtle px-4 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded border border-brand-1 bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Salvando..." : "Adicionar à revisão"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TaxManualFactModal;
