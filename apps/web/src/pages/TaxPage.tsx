import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  taxService,
  type TaxFact,
  type TaxFactsListResult,
  type TaxObligation,
  type TaxSummary,
} from "../services/tax.service";
import { getApiErrorMessage } from "../utils/apiError";
import { formatCurrency } from "../utils/formatCurrency";

interface TaxPageProps {
  onBack?: () => void;
}

interface CorrectionDraft {
  factId: number;
  amount: string;
  subcategory: string;
  note: string;
}

const DEFAULT_FACTS_PAGE_SIZE = 25;

const EMPTY_SUMMARY: TaxSummary = {
  taxYear: 0,
  exerciseYear: 0,
  calendarYear: 0,
  status: "not_generated",
  snapshotVersion: null,
  mustDeclare: null,
  obligationReasons: [],
  annualTaxableIncome: 0,
  annualExemptIncome: 0,
  annualExclusiveIncome: 0,
  annualWithheldTax: 0,
  totalLegalDeductions: 0,
  simplifiedDiscountUsed: 0,
  bestMethod: null,
  estimatedAnnualTax: null,
  warnings: [],
  sourceCounts: {
    documents: 0,
    factsPending: 0,
    factsApproved: 0,
  },
  generatedAt: null,
};

const EMPTY_OBLIGATION: TaxObligation = {
  taxYear: 0,
  exerciseYear: 0,
  calendarYear: 0,
  mustDeclare: false,
  reasons: [],
  thresholds: {
    taxableIncome: 0,
    exemptAndExclusiveIncome: 0,
    assets: 0,
    ruralRevenue: 0,
  },
  totals: {
    annualTaxableIncome: 0,
    annualExemptIncome: 0,
    annualExclusiveIncome: 0,
    annualCombinedExemptAndExclusiveIncome: 0,
    totalAssetBalance: 0,
  },
  approvedFactsCount: 0,
};

const FACT_TYPE_LABELS: Record<string, string> = {
  taxable_income: "Rendimento tributável",
  exempt_income: "Rendimento isento",
  exclusive_tax_income: "Tributação exclusiva",
  withheld_tax: "IR retido na fonte",
  asset_balance: "Bens e direitos",
  debt_balance: "Dívidas e ônus",
  medical_deduction: "Dedução médica",
  education_deduction: "Dedução de instrução",
  other: "Outro fato fiscal",
};

const METHOD_LABELS: Record<string, string> = {
  legal_deductions: "Deduções legais",
  simplified_discount: "Desconto simplificado",
};

const resolveDefaultTaxYear = () => new Date().getFullYear();

const normalizeRouteTaxYear = (value: string | undefined) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 2000 || parsedValue > 2100) {
    return resolveDefaultTaxYear();
  }

  return parsedValue;
};

const downloadTextFile = (fileName: string, content: string, contentType: string) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const blob = new Blob([content], { type: contentType });
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
};

