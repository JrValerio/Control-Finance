import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import TaxUploadModal, { type TaxUploadStage } from "../components/TaxUploadModal";
import TaxManualFactModal from "../components/TaxManualFactModal";
import { profileService } from "../services/profile.service";
import {
  taxService,
  type TaxDocument,
  type TaxDocumentDetail,
  type TaxDocumentsListResult,
  type TaxFact,
  type TaxFactsListResult,
  type TaxFactReviewStatus,
  type TaxFactSourceFilter,
  type TaxObligation,
  type TaxSummary,
} from "../services/tax.service";
import { getApiErrorMessage } from "../utils/apiError";
import { formatCurrency } from "../utils/formatCurrency";

interface TaxPageProps {
  onBack?: () => void;
  onOpenProfileSettings?: () => void;
}

interface CorrectionDraft {
  factId: number;
  amount: string;
  subcategory: string;
  note: string;
}

const DEFAULT_FACTS_PAGE_SIZE = 25;
const DEFAULT_DOCUMENTS_PAGE_SIZE = 6;

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
    annualWithheldTax: 0,
    totalLegalDeductions: 0,
    annualCombinedExemptAndExclusiveIncome: 0,
    totalAssetBalance: 0,
  },
  approvedFactsCount: 0,
  taxpayerCpfConfigured: false,
  excludedFactsCount: 0,
};

const EMPTY_DOCUMENTS_PAGE: TaxDocumentsListResult = {
  items: [],
  page: 1,
  pageSize: DEFAULT_DOCUMENTS_PAGE_SIZE,
  total: 0,
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

const REVIEW_STATUS_LABELS: Record<TaxFactReviewStatus, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  corrected: "Corrigido",
  rejected: "Rejeitado",
};

const REVIEW_STATUS_CLASSNAMES: Record<TaxFactReviewStatus, string> = {
  pending: "border-amber-300 bg-amber-100 text-amber-800",
  approved: "border-green-300 bg-green-100 text-green-800",
  corrected: "border-blue-300 bg-blue-100 text-blue-800",
  rejected: "border-red-300 bg-red-100 text-red-800",
};

const REVIEW_FILTER_OPTIONS: Array<{
  value: TaxFactReviewStatus | "all";
  label: string;
}> = [
  { value: "pending", label: "Pendentes" },
  { value: "approved", label: "Aprovados" },
  { value: "corrected", label: "Corrigidos" },
  { value: "rejected", label: "Rejeitados" },
  { value: "all", label: "Todos" },
];

const SOURCE_FILTER_OPTIONS: Array<{
  value: TaxFactSourceFilter | "all";
  label: string;
}> = [
  { value: "all", label: "Todas as fontes" },
  { value: "with_document", label: "Com documento" },
  { value: "without_document", label: "Sem documento" },
];

const FACT_TYPE_FILTER_OPTIONS: Array<{
  value: string;
  label: string;
}> = [
  { value: "all", label: "Todos os tipos" },
  ...Object.entries(FACT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const METHOD_LABELS: Record<string, string> = {
  legal_deductions: "Deduções legais",
  simplified_discount: "Desconto simplificado",
};

const OBLIGATION_REASON_LABELS: Record<string, string> = {
  TAXABLE_INCOME_LIMIT: "Rendimentos tributáveis acima do limite",
  EXEMPT_AND_EXCLUSIVE_INCOME_LIMIT: "Rendimentos isentos e exclusivos acima do limite",
  ASSET_BALANCE_LIMIT: "Patrimônio acima do limite",
  RURAL_REVENUE_LIMIT: "Receita rural acima do limite",
  RURAL_LOSS_COMPENSATION: "Compensação de prejuízo rural",
  CAPITAL_GAIN_EVENT: "Ganho de capital no exercício",
  PROPERTY_SALE_EXEMPTION_EVENT: "Venda de imóvel com isenção",
  STOCK_OPERATION_EVENT: "Operações em bolsa",
  RESIDENT_START_EVENT: "Passou à condição de residente",
  CONTROLLED_ENTITY_ABROAD_EVENT: "Entidade controlada no exterior",
  FOREIGN_TRUST_EVENT: "Trust no exterior",
  FOREIGN_FINANCIAL_EVENT: "Aplicações financeiras no exterior",
  FOREIGN_DIVIDENDS_EVENT: "Dividendos no exterior",
};

const FACT_WARNING_LABELS: Record<string, string> = {
  PENDING_FACTS_EXCLUDED: "Fatos pendentes fora do cálculo",
  DUPLICATE_FACTS_INCLUDED: "Fatos revisados com possível duplicidade",
  TAXPAYER_CPF_MISMATCH_EXCLUDED: "Fatos excluídos por CPF divergente",
  TAXPAYER_CPF_NOT_CONFIGURED: "CPF do titular ainda não configurado",
};

const FACT_CONFLICT_LABELS: Record<string, string> = {
  TAX_FACT_DUPLICATE: "Possível duplicidade",
};

const FACT_SUBCATEGORY_LABELS: Record<string, string> = {
  annual_taxable_income: "Rendimento tributável anual",
  annual_taxable_income_adjusted: "Rendimento tributável anual ajustado",
  annual_withheld_tax: "IR retido na fonte no ano",
  bank_account_balance: "Saldo em conta bancária",
  bank_annual_exclusive_income: "Rendimento bancário com tributação exclusiva",
  bank_debt_balance: "Saldo de dívida bancária",
  bank_investment_balance: "Saldo de investimento bancário",
  exempt_income_total: "Rendimento isento no ano",
  exclusive_income_total: "Rendimento exclusivo no ano",
  inss_annual_taxable_income: "Benefício INSS tributável no ano",
  inss_annual_withheld_tax: "IR retido do INSS no ano",
  inss_retirement_65_plus_exempt: "Aposentadoria do INSS isenta para maiores de 65 anos",
  inss_retirement_65_plus_thirteenth_exempt: "13º do INSS isento para maiores de 65 anos",
  inss_thirteenth_salary_exclusive: "13º do INSS com tributação exclusiva",
  inss_thirteenth_withheld_tax: "IR retido sobre o 13º do INSS",
  app_income_statement_taxable_income: "Renda sincronizada do app",
  app_transaction_income: "Entrada sincronizada do app",
  clt_monthly_fgts_base: "Base mensal de FGTS (CLT)",
  clt_monthly_gross_income: "Renda bruta mensal (CLT)",
  clt_monthly_inss_discount: "Desconto mensal de INSS (CLT)",
  clt_monthly_irrf_withheld: "IRRF retido no mês (CLT)",
  clt_monthly_net_income: "Renda líquida mensal (CLT)",
  clt_monthly_total_discounts: "Total de descontos do mês (CLT)",
  profile_suggestion_amount: "Valor sugerido a partir do perfil",
  thirteenth_salary: "13º salário",
  total_paid: "Total pago",
  withheld_tax_total: "Total de IR retido",
  year_end_balance: "Saldo em 31 de dezembro",
};

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  uploaded: "Enviado",
  classified: "Classificado",
  extracted: "Extraído",
  normalized: "Processado",
  failed: "Falhou",
};

const DOCUMENT_STATUS_CLASSNAMES: Record<string, string> = {
  uploaded: "border-slate-200 bg-slate-50 text-slate-700",
  classified: "border-blue-200 bg-blue-50 text-blue-700",
  extracted: "border-cyan-200 bg-cyan-50 text-cyan-700",
  normalized: "border-green-200 bg-green-50 text-green-700",
  failed: "border-red-200 bg-red-50 text-red-700",
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  unknown: "Documento ainda não classificado",
  income_report_bank: "Informe bancário",
  income_report_employer: "Informe do empregador",
  clt_payslip: "Holerite CLT",
  income_report_inss: "Informe do INSS",
  medical_statement: "Comprovante médico",
  education_receipt: "Comprovante educacional",
  loan_statement: "Comprovante de empréstimo",
  bank_statement_support: "Extrato de apoio",
};

const resolveDefaultTaxYear = () => new Date().getFullYear();

const normalizeRouteTaxYear = (value: string | undefined) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 2000 || parsedValue > 2100) {
    return resolveDefaultTaxYear();
  }

  return parsedValue;
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "Data indisponível";
  }

  const parsedValue = new Date(value);

  if (Number.isNaN(parsedValue.getTime())) {
    return "Data indisponível";
  }

  return parsedValue.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const normalizeDocumentNumber = (value: unknown) => String(value || "").replace(/\D/g, "");

