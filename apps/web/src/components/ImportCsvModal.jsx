import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { transactionsService } from "../services/transactions.service";
import { profileService } from "../services/profile.service";
import { salaryService } from "../services/salary.service";
import { forecastService } from "../services/forecast.service";
import { categoriesService } from "../services/categories.service";
import { formatCurrency } from "../utils/formatCurrency";
import { getApiErrorMessage } from "../utils/apiError";
import BillModal from "./BillModal";
import IncomeStatementQuickModal from "./IncomeStatementQuickModal";
import ConfirmDialog from "./ConfirmDialog";

const PREVIEW_PAGE_SIZE = 100;
const SALARY_PROFILE_UPDATED_EVENT = "salary-profile-updated";
const buildProfileSuggestionKey = (suggestion) =>
  [
    suggestion?.line ?? "",
    suggestion?.referenceMonth ?? "",
    suggestion?.paymentDate ?? "",
  ].join("|");

const getProfileSuggestionRank = (suggestion) => {
  if (suggestion?.paymentDate) {
    const paymentTimestamp = Date.parse(`${suggestion.paymentDate}T00:00:00Z`);
    if (Number.isFinite(paymentTimestamp)) {
      return paymentTimestamp;
    }
  }

  if (suggestion?.referenceMonth) {
    const monthTimestamp = Date.parse(`${suggestion.referenceMonth}-01T00:00:00Z`);
    if (Number.isFinite(monthTimestamp)) {
      return monthTimestamp;
    }
  }

  return 0;
};

const getCurrentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const formatReferenceMonth = (value) => {
  const [year, month] = String(value || "").split("-");
  if (year && month) {
    return `${month}/${year}`;
  }
  return String(value || "");
};

const formatIsoDate = (value) => {
  const [year, month, day] = String(value || "").split("-");
  if (year && month && day) {
    return `${day}/${month}/${year}`;
  }
  return String(value || "");
};

const getPreviewStatusLabel = (status) => {
  switch (status) {
    case "valid":
      return "Pronta";
    case "duplicate":
      return "Já existente";
    case "conflict":
      return "Revisar";
    default:
      return "Inválida";
  }
};

const getPreviewStatusDetail = (row) => {
  if (!row) {
    return "";
  }

  if (row.conflict?.type === "income_statement") {
    const sourceName = row.conflict.sourceName || "Histórico de renda";
    const referenceMonth = row.conflict.referenceMonth
      ? `, competência ${formatReferenceMonth(row.conflict.referenceMonth)}`
      : "";
    const paymentDate = row.conflict.paymentDate
      ? `, pagamento em ${formatIsoDate(row.conflict.paymentDate)}`
      : "";
    return `Esta renda já existe no histórico: ${sourceName}${referenceMonth}${paymentDate}.`;
  }

  if (row.status === "duplicate") {
    return "Já existe um lançamento equivalente com esses dados.";
  }

  if (row.status === "conflict") {
    return row.statusDetail || "Este item precisa de revisão antes de ser importado.";
  }

  if (row.status === "invalid") {
    return row.statusDetail || "Não foi possível entender esta linha com segurança.";
  }

  return row.statusDetail || "";
};

const getProfileSuggestionTiming = (suggestion) => {
  const effectiveMonth = suggestion?.paymentDate?.slice(0, 7) || suggestion?.referenceMonth || "";
  if (!effectiveMonth) {
    return null;
  }

  const currentMonth = getCurrentMonthValue();
  if (effectiveMonth < currentMonth) {
    return { label: "Passado", className: "border-slate-300 bg-slate-100 text-slate-700" };
  }
  if (effectiveMonth > currentMonth) {
    return { label: "Futuro", className: "border-amber-300 bg-amber-100 text-amber-700" };
  }

  return { label: "Entra neste mês", className: "border-green-300 bg-green-100 text-green-700" };
};