const escapeCsvValue = (value: string | number | null | undefined) => {
  const normalizedValue = value == null ? "" : String(value);

  if (/[",\n]/.test(normalizedValue)) {
    return `"${normalizedValue.replace(/"/g, '""')}"`;
  }

  return normalizedValue;
};

const buildFactsCsv = (facts: TaxFact[]) => {
  const header = [
    "fact_id",
    "fact_type",
    "subcategory",
    "payer_name",
    "payer_document",
    "amount",
    "review_status",
    "conflict_code",
    "source_document",
  ];
  const lines = facts.map((fact) =>
    [
      fact.id,
      fact.factType,
      fact.subcategory,
      fact.payerName,
      fact.payerDocument,
      fact.amount.toFixed(2),
      fact.reviewStatus,
      fact.conflictCode || "",
      fact.sourceDocument?.originalFileName || "",
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  return [header.join(","), ...lines].join("\n");
};

const FactSummaryCard = ({
  title,
  value,
  helper,
}: {
  title: string;
  value: string;
  helper?: string;
}) => (
  <div className="rounded border border-cf-border bg-cf-surface p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-cf-text-secondary">{title}</p>
    <p className="mt-2 text-xl font-bold text-cf-text-primary">{value}</p>
    {helper ? <p className="mt-1 text-xs text-cf-text-secondary">{helper}</p> : null}
  </div>
);

const TaxPage = ({ onBack = undefined }: TaxPageProps): JSX.Element => {
  const params = useParams();
  const taxYear = useMemo(() => normalizeRouteTaxYear(params.taxYear), [params.taxYear]);

  const [summary, setSummary] = useState<TaxSummary>({
    ...EMPTY_SUMMARY,
    taxYear,
    exerciseYear: taxYear,
    calendarYear: taxYear - 1,
  });
  const [obligation, setObligation] = useState<TaxObligation>({
    ...EMPTY_OBLIGATION,
    taxYear,
    exerciseYear: taxYear,
    calendarYear: taxYear - 1,
  });
  const [factsPage, setFactsPage] = useState<TaxFactsListResult>({
    items: [],
    page: 1,
    pageSize: DEFAULT_FACTS_PAGE_SIZE,
    total: 0,
  });
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isRebuildingSummary, setIsRebuildingSummary] = useState(false);
  const [processingFactId, setProcessingFactId] = useState<number | null>(null);
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [correctionDraft, setCorrectionDraft] = useState<CorrectionDraft | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSuccess = useCallback((message: string) => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }

    setSuccessMessage(message);
    successTimerRef.current = setTimeout(() => setSuccessMessage(""), 4000);
  }, []);

  const loadPageData = useCallback(async () => {
    setIsLoadingPage(true);
    setPageError("");

    const [summaryResult, obligationResult, factsResult] = await Promise.allSettled([
      taxService.getSummary(taxYear),
      taxService.getObligation(taxYear),
      taxService.listFacts({
        taxYear,
        reviewStatus: "pending",
        pageSize: DEFAULT_FACTS_PAGE_SIZE,
      }),
    ]);

    const nextErrors: string[] = [];

    if (summaryResult.status === "fulfilled") {
      setSummary(summaryResult.value);
    } else {
      setSummary({
        ...EMPTY_SUMMARY,
        taxYear,
        exerciseYear: taxYear,
        calendarYear: taxYear - 1,
      });
      nextErrors.push(getApiErrorMessage(summaryResult.reason, "Não foi possível carregar o resumo fiscal."));
    }

    if (obligationResult.status === "fulfilled") {
      setObligation(obligationResult.value);
    } else {
      setObligation({
        ...EMPTY_OBLIGATION,
        taxYear,
        exerciseYear: taxYear,
        calendarYear: taxYear - 1,
      });
      nextErrors.push(
        getApiErrorMessage(
          obligationResult.reason,
          "Não foi possível carregar a obrigatoriedade do exercício.",
        ),
      );
    }

    if (factsResult.status === "fulfilled") {
      setFactsPage(factsResult.value);
    } else {
      setFactsPage({
        items: [],
        page: 1,
        pageSize: DEFAULT_FACTS_PAGE_SIZE,
        total: 0,
      });
      nextErrors.push(
        getApiErrorMessage(factsResult.reason, "Não foi possível carregar a fila de revisão."),
      );
    }

    setPageError(nextErrors[0] || "");
    setIsLoadingPage(false);
  }, [taxYear]);

  useEffect(() => {
    void loadPageData();

    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, [loadPageData]);

  const handleRebuildSummary = async () => {
    setIsRebuildingSummary(true);
    setPageError("");

    try {
      const rebuiltSummary = await taxService.rebuildSummary(taxYear);
      const nextObligation = await taxService.getObligation(taxYear);
      setSummary(rebuiltSummary);
      setObligation(nextObligation);
      showSuccess(
        rebuiltSummary.snapshotVersion
          ? `Resumo fiscal atualizado na versão ${rebuiltSummary.snapshotVersion}.`
          : "Resumo fiscal atualizado.",
      );
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível gerar o resumo fiscal."));
    } finally {
      setIsRebuildingSummary(false);
    }
  };

  const reviewFact = async (
    factId: number,
    payload:
      | { action: "approve"; note?: string }
      | { action: "reject"; note?: string }
      | {
          action: "correct";
          note?: string;
          corrected: {
            amount?: number;
            subcategory?: string;
          };
        },
    successLabel: string,
  ) => {
    setProcessingFactId(factId);
    setPageError("");

    try {
      await taxService.reviewFact(factId, payload);
      await loadPageData();
      showSuccess(successLabel);
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível revisar o fato fiscal."));
    } finally {
      setProcessingFactId(null);
    }
  };

  const handleBulkApprove = async () => {
    if (factsPage.items.length === 0) {
      return;
    }

    setIsBulkApproving(true);
    setPageError("");

    try {
      await taxService.bulkApproveFacts(
        factsPage.items.map((fact) => fact.id),
        "Aprovação em lote pela Central do Leão.",
      );
      await loadPageData();
      showSuccess("Fatos pendentes aprovados em lote.");
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível aprovar os fatos em lote."));
    } finally {
      setIsBulkApproving(false);
    }
  };

  const handleOpenCorrection = (fact: TaxFact) => {
    setCorrectionDraft({
      factId: fact.id,
      amount: fact.amount.toFixed(2),
      subcategory: fact.subcategory,
      note: "",
    });
  };

  const handleSubmitCorrection = async () => {
    if (!correctionDraft) {
      return;
    }

    const parsedAmount = Number(correctionDraft.amount.replace(",", "."));

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setPageError("Informe um valor corrigido válido.");
      return;
    }

    await reviewFact(
      correctionDraft.factId,
      {
        action: "correct",
        note: correctionDraft.note,
        corrected: {
          amount: parsedAmount,
          subcategory: correctionDraft.subcategory.trim() || undefined,
        },
      },
      "Fato fiscal corrigido.",
    );
    setCorrectionDraft(null);
  };

  const handleExportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      summary,
      obligation,
      pendingFacts: factsPage.items,
    };

    downloadTextFile(
      `central-do-leao-${taxYear}.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8",
    );
  };

  const handleExportCsv = () => {
    downloadTextFile(
      `central-do-leao-facts-${taxYear}.csv`,
      buildFactsCsv(factsPage.items),
      "text/csv;charset=utf-8",
    );
  };

  const headerCalendarYear = summary.calendarYear || obligation.calendarYear || taxYear - 1;
  const methodLabel = summary.bestMethod ? METHOD_LABELS[summary.bestMethod] : "Ainda não definido";

  return (
    <div className="min-h-screen bg-cf-bg-page px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 rounded border border-cf-border bg-cf-surface p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                {onBack ? (
                  <button
                    type="button"
                    onClick={onBack}
                    className="text-sm font-semibold text-cf-text-secondary hover:text-cf-text-primary"
                  >
                    ← Voltar
                  </button>
                ) : null}
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  Exercício {taxYear}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-bold text-cf-text-primary">Central do Leão</h1>
              <p className="mt-1 text-sm text-cf-text-secondary">
                Ano-calendário {headerCalendarYear}. Revise fatos pendentes, acompanhe a obrigatoriedade e gere snapshots do resumo fiscal quando precisar congelar o exercício.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadPageData()}
                className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-surface"
              >
                Atualizar
              </button>
              <button
                type="button"
                onClick={handleRebuildSummary}
                disabled={isRebuildingSummary}
                className="rounded border border-brand-1 bg-brand-1 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRebuildingSummary ? "Gerando resumo..." : "Gerar resumo"}
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-surface"
              >
                Baixar JSON
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-surface"
              >
                Baixar CSV
              </button>
            </div>
          </div>

          {pageError ? (
            <div
              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {pageError}
            </div>
          ) : null}
          {!pageError && successMessage ? (
            <div
              className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
              role="status"
              aria-live="polite"
            >
              {successMessage}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <FactSummaryCard
            title="Obrigatoriedade"
            value={obligation.mustDeclare ? "Obrigatório declarar" : "Sem gatilho objetivo"}
            helper={
              obligation.mustDeclare
                ? `${obligation.reasons.length} motivo(s) ativo(s) com base em fatos revisados`
                : "Só fatos approved/corrected entram aqui"
            }
          />
          <FactSummaryCard
            title="Rendimentos Tributáveis"
            value={formatCurrency(obligation.totals.annualTaxableIncome)}
            helper="Base considerada para o gatilho principal"
          />
          <FactSummaryCard
            title="IRRF Acumulado"
            value={formatCurrency(summary.annualWithheldTax)}
            helper="Valor separado do imposto pela tabela"
          />
          <FactSummaryCard
            title="Método Sugerido"
            value={methodLabel}
            helper={
              summary.status === "generated"
                ? `Resumo v${summary.snapshotVersion ?? 0}`
                : "Gere o resumo para snapshotar o exercício"
            }
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded border border-cf-border bg-cf-surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-cf-text-primary">Resumo do exercício</h2>
                <p className="mt-1 text-sm text-cf-text-secondary">
                  Snapshot fiscal explícito. O imposto abaixo é o cálculo pela tabela ativa, sem compensar o IRRF acumulado.
                </p>
              </div>
              <span className="rounded-full border border-cf-border bg-cf-bg-subtle px-2.5 py-1 text-xs font-semibold text-cf-text-secondary">
                {summary.status === "generated" ? "Gerado" : "Ainda não gerado"}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <FactSummaryCard
                title="Imposto pela Tabela"
                value={summary.estimatedAnnualTax == null ? "—" : formatCurrency(summary.estimatedAnnualTax)}
                helper="Sem compensar IRRF"
              />
              <FactSummaryCard
                title="Exclusivos na Fonte"
                value={formatCurrency(summary.annualExclusiveIncome)}
                helper="Ex.: 13º e aplicações"
              />
              <FactSummaryCard
                title="Deduções Legais"
                value={formatCurrency(summary.totalLegalDeductions)}
                helper="Médicas e instrução já revisadas"
              />
              <FactSummaryCard
                title="Desconto Simplificado"
                value={formatCurrency(summary.simplifiedDiscountUsed)}
                helper="Cap aplicado pelas regras ativas"
              />
              <FactSummaryCard
                title="Documentos"
                value={String(summary.sourceCounts.documents)}
                helper="Arquivos vinculados ao exercício"
              />
              <FactSummaryCard
                title="Fatos Aprovados"
                value={String(summary.sourceCounts.factsApproved)}
                helper="Base que entra em obrigação e summary"
              />
            </div>
          </section>

          <section className="rounded border border-cf-border bg-cf-surface p-5">
            <h2 className="text-lg font-bold text-cf-text-primary">Gatilhos do exercício</h2>
            <p className="mt-1 text-sm text-cf-text-secondary">
              Limiares oficiais hoje ativos para o exercício {taxYear}.
            </p>

            <div className="mt-4 space-y-3">
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-3">
                <p className="text-xs font-semibold uppercase text-cf-text-secondary">Tributáveis</p>
                <p className="mt-1 text-lg font-bold text-cf-text-primary">
                  {formatCurrency(obligation.thresholds.taxableIncome)}
                </p>
              </div>
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-3">
                <p className="text-xs font-semibold uppercase text-cf-text-secondary">Isentos + exclusivos</p>
                <p className="mt-1 text-lg font-bold text-cf-text-primary">
                  {formatCurrency(obligation.thresholds.exemptAndExclusiveIncome)}
                </p>
              </div>
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-3">
                <p className="text-xs font-semibold uppercase text-cf-text-secondary">Patrimônio</p>
                <p className="mt-1 text-lg font-bold text-cf-text-primary">
                  {formatCurrency(obligation.thresholds.assets)}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded border border-cf-border bg-cf-bg-subtle px-3 py-3">
              <p className="text-xs font-semibold uppercase text-cf-text-secondary">Motivos ativos</p>
              {obligation.reasons.length === 0 ? (
                <p className="mt-2 text-sm text-cf-text-secondary">
                  Ainda não há gatilho objetivo com base nos fatos revisados.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {obligation.reasons.map((reason) => (
                    <li key={reason.code} className="text-sm text-cf-text-primary">
                      <span className="font-semibold">{reason.code}</span>: {reason.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {summary.warnings.length > 0 ? (
          <section className="mt-4 rounded border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-lg font-bold text-amber-900">Warnings fiscais</h2>
            <div className="mt-3 space-y-2">
              {summary.warnings.map((warning) => (
                <div
                  key={warning.code}
                  className="rounded border border-amber-200 bg-white/60 px-3 py-2 text-sm text-amber-900"
                >
                  <span className="font-semibold">{warning.code}</span>: {warning.message}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-4 rounded border border-cf-border bg-cf-surface p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-cf-text-primary">Fila de revisão</h2>
              <p className="mt-1 text-sm text-cf-text-secondary">
                Fatos pendentes ainda fora do cálculo. Aprovar ou corrigir aqui atualiza a obrigatoriedade na hora.
              </p>
            </div>
            <button
              type="button"
              onClick={handleBulkApprove}
              disabled={isBulkApproving || factsPage.items.length === 0}
              className="rounded border border-brand-1 px-3 py-2 text-sm font-semibold text-brand-1 hover:bg-brand-1/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBulkApproving ? "Aprovando..." : "Aprovar todos pendentes"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <FactSummaryCard
              title="Pendentes"
              value={String(summary.sourceCounts.factsPending)}
              helper="Ainda fora do cálculo"
            />
            <FactSummaryCard
              title="Aprovados"
              value={String(obligation.approvedFactsCount)}
              helper="Entram em obrigação e summary"
            />
            <FactSummaryCard
              title="Fila atual"
              value={String(factsPage.total)}
              helper="Itens retornados pela API"
            />
          </div>

          <div className="mt-4 space-y-3">
            {isLoadingPage ? (
              <p className="py-6 text-center text-sm text-cf-text-secondary">
                Carregando fatos pendentes...
              </p>
            ) : factsPage.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-cf-text-secondary">
                Nenhum fato pendente neste exercício.
              </p>
            ) : (
              factsPage.items.map((fact) => (
                <div key={fact.id} className="rounded border border-cf-border bg-cf-bg-subtle p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-cf-border bg-cf-surface px-2 py-0.5 text-xs font-semibold text-cf-text-secondary">
                          {FACT_TYPE_LABELS[fact.factType] || fact.factType}
                        </span>
                        <span className="text-xs text-cf-text-secondary">#{fact.id}</span>
                        {fact.conflictCode ? (
                          <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            {fact.conflictCode}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-lg font-bold text-cf-text-primary">
                        {formatCurrency(fact.amount)}
                      </p>
                      <p className="mt-1 text-sm text-cf-text-primary">
                        {fact.payerName || "Fonte pagadora não identificada"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-cf-text-secondary">
                        {fact.subcategory ? <span>Subcategoria: {fact.subcategory}</span> : null}
                        {fact.referencePeriod ? <span>Período: {fact.referencePeriod}</span> : null}
                        {fact.sourceDocument?.originalFileName ? (
                          <span>Documento: {fact.sourceDocument.originalFileName}</span>
                        ) : null}
                      </div>
                      {fact.conflictMessage ? (
                        <p className="mt-2 text-xs text-amber-800">{fact.conflictMessage}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void reviewFact(
                            fact.id,
                            {
                              action: "approve",
                              note: "Aprovado pela Central do Leão.",
                            },
                            "Fato fiscal aprovado.",
                          )
                        }
                        disabled={processingFactId === fact.id}
                        className="rounded border border-green-300 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenCorrection(fact)}
                        disabled={processingFactId === fact.id}
                        className="rounded border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Corrigir
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void reviewFact(
                            fact.id,
                            {
                              action: "reject",
                              note: "Rejeitado pela Central do Leão.",
                            },
                            "Fato fiscal rejeitado.",
                          )
                        }
                        disabled={processingFactId === fact.id}
                        className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Rejeitar
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {correctionDraft ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-lg rounded border border-cf-border bg-cf-surface p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-cf-text-primary">Corrigir fato fiscal</h2>
                <p className="mt-1 text-sm text-cf-text-secondary">
                  Ajuste o valor ou a subcategoria antes de mover o fato para `corrected`.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCorrectionDraft(null)}
                className="text-sm font-semibold text-cf-text-secondary hover:text-cf-text-primary"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-cf-text-primary">Valor corrigido</span>
                <input
                  type="text"
                  value={correctionDraft.amount}
                  onChange={(event) =>
                    setCorrectionDraft((previous) =>
                      previous
                        ? {
                            ...previous,
                            amount: event.target.value,
                          }
                        : previous,
                    )
                  }
                  className="w-full rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-cf-text-primary">Subcategoria</span>
                <input
                  type="text"
                  value={correctionDraft.subcategory}
                  onChange={(event) =>
                    setCorrectionDraft((previous) =>
                      previous
                        ? {
                            ...previous,
                            subcategory: event.target.value,
                          }
                        : previous,
                    )
                  }
                  className="w-full rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-cf-text-primary">Nota de revisão</span>
                <textarea
                  value={correctionDraft.note}
                  onChange={(event) =>
                    setCorrectionDraft((previous) =>
                      previous
                        ? {
                            ...previous,
                            note: event.target.value,
                          }
                        : previous,
                    )
                  }
                  rows={3}
                  className="w-full rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCorrectionDraft(null)}
                className="rounded border border-cf-border px-3 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitCorrection()}
                disabled={processingFactId === correctionDraft.factId}
                className="rounded border border-brand-1 bg-brand-1 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingFactId === correctionDraft.factId ? "Salvando..." : "Salvar correção"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TaxPage;