const humanizeTaxIdentifier = (value: string | null | undefined) => {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "Não informado";
  }

  if (!/[_-]/.test(normalizedValue) && /\s/.test(normalizedValue)) {
    return normalizedValue;
  }

  const acronymLabels: Record<string, string> = {
    app: "App",
    bank: "Banco",
    cpf: "CPF",
    inss: "INSS",
    irpf: "IRPF",
    irrf: "IRRF",
  };

  return normalizedValue
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((segment) => {
      const loweredSegment = segment.toLowerCase();

      if (acronymLabels[loweredSegment]) {
        return acronymLabels[loweredSegment];
      }

      if (/^\d+$/.test(segment)) {
        return segment;
      }

      return `${segment.charAt(0).toUpperCase()}${segment.slice(1).toLowerCase()}`;
    })
    .join(" ");
};

const formatObligationReasonLabel = (code: string) =>
  OBLIGATION_REASON_LABELS[code] || humanizeTaxIdentifier(code);

const formatFactWarningLabel = (code: string) =>
  FACT_WARNING_LABELS[code] || humanizeTaxIdentifier(code);

const formatFactConflictLabel = (code: string) =>
  FACT_CONFLICT_LABELS[code] || humanizeTaxIdentifier(code);

const formatFactSubcategoryLabel = (subcategory: string) =>
  FACT_SUBCATEGORY_LABELS[subcategory] || humanizeTaxIdentifier(subcategory);

const formatReferencePeriod = (value: string | null) => {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "Período não informado";
  }

  const annualMatch = normalizedValue.match(/^(\d{4})-annual$/);

  if (annualMatch) {
    return `Ano de ${annualMatch[1]}`;
  }

  const monthMatch = normalizedValue.match(/^(\d{4})-(\d{2})$/);

  if (monthMatch) {
    return `${monthMatch[2]}/${monthMatch[1]}`;
  }

  const dateMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateMatch) {
    return `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}`;
  }

  return normalizedValue;
};