const ImportCsvModal = ({
  isOpen,
  onClose,
  onImported = undefined,
  onOpenHistory = undefined,
  onDataChanged = undefined,
}) => {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showProfileConfirm, setShowProfileConfirm] = useState(false);
  const [isApplyingProfile, setIsApplyingProfile] = useState(false);
  const [profileApplied, setProfileApplied] = useState(false);
  const [profileSuggestionDismissed, setProfileSuggestionDismissed] = useState(false);
  const [planningUpdateError, setPlanningUpdateError] = useState("");
  const [categories, setCategories] = useState([]);
  // categoryOverrides: Record<line, categoryId | null>
  const [categoryOverrides, setCategoryOverrides] = useState({});
  // inlineCreate: { line, type } | null — which row's inline form is open
  const [inlineCreate, setInlineCreate] = useState(null);
  const [inlineCreateName, setInlineCreateName] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  // post-commit state
  const [lastCommitResult, setLastCommitResult] = useState(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  // bill bridge
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [billCreated, setBillCreated] = useState(false);
  // income statement bridge
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [incomeStatementCreated, setIncomeStatementCreated] = useState(false);
  const [selectedProfileSuggestionKey, setSelectedProfileSuggestionKey] = useState("");
  // batch category
  const [selectedPreviewLines, setSelectedPreviewLines] = useState(new Set());
  const [batchCategoryId, setBatchCategoryId] = useState("");
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewStatusFilter, setPreviewStatusFilter] = useState("all");
  const [previewTypeFilter, setPreviewTypeFilter] = useState("all");
  const [previewCategoryFilter, setPreviewCategoryFilter] = useState("all");
  const [previewVisibleCount, setPreviewVisibleCount] = useState(PREVIEW_PAGE_SIZE);
  const [importRules, setImportRules] = useState([]);
  const [isSavingImportRule, setIsSavingImportRule] = useState(false);
  const [deletingImportRuleId, setDeletingImportRuleId] = useState(null);
  const [ruleFeedback, setRuleFeedback] = useState(null);
  const deferredPreviewSearch = useDeferredValue(previewSearch);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setSelectedFile(null);
    setIsDryRunning(false);
    setIsCommitting(false);
    setDryRunResult(null);
    setErrorMessage("");
    setSuccessMessage("");
    setShowProfileConfirm(false);
    setIsApplyingProfile(false);
    setProfileApplied(false);
    setProfileSuggestionDismissed(false);
    setPlanningUpdateError("");
    setCategoryOverrides({});
    setInlineCreate(null);
    setInlineCreateName("");
    setLastCommitResult(null);
    setIsUndoing(false);
    setShowUndoConfirm(false);
    setIsBillModalOpen(false);
    setBillCreated(false);
    setIsIncomeModalOpen(false);
    setIncomeStatementCreated(false);
    setSelectedProfileSuggestionKey("");
    setSelectedPreviewLines(new Set());
    setBatchCategoryId("");
    setPreviewSearch("");
    setPreviewStatusFilter("all");
    setPreviewTypeFilter("all");
    setPreviewCategoryFilter("all");
    setPreviewVisibleCount(PREVIEW_PAGE_SIZE);
    setImportRules([]);
    setIsSavingImportRule(false);
    setDeletingImportRuleId(null);
    setRuleFeedback(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fileInputRef.current?.focus();

    const handleEscapeKey = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscapeKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscapeKey);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    categoriesService.listCategories().then(setCategories).catch(() => {});
    transactionsService.listImportCategoryRules().then(setImportRules).catch(() => {});
  }, [isOpen]);

  const hasValidRows = useMemo(() => {
    return (dryRunResult?.summary?.validRows || 0) > 0;
  }, [dryRunResult]);

  const hasDuplicates = useMemo(() => {
    return (dryRunResult?.summary?.duplicateRows || 0) > 0;
  }, [dryRunResult]);

  const hasConflicts = useMemo(() => {
    return (dryRunResult?.summary?.conflictRows || 0) > 0;
  }, [dryRunResult]);

  const documentTypeBadge = useMemo(() => {
      switch (dryRunResult?.documentType) {
        case "bank_statement":
          return { label: "Extrato bancário", className: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-400" };
        case "income_statement_inss":
          return { label: "Comprovante INSS", className: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/40 dark:text-purple-400" };
        case "income_statement_payroll":
          return { label: "Holerite / CLT", className: "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" };
        case "utility_bill_energy":
          return { label: "Conta de energia", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400" };
        case "utility_bill_water":
          return { label: "Conta de água", className: "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400" };
        case "utility_bill_telecom":
          return { label: "Conta de internet/telefone/TV", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" };
        default:
        return null;
    }
  }, [dryRunResult]);

  const isUtilityBill = useMemo(() => {
    return (
      dryRunResult?.documentType === "utility_bill_energy" ||
      dryRunResult?.documentType === "utility_bill_water" ||
      dryRunResult?.documentType === "utility_bill_telecom"
    );
  }, [dryRunResult]);

  const profileSuggestions = useMemo(() => {
    const suggestionsFromResponse = Array.isArray(dryRunResult?.suggestions)
      ? dryRunResult.suggestions
      : [];
    const fallbackSuggestion =
      dryRunResult?.suggestion?.type === "profile" ? [dryRunResult.suggestion] : [];

    const candidates = (suggestionsFromResponse.length > 0
      ? suggestionsFromResponse
      : fallbackSuggestion).filter((suggestion) => suggestion?.type === "profile");

    return [...candidates].sort(
      (left, right) => getProfileSuggestionRank(right) - getProfileSuggestionRank(left),
    );
  }, [dryRunResult]);

  useEffect(() => {
    if (profileSuggestions.length === 0) {
      setSelectedProfileSuggestionKey("");
      return;
    }

    setSelectedProfileSuggestionKey((current) => {
      if (
        current &&
        profileSuggestions.some((suggestion) => buildProfileSuggestionKey(suggestion) === current)
      ) {
        return current;
      }

      return buildProfileSuggestionKey(profileSuggestions[0]);
    });
  }, [profileSuggestions]);

  const selectedProfileSuggestion = useMemo(() => {
    if (profileSuggestions.length === 0) return null;
    return profileSuggestions.find(
      (suggestion) => buildProfileSuggestionKey(suggestion) === selectedProfileSuggestionKey,
    ) ?? profileSuggestions[0];
  }, [profileSuggestions, selectedProfileSuggestionKey]);

  const selectedBillSuggestion = useMemo(() => {
    if (dryRunResult?.suggestion?.type === "bill") {
      return dryRunResult.suggestion;
    }
    return null;
  }, [dryRunResult]);

  const suggestionCard = useMemo(() => {
    const suggestion = selectedProfileSuggestion ?? selectedBillSuggestion;
    if (!suggestion) return null;

    if (suggestion.type === "profile") {
      const lines = [];
      if (suggestion.profileKind === "clt") lines.push("Tipo: Holerite / CLT");
      if (suggestion.profileKind === "inss") lines.push("Tipo: Benefício INSS");
      if (suggestion.employerName) lines.push(`Empresa: ${suggestion.employerName}`);
      if (suggestion.referenceMonth) lines.push(`Competência: ${suggestion.referenceMonth}`);
      if (suggestion.paymentDate) lines.push(`Pagamento: ${suggestion.paymentDate}`);
      const timing = getProfileSuggestionTiming(suggestion);
      if (timing) lines.push(`Status: ${timing.label}`);
      if (suggestion.netAmount != null) lines.push(`Líquido: R$ ${suggestion.netAmount.toFixed(2).replace(".", ",")}`);
      if (suggestion.grossAmount != null) {
        lines.push(
          `${suggestion.profileKind === "inss" ? "Bruto (MR)" : "Bruto"}: R$ ${suggestion.grossAmount.toFixed(2).replace(".", ",")}`,
        );
      }
      if (suggestion.benefitKind) lines.push(`Espécie: ${suggestion.benefitKind}`);
      if (Array.isArray(suggestion.deductions) && suggestion.deductions.length > 0) {
        lines.push(
          `${suggestion.deductions.length} desconto(s) reconhecido(s) para esta competência.`,
        );
      }
      return { kind: "profile", lines };
    }

    if (suggestion.type === "bill") {
      const lines = [];
      if (suggestion.issuer) lines.push(`Emissor: ${suggestion.issuer}`);
      if (suggestion.referenceMonth) lines.push(`Referência: ${suggestion.referenceMonth}`);
      if (suggestion.dueDate) lines.push(`Vencimento: ${suggestion.dueDate}`);
      if (suggestion.amountDue != null) lines.push(`Total a pagar: R$ ${suggestion.amountDue.toFixed(2).replace(".", ",")}`);
      if (suggestion.customerCode) lines.push(`Código: ${suggestion.customerCode}`);
      return { kind: "bill", lines };
    }

    return null;
  }, [selectedBillSuggestion, selectedProfileSuggestion]);

  const profilePatch = useMemo(() => {
    const suggestion = selectedProfileSuggestion;
    if (suggestion?.type !== "profile") return null;
    const patch = {};
    if (suggestion.netAmount != null) patch.salary_monthly = suggestion.netAmount;
    if (suggestion.paymentDate) {
      const day = new Date(`${suggestion.paymentDate}T12:00:00Z`).getUTCDate();
      if (day >= 1 && day <= 31) patch.payday = day;
    }
    return Object.keys(patch).length > 0 ? patch : null;
  }, [selectedProfileSuggestion]);

  const billPrefill = useMemo(() => {
    const suggestion = selectedBillSuggestion;
    if (suggestion?.type !== "bill") return null;
    const typeLabelMap = {
      energy: "Conta de energia",
      water: "Conta de água",
      internet: "Conta de internet",
      phone: "Conta de telefone",
      tv: "Conta de TV",
      gas: "Conta de gás",
    };
    const typeLabel = typeLabelMap[suggestion.billType] || "Conta";
    const title = suggestion.issuer ? `${typeLabel} — ${suggestion.issuer}` : typeLabel;
    return {
      title,
      amount: suggestion.amountDue ?? undefined,
      dueDate: suggestion.dueDate ?? undefined,
      referenceMonth: suggestion.referenceMonth ?? undefined,
      billType: suggestion.billType ?? undefined,
      sourceImportSessionId: dryRunResult?.importId ?? undefined,
    };
  }, [dryRunResult, selectedBillSuggestion]);

  const incomePrefill = useMemo(() => {
    const suggestion = selectedProfileSuggestion;
    if (suggestion?.type !== "profile") return null;
    const details = {};
    if (suggestion.profileKind) details.profileKind = suggestion.profileKind;
    if (suggestion.employerName) details.employerName = suggestion.employerName;
    if (suggestion.benefitKind) details.benefitKind = suggestion.benefitKind;
    if (suggestion.benefitId) details.benefitId = suggestion.benefitId;
    if (suggestion.taxpayerCpf) details.taxpayerCpf = suggestion.taxpayerCpf;
    if (suggestion.birthYear != null) details.birthYear = suggestion.birthYear;
    return {
      referenceMonth: suggestion.referenceMonth ?? undefined,
      netAmount: suggestion.netAmount ?? undefined,
      paymentDate: suggestion.paymentDate ?? undefined,
      grossAmount: suggestion.grossAmount ?? null,
      deductions: Array.isArray(suggestion.deductions) ? suggestion.deductions : [],
      details: Object.keys(details).length > 0 ? details : null,
      sourceImportSessionId: dryRunResult?.importId ?? undefined,
    };
  }, [dryRunResult, selectedProfileSuggestion]);

  // First Entrada transaction created by the last commit — used for auto-link
  const incomeTransactionId = useMemo(() => {
    const txs = lastCommitResult?.createdTransactions;
    if (!Array.isArray(txs)) return null;
    if (selectedProfileSuggestion?.line != null) {
      const byLine = txs.find(
        (tx) => tx.type === "Entrada" && Number(tx.line) === Number(selectedProfileSuggestion.line),
      );
      if (byLine) {
        return byLine.id;
      }
    }
    if (selectedProfileSuggestion?.paymentDate) {
      const byDate = txs.find(
        (tx) => tx.type === "Entrada" && tx.date === selectedProfileSuggestion.paymentDate,
      );
      if (byDate) {
        return byDate.id;
      }
    }
    return txs.find((tx) => tx.type === "Entrada")?.id ?? null;
  }, [lastCommitResult, selectedProfileSuggestion]);


  const handleApplyProfile = async () => {
    if (!profilePatch) return;
    setIsApplyingProfile(true);
    setErrorMessage("");
    setPlanningUpdateError("");
    let benefitProfileSynced = false;
    try {
      if (
        selectedProfileSuggestion?.type === "profile" &&
        selectedProfileSuggestion.profileKind === "inss" &&
        selectedProfileSuggestion.grossAmount != null &&
        profilePatch.payday != null
      ) {
        await salaryService.syncImportedBenefitProfile({
          gross_salary: selectedProfileSuggestion.grossAmount,
          payment_day: profilePatch.payday,
          birth_year: selectedProfileSuggestion.birthYear ?? null,
          reference_month: selectedProfileSuggestion.referenceMonth ?? null,
          payment_date: selectedProfileSuggestion.paymentDate ?? null,
          consignacoes: Array.isArray(selectedProfileSuggestion.deductions)
            ? selectedProfileSuggestion.deductions.map((deduction) => ({
                description: `${deduction.code ? `${deduction.code} ` : ""}${deduction.label}`.trim(),
                amount: deduction.amount,
                consignacao_type: deduction.consignacaoType ?? "other",
              }))
            : [],
        });
        benefitProfileSynced = true;
      }

      await profileService.updateProfile(profilePatch);
      try {
        await forecastService.recompute({
          feature: "forecast",
          widget: "import-csv-modal",
          operation: "apply-profile-recompute",
        });
      } catch (forecastError) {
        setPlanningUpdateError(
          getApiErrorMessage(
            forecastError,
            "Perfil atualizado, mas não foi possível atualizar o planejamento agora.",
          ),
        );
      }
      setProfileApplied(true);
      setProfileSuggestionDismissed(false);
      if (benefitProfileSynced && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(SALARY_PROFILE_UPDATED_EVENT));
      }
    } catch (error) {
      if (benefitProfileSynced && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(SALARY_PROFILE_UPDATED_EVENT));
      }
      setErrorMessage(
        getApiErrorMessage(
          error,
          benefitProfileSynced
            ? "Benefício líquido sincronizado, mas não foi possível atualizar o perfil."
            : "Não foi possível atualizar o perfil.",
        ),
      );
    } finally {
      setIsApplyingProfile(false);
      setShowProfileConfirm(false);
    }
  };

  const resolvePreviewCategoryMeta = useCallback((row) => {
    const categoryId =
      categoryOverrides[row.line] !== undefined
        ? categoryOverrides[row.line]
        : row.normalized?.categoryId ?? null;

    if (categoryId == null) {
      return { categoryId: null, categoryLabel: "Sem categoria" };
    }

    const match = categories.find((cat) => Number(cat.id) === Number(categoryId));
    return {
      categoryId,
      categoryLabel: match?.name ?? row.raw.category ?? `Categoria ${categoryId}`,
    };
  }, [categories, categoryOverrides]);

  const filteredPreviewRows = useMemo(() => {
    const rows = dryRunResult?.rows ?? [];
    const normalizedSearch = deferredPreviewSearch.trim().toLowerCase();

    return rows.filter((row) => {
      if (previewStatusFilter !== "all" && row.status !== previewStatusFilter) {
        return false;
      }

      if (previewTypeFilter !== "all" && row.raw.type !== previewTypeFilter) {
        return false;
      }

      const { categoryId, categoryLabel } = resolvePreviewCategoryMeta(row);
      if (previewCategoryFilter === "categorized" && categoryId == null) {
        return false;
      }
      if (previewCategoryFilter === "uncategorized" && categoryId != null) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableFields = [
        row.raw.description,
        row.raw.notes,
        row.raw.category,
        row.raw.type,
        row.raw.date,
        row.raw.value,
        row.status,
        row.statusDetail,
        categoryLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableFields.includes(normalizedSearch);
    });
  }, [
    deferredPreviewSearch,
    dryRunResult,
    previewCategoryFilter,
    previewStatusFilter,
    previewTypeFilter,
    resolvePreviewCategoryMeta,
  ]);

  useEffect(() => {
    setPreviewVisibleCount(PREVIEW_PAGE_SIZE);
  }, [dryRunResult, deferredPreviewSearch, previewCategoryFilter, previewStatusFilter, previewTypeFilter]);

  const renderedPreviewRows = useMemo(
    () => filteredPreviewRows.slice(0, previewVisibleCount),
    [filteredPreviewRows, previewVisibleCount],
  );

  const hasHiddenPreviewRows = renderedPreviewRows.length < filteredPreviewRows.length;

  const validPreviewLines = useMemo(
    () => renderedPreviewRows.filter((r) => r.status === "valid").map((r) => r.line),
    [renderedPreviewRows],
  );

  const selectedPreviewRows = useMemo(
    () =>
      (dryRunResult?.rows ?? []).filter(
        (row) => row.status === "valid" && selectedPreviewLines.has(row.line),
      ),
    [dryRunResult, selectedPreviewLines],
  );

  const importRuleMatchText = useMemo(() => {
    const searchTerm = previewSearch.trim();

    if (searchTerm.length >= 2) {
      return searchTerm;
    }

    if (selectedPreviewRows.length === 1) {
      return String(selectedPreviewRows[0]?.raw?.description || "").trim();
    }

    return "";
  }, [previewSearch, selectedPreviewRows]);

  const importRuleTransactionType = useMemo(() => {
    if (previewTypeFilter === "Entrada" || previewTypeFilter === "Saida") {
      return previewTypeFilter;
    }

    const selectedTypes = [...new Set(selectedPreviewRows.map((row) => row.raw.type).filter(Boolean))];
    return selectedTypes.length === 1 ? selectedTypes[0] : null;
  }, [previewTypeFilter, selectedPreviewRows]);

  const canSaveImportRule =
    batchCategoryId !== "" && importRuleMatchText.length >= 2 && selectedPreviewRows.length > 0;

  const allVisibleValidSelected = useMemo(
    () =>
      validPreviewLines.length > 0 && validPreviewLines.every((line) => selectedPreviewLines.has(line)),
    [selectedPreviewLines, validPreviewLines],
  );

  const handleShowMorePreviewRows = () => {
    setPreviewVisibleCount((current) =>
      Math.min(current + PREVIEW_PAGE_SIZE, filteredPreviewRows.length),
    );
  };

  const handleShowAllPreviewRows = () => {
    setPreviewVisibleCount(filteredPreviewRows.length);
  };

  const togglePreviewLine = (line) => {
    setSelectedPreviewLines((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line); else next.add(line);
      return next;
    });
  };

  const toggleSelectAllPreview = () => {
    setSelectedPreviewLines((prev) => {
      const next = new Set(prev);
      if (allVisibleValidSelected) {
        validPreviewLines.forEach((line) => next.delete(line));
      } else {
        validPreviewLines.forEach((line) => next.add(line));
      }
      return next;
    });
  };

  const applyBatchCategorySelection = useCallback(
    (lines = [...selectedPreviewLines], categoryValue = batchCategoryId) => {
      if (!Array.isArray(lines) || lines.length === 0) return;
      const val = categoryValue === "" ? null : Number(categoryValue);
      setCategoryOverrides((prev) => {
        const next = { ...prev };
        lines.forEach((line) => {
          next[line] = val;
        });
        return next;
      });
      setSelectedPreviewLines(new Set());
      setBatchCategoryId("");
    },
    [batchCategoryId, selectedPreviewLines],
  );

  const handleApplyBatchCategory = () => {
    applyBatchCategorySelection([...selectedPreviewLines], batchCategoryId);
  };

  const handleApplyBatchCategoryAndSaveRule = useCallback(async () => {
    const selectedLines = [...selectedPreviewLines];

    if (!canSaveImportRule || selectedLines.length === 0) {
      return;
    }

    const categoryId = Number(batchCategoryId);
    applyBatchCategorySelection(selectedLines, batchCategoryId);
    setRuleFeedback(null);
    setIsSavingImportRule(true);

    try {
      const savedRule = await transactionsService.createImportCategoryRule({
        matchText: importRuleMatchText,
        categoryId,
        transactionType: importRuleTransactionType || undefined,
      });
      setImportRules((prev) => [savedRule, ...prev.filter((rule) => rule.id !== savedRule.id)]);
      setRuleFeedback({
        type: "success",
        message: `Regra salva para "${savedRule.matchText}".`,
      });
    } catch (error) {
      setRuleFeedback({
        type: "error",
        message: getApiErrorMessage(error, "Não foi possível salvar a regra."),
      });
    } finally {
      setIsSavingImportRule(false);
    }
  }, [
    applyBatchCategorySelection,
    batchCategoryId,
    canSaveImportRule,
    importRuleMatchText,
    importRuleTransactionType,
    selectedPreviewLines,
  ]);

  const handleDeleteImportRule = useCallback(async (ruleId) => {
    setDeletingImportRuleId(ruleId);
    setRuleFeedback(null);

    try {
      await transactionsService.deleteImportCategoryRule(ruleId);
      setImportRules((prev) => prev.filter((rule) => rule.id !== ruleId));
      setRuleFeedback({
        type: "success",
        message: "Regra removida com sucesso.",
      });
    } catch (error) {
      setRuleFeedback({
        type: "error",
        message: getApiErrorMessage(error, "Não foi possível remover a regra."),
      });
    } finally {
      setDeletingImportRuleId(null);
    }
  }, []);

  const handleInlineCreateCategory = useCallback(
    async (line, rowType) => {
      const trimmedName = inlineCreateName.trim();
      if (!trimmedName) return;
      setIsCreatingCategory(true);
      try {
        const inferredType = rowType === "Entrada" ? "income" : rowType === "Saida" ? "expense" : undefined;
        const created = await categoriesService.createCategory(trimmedName, inferredType);
        setCategories((prev) => [...prev, created]);
        setCategoryOverrides((prev) => ({ ...prev, [line]: created.id }));
        setInlineCreate(null);
        setInlineCreateName("");
      } catch {
        // silently fail — user can try again
      } finally {
        setIsCreatingCategory(false);
      }
    },
    [inlineCreateName],
  );

  const selectedRuleCategory = categories.find((category) => Number(category.id) === Number(batchCategoryId));
  const importRuleHelpText = importRuleMatchText
    ? `A regra usara "${importRuleMatchText}"${importRuleTransactionType ? ` em ${importRuleTransactionType.toLowerCase()}` : ""}.`
    : "Use a busca atual ou selecione uma unica linha para salvar uma regra reutilizavel.";

  const handleDryRun = async () => {
    if (!selectedFile) {
      setErrorMessage("Selecione um arquivo CSV, OFX ou PDF.");
      setSuccessMessage("");
      return;
    }

    setIsDryRunning(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const result = await transactionsService.dryRunImportCsv(selectedFile);
      setDryRunResult(result);
    } catch (error) {
      setDryRunResult(null);
      setErrorMessage(getApiErrorMessage(error, "Não foi possível processar o arquivo do extrato."));
    } finally {
      setIsDryRunning(false);
    }
  };

  const handleCommit = async () => {
    if (!dryRunResult?.importId) {
      setErrorMessage("Rode a pré-visualização antes de importar.");
      return;
    }

    if (!hasValidRows) {
      setErrorMessage("Não há linhas válidas para importar.");
      return;
    }

    setIsCommitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const overridesArray = Object.entries(categoryOverrides).map(([line, categoryId]) => ({
        line: Number(line),
        categoryId: categoryId ?? null,
      }));
      const commitResult = await transactionsService.commitImportCsv(dryRunResult.importId, overridesArray);
      setLastCommitResult(commitResult);
      if (onDataChanged) {
        await onDataChanged(commitResult);
      }
    } catch (error) {
      const apiMessage = getApiErrorMessage(error, "Não foi possível confirmar a importação.");
      setErrorMessage(
        apiMessage === "Sessão de importação expirada."
          ? "Sessão de importação expirada. Rode a pré-visualização novamente."
          : apiMessage,
      );
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCloseAfterCommit = async () => {
    if (onImported) await onImported(lastCommitResult);
    else onClose();
  };

  const handleOpenHistoryAfterCommit = async () => {
    if (onImported) {
      await onImported(lastCommitResult);
    }

    if (onOpenHistory) {
      await onOpenHistory(lastCommitResult);
      return;
    }

    onClose();
  };

  const handleUndo = async () => {
    if (!lastCommitResult?.importSessionId) return;
    setIsUndoing(true);
    setErrorMessage("");
    setShowUndoConfirm(false);
    try {
      await transactionsService.deleteImportSession(lastCommitResult.importSessionId);
      if (onImported) await onImported(null);
      else onClose();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Não foi possível desfazer a importação."));
      setIsUndoing(false);
    }
  };

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-2 sm:p-6"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          className="flex w-full max-w-4xl max-h-[min(92vh,1080px)] flex-col overflow-hidden rounded-lg border border-cf-border bg-cf-surface shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-csv-modal-title"
          data-testid="import-csv-modal-shell"
        >
          <div className="border-b border-cf-border px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="import-csv-modal-title" className="text-lg font-semibold text-cf-text-primary">
                  Importar extrato
                </h2>
                <p className="mt-1 text-sm text-cf-text-secondary">
                  Revise o arquivo, resolva conflitos e confirme o que entra no seu painel antes de importar.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-ui-200 transition-colors hover:text-ui-100"
                aria-label="Fechar modal de importação de extrato"
              >
                X
              </button>
            </div>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
            data-testid="import-csv-modal-body"
          >
          <p className="mb-4 text-sm text-cf-text-secondary">
            Envie um CSV, OFX ou PDF para revisar, categorizar e confirmar o que entra no seu painel financeiro antes de importar.
          </p>

          <div className="rounded border border-cf-border bg-cf-surface p-3">
            <label
              htmlFor="csv-file-input"
              className="mb-1 block text-sm font-medium text-cf-text-primary"
            >
              Arquivo do extrato
            </label>
            <input
              ref={fileInputRef}
              id="csv-file-input"
              type="file"
              accept=".csv,.ofx,.pdf,text/csv,application/ofx,application/pdf"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] || null;
                setSelectedFile(nextFile);
                setDryRunResult(null);
                setErrorMessage("");
                setSuccessMessage("");
                setProfileApplied(false);
                setShowProfileConfirm(false);
                setCategoryOverrides({});
                setInlineCreate(null);
                setInlineCreateName("");
                setLastCommitResult(null);
                setShowUndoConfirm(false);
                setSelectedProfileSuggestionKey("");
              }}
              className="block w-full text-sm text-cf-text-primary file:mr-3 file:rounded file:border file:border-cf-border file:bg-cf-bg-subtle file:px-3 file:py-1 file:text-sm file:font-semibold file:text-cf-text-primary hover:file:bg-cf-border"
            />
            <p className="mt-2 text-xs text-cf-text-secondary">
              OFX é o formato preferencial quando o banco oferecer. CSV manual, CSV do banco e PDF com OCR assistido entram como alternativas.
            </p>
            <p className="mt-1 text-xs text-cf-text-secondary">
              Use a pré-visualização para conferir categorias, renda e pendências antes de confirmar a importação.
            </p>
            <p className="mt-1 text-xs text-cf-text-secondary">
              Quando possível, a plataforma sugere automaticamente categorias com base nas descrições e nas categorias já cadastradas.
            </p>
          </div>

          {lastCommitResult ? (
            <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-3 dark:border-green-800 dark:bg-green-950/40">
              <p className="mb-2 text-sm font-semibold text-green-700 dark:text-green-400">
                {lastCommitResult.imported === 1
                  ? "1 lançamento importado."
                  : `${lastCommitResult.imported} lançamentos importados.`}
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded border border-green-200 bg-white px-3 py-2 text-xs text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
                  <p className="font-semibold uppercase">Entradas</p>
                  <p>{formatCurrency(lastCommitResult.summary?.income || 0)}</p>
                </div>
                <div className="rounded border border-green-200 bg-white px-3 py-2 text-xs text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
                  <p className="font-semibold uppercase">Saídas</p>
                  <p>{formatCurrency(lastCommitResult.summary?.expense || 0)}</p>
                </div>
                <div className="rounded border border-green-200 bg-white px-3 py-2 text-xs text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
                  <p className="font-semibold uppercase">Saldo</p>
                  <p>{formatCurrency(lastCommitResult.summary?.balance || 0)}</p>
                </div>
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {successMessage}
            </div>
          ) : null}

          {dryRunResult ? (
            <div className="mt-4 space-y-3">
            {documentTypeBadge ? (
              <div className="flex items-center gap-2">
                <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${documentTypeBadge.className}`}>
                  {documentTypeBadge.label}
                </span>
              </div>
            ) : null}

            {isUtilityBill ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                Boleto detectado. O suporte completo à importação de contas de energia, água, internet, telefone e TV chegará em breve. Por enquanto, nenhuma transação é extraída.
              </div>
            ) : null}

            {suggestionCard ? (
              <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/40">
                <p className="mb-1 text-xs font-semibold uppercase text-blue-700 dark:text-blue-400">
                  {suggestionCard.kind === "profile" ? "Dados extraídos do comprovante" : "Dados do boleto"}
                </p>
                <ul className="mb-2 space-y-0.5">
                  {suggestionCard.lines.map((line) => (
                    <li key={line} className="text-xs text-blue-700 dark:text-blue-300">{line}</li>
                  ))}
                </ul>
                {suggestionCard.kind === "profile" && profileSuggestions.length > 1 ? (
                  <div className="mb-2 rounded border border-blue-200 bg-white/70 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/20">
                    <p className="mb-2 text-[11px] font-semibold uppercase text-blue-700 dark:text-blue-400">
                      Escolha a competência para usar na renda
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {profileSuggestions.map((suggestion) => {
                        const suggestionKey = buildProfileSuggestionKey(suggestion);
                        const isSelected = suggestionKey === buildProfileSuggestionKey(selectedProfileSuggestion);
                        const timing = getProfileSuggestionTiming(suggestion);

                        return (
                          <button
                            key={suggestionKey}
                            type="button"
                            onClick={() => setSelectedProfileSuggestionKey(suggestionKey)}
                            className={`rounded border px-2 py-1 text-xs font-medium ${
                              isSelected
                                ? "border-blue-500 bg-blue-600 text-white"
                                : "border-blue-200 bg-white text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
                            }`}
                          >
                            <span>{suggestion.referenceMonth || "Sem competência"}</span>
                            {suggestion.paymentDate ? <span>{` · ${suggestion.paymentDate}`}</span> : null}
                            {timing ? (
                              <span
                                className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                                  isSelected ? "border-white/60 bg-white/15 text-white" : timing.className
                                }`}
                              >
                                {timing.label}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {suggestionCard.kind === "profile" && !incomeStatementCreated ? (
                  <p className="mb-2 text-xs text-blue-700 dark:text-blue-300">
                    Depois de usar este documento na sua renda, o app pode sugerir uma atualização
                    do perfil financeiro e do planejamento.
                  </p>
                ) : null}
                {suggestionCard.kind === "profile" && !incomeStatementCreated ? (
                  <button
                    type="button"
                    onClick={() => setIsIncomeModalOpen(true)}
                    className="mt-1 rounded border border-blue-400 bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200 dark:border-blue-600 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/40"
                  >
                    Usar este documento na minha renda
                  </button>
                ) : null}
                {suggestionCard.kind === "profile" &&
                incomeStatementCreated &&
                profilePatch &&
                !profileApplied &&
                !profileSuggestionDismissed ? (
                  showProfileConfirm ? (
                    <div className="mt-2 rounded border border-blue-300 bg-blue-100 px-3 py-2 dark:border-blue-700 dark:bg-blue-900/40">
                      <p className="mb-2 text-xs font-semibold text-blue-800 dark:text-blue-200">
                        Confirmar atualização do perfil e do planejamento?
                      </p>
                      <ul className="mb-3 space-y-0.5">
                        {profilePatch.salary_monthly != null && (
                          <li className="text-xs text-blue-700 dark:text-blue-300">
                            Renda líquida mensal → R$ {profilePatch.salary_monthly.toFixed(2).replace(".", ",")}
                          </li>
                        )}
                        {profilePatch.payday != null && (
                          <li className="text-xs text-blue-700 dark:text-blue-300">
                            Dia de pagamento → dia {profilePatch.payday}
                          </li>
                        )}
                      </ul>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleApplyProfile}
                          disabled={isApplyingProfile}
                          className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {isApplyingProfile ? "Salvando..." : "Confirmar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowProfileConfirm(false)}
                          disabled={isApplyingProfile}
                          className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 disabled:opacity-60"
                        >
                          Revisar depois
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 rounded border border-blue-300 bg-blue-100 px-3 py-2 dark:border-blue-700 dark:bg-blue-900/40">
                      <p className="mb-2 text-xs font-semibold text-blue-800 dark:text-blue-200">
                        Renda estruturada confirmada. Deseja atualizar seu perfil e o planejamento
                        com esses dados?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setShowProfileConfirm(true)}
                          className="rounded border border-blue-400 bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 dark:border-blue-500"
                        >
                          Atualizar perfil e planejamento
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileSuggestionDismissed(true);
                            setShowProfileConfirm(false);
                          }}
                          className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
                        >
                          Ignorar
                        </button>
                      </div>
                    </div>
                  )
                ) : null}
                {suggestionCard.kind === "profile" && profileApplied ? (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                      {selectedProfileSuggestion?.profileKind === "inss"
                        ? "Perfil, planejamento e benefício atualizados com sucesso."
                        : "Perfil e planejamento atualizados com sucesso."}
                    </p>
                    {planningUpdateError ? (
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        {planningUpdateError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {suggestionCard.kind === "profile" && incomeStatementCreated ? (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                      Lancamento registrado no historico de renda.
                    </p>
                    {profileSuggestionDismissed && !profileApplied ? (
                      <p className="text-xs font-medium text-cf-text-secondary">
                        Sugestao de atualizacao ignorada por enquanto.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {suggestionCard.kind === "bill" && !billCreated ? (
                  <button
                    type="button"
                    onClick={() => setIsBillModalOpen(true)}
                    className="mt-1 rounded border border-blue-400 bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200 dark:border-blue-600 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/40"
                  >
                    Criar pendência
                  </button>
                ) : null}
                {suggestionCard.kind === "bill" && billCreated ? (
                  <p className="mt-1 text-xs font-semibold text-green-600 dark:text-green-400">
                    Pendência criada com sucesso.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Total</p>
                <p className="text-sm font-semibold text-cf-text-primary">{dryRunResult.summary.totalRows}</p>
              </div>
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Válidas</p>
                <p className="text-sm font-semibold text-cf-text-primary">{dryRunResult.summary.validRows}</p>
              </div>
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Inválidas</p>
                <p className="text-sm font-semibold text-cf-text-primary">{dryRunResult.summary.invalidRows}</p>
              </div>
              <div className={`rounded border px-3 py-2 ${hasDuplicates ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40" : "border-cf-border bg-cf-bg-subtle"}`}>
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Já existentes</p>
                <p className={`text-sm font-semibold ${hasDuplicates ? "text-red-600 dark:text-red-400" : "text-cf-text-primary"}`}>{dryRunResult.summary.duplicateRows ?? 0}</p>
              </div>
              <div className={`rounded border px-3 py-2 ${hasConflicts ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40" : "border-cf-border bg-cf-bg-subtle"}`}>
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Para revisar</p>
                <p className={`text-sm font-semibold ${hasConflicts ? "text-amber-700 dark:text-amber-400" : "text-cf-text-primary"}`}>{dryRunResult.summary.conflictRows ?? 0}</p>
              </div>
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Entradas</p>
                <p className="text-sm font-semibold text-cf-text-primary">
                  {formatCurrency(dryRunResult.summary.income)}
                </p>
              </div>
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Saídas</p>
                <p className="text-sm font-semibold text-cf-text-primary">
                  {formatCurrency(dryRunResult.summary.expense)}
                </p>
              </div>
            </div>

            <p className="text-xs text-cf-text-secondary">
              Sessão expira em: {dryRunResult.expiresAt || "não informado"}
            </p>

            {dryRunResult.rows.length === 0 ? (
              <div className="rounded border border-cf-border bg-cf-surface px-3 py-2 text-sm text-cf-text-secondary">
                Sem linhas para pré-visualizar.
              </div>
            ) : (
              <>
                <div className="grid gap-2 rounded border border-cf-border bg-cf-surface px-3 py-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="sm:col-span-2 xl:col-span-2">
                    <label
                      className="mb-1 block text-xs font-medium uppercase text-cf-text-secondary"
                      htmlFor="import-preview-search"
                    >
                      Buscar
                    </label>
                    <input
                      id="import-preview-search"
                      type="search"
                      aria-label="Buscar na pré-visualização"
                      value={previewSearch}
                      onChange={(e) => setPreviewSearch(e.target.value)}
                      placeholder="PIX, farmácia, salário..."
                      className="w-full rounded border border-cf-border bg-cf-surface px-2 py-1.5 text-sm text-cf-text-primary"
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium uppercase text-cf-text-secondary"
                      htmlFor="import-preview-status-filter"
                    >
                      Status
                    </label>
                    <select
                      id="import-preview-status-filter"
                      aria-label="Filtrar por status"
                      value={previewStatusFilter}
                      onChange={(e) => setPreviewStatusFilter(e.target.value)}
                      className="w-full rounded border border-cf-border bg-cf-surface px-2 py-1.5 text-sm text-cf-text-primary"
                    >
                      <option value="all">Todos</option>
                      <option value="valid">Válidas</option>
                      <option value="duplicate">Já existentes</option>
                      <option value="conflict">Para revisar</option>
                      <option value="invalid">Inválidas</option>
                    </select>
                  </div>
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium uppercase text-cf-text-secondary"
                      htmlFor="import-preview-type-filter"
                    >
                      Tipo
                    </label>
                    <select
                      id="import-preview-type-filter"
                      aria-label="Filtrar por tipo"
                      value={previewTypeFilter}
                      onChange={(e) => setPreviewTypeFilter(e.target.value)}
                      className="w-full rounded border border-cf-border bg-cf-surface px-2 py-1.5 text-sm text-cf-text-primary"
                    >
                      <option value="all">Todos</option>
                      <option value="Entrada">Entrada</option>
                      <option value="Saida">Saída</option>
                    </select>
                  </div>
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium uppercase text-cf-text-secondary"
                      htmlFor="import-preview-category-filter"
                    >
                      Categoria
                    </label>
                    <select
                      id="import-preview-category-filter"
                      aria-label="Filtrar por categoria"
                      value={previewCategoryFilter}
                      onChange={(e) => setPreviewCategoryFilter(e.target.value)}
                      className="w-full rounded border border-cf-border bg-cf-surface px-2 py-1.5 text-sm text-cf-text-primary"
                    >
                      <option value="all">Todas</option>
                      <option value="categorized">Com categoria</option>
                      <option value="uncategorized">Sem categoria</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2 xl:col-span-5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="text-xs text-cf-text-secondary">
                        {filteredPreviewRows.length} de {dryRunResult.rows.length} linhas visíveis nesta revisão.
                      </p>
                      {hasHiddenPreviewRows ? (
                        <p className="text-xs text-cf-text-secondary">
                          Mostrando {renderedPreviewRows.length} agora para manter a revisão leve.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
                {importRules.length > 0 ? (
                  <div className="rounded border border-cf-border bg-cf-surface px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase text-cf-text-secondary">
                          Regras salvas
                        </p>
                        <p className="text-xs text-cf-text-secondary">
                          Reaplicadas automaticamente nos próximos imports.
                        </p>
                      </div>
                      <span className="text-xs text-cf-text-secondary">
                        {importRules.length} {importRules.length === 1 ? "regra ativa" : "regras ativas"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {importRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex items-start gap-2 rounded border border-cf-border bg-cf-bg-subtle px-2 py-2"
                        >
                          <div>
                            <p className="text-xs font-semibold text-cf-text-primary">
                              {rule.categoryName}
                            </p>
                            <p className="text-xs text-cf-text-secondary">
                              Contem &quot;{rule.matchText}&quot;
                              {rule.transactionType ? ` · ${rule.transactionType}` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteImportRule(rule.id)}
                            disabled={deletingImportRuleId === rule.id}
                            aria-label={`Remover regra ${rule.matchText}`}
                            className="rounded border border-cf-border px-2 py-0.5 text-xs text-cf-text-secondary hover:bg-cf-surface disabled:opacity-60"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {ruleFeedback ? (
                  <div
                    className={`rounded border px-3 py-2 text-xs ${
                      ruleFeedback.type === "error"
                        ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                        : "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
                    }`}
                  >
                    {ruleFeedback.message}
                  </div>
                ) : null}
                {selectedPreviewLines.size > 0 && (
                  <div className="mb-1 flex flex-wrap items-center gap-2 rounded border border-brand-1/40 bg-brand-1/5 px-3 py-2">
                    <span className="text-xs font-medium text-cf-text-primary">
                      {selectedPreviewLines.size} {selectedPreviewLines.size === 1 ? "linha selecionada" : "linhas selecionadas"}
                    </span>
                    <select
                      aria-label="Categoria para aplicar em lote"
                      value={batchCategoryId}
                      onChange={(e) => setBatchCategoryId(e.target.value)}
                      className="rounded border border-cf-border bg-cf-surface px-1 py-0.5 text-xs text-cf-text-primary"
                    >
                      <option value="">— Sem categoria —</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleApplyBatchCategory}
                      className="rounded border border-brand-1 bg-brand-1 px-2 py-0.5 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Aplicar categoria
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyBatchCategoryAndSaveRule}
                      disabled={!canSaveImportRule || isSavingImportRule}
                      className="rounded border border-cf-border px-2 py-0.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-surface disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingImportRule ? "Salvando regra..." : "Aplicar e salvar regra"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPreviewLines(new Set())}
                      className="rounded border border-cf-border px-2 py-0.5 text-xs text-cf-text-secondary hover:bg-cf-bg-subtle"
                    >
                      Cancelar
                    </button>
                    <div className="basis-full text-[11px] text-cf-text-secondary">
                      {importRuleHelpText}
                      {selectedRuleCategory ? ` Categoria alvo: ${selectedRuleCategory.name}.` : ""}
                    </div>
                  </div>
                )}
                {(hasConflicts || hasDuplicates) && (
                  <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                    {hasConflicts && hasDuplicates
                      ? "Há itens já existentes e outros que precisam da sua revisão antes de importar."
                      : hasConflicts
                        ? "Há itens que precisam da sua decisão antes de entrar no painel."
                        : "Alguns itens já existem no histórico e ficaram visíveis aqui só para conferência."}
                  </div>
                )}
                <div className="max-h-80 overflow-auto rounded border border-cf-border">
                  {filteredPreviewRows.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-cf-text-secondary">
                      Nenhum item combina com esta busca. Ajuste os filtros para continuar a revisão.
                    </div>
                  ) : (
                    <>
                      {hasHiddenPreviewRows ? (
                        <div className="border-b border-cf-border bg-cf-bg-subtle px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-cf-text-secondary">
                              Mostrando {renderedPreviewRows.length} de {filteredPreviewRows.length} linhas filtradas.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={handleShowMorePreviewRows}
                                className="rounded border border-cf-border px-2 py-1 text-xs font-medium text-cf-text-primary hover:bg-cf-surface"
                              >
                                Mostrar mais {Math.min(PREVIEW_PAGE_SIZE, filteredPreviewRows.length - renderedPreviewRows.length)}
                              </button>
                              <button
                                type="button"
                                onClick={handleShowAllPreviewRows}
                                className="rounded border border-cf-border px-2 py-1 text-xs text-cf-text-secondary hover:bg-cf-surface"
                              >
                                Mostrar todas
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <table className="min-w-full border-collapse text-left text-xs">
                        <thead className="bg-cf-bg-subtle">
                          <tr>
                            <th className="border-b border-cf-border px-2 py-2">
                              <input
                                type="checkbox"
                                aria-label="Selecionar todas as linhas válidas"
                                checked={allVisibleValidSelected}
                                onChange={toggleSelectAllPreview}
                                className="h-3.5 w-3.5 cursor-pointer accent-brand-1"
                              />
                            </th>
                            <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Linha</th>
                            <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Status</th>
                            <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Descrição</th>
                            <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Valor</th>
                            <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Data</th>
                            <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Categoria</th>
                            <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Observações</th>
                          </tr>
                        </thead>
                        <tbody>
                      {renderedPreviewRows.map((row) => {
                        const statusDetailCopy = getPreviewStatusDetail(row);

                        return (
                        <tr key={`import-row-${row.line}`} className="align-top">
                          <td className="border-b border-cf-border px-2 py-2">
                            {row.status === "valid" ? (
                              <input
                                type="checkbox"
                                aria-label={`Selecionar linha ${row.line}`}
                                checked={selectedPreviewLines.has(row.line)}
                                onChange={() => togglePreviewLine(row.line)}
                                className="h-3.5 w-3.5 cursor-pointer accent-brand-1"
                              />
                            ) : null}
                          </td>
                          <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">{row.line}</td>
                          <td className="border-b border-cf-border px-2 py-2">
                            <span
                              className={`rounded px-2 py-0.5 font-semibold ${
                                row.status === "valid"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                  : row.status === "duplicate"
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                    : row.status === "conflict"
                                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                              }`}
                            >
                              {getPreviewStatusLabel(row.status)}
                            </span>
                            {(row.status === "duplicate" || row.status === "conflict") && statusDetailCopy && (
                              <span className="ml-1.5 text-xs text-cf-text-secondary">{statusDetailCopy}</span>
                            )}
                          </td>
                          <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">
                            {row.raw.description || "-"}
                          </td>
                          <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">
                            {row.raw.value || "-"}
                          </td>
                          <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">{row.raw.date || "-"}</td>
                          <td className="border-b border-cf-border px-2 py-2">
                            {row.status === "valid" ? (
                              <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <select
                                  aria-label={`Categoria da linha ${row.line}`}
                                  value={
                                    categoryOverrides[row.line] !== undefined
                                      ? categoryOverrides[row.line] ?? ""
                                      : row.normalized?.categoryId ?? ""
                                  }
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? null : Number(e.target.value);
                                    setCategoryOverrides((prev) => ({ ...prev, [row.line]: val }));
                                  }}
                                  className="rounded border border-cf-border bg-cf-surface px-1 py-0.5 text-xs text-cf-text-primary"
                                >
                                  <option value="">— Sem categoria —</option>
                                  {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                  ))}
                                </select>
                                {inlineCreate?.line !== row.line && (
                                  <button
                                    type="button"
                                    title="Nova categoria"
                                    onClick={() => { setInlineCreate({ line: row.line, type: row.raw.type }); setInlineCreateName(""); }}
                                    className="rounded border border-cf-border px-1 py-0.5 text-xs text-cf-text-secondary hover:bg-cf-bg-subtle"
                                  >
                                    +
                                  </button>
                                )}
                              </div>
                              {inlineCreate?.line === row.line && (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={inlineCreateName}
                                    onChange={(e) => setInlineCreateName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleInlineCreateCategory(row.line, row.raw.type); if (e.key === "Escape") setInlineCreate(null); }}
                                    placeholder="Nova categoria"
                                    className="rounded border border-cf-border bg-cf-surface px-1 py-0.5 text-xs text-cf-text-primary"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    disabled={isCreatingCategory}
                                    onClick={() => handleInlineCreateCategory(row.line, row.raw.type)}
                                    className="rounded border border-brand-1 bg-brand-1 px-1.5 py-0.5 text-xs text-white disabled:opacity-60"
                                  >
                                    OK
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setInlineCreate(null)}
                                    className="rounded border border-cf-border px-1.5 py-0.5 text-xs text-cf-text-secondary"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                              {!categoryOverrides[row.line] && !row.normalized?.categoryId && inlineCreate?.line !== row.line && (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                                    Revisar
                                  </span>
                                </span>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">
                          {row.errors.length > 0
                            ? row.errors.map((error) => error.message).join(" | ")
                            : statusDetailCopy
                              ? statusDetailCopy
                            : "-"}
                        </td>
                      </tr>
                    );
                    })}
                      </tbody>
                    </table>
                  </>
                  )}
                </div>
              </>
            )}
            </div>
          ) : null}
          </div>

          <div
            className="flex flex-wrap items-center justify-end gap-2 border-t border-cf-border px-4 py-4 sm:px-6"
            data-testid="import-csv-modal-footer"
          >
            {lastCommitResult ? (
              <>
                <button
                  type="button"
                  onClick={handleCloseAfterCommit}
                  disabled={isUndoing}
                  className="rounded border border-green-400 bg-green-100 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-green-700 dark:bg-green-900/40 dark:text-green-300"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleOpenHistoryAfterCommit}
                  disabled={isUndoing}
                  className="rounded border border-cf-border bg-white px-3 py-1.5 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Ver histórico
                </button>
                <button
                  type="button"
                  onClick={() => setShowUndoConfirm(true)}
                  disabled={isUndoing}
                  className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700 dark:bg-red-950/40 dark:text-red-400"
                >
                  {isUndoing ? "Desfazendo..." : "Desfazer importação"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleDryRun}
                  disabled={isDryRunning || isCommitting}
                  className="rounded border border-brand-1 bg-brand-1 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDryRunning ? "Processando..." : "Pré-visualizar"}
                </button>
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={!hasValidRows || isDryRunning || isCommitting}
                  className="rounded border border-cf-border bg-cf-surface px-3 py-1.5 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCommitting ? "Importando..." : "Importar"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-1.5 text-sm font-semibold text-cf-text-secondary"
                >
                  Fechar
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <BillModal
        isOpen={isBillModalOpen}
        onClose={() => setIsBillModalOpen(false)}
        onSaved={() => {
          setIsBillModalOpen(false);
          setBillCreated(true);
        }}
        prefill={billPrefill}
        categories={categories}
      />

      <IncomeStatementQuickModal
        isOpen={isIncomeModalOpen}
        onClose={() => setIsIncomeModalOpen(false)}
        prefill={incomePrefill}
        transactionId={incomeTransactionId}
        defaultComposeIncome
        onCreated={() => {
          setIsIncomeModalOpen(false);
          setIncomeStatementCreated(true);
          if (onDataChanged) {
            void onDataChanged();
          }
        }}
        onIgnored={(statement) => {
          setIsIncomeModalOpen(false);
          setSuccessMessage(
            `Competência ${statement.referenceMonth} já existia e foi ignorada. Nenhum dado foi alterado.`,
          );
        }}
      />

      <ConfirmDialog
        isOpen={showUndoConfirm}
        title="Desfazer esta importação?"
        description="Os lançamentos criados nesta sessão serão removidos e o histórico continuará disponível como registro revertido."
        confirmLabel="Desfazer importação"
        onConfirm={() => void handleUndo()}
        onCancel={() => setShowUndoConfirm(false)}
      />
    </div>
  );
};

ImportCsvModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onImported: PropTypes.func,
  onOpenHistory: PropTypes.func,
  onDataChanged: PropTypes.func,
};

export default ImportCsvModal;