const formatCpf = (value: string | null) => {
  const digits = normalizeDocumentNumber(value);

  if (digits.length !== 11) {
    return value || "CPF não informado";
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const resolveFactOwnerDocument = (fact: TaxFact) => {
  const metadata = fact.metadata || {};

  return normalizeDocumentNumber(
    metadata.beneficiaryDocument ||
      metadata.customerDocument ||
      metadata.studentDocument ||
      metadata.ownerDocument,
  );
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

const TaxPage = ({ onBack = undefined, onOpenProfileSettings = undefined }: TaxPageProps): JSX.Element => {
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
  const [documentsPage, setDocumentsPage] = useState<TaxDocumentsListResult>(EMPTY_DOCUMENTS_PAGE);
  const [factsPage, setFactsPage] = useState<TaxFactsListResult>({
    items: [],
    page: 1,
    pageSize: DEFAULT_FACTS_PAGE_SIZE,
    total: 0,
  });
  const [reviewStatusFilter, setReviewStatusFilter] = useState<TaxFactReviewStatus | "all">(
    "pending",
  );
  const [factTypeFilter, setFactTypeFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<TaxFactSourceFilter | "all">("all");
  const [taxpayerCpf, setTaxpayerCpf] = useState<string | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isRebuildingSummary, setIsRebuildingSummary] = useState(false);
  const [isSyncingAppData, setIsSyncingAppData] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"json" | "csv" | null>(null);
  const [isPrintingDossier, setIsPrintingDossier] = useState(false);
  const [processingFactId, setProcessingFactId] = useState<number | null>(null);
  const [processingDocumentId, setProcessingDocumentId] = useState<number | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<number | null>(null);
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [correctionDraft, setCorrectionDraft] = useState<CorrectionDraft | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isManualFactModalOpen, setIsManualFactModalOpen] = useState(false);
  const [isCreatingManualFact, setIsCreatingManualFact] = useState(false);
  const [uploadStage, setUploadStage] = useState<TaxUploadStage>("idle");
  const [uploadStatusMessage, setUploadStatusMessage] = useState("");
  const [uploadErrorMessage, setUploadErrorMessage] = useState("");
  const [uploadPreviewDocument, setUploadPreviewDocument] = useState<TaxDocumentDetail | null>(null);
  const [uploadPreviewFactCount, setUploadPreviewFactCount] = useState(0);
  const [manualFactErrorMessage, setManualFactErrorMessage] = useState("");
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard: fire auto-sync at most once per mount (StrictMode + dep-change safety)
  const hasAutoSyncedRef = useRef(false);

  const showSuccess = useCallback((message: string) => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }

    setSuccessMessage(message);
    successTimerRef.current = setTimeout(() => setSuccessMessage(""), 4000);
  }, []);

  const applyReviewPreview = useCallback(
    (preview: { summary: TaxSummary; obligation: TaxObligation } | null) => {
      if (!preview) {
        return;
      }

      setSummary(preview.summary);
      setObligation(preview.obligation);
    },
    [],
  );

  const loadPageData = useCallback(async (): Promise<TaxFactsListResult> => {
    const EMPTY_FACTS: TaxFactsListResult = { items: [], page: 1, pageSize: DEFAULT_FACTS_PAGE_SIZE, total: 0 };

    setIsLoadingPage(true);
    setPageError("");

    const [summaryResult, obligationResult, documentsResult, factsResult, profileResult] = await Promise.allSettled([
      taxService.getSummary(taxYear),
      taxService.getObligation(taxYear),
      taxService.listDocuments({
        taxYear,
        pageSize: DEFAULT_DOCUMENTS_PAGE_SIZE,
      }),
      taxService.listFacts({
        taxYear,
        reviewStatus: reviewStatusFilter === "all" ? undefined : reviewStatusFilter,
        factType: factTypeFilter === "all" ? undefined : factTypeFilter,
        sourceFilter: sourceFilter === "all" ? undefined : sourceFilter,
        pageSize: DEFAULT_FACTS_PAGE_SIZE,
      }),
      profileService.getMe(),
    ]);

    const nextErrors: string[] = [];

    if (summaryResult.status === "fulfilled") {
      setSummary(summaryResult.value);
    } else {
      nextErrors.push(getApiErrorMessage(summaryResult.reason, "Não foi possível carregar o resumo fiscal."));
    }

    if (obligationResult.status === "fulfilled") {
      setObligation(obligationResult.value);
    } else {
      nextErrors.push(
        getApiErrorMessage(
          obligationResult.reason,
          "Não foi possível carregar a obrigatoriedade do exercício.",
        ),
      );
    }

    const freshFacts = factsResult.status === "fulfilled" ? factsResult.value : EMPTY_FACTS;

    if (factsResult.status === "fulfilled") {
      setFactsPage(freshFacts);
    } else {
      nextErrors.push(
        getApiErrorMessage(factsResult.reason, "Não foi possível carregar a fila de revisão."),
      );
    }

    if (documentsResult.status === "fulfilled") {
      setDocumentsPage(documentsResult.value);
    } else {
      nextErrors.push(
        getApiErrorMessage(documentsResult.reason, "Não foi possível carregar os documentos do exercício."),
      );
    }

    if (profileResult.status === "fulfilled") {
      setTaxpayerCpf(profileResult.value.profile?.taxpayerCpf ?? null);
    }

    setPageError(nextErrors[0] || "");
    setIsLoadingPage(false);
    return freshFacts;
  }, [factTypeFilter, reviewStatusFilter, sourceFilter, taxYear]);

  useEffect(() => {
    void loadPageData();

    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, [loadPageData]);

  // Auto-sync: when the page finishes loading with zero facts and zero documents,
  // silently pull income_statements + transactions into tax_facts for this year.
  // The ref prevents re-triggering on subsequent renders or StrictMode double-mounts.
  useEffect(() => {
    if (
      isLoadingPage ||
      hasAutoSyncedRef.current ||
      factsPage.total > 0 ||
      documentsPage.total > 0
    ) {
      return;
    }

    hasAutoSyncedRef.current = true;
    setIsSyncingAppData(true);

    void taxService
      .syncAppData(taxYear)
      .then((result) => {
        if (result.totalFactsGenerated > 0) {
          void loadPageData();
        }
      })
      .catch(() => {
        // Silent — auto-sync failure is non-blocking; user can still sync manually.
      })
      .finally(() => {
        setIsSyncingAppData(false);
      });
  }, [isLoadingPage, factsPage.total, documentsPage.total, taxYear, loadPageData]);

  const refreshAfterDocumentLifecycle = useCallback(async (): Promise<TaxFactsListResult> => {
    let rebuildErrorMessage = "";

    try {
      await taxService.rebuildSummary(taxYear);
    } catch (error) {
      rebuildErrorMessage = getApiErrorMessage(
        error,
        "Não foi possível atualizar o resumo fiscal após a ação documental.",
      );
    }

    const freshFacts = await loadPageData();

    if (rebuildErrorMessage) {
      setPageError((currentError) => currentError || rebuildErrorMessage);
    }

    return freshFacts;
  }, [loadPageData, taxYear]);

  const resetUploadFlow = useCallback(() => {
    setUploadStage("idle");
    setUploadStatusMessage("");
    setUploadErrorMessage("");
    setUploadPreviewDocument(null);
    setUploadPreviewFactCount(0);
  }, []);

  const handleOpenUploadModal = () => {
    resetUploadFlow();
    setIsUploadModalOpen(true);
  };

  const handleOpenManualFactModal = () => {
    setManualFactErrorMessage("");
    setIsManualFactModalOpen(true);
  };

  const handleCloseUploadModal = () => {
    if (uploadStage === "uploading" || uploadStage === "processing") {
      return;
    }

    setIsUploadModalOpen(false);
    resetUploadFlow();
  };

  const handleConfirmUploadPreview = () => {
    const successLabel = "Documento enviado e processado. Fatos disponíveis na fila de revisão.";
    setUploadStage("success");
    setUploadStatusMessage(successLabel);
    showSuccess(successLabel);
  };

  const handleCloseManualFactModal = () => {
    if (isCreatingManualFact) {
      return;
    }

    setIsManualFactModalOpen(false);
    setManualFactErrorMessage("");
  };

  const handleUploadDocument = async ({
    file,
    sourceLabel,
    sourceHint,
  }: {
    file: File;
    sourceLabel: string;
    sourceHint: string;
  }) => {
    setPageError("");
    setUploadErrorMessage("");
    setUploadStage("uploading");
    setUploadStatusMessage("Enviando documento fiscal...");

    try {
      const uploadedDocument = await taxService.uploadDocument(taxYear, file, {
        sourceLabel,
        sourceHint,
      });

      setUploadStage("processing");
      setUploadStatusMessage("Lendo documento, classificando e atualizando a fila fiscal...");

      try {
        const processedDocument = await taxService.reprocessDocument(uploadedDocument.id);
        const freshFacts = await refreshAfterDocumentLifecycle();

        const factCount = freshFacts.items.filter(
          (f) => f.sourceDocumentId === processedDocument.id,
        ).length;

        setUploadPreviewDocument(processedDocument);
        setUploadPreviewFactCount(factCount);
        setUploadStage("preview");
        setUploadStatusMessage("");
      } catch (processingError) {
        await loadPageData();
        setUploadStage("error");
        setUploadStatusMessage("");
        setUploadErrorMessage(
          `Documento enviado, mas não foi possível processar. ${getApiErrorMessage(
            processingError,
            "Tente novamente mais tarde.",
          )}`,
        );
      }
    } catch (uploadError) {
      setUploadStage("error");
      setUploadStatusMessage("");
      setUploadErrorMessage(
        getApiErrorMessage(uploadError, "Não foi possível enviar o documento fiscal."),
      );
    }
  };

  const handleCreateManualFact = async (payload: {
    taxYear: number;
    factType: string;
    subcategory: string;
    payerName: string;
    payerDocument: string;
    referencePeriod: string;
    amount: number;
    note: string;
  }) => {
    setManualFactErrorMessage("");
    setPageError("");
    setIsCreatingManualFact(true);

    try {
      const createdFact = await taxService.createManualFact(payload);
      await loadPageData();
      setIsManualFactModalOpen(false);
      showSuccess(
        createdFact.conflictCode
          ? "Fato manual adicionado com alerta de possível duplicidade. Revise antes de aprovar."
          : "Fato manual adicionado à fila de revisão.",
      );
    } catch (error) {
      setManualFactErrorMessage(
        getApiErrorMessage(error, "Não foi possível adicionar o fato manual."),
      );
    } finally {
      setIsCreatingManualFact(false);
    }
  };

  const handleRetryDocument = async (document: TaxDocument) => {
    setProcessingDocumentId(document.id);
    setPageError("");

    try {
      await taxService.reprocessDocument(document.id);
      await refreshAfterDocumentLifecycle();
      showSuccess("Documento processado novamente. Se houver fatos extraídos, eles já aparecem na fila de revisão.");
    } catch (error) {
      await loadPageData();
      setPageError(getApiErrorMessage(error, "Não foi possível processar novamente o documento."));
    } finally {
      setProcessingDocumentId(null);
    }
  };

  const handleDeleteDocument = async (document: TaxDocument) => {
    const shouldDelete =
      typeof window === "undefined" || typeof window.confirm !== "function"
        ? true
        : window.confirm(
            "Excluir documento? Os fatos fiscais extraídos deste documento também serão apagados.",
          );

    if (!shouldDelete) {
      return;
    }

    setDeletingDocumentId(document.id);
    setPageError("");

    try {
      const result = await taxService.deleteDocument(document.id);
      await refreshAfterDocumentLifecycle();
      showSuccess(
        result.deletedFactsCount > 0
          ? result.deletedFactsCount === 1
            ? "Documento excluído. 1 fato fiscal vinculado foi removido."
            : `Documento excluído. ${result.deletedFactsCount} fatos fiscais vinculados foram removidos.`
          : "Documento excluído.",
      );
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível excluir o documento."));
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const handleRebuildSummary = async () => {
    setIsRebuildingSummary(true);
    setPageError("");

    try {
      const rebuiltSummary = await taxService.rebuildSummary(taxYear);
      setSummary(rebuiltSummary);
      await loadPageData();
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

  const handleSyncAppData = async () => {
    setIsSyncingAppData(true);
    setPageError("");

    try {
      const result = await taxService.syncAppData(taxYear);
      await loadPageData();

      if (result.totalFactsGenerated > 0) {
        showSuccess(
          result.totalFactsGenerated === 1
            ? "Importamos 1 fato fiscal pendente a partir dos dados do app. Revise-o para entrar no cálculo oficial."
            : `Importamos ${result.totalFactsGenerated} fatos fiscais pendentes a partir dos dados do app. Revise-os para entrarem no cálculo oficial.`,
        );
        return;
      }

      if (result.preservedReviewedFactsCount > 0) {
        showSuccess(
          "Sincronização concluída. Nenhum fato novo foi criado, mas os fatos já revisados derivados do app foram preservados.",
        );
        return;
      }

      showSuccess(
        "Nenhum fato fiscal novo foi encontrado nos lançamentos e demonstrativos já alimentados no app para este exercício.",
      );
    } catch (error) {
      setPageError(
        getApiErrorMessage(
          error,
          "Não foi possível sincronizar os dados já alimentados no app com a Central do Leão.",
        ),
      );
    } finally {
      setIsSyncingAppData(false);
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
      const result = await taxService.reviewFact(factId, payload);

      applyReviewPreview(result.preview);
      setFactsPage((currentPage) => ({
        ...currentPage,
        items: currentPage.items.filter((fact) => fact.id !== factId),
        total: Math.max(currentPage.total - 1, 0),
      }));

      if (!result.preview) {
        await loadPageData();
      }

      showSuccess(successLabel);
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível revisar o fato fiscal."));
    } finally {
      setProcessingFactId(null);
    }
  };

  const handleBulkApprove = async () => {
    const factIds = factsPage.items
      .filter((fact) => fact.reviewStatus === "pending")
      .map((fact) => fact.id);

    if (factIds.length === 0) {
      return;
    }

    setIsBulkApproving(true);
    setPageError("");

    try {
      const result = await taxService.bulkApproveFacts(factIds, "Aprovação em lote pela Central do Leão.");

      applyReviewPreview(result.preview);
      setFactsPage((currentPage) => ({
        ...currentPage,
        items: currentPage.items.filter((fact) => !factIds.includes(fact.id)),
        total: Math.max(currentPage.total - factIds.length, 0),
      }));

      if (!result.preview) {
        await loadPageData();
      }

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

  const handleExport = async (format: "json" | "csv") => {
    setExportingFormat(format);
    setPageError("");

    try {
      const result = await taxService.downloadExport(taxYear, format);
      showSuccess(
        `Dossiê ${format.toUpperCase()} baixado${result.fileName ? `: ${result.fileName}.` : "."}`,
      );
    } catch (error) {
      setPageError(
        getApiErrorMessage(error, `Não foi possível baixar o dossiê ${format.toUpperCase()}.`),
      );
    } finally {
      setExportingFormat(null);
    }
  };

  const handlePrintDossier = () => {
    setPageError("");
    setIsPrintingDossier(true);

    try {
      if (typeof window === "undefined" || typeof window.print !== "function") {
        throw new Error("PRINT_UNAVAILABLE");
      }

      window.print();
      showSuccess(
        "Modo imprimível aberto. Para gerar PDF, use 'Salvar como PDF' na janela de impressão.",
      );
    } catch {
      setPageError("Não foi possível abrir a visualização de impressão/PDF de conferência.");
    } finally {
      setIsPrintingDossier(false);
    }
  };

  const headerCalendarYear = summary.calendarYear || obligation.calendarYear || taxYear - 1;
  const hasGeneratedOrPreviewSummary = summary.status === "generated" || summary.status === "preview";
  const hasResolvedFiscalData =
    hasGeneratedOrPreviewSummary ||
    summary.snapshotVersion !== null ||
    summary.generatedAt !== null ||
    obligation.approvedFactsCount > 0 ||
    documentsPage.total > 0 ||
    factsPage.total > 0;
  const showLoadingPlaceholders = isLoadingPage && !hasResolvedFiscalData;
  const methodLabel = showLoadingPlaceholders
    ? "Carregando..."
    : summary.bestMethod
      ? METHOD_LABELS[summary.bestMethod]
      : "Ainda não definido";
  const liveTaxableIncome = obligation.totals.annualTaxableIncome;
  const liveExemptIncome = obligation.totals.annualExemptIncome;
  const liveExclusiveIncome = obligation.totals.annualExclusiveIncome;
  const liveWithheldTax = obligation.totals.annualWithheldTax;
  const liveLegalDeductions = obligation.totals.totalLegalDeductions;
  const displayAnnualTaxableIncome =
    hasGeneratedOrPreviewSummary ? summary.annualTaxableIncome : liveTaxableIncome;
  const displayAnnualExemptIncome =
    hasGeneratedOrPreviewSummary ? summary.annualExemptIncome : liveExemptIncome;
  const displayAnnualExclusiveIncome =
    hasGeneratedOrPreviewSummary ? summary.annualExclusiveIncome : liveExclusiveIncome;
  const displayAnnualWithheldTax =
    hasGeneratedOrPreviewSummary ? summary.annualWithheldTax : liveWithheldTax;
  const displayLegalDeductions =
    hasGeneratedOrPreviewSummary ? summary.totalLegalDeductions : liveLegalDeductions;
  const legalDeductionsBase = Math.max(displayAnnualTaxableIncome - displayLegalDeductions, 0);
  const simplifiedDiscountBase = Math.max(
    displayAnnualTaxableIncome - summary.simplifiedDiscountUsed,
    0,
  );
  const pendingNoDocumentCount = factsPage.items.filter((fact) => !fact.sourceDocumentId).length;
  const pendingConflictCount = factsPage.items.filter((fact) => Boolean(fact.conflictCode)).length;
  const pendingDuplicateCount = factsPage.items.filter(
    (fact) => fact.conflictCode === "TAX_FACT_DUPLICATE",
  ).length;
  const pendingOwnershipMismatchCount = factsPage.items.filter((fact) => {
    if (!taxpayerCpf) {
      return false;
    }

    const ownerDocument = resolveFactOwnerDocument(fact);

    return Boolean(ownerDocument) && normalizeDocumentNumber(taxpayerCpf) !== ownerDocument;
  }).length;
  const pendingAssetBalanceAmount = factsPage.items
    .filter((fact) => fact.factType === "asset_balance")
    .reduce((sum, fact) => sum + fact.amount, 0);
  const pendingDebtBalanceAmount = factsPage.items
    .filter((fact) => fact.factType === "debt_balance")
    .reduce((sum, fact) => sum + fact.amount, 0);
  const pendingFactsInView = factsPage.items.filter((fact) => fact.reviewStatus === "pending").length;
  const reviewStatusLabel = showLoadingPlaceholders
    ? "Revisão fiscal em carregamento"
    : summary.sourceCounts.factsPending > 0
      ? `${summary.sourceCounts.factsPending} pendência(s) em revisão humana`
      : obligation.approvedFactsCount > 0
        ? "Revisão fiscal sem pendências abertas"
        : "Sem fatos revisados até agora";
  const excludedApprovedFactsCount = Math.max(
    summary.sourceCounts.factsApproved - obligation.approvedFactsCount,
    0,
  );
  const factWarnings = [...summary.warnings];

  if (!factWarnings.some((warning) => warning.code === "TAXPAYER_CPF_MISMATCH_EXCLUDED") &&
      excludedApprovedFactsCount > 0) {
    factWarnings.push({
      code: "TAXPAYER_CPF_MISMATCH_EXCLUDED",
      message:
        excludedApprovedFactsCount === 1
          ? "Há 1 fato aprovado com CPF diferente do titular cadastrado e ele ficou fora do cálculo oficial."
          : `Há ${excludedApprovedFactsCount} fatos aprovados com CPF diferente do titular cadastrado e eles ficaram fora do cálculo oficial.`,
    });
  }

  if (!factWarnings.some((warning) => warning.code === "TAXPAYER_CPF_NOT_CONFIGURED") && !taxpayerCpf) {
    factWarnings.push({
      code: "TAXPAYER_CPF_NOT_CONFIGURED",
      message:
        "Cadastre o CPF do titular em Configurações para a Central do Leão conseguir conferir a titularidade dos informes automaticamente.",
    });
  }

  const visibleFactWarnings = showLoadingPlaceholders ? [] : factWarnings;
  const showNoObligationInfo = !showLoadingPlaceholders && !obligation.mustDeclare;
  const canSyncFromApp = !isLoadingPage && documentsPage.total === 0;
  const generatedStatusLabel = showLoadingPlaceholders
    ? "Carregando dados..."
    : summary.status === "generated"
      ? "Gerado"
      : summary.status === "preview"
        ? "Prévia"
      : "Ainda não gerado";
  const documentsCountLabel = showLoadingPlaceholders
    ? "Carregando..."
    : `${documentsPage.total} documento(s)`;

  return (
    <div className="min-h-screen bg-cf-bg-page px-4 py-6 sm:px-6 print:min-h-0 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 rounded border border-cf-border bg-cf-surface p-5 print:mb-3 print:rounded-none print:border-0 print:p-0">
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-3">
                {onBack ? (
                  <button
                    type="button"
                    onClick={onBack}
                    className="text-sm font-semibold text-cf-text-secondary hover:text-cf-text-primary print:hidden"
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

            <div className="flex flex-wrap items-center gap-2 text-xs text-cf-text-secondary">
              <span className="rounded-full border border-cf-border bg-cf-bg-subtle px-2.5 py-1 font-semibold">
                {generatedStatusLabel}
              </span>
              <span className="rounded-full border border-cf-border bg-cf-bg-subtle px-2.5 py-1 font-medium">
                {reviewStatusLabel}
              </span>
              <span className="rounded-full border border-cf-border bg-cf-bg-subtle px-2.5 py-1 font-medium">
                CPF titular: {taxpayerCpf ? formatCpf(taxpayerCpf) : "não configurado"}
              </span>
              {summary.generatedAt && !showLoadingPlaceholders ? (
                <span className="rounded-full border border-cf-border bg-cf-bg-subtle px-2.5 py-1 font-medium">
                  Atualizado em {formatDateTime(summary.generatedAt)}
                </span>
              ) : null}
              {summary.snapshotVersion != null && !showLoadingPlaceholders ? (
                <span className="rounded-full border border-cf-border bg-cf-bg-subtle px-2.5 py-1 font-medium">
                  Snapshot v{summary.snapshotVersion}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between print:hidden">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleOpenUploadModal}
                  className="rounded border border-brand-1 bg-brand-1 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-2"
                >
                  Enviar documento
                </button>
                <button
                  type="button"
                  onClick={handleOpenManualFactModal}
                  className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-surface"
                >
                  Adicionar manualmente
                </button>
                <button
                  type="button"
                  onClick={() => void handleSyncAppData()}
                  disabled={!canSyncFromApp || isSyncingAppData}
                  className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSyncingAppData ? "Sincronizando..." : "Sincronizar do app"}
                </button>
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
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleExport("json")}
                  disabled={exportingFormat !== null}
                  className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exportingFormat === "json" ? "Baixando JSON..." : "Baixar JSON"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport("csv")}
                  disabled={exportingFormat !== null}
                  className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exportingFormat === "csv" ? "Baixando CSV..." : "Baixar CSV"}
                </button>
                <button
                  type="button"
                  onClick={handlePrintDossier}
                  disabled={isPrintingDossier}
                  className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPrintingDossier ? "Abrindo impressão..." : "Imprimir / PDF"}
                </button>
              </div>
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

          <p className="hidden text-xs text-cf-text-secondary print:block">
            Conferência fiscal - Exercício {taxYear} (ano-calendário {headerCalendarYear}) - emitido em {formatDateTime(new Date().toISOString())}.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <FactSummaryCard
            title="Obrigatoriedade"
            value={
              showLoadingPlaceholders
                ? "Carregando..."
                : obligation.mustDeclare
                  ? "Obrigatório declarar"
                  : "Sem obrigatoriedade hoje"
            }
            helper={
              showLoadingPlaceholders
                ? "Lendo fatos revisados e status do exercício"
                : obligation.mustDeclare
                ? `${obligation.reasons.length} motivo(s) ativo(s) com base em fatos revisados`
                : "Mesmo isento, o espelho do exercício continua disponível"
            }
          />
          <FactSummaryCard
            title="Rendimentos Tributáveis"
            value={
              showLoadingPlaceholders ? "Carregando..." : formatCurrency(displayAnnualTaxableIncome)
            }
            helper="Base considerada para o gatilho principal"
          />
          <FactSummaryCard
            title="IRRF Acumulado"
            value={
              showLoadingPlaceholders ? "Carregando..." : formatCurrency(displayAnnualWithheldTax)
            }
            helper="Valor separado do imposto pela tabela, mesmo abaixo do limite"
          />
          <FactSummaryCard
            title="Método Sugerido"
            value={methodLabel}
            helper={
              summary.status === "generated"
                ? `Resumo v${summary.snapshotVersion ?? 0}`
                : summary.status === "preview"
                  ? "Prévia dinâmica após revisão"
                : "Gere o resumo para snapshotar o exercício"
            }
          />
        </div>

        {showNoObligationInfo ? (
          <section className="mt-4 rounded border border-sky-200 bg-sky-50 p-5">
            <h2 className="text-lg font-bold text-sky-900">Sua situação hoje</h2>
            <p className="mt-2 text-sm text-sky-900">
              Pelos fatos revisados até agora, você está sem obrigatoriedade objetiva no exercício {taxYear}. Ainda assim, a Central do Leão continua mostrando seu espelho fiscal com valores tributáveis, isentos, exclusivos e IRRF para conferência.
            </p>
          </section>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr] print:mt-2">
          <section className="rounded border border-cf-border bg-cf-surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-cf-text-primary">Resumo do exercício</h2>
                <p className="mt-1 text-sm text-cf-text-secondary">
                  Snapshot fiscal explícito. O imposto abaixo é o cálculo pela tabela ativa, sem compensar o IRRF acumulado.
                </p>
              </div>
              <span className="rounded-full border border-cf-border bg-cf-bg-subtle px-2.5 py-1 text-xs font-semibold text-cf-text-secondary">
                {generatedStatusLabel}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <FactSummaryCard
                title="Imposto pela Tabela"
                value={
                  showLoadingPlaceholders
                    ? "Carregando..."
                    : summary.estimatedAnnualTax == null
                      ? "—"
                      : formatCurrency(summary.estimatedAnnualTax)
                }
                helper="Sem compensar IRRF"
              />
              <FactSummaryCard
                title="Rendimentos Isentos"
                value={
                  showLoadingPlaceholders ? "Carregando..." : formatCurrency(displayAnnualExemptIncome)
                }
                helper="Ex.: aposentadoria 65+, parcelas isentas e afins"
              />
              <FactSummaryCard
                title="Exclusivos na Fonte"
                value={
                  showLoadingPlaceholders
                    ? "Carregando..."
                    : formatCurrency(displayAnnualExclusiveIncome)
                }
                helper="Ex.: 13º e aplicações"
              />
              <FactSummaryCard
                title="Deduções Legais"
                value={
                  showLoadingPlaceholders ? "Carregando..." : formatCurrency(displayLegalDeductions)
                }
                helper="Médicas e instrução já revisadas"
              />
              <FactSummaryCard
                title="Desconto Simplificado"
                value={
                  showLoadingPlaceholders
                    ? "Carregando..."
                    : formatCurrency(summary.simplifiedDiscountUsed)
                }
                helper="Cap aplicado pelas regras ativas"
              />
              <FactSummaryCard
                title="Documentos"
                value={
                  showLoadingPlaceholders ? "Carregando..." : String(summary.sourceCounts.documents)
                }
                helper="Arquivos vinculados ao exercício"
              />
              <FactSummaryCard
                title="Fatos no Cálculo"
                value={
                  showLoadingPlaceholders ? "Carregando..." : String(obligation.approvedFactsCount)
                }
                helper={
                  showLoadingPlaceholders
                    ? "Separando fatos que entram no cálculo oficial"
                    : excludedApprovedFactsCount > 0
                    ? `${excludedApprovedFactsCount} aprovado(s) ficaram fora por CPF divergente`
                    : "Base que entra no cálculo e no resumo oficial"
                }
              />
            </div>

            <div className="mt-4 rounded border border-cf-border bg-cf-bg-subtle p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-cf-text-secondary">
                Comparação de regimes
              </h3>
              {showLoadingPlaceholders ? (
                <p className="mt-2 text-sm text-cf-text-secondary">
                  Carregando comparação entre deduções legais e simplificado...
                </p>
              ) : (
                <>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <FactSummaryCard
                      title="Deduções Legais"
                      value={formatCurrency(legalDeductionsBase)}
                      helper={`Base após deduções: ${formatCurrency(displayLegalDeductions)}`}
                    />
                    <FactSummaryCard
                      title="Simplificado"
                      value={formatCurrency(simplifiedDiscountBase)}
                      helper={`Base após desconto: ${formatCurrency(summary.simplifiedDiscountUsed)}`}
                    />
                  </div>
                  <p className="mt-3 text-sm text-cf-text-secondary">
                    Melhor cenário para conferência: <span className="font-semibold text-cf-text-primary">{methodLabel}</span>
                    {summary.estimatedAnnualTax != null
                      ? ` (imposto estimado: ${formatCurrency(summary.estimatedAnnualTax)}).`
                      : ". Gere o resumo para materializar o imposto estimado."}
                  </p>
                </>
              )}
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
                  {showLoadingPlaceholders
                    ? "Carregando..."
                    : formatCurrency(obligation.thresholds.taxableIncome)}
                </p>
              </div>
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-3">
                <p className="text-xs font-semibold uppercase text-cf-text-secondary">Isentos + exclusivos</p>
                <p className="mt-1 text-lg font-bold text-cf-text-primary">
                  {showLoadingPlaceholders
                    ? "Carregando..."
                    : formatCurrency(obligation.thresholds.exemptAndExclusiveIncome)}
                </p>
              </div>
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-3">
                <p className="text-xs font-semibold uppercase text-cf-text-secondary">Patrimônio</p>
                <p className="mt-1 text-lg font-bold text-cf-text-primary">
                  {showLoadingPlaceholders
                    ? "Carregando..."
                    : formatCurrency(obligation.thresholds.assets)}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded border border-cf-border bg-cf-bg-subtle px-3 py-3">
              <p className="text-xs font-semibold uppercase text-cf-text-secondary">Motivos ativos</p>
              {showLoadingPlaceholders ? (
                <p className="mt-2 text-sm text-cf-text-secondary">
                  Carregando gatilhos e fatos revisados do exercício...
                </p>
              ) : obligation.reasons.length === 0 ? (
                <p className="mt-2 text-sm text-cf-text-secondary">
                  Pelos fatos revisados até agora, você continua abaixo dos limites objetivos do exercício.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {obligation.reasons.map((reason) => (
                    <li key={reason.code} className="text-sm text-cf-text-primary">
                      <span className="font-semibold" title={reason.code}>
                        {formatObligationReasonLabel(reason.code)}
                      </span>
                      : {reason.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <section className="mt-4 rounded border border-cf-border bg-cf-surface p-5 print:break-inside-avoid">
          <h2 className="text-lg font-bold text-cf-text-primary">Resumo da declaração em tela</h2>
          <p className="mt-1 text-sm text-cf-text-secondary">
            Blocos fiscais conferíveis para apoiar a decisão antes do snapshot e da exportação oficial.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FactSummaryCard
              title="Rendimentos Tributáveis"
              value={showLoadingPlaceholders ? "Carregando..." : formatCurrency(displayAnnualTaxableIncome)}
            />
            <FactSummaryCard
              title="Rendimentos Isentos"
              value={showLoadingPlaceholders ? "Carregando..." : formatCurrency(displayAnnualExemptIncome)}
            />
            <FactSummaryCard
              title="Exclusivos na Fonte"
              value={showLoadingPlaceholders ? "Carregando..." : formatCurrency(displayAnnualExclusiveIncome)}
            />
            <FactSummaryCard
              title="IR Retido"
              value={showLoadingPlaceholders ? "Carregando..." : formatCurrency(displayAnnualWithheldTax)}
            />
            <FactSummaryCard
              title="Bens Relevantes"
              value={showLoadingPlaceholders ? "Carregando..." : formatCurrency(obligation.totals.totalAssetBalance)}
              helper={
                showLoadingPlaceholders
                  ? ""
                  : pendingAssetBalanceAmount > 0
                    ? `${formatCurrency(pendingAssetBalanceAmount)} ainda em revisão pendente`
                    : "Sem saldo pendente em revisão"
              }
            />
            <FactSummaryCard
              title="Dívidas Relevantes"
              value={showLoadingPlaceholders ? "Carregando..." : formatCurrency(pendingDebtBalanceAmount)}
              helper="Total atual de dívidas ainda pendentes de revisão"
            />
            <FactSummaryCard
              title="Deduções"
              value={showLoadingPlaceholders ? "Carregando..." : formatCurrency(displayLegalDeductions)}
              helper="Deduções legais atualmente consideradas"
            />
            <FactSummaryCard
              title="Pendências"
              value={showLoadingPlaceholders ? "Carregando..." : String(factsPage.total)}
              helper="Itens aguardando revisão humana"
            />
          </div>
        </section>

        <section className="mt-4 rounded border border-cf-border bg-cf-surface p-5 print:break-inside-avoid">
          <h2 className="text-lg font-bold text-cf-text-primary">Painel de pendências de conferência</h2>
          <p className="mt-1 text-sm text-cf-text-secondary">
            Itens operacionais para limpar a fila antes do fechamento fiscal do exercício.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <FactSummaryCard
              title="Aguardando revisão"
              value={showLoadingPlaceholders ? "Carregando..." : String(factsPage.total)}
              helper="Fatos pendentes de decisão humana"
            />
            <FactSummaryCard
              title="Sem documento"
              value={showLoadingPlaceholders ? "Carregando..." : String(pendingNoDocumentCount)}
              helper="Entradas sem arquivo fiscal de origem"
            />
            <FactSummaryCard
              title="Com conflito"
              value={showLoadingPlaceholders ? "Carregando..." : String(pendingConflictCount)}
              helper="Pendências com alerta operacional"
            />
            <FactSummaryCard
              title="Possível duplicidade"
              value={showLoadingPlaceholders ? "Carregando..." : String(pendingDuplicateCount)}
              helper="Fatos sinalizados como potencialmente duplicados"
            />
            <FactSummaryCard
              title="CPF divergente"
              value={showLoadingPlaceholders ? "Carregando..." : String(pendingOwnershipMismatchCount)}
              helper="Titular do informe diferente do CPF cadastrado"
            />
          </div>
        </section>

        {visibleFactWarnings.length > 0 ? (
          <section className="mt-4 rounded border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-lg font-bold text-amber-900">Alertas e observações fiscais</h2>
            <div className="mt-3 space-y-2">
              {visibleFactWarnings.map((warning) => (
                <div
                  key={warning.code}
                  className="rounded border border-amber-200 bg-white/60 px-3 py-2 text-sm text-amber-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span>
                      <span className="font-semibold" title={warning.code}>
                        {formatFactWarningLabel(warning.code)}
                      </span>
                      : {warning.message}
                    </span>
                    {warning.code === "TAXPAYER_CPF_NOT_CONFIGURED" && onOpenProfileSettings ? (
                      <button
                        type="button"
                        onClick={onOpenProfileSettings}
                        className="shrink-0 rounded border border-amber-400 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200"
                      >
                        Configurar CPF
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-4 rounded border border-cf-border bg-cf-surface p-5 print:hidden">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-cf-text-primary">Documentos do exercício</h2>
              <p className="mt-1 text-sm text-cf-text-secondary">
                Últimos arquivos enviados para o exercício {taxYear}. O upload já dispara o processamento automático.
              </p>
              <p className="mt-1 text-sm text-cf-text-secondary">
                {documentsPage.total === 0
                  ? "Sem informe em PDF? Use “Adicionar manualmente” ou “Sincronizar do app” para gerar fatos pendentes a partir das rendas e lançamentos já alimentados."
                  : "Quando já existem documentos fiscais no exercício, a sincronização vinda do app fica bloqueada para evitar mistura entre as trilhas."}
              </p>
            </div>
            <span className="rounded-full border border-cf-border bg-cf-bg-subtle px-2.5 py-1 text-xs font-semibold text-cf-text-secondary">
              {documentsCountLabel}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {isLoadingPage ? (
              <p className="py-4 text-center text-sm text-cf-text-secondary">
                Carregando documentos do exercício...
              </p>
            ) : documentsPage.items.length === 0 ? (
              <p className="py-4 text-center text-sm text-cf-text-secondary">
                Nenhum documento enviado para este exercício ainda.
              </p>
            ) : (
              documentsPage.items.map((document: TaxDocument) => {
                const statusLabel =
                  DOCUMENT_STATUS_LABELS[document.processingStatus] || document.processingStatus;
                const statusClassName =
                  DOCUMENT_STATUS_CLASSNAMES[document.processingStatus] ||
                  "border-cf-border bg-cf-bg-subtle text-cf-text-secondary";
                const documentTypeLabel =
                  DOCUMENT_TYPE_LABELS[document.documentType] || document.documentType;
                const canRetry =
                  document.processingStatus === "failed" ||
                  document.processingStatus === "uploaded";
                const isRetryingDocument = processingDocumentId === document.id;
                const isDeletingDocument = deletingDocumentId === document.id;
                const isDocumentBusy = isRetryingDocument || isDeletingDocument;

                return (
                  <div
                    key={document.id}
                    className="rounded border border-cf-border bg-cf-bg-subtle p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-cf-border bg-cf-surface px-2 py-0.5 text-xs font-semibold text-cf-text-secondary">
                            {documentTypeLabel}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClassName}`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-sm font-semibold text-cf-text-primary">
                          {document.originalFileName}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-cf-text-secondary">
                          <span>
                            Fonte: {document.sourceLabel || "Não informada"}
                          </span>
                          <span>Enviado em {formatDateTime(document.uploadedAt)}</span>
                        </div>
                        {document.sourceHint ? (
                          <p className="mt-2 text-xs text-cf-text-secondary">
                            Observação: {document.sourceHint}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {canRetry ? (
                          <button
                            type="button"
                            onClick={() => void handleRetryDocument(document)}
                            disabled={isDocumentBusy}
                            aria-label={`Tentar novamente ${document.originalFileName}`}
                            className="rounded border border-brand-1 px-3 py-2 text-sm font-semibold text-brand-1 hover:bg-brand-1/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isRetryingDocument ? "Processando..." : "Tentar novamente"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleDeleteDocument(document)}
                          disabled={isDocumentBusy}
                          aria-label={`Excluir ${document.originalFileName}`}
                          className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isDeletingDocument ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

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
              disabled={isBulkApproving || pendingFactsInView === 0}
              className="rounded border border-brand-1 px-3 py-2 text-sm font-semibold text-brand-1 hover:bg-brand-1/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBulkApproving ? "Aprovando..." : "Aprovar todos pendentes"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cf-text-secondary">
                Status de revisão
              </span>
              <select
                value={reviewStatusFilter}
                onChange={(event) =>
                  setReviewStatusFilter(event.target.value as TaxFactReviewStatus | "all")
                }
                className="w-full rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
              >
                {REVIEW_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cf-text-secondary">
                Tipo de fato
              </span>
              <select
                value={factTypeFilter}
                onChange={(event) => setFactTypeFilter(event.target.value)}
                className="w-full rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
              >
                {FACT_TYPE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cf-text-secondary">
                Fonte do fato
              </span>
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as TaxFactSourceFilter | "all")}
                className="w-full rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
              >
                {SOURCE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
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
              helper="Já contam no cálculo e no resumo"
            />
            <FactSummaryCard
              title="Na revisão agora"
              value={String(factsPage.total)}
              helper="Fatos exibidos nesta revisão"
            />
          </div>

          <div className="mt-4 space-y-3">
            {isLoadingPage ? (
              <p className="py-6 text-center text-sm text-cf-text-secondary">
                Carregando fatos da revisão...
              </p>
            ) : factsPage.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-cf-text-secondary">
                Nenhum fato encontrado com os filtros selecionados.
              </p>
            ) : (
              factsPage.items.map((fact) => (
                (() => {
                  const ownerDocument = resolveFactOwnerDocument(fact);
                  const hasTaxpayerCpf = Boolean(taxpayerCpf);
                  const hasOwnerDocument = Boolean(ownerDocument);
                  const isPendingFact = fact.reviewStatus === "pending";
                  const ownershipMismatch =
                    hasTaxpayerCpf &&
                    hasOwnerDocument &&
                    normalizeDocumentNumber(taxpayerCpf) !== ownerDocument;
                  const reviewStatusLabel =
                    REVIEW_STATUS_LABELS[fact.reviewStatus] || humanizeTaxIdentifier(fact.reviewStatus);
                  const reviewStatusClassName =
                    REVIEW_STATUS_CLASSNAMES[fact.reviewStatus] ||
                    "border-cf-border bg-cf-bg-subtle text-cf-text-secondary";

                  return (
                    <div key={fact.id} className="rounded border border-cf-border bg-cf-bg-subtle p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-cf-border bg-cf-surface px-2 py-0.5 text-xs font-semibold text-cf-text-secondary">
                              {FACT_TYPE_LABELS[fact.factType] || fact.factType}
                            </span>
                            <span className="text-xs text-cf-text-secondary">#{fact.id}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${reviewStatusClassName}`}>
                              {reviewStatusLabel}
                            </span>
                            {fact.conflictCode ? (
                              <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                {formatFactConflictLabel(fact.conflictCode)}
                              </span>
                            ) : null}
                            {ownershipMismatch ? (
                              <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                                CPF divergente
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
                            {fact.subcategory ? (
                              <span title={fact.subcategory}>
                                Subcategoria fiscal: {formatFactSubcategoryLabel(fact.subcategory)}
                              </span>
                            ) : null}
                            {fact.referencePeriod ? (
                              <span title={fact.referencePeriod}>
                                Período de referência: {formatReferencePeriod(fact.referencePeriod)}
                              </span>
                            ) : null}
                            {fact.sourceDocument?.originalFileName ? (
                              <span>Documento: {fact.sourceDocument.originalFileName}</span>
                            ) : null}
                            {hasOwnerDocument ? (
                              <span>Titular do informe: {formatCpf(ownerDocument)}</span>
                            ) : null}
                          </div>
                          {ownershipMismatch ? (
                            <p className="mt-2 text-xs text-red-800">
                              Este fato pertence a um CPF diferente do titular cadastrado ({formatCpf(taxpayerCpf)}). Mesmo aprovado, ele fica fora do cálculo oficial do IRPF até ser corrigido ou rejeitado.
                            </p>
                          ) : null}
                          {fact.conflictMessage ? (
                            <p className="mt-2 text-xs text-amber-800">{fact.conflictMessage}</p>
                          ) : null}
                        </div>

                        {isPendingFact ? (
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
                        ) : (
                          <p className="text-xs font-semibold uppercase tracking-wide text-cf-text-secondary">
                            Fato já revisado
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()
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
                  Ajuste o valor ou a subcategoria antes de marcar este fato como corrigido.
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

      <TaxUploadModal
        isOpen={isUploadModalOpen}
        taxYear={taxYear}
        stage={uploadStage}
        statusMessage={uploadStatusMessage}
        errorMessage={uploadErrorMessage}
        previewDocument={uploadPreviewDocument}
        previewFactCount={uploadPreviewFactCount}
        onClose={handleCloseUploadModal}
        onSubmit={handleUploadDocument}
        onConfirmPreview={handleConfirmUploadPreview}
      />
      <TaxManualFactModal
        isOpen={isManualFactModalOpen}
        taxYear={taxYear}
        isSubmitting={isCreatingManualFact}
        errorMessage={manualFactErrorMessage}
        onClose={handleCloseManualFactModal}
        onSubmit={handleCreateManualFact}
      />
    </div>
  );
};

export default TaxPage;
