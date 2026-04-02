import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiErrorMessage } from "../utils/apiError";
import ConfirmDialog from "../components/ConfirmDialog";
import WelcomeCard from "../components/WelcomeCard";
import Modal from "../components/Modal";
import ImportCsvModal from "../components/ImportCsvModal";
import ImportHistoryModal from "../components/ImportHistoryModal";
import UpgradeModal from "../components/UpgradeModal";
import ForecastCard from "../components/ForecastCard";
import FinancialAlertBanner from "../components/FinancialAlertBanner";
import BankAccountsWidget from "../components/BankAccountsWidget";
import BillsSummaryWidget from "../components/BillsSummaryWidget";
import UtilityBillsWidget from "../components/UtilityBillsWidget";
import CreditCardsSummaryWidget from "../components/CreditCardsSummaryWidget";
import SalaryWidget from "../components/SalaryWidget";
import ConsignadoOverviewWidget from "../components/ConsignadoOverviewWidget";
import OperationalSummaryPanel from "../components/OperationalSummaryPanel";
import TransactionList from "../components/TransactionList";
import {
  transactionsService,
  type CategoryOption,
  type MonthlyBudget,
  type MonthlySummaryCompare,
  type MonthlyBudgetStatus,
  type MonthlySummary,
  type Transaction,
  type TransactionType,
} from "../services/transactions.service";
import {
  CATEGORY_ALL,
  CATEGORY_ENTRY,
  CATEGORY_EXIT,
  isValidISODate,
  PERIOD_ALL,
  PERIOD_CUSTOM,
  PERIOD_LAST_30_DAYS,
  PERIOD_LAST_7_DAYS,
  PERIOD_TODAY,
  getTodayISODate,
  normalizeTransactionDate,
} from "../components/DatabaseUtils";
import { analyticsService, type TrendPoint } from "../services/analytics.service";
import { setPaymentRequiredHandler, type PaymentRequiredPayload } from "../services/api";
import { trackActivationEvent } from "../utils/analytics";
import type { PaywallFeature, PaywallContext } from "../utils/analytics";
import {
  useFilters,
  type FilterState,
  type SelectedCategory,
  type SelectedPeriod,
  DEFAULT_SORT,
  SORT_OPTIONS,
  getCurrentMonthRange,
  normalizeSortOption,
  isSelectedPeriod,
} from "../features/filters/useFilters";
import { useTheme } from "../hooks/useTheme";
import { formatCurrency } from "../utils/formatCurrency";
import { useMaskedCurrency } from "../context/DiscreetModeContext";

const TransactionChart = lazy(() => import("../components/TransactionChart"));
const TrendChart = lazy(() => import("../components/TrendChart"));
const CategoryTreemap = lazy(() => import("../components/CategoryTreemap"));
const HealthOverview = lazy(() => import("../components/HealthOverview"));
const GoalsSection = lazy(() => import("../components/GoalsSection"));

type SummaryMetricKey = "income" | "expense" | "balance";
type MonthOverMonthDirection = "up" | "down" | "flat";
type MonthOverMonthTone = "good" | "bad" | "neutral";
type BudgetAlertStatus = Exclude<MonthlyBudgetStatus, "ok">;

interface PaginationState {
  page: number;
  limit: number;
  offset: number;
}

interface PaginationMeta extends PaginationState {
  total: number;
  totalPages: number;
}

interface UndoState {
  transactionId: number;
}

interface BudgetFormState {
  categoryId: string;
  amount: string;
}

interface TransactionWithCategoryName extends Transaction {
  categoryName: string;
}

interface TransactionModalPayload {
  value: number;
  type: TransactionType;
  categoryId: number | null;
  date: string;
  description: string;
  notes: string;
}

interface MonthOverMonthMetric {
  delta: number;
  deltaPercent: number | null;
  direction: MonthOverMonthDirection;
  tone: MonthOverMonthTone;
}

interface AppProps {
  onLogout?: () => void;
  onOpenBills?: (filter?: "due_soon") => void;
  onOpenCreditCards?: () => void;
  onOpenIncomeSources?: () => void;
  onOpenTax?: () => void;
  onOpenCategoriesSettings?: () => void;
  onOpenBillingSettings?: () => void;
  onOpenProfileSettings?: () => void;
  onOpenSecuritySettings?: () => void;
}

const PERIOD_OPTIONS = [
  PERIOD_ALL,
  PERIOD_TODAY,
  PERIOD_LAST_7_DAYS,
  PERIOD_LAST_30_DAYS,
  PERIOD_CUSTOM,
];
const FILTER_PRESETS = [
  { id: "this-month", label: "Este mês" },
] as const;
const FILTER_BUTTON_LABELS: Record<SelectedCategory, string> = {
  Todos: "Todas",
  Entrada: "Entradas",
  Saida: "Saídas",
};
const FILTER_BUTTON_ARIA_LABELS: Record<SelectedCategory, string> = {
  Todos: "Filtrar todas",
  Entrada: "Filtrar entradas",
  Saida: "Filtrar saídas",
};
const DEFAULT_OFFSET = 0;
const DEFAULT_LIMIT = 20;
const MOBILE_HEADER_ACTIONS_BREAKPOINT = 640;
const MOBILE_ACTIONS_MENU_ID = "mobile-header-actions-menu";
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const PAGE_SIZE_STORAGE_KEY = "control_finance.page_size";
const DEFAULT_MONTHLY_SUMMARY: MonthlySummary = {
  month: "",
  income: 0,
  expense: 0,
  balance: 0,
  byCategory: [],
};
const DEFAULT_MONTHLY_SUMMARY_COMPARE: MonthlySummaryCompare = {
  current: {
    income: 0,
    expense: 0,
    balance: 0,
  },
  previous: {
    income: 0,
    expense: 0,
    balance: 0,
  },
  delta: {
    income: 0,
    expense: 0,
    balance: 0,
    incomePct: 0,
    expensePct: 0,
    balancePct: 0,
  },
  byCategoryDelta: [],
};
const MONTH_VALUE_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const MOM_TONE_CLASSNAMES: Record<MonthOverMonthTone, string> = {
  good: "text-green-200",
  bad: "text-red-200",
  neutral: "text-ui-200",
};
const DEFAULT_MONTHLY_BUDGETS: MonthlyBudget[] = [];
const TREND_MONTHS = 6;
const DEFAULT_TREND: TrendPoint[] = [];
const DEFAULT_BUDGET_FORM: BudgetFormState = {
  categoryId: "",
  amount: "",
};
const BUDGET_STATUS_LABELS: Record<MonthlyBudgetStatus, string> = {
  ok: "Dentro da meta",
  near_limit: "Próximo do limite",
  exceeded: "Acima da meta",
};
const BUDGET_STATUS_BADGE_CLASSNAMES: Record<MonthlyBudgetStatus, string> = {
  ok: "border-green-200 bg-green-50 text-green-700",
  near_limit: "border-amber-200 bg-amber-50 text-amber-700",
  exceeded: "border-red-200 bg-red-50 text-red-700",
};
const BUDGET_STATUS_BAR_CLASSNAMES: Record<MonthlyBudgetStatus, string> = {
  ok: "bg-green-500",
  near_limit: "bg-amber-500",
  exceeded: "bg-red-500",
};
const BUDGET_ALERT_SEVERITY: Record<BudgetAlertStatus, number> = {
  near_limit: 1,
  exceeded: 2,
};
const getCurrentMonth = () => getTodayISODate().slice(0, 7);
const getInitialSummaryMonth = (): string => {
  if (typeof window === "undefined") return getCurrentMonth();
  const param = new URLSearchParams(window.location.search).get("summaryMonth");
  return param && MONTH_VALUE_REGEX.test(param) ? param : getCurrentMonth();
};
const getMonthRange = (monthValue: string) => {
  if (!MONTH_VALUE_REGEX.test(String(monthValue || "").trim())) {
    return getCurrentMonthRange();
  }

  const [yearPart, monthPart] = monthValue.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  return getCurrentMonthRange(new Date(year, month - 1, 1));
};

const parseIntegerInRange = (
  value: string | null | undefined,
  { min, max }: { min: number; max: number },
) => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < min || parsedValue > max) {
    return null;
  }

  return parsedValue;
};

const getInitialFilterState = (): FilterState => {
  if (typeof window === "undefined") {
    return {
      selectedCategory: CATEGORY_ALL,
      selectedPeriod: PERIOD_ALL,
      selectedSort: DEFAULT_SORT,
      selectedQuery: "",
      selectedTransactionCategoryId: "",
      customStartDate: "",
      customEndDate: "",
    };
  }

  const params = new URLSearchParams(window.location.search);
  const queryType = params.get("type");
  const queryPeriod = params.get("period");
  const queryFrom = params.get("from");
  const queryTo = params.get("to");
  const querySort = normalizeSortOption(params.get("sort"));
  const queryValue = params.get("q");
  const querySearch = typeof queryValue === "string" ? queryValue.trim() : "";
  const queryCategoryId = parseIntegerInRange(params.get("categoryId"), {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
  });

  const selectedCategory =
    queryType === CATEGORY_ENTRY || queryType === CATEGORY_EXIT ? queryType : CATEGORY_ALL;
  let selectedPeriod: SelectedPeriod = isSelectedPeriod(queryPeriod) ? queryPeriod : PERIOD_ALL;
  const customStartDate: string = isValidISODate(queryFrom) ? (queryFrom ?? "") : "";
  const customEndDate: string = isValidISODate(queryTo) ? (queryTo ?? "") : "";

  if (selectedPeriod === PERIOD_ALL && (customStartDate || customEndDate)) {
    selectedPeriod = PERIOD_CUSTOM;
  }

  return {
    selectedCategory,
    selectedPeriod,
    selectedSort: querySort,
    selectedQuery: querySearch,
    selectedTransactionCategoryId: queryCategoryId ? String(queryCategoryId) : "",
    customStartDate: selectedPeriod === PERIOD_CUSTOM ? customStartDate : "",
    customEndDate: selectedPeriod === PERIOD_CUSTOM ? customEndDate : "",
  };
};


const normalizeTransactions = (transactions: unknown): Transaction[] => {
  if (!Array.isArray(transactions)) {
    return [];
  }

  const fallbackDate = getTodayISODate();

  return transactions
    .map((transaction) => ({
      id: Number(transaction.id),
      value: Number(transaction.value),
      type: transaction.type,
      categoryId: Number.isInteger(Number(transaction.categoryId))
        ? Number(transaction.categoryId)
        : null,
      date: normalizeTransactionDate(transaction.date, fallbackDate),
      description: typeof transaction.description === "string" ? transaction.description : "",
      notes: typeof transaction.notes === "string" ? transaction.notes : "",
    }))
    .filter(
      (transaction) =>
        Number.isFinite(transaction.id) &&
        Number.isFinite(transaction.value) &&
        [CATEGORY_ENTRY, CATEGORY_EXIT].includes(transaction.type),
    );
};

const downloadBlobFile = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = objectUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(objectUrl);
};

const getInitialPageSize = (): number => {
  if (typeof window === "undefined") {
    return DEFAULT_LIMIT;
  }

  const queryLimit = parseIntegerInRange(new URLSearchParams(window.location.search).get("limit"), {
    min: 1,
    max: 100,
  });

  if (queryLimit !== null && PAGE_SIZE_OPTIONS.includes(queryLimit)) {
    return queryLimit;
  }

  const storedPageSize = Number.parseInt(
    window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY) || "",
    10,
  );

  if (PAGE_SIZE_OPTIONS.includes(storedPageSize)) {
    return storedPageSize;
  }

  return DEFAULT_LIMIT;
};

const getInitialOffset = (): number => {
  if (typeof window === "undefined") {
    return DEFAULT_OFFSET;
  }

  const queryOffset = parseIntegerInRange(new URLSearchParams(window.location.search).get("offset"), {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
  });

  return queryOffset ?? DEFAULT_OFFSET;
};

const getPageFromOffset = (offset: number, limit: number) => {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
  const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : DEFAULT_OFFSET;
  return Math.floor(safeOffset / safeLimit) + 1;
};

const getInitialPaginationState = (): PaginationState => {
  const limit = getInitialPageSize();
  const offset = getInitialOffset();

  return {
    limit,
    offset,
    page: getPageFromOffset(offset, limit),
  };
};

const formatPercentage = (value: number) => `${Number(value || 0).toFixed(2)}%`;
const formatSignedCurrency = (value: number) => {
  if (value > 0) {
    return `+${formatCurrency(value)}`;
  }

  if (value < 0) {
    return `-${formatCurrency(Math.abs(value))}`;
  }

  return formatCurrency(0);
};
const formatSignedPercentage = (value: number | null) => {
  if (value === null) {
    return "—";
  }

  const normalizedValue = Number(value) || 0;
  const prefix = normalizedValue > 0 ? "+" : "";
  return `${prefix}${normalizedValue.toFixed(1)}%`;
};
const formatAbsolutePercentage = (value: number | null) => {
  if (value === null) {
    return null;
  }

  const normalizedValue = Math.abs(Number(value) || 0);
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(normalizedValue)}%`;
};
const formatMonthOverMonthSummary = (metric: MonthOverMonthMetric) => {
  if (metric.direction === "flat" && Math.abs(metric.delta) < 0.005) {
    return "Vs. mês anterior: sem variação";
  }

  const deltaLabel = formatSignedCurrency(metric.delta);

  if (metric.deltaPercent === null) {
    return `Vs. mês anterior: sem base de comparação (${deltaLabel})`;
  }

  if (metric.direction === "flat") {
    return `Vs. mês anterior: ficou estável (${deltaLabel})`;
  }

  const actionLabel = metric.direction === "up" ? "subiu" : "caiu";
  const percentLabel = formatAbsolutePercentage(metric.deltaPercent) || "0,0%";

  return `Vs. mês anterior: ${actionLabel} ${percentLabel} (${deltaLabel})`;
};
const getDirectionArrow = (direction: MonthOverMonthDirection): string => {
  if (direction === "up") {
    return "â†‘";
  }

  if (direction === "down") {
    return "â†“";
  }

  return "â†’";
};
const isCompactHeaderActionsMode = (): boolean =>
  typeof window !== "undefined" && window.innerWidth < MOBILE_HEADER_ACTIONS_BREAKPOINT;
const normalizeMonthlySummary = (summary: MonthlySummary, fallbackMonth: string): MonthlySummary => ({
  month: summary?.month || fallbackMonth,
  income: Number(summary?.income) || 0,
  expense: Number(summary?.expense) || 0,
  balance: Number(summary?.balance) || 0,
  byCategory: Array.isArray(summary?.byCategory) ? summary.byCategory : [],
});
const calculateMonthOverMonthMetric = (
  metricKey: SummaryMetricKey,
  deltaValue: number,
  deltaPercentValue: number | null,
): MonthOverMonthMetric => {
  const delta = Number(deltaValue) || 0;
  const direction: MonthOverMonthDirection = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const deltaPercent =
    deltaPercentValue === null ? null : Number.isFinite(Number(deltaPercentValue)) ? Number(deltaPercentValue) : 0;

  let tone: MonthOverMonthTone = "neutral";

  if (direction !== "flat") {
    if (metricKey === "expense") {
      tone = direction === "down" ? "good" : "bad";
    } else {
      tone = direction === "up" ? "good" : "bad";
    }
  }

  return {
    delta,
    deltaPercent,
    direction,
    tone,
  };
};
const App = ({
  onLogout = undefined,
  onOpenBills = undefined,
  onOpenCreditCards = undefined,
  onOpenIncomeSources = undefined,
  onOpenTax = undefined,
  onOpenCategoriesSettings = undefined,
  onOpenBillingSettings = undefined,
  onOpenProfileSettings = undefined,
  onOpenSecuritySettings = undefined,
}: AppProps): JSX.Element => {
  const money = useMaskedCurrency();
  const initialFilterState = useMemo(() => getInitialFilterState(), []);
  const initialPaginationState = useMemo(() => getInitialPaginationState(), []);
  // Guards first_transaction_created from duplicate fires within a session.
  // Two guards are intentionally both required:
  //   transactions.length === 0  → logical gate (only fires on true first creation)
  //   hasTrackedFirstTransactionRef → re-render safety (ref survives re-renders; removing
  //                                   either guard alone leaves the other as a partial defence)
  const hasTrackedFirstTransactionRef = useRef(false);
  const listSectionRef = useRef<HTMLElement | null>(null);
  const summarySectionRef = useRef<HTMLElement | null>(null);
  const mobileActionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const firstMobileActionsItemRef = useRef<HTMLButtonElement | null>(null);
  const contaButtonRef = useRef<HTMLButtonElement | null>(null);
  const contaMenuRef = useRef<HTMLDivElement | null>(null);
  const firstContaItemRef = useRef<HTMLButtonElement | null>(null);
  const [selectedSummaryMonth, setSelectedSummaryMonth] = useState(() => getInitialSummaryMonth());
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [hasLoadedCategories, setHasLoadedCategories] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(initialPaginationState.offset);
  const [pageSize, setPageSize] = useState(initialPaginationState.limit);
  const [paginationMeta, setPaginationMeta] = useState<PaginationMeta>(() => ({
    page: initialPaginationState.page,
    limit: initialPaginationState.limit,
    offset: initialPaginationState.offset,
    total: 0,
    totalPages: 1,
  }));
  const [isModalOpen, setModalOpen] = useState(false);
  const [isImportModalOpen, setImportModalOpen] = useState(false);
  const [isImportHistoryModalOpen, setImportHistoryModalOpen] = useState(false);
  const [isMobileActionsMenuOpen, setMobileActionsMenuOpen] = useState(false);
  const [isContaMenuOpen, setContaMenuOpen] = useState(false);
  const [useMobileActionsMenu, setUseMobileActionsMenu] = useState(() =>
    isCompactHeaderActionsMode(),
  );
  const [isBudgetModalOpen, setBudgetModalOpen] = useState(false);
  const [isUpgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeModalReason, setUpgradeModalReason] = useState("");
  const [upgradeModalFeature, setUpgradeModalFeature] = useState<PaywallFeature>("unknown");
  const [upgradeModalContext, setUpgradeModalContext] = useState<PaywallContext>("feature_gate");
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithCategoryName | null>(null);
  const [editingBudget, setEditingBudget] = useState<MonthlyBudget | null>(null);
  const [budgetForm, setBudgetForm] = useState<BudgetFormState>(DEFAULT_BUDGET_FORM);
  const [pendingDeleteTransactionId, setPendingDeleteTransactionId] = useState<number | null>(null);
  const [pendingDeleteBudget, setPendingDeleteBudget] = useState<MonthlyBudget | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setLoadingTransactions] = useState(false);
  const [isLoadingSummary, setLoadingSummary] = useState(false);
  const [isExportingCsv, setExportingCsv] = useState(false);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary>(DEFAULT_MONTHLY_SUMMARY);
  const [monthlySummaryCompare, setMonthlySummaryCompare] = useState<MonthlySummaryCompare>(
    DEFAULT_MONTHLY_SUMMARY_COMPARE,
  );
  const [monthlyBudgets, setMonthlyBudgets] = useState<MonthlyBudget[]>(DEFAULT_MONTHLY_BUDGETS);
  const [summaryError, setSummaryError] = useState("");
  const [momError, setMomError] = useState("");
  const [budgetsError, setBudgetsError] = useState("");
  const [budgetSuccessMessage, setBudgetSuccessMessage] = useState("");
  const [budgetMutationError, setBudgetMutationError] = useState("");
  const [isSavingBudget, setSavingBudget] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [showActivationBanner, setShowActivationBanner] = useState(false);
  const [modalRequestError, setModalRequestError] = useState("");
  const [isLoadingBudgets, setLoadingBudgets] = useState(false);
  const [trend, setTrend] = useState<TrendPoint[]>(DEFAULT_TREND);
  const [isLoadingTrend, setLoadingTrend] = useState(false);
  const [trendError, setTrendError] = useState("");
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const budgetSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categoryNameById = useMemo(() => {
    const map = new Map<number, string>();
    categories.forEach((category) => {
      map.set(Number(category.id), category.name);
    });
    return map;
  }, [categories]);

  const scrollToListTop = useCallback(() => {
    const scrollTarget = listSectionRef.current;
    if (!scrollTarget || typeof scrollTarget.scrollIntoView !== "function") {
      return;
    }
    scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const onPaginationReset = useCallback(() => setCurrentOffset(DEFAULT_OFFSET), []);

  const { themePreference, setThemePreference } = useTheme();
  const cycleTheme = useCallback(() => {
    setThemePreference(
      themePreference === "system" ? "light" : themePreference === "light" ? "dark" : "system",
    );
  }, [themePreference, setThemePreference]);
  const themeLabel =
    themePreference === "light" ? "☀ Claro" : themePreference === "dark" ? "☾ Escuro" : "◐ Sistema";
  const themeAriaLabel =
    themePreference === "light"
      ? "Mudar para tema escuro"
      : themePreference === "dark"
        ? "Mudar para tema sistema"
        : "Mudar para tema claro";

  const {
    selectedCategory,
    setSelectedCategory,
    selectedPeriod,
    setSelectedPeriod,
    selectedSort,
    setSelectedSort,
    selectedQuery,
    queryInput,
    setQueryInput,
    selectedTransactionCategoryId,
    setSelectedTransactionCategoryId,
    customStartDate,
    customEndDate,
    setCustomStartDate,
    setCustomEndDate,
    isFiltersPanelOpen,
    setIsFiltersPanelOpen,
    filtersPanelRef,
    searchInputRef,
    periodRange,
    activeFiltersCount,
    hasActiveFilters,
    appliedChips,
    handleApplyQueryFilter,
    handleQueryInputKeyDown,
    handleRemoveAppliedChip,
    applyFilterPreset,
    handleEditFilters,
  } = useFilters({
    initialState: initialFilterState,
    onPaginationReset,
    scrollToListTop,
    categoryNameById,
  });

  const clearUndoState = useCallback(() => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    setUndoState(null);
  }, []);

  const scheduleUndo = useCallback(
    (transactionId: number) => {
      clearUndoState();
      setUndoState({ transactionId });
      undoTimeoutRef.current = setTimeout(() => {
        undoTimeoutRef.current = null;
        setUndoState(null);
      }, 10000);
    },
    [clearUndoState],
  );

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }

      if (budgetSuccessTimeoutRef.current) {
        clearTimeout(budgetSuccessTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setPaymentRequiredHandler(({ reason, feature, context }: PaymentRequiredPayload) => {
      setUpgradeModalReason(reason);
      setUpgradeModalFeature(feature);
      setUpgradeModalContext(context);
      setUpgradeModalOpen(true);
    });
    return () => {
      setPaymentRequiredHandler(undefined);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncMobileActionsMode = () => {
      setUseMobileActionsMenu(isCompactHeaderActionsMode());
    };

    syncMobileActionsMode();
    window.addEventListener("resize", syncMobileActionsMode);

    return () => {
      window.removeEventListener("resize", syncMobileActionsMode);
    };
  }, []);

  useEffect(() => {
    if (!useMobileActionsMenu && isMobileActionsMenuOpen) {
      setMobileActionsMenuOpen(false);
    }
  }, [isMobileActionsMenuOpen, useMobileActionsMenu]);

  useEffect(() => {
    if (!isMobileActionsMenuOpen || typeof window === "undefined") {
      return undefined;
    }

    const handleWindowMouseDown = (event: MouseEvent) => {
      const eventTarget = event.target as Node | null;

      if (
        mobileActionsMenuRef.current?.contains(eventTarget) ||
        mobileActionsButtonRef.current?.contains(eventTarget)
      ) {
        return;
      }

      setMobileActionsMenuOpen(false);
    };

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileActionsMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handleWindowMouseDown);
    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.removeEventListener("mousedown", handleWindowMouseDown);
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [isMobileActionsMenuOpen]);

  useEffect(() => {
    if (!isMobileActionsMenuOpen) {
      return;
    }

    const focusFirstMenuItem = () => {
      firstMobileActionsItemRef.current?.focus();
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(focusFirstMenuItem);
      return;
    }

    focusFirstMenuItem();
  }, [isMobileActionsMenuOpen]);

  // ─── Conta dropdown (desktop) ────────────────────────────────────────────────

  useEffect(() => {
    if (!isContaMenuOpen || typeof window === "undefined") return undefined;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (contaMenuRef.current?.contains(target) || contaButtonRef.current?.contains(target)) return;
      setContaMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContaMenuOpen(false);
        contaButtonRef.current?.focus();
      }
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isContaMenuOpen]);

  useEffect(() => {
    if (!isContaMenuOpen) return;
    const focus = () => firstContaItemRef.current?.focus();
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(focus);
      return;
    }
    focus();
  }, [isContaMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const value = params.get("summaryMonth");
      const nextMonth = value && MONTH_VALUE_REGEX.test(value) ? value : getCurrentMonth();
      setSelectedSummaryMonth((current) => (current === nextMonth ? current : nextMonth));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const clearBudgetSuccessMessage = useCallback(() => {
    if (budgetSuccessTimeoutRef.current) {
      clearTimeout(budgetSuccessTimeoutRef.current);
      budgetSuccessTimeoutRef.current = null;
    }

    setBudgetSuccessMessage("");
  }, []);

  const showBudgetSuccessMessage = useCallback(
    (message: string) => {
      clearBudgetSuccessMessage();
      setBudgetSuccessMessage(message);
      budgetSuccessTimeoutRef.current = setTimeout(() => {
        budgetSuccessTimeoutRef.current = null;
        setBudgetSuccessMessage("");
      }, 2500);
    },
    [clearBudgetSuccessMessage],
  );

  const loadCategories = useCallback(async () => {
    try {
      const categoryOptions = await transactionsService.listCategories();
      setCategories(Array.isArray(categoryOptions) ? categoryOptions : []);
      setHasLoadedCategories(true);
    } catch {
      setCategories([]);
      setHasLoadedCategories(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const loadMonthlySummary = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError("");
    setMomError("");

    const [currentSummaryResult, compareSummaryResult] = await Promise.allSettled([
      transactionsService.getMonthlySummary(selectedSummaryMonth),
      transactionsService.getMonthlySummaryCompare(selectedSummaryMonth),
    ]);

    if (currentSummaryResult.status === "fulfilled") {
      setMonthlySummary(normalizeMonthlySummary(currentSummaryResult.value, selectedSummaryMonth));
    } else {
      setMonthlySummary({
        ...DEFAULT_MONTHLY_SUMMARY,
        month: selectedSummaryMonth,
      });
      setSummaryError(
        getApiErrorMessage(currentSummaryResult.reason, "Não foi possível carregar o resumo mensal."),
      );
    }

    if (compareSummaryResult.status === "fulfilled") {
      setMonthlySummaryCompare(compareSummaryResult.value);
    } else {
      setMonthlySummaryCompare(DEFAULT_MONTHLY_SUMMARY_COMPARE);
      setMomError(
        getApiErrorMessage(compareSummaryResult.reason, "Comparação mensal indisponível."),
      );
    }

    setLoadingSummary(false);
  }, [selectedSummaryMonth]);

  useEffect(() => {
    loadMonthlySummary();
  }, [loadMonthlySummary]);

  const loadMonthlyBudgets = useCallback(async () => {
    setLoadingBudgets(true);
    setBudgetsError("");

    try {
      const budgets = await transactionsService.getMonthlyBudgets(selectedSummaryMonth);
      setMonthlyBudgets(Array.isArray(budgets) ? budgets : []);
    } catch (error) {
      setMonthlyBudgets(DEFAULT_MONTHLY_BUDGETS);
      setBudgetsError(getApiErrorMessage(error, "Não foi possível carregar as metas mensais."));
    } finally {
      setLoadingBudgets(false);
    }
  }, [selectedSummaryMonth]);

  useEffect(() => {
    loadMonthlyBudgets();
  }, [loadMonthlyBudgets]);

  const loadTrend = useCallback(async () => {
    setLoadingTrend(true);
    setTrendError("");

    try {
      const trendData = await analyticsService.getMonthlyTrend(TREND_MONTHS);
      setTrend(Array.isArray(trendData) ? trendData : DEFAULT_TREND);
    } catch {
      setTrend(DEFAULT_TREND);
      setTrendError("Gráfico de evolução indisponível.");
    } finally {
      setLoadingTrend(false);
    }
  }, []);

  useEffect(() => {
    loadTrend();
  }, [loadTrend]);

  const handleTrendMonthClick = useCallback((month: string) => {
    if (MONTH_VALUE_REGEX.test(String(month || "").trim())) {
      setSelectedSummaryMonth(month.trim());
      if (
        summarySectionRef.current &&
        typeof summarySectionRef.current.scrollIntoView === "function"
      ) {
        summarySectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, []);

  const openCreateBudgetModal = () => {
    setEditingBudget(null);
    setBudgetForm(DEFAULT_BUDGET_FORM);
    setBudgetMutationError("");
    setBudgetModalOpen(true);
  };

  const openEditBudgetModal = (budget: MonthlyBudget) => {
    setEditingBudget(budget);
    setBudgetForm({
      categoryId: String(budget?.categoryId || ""),
      amount: String(budget?.budget ?? ""),
    });
    setBudgetMutationError("");
    setBudgetModalOpen(true);
  };

  const closeBudgetModal = () => {
    if (isSavingBudget) {
      return;
    }

    setBudgetModalOpen(false);
    setEditingBudget(null);
    setBudgetForm(DEFAULT_BUDGET_FORM);
    setBudgetMutationError("");
  };

  const handleSaveBudget = async () => {
    const categoryId = Number.parseInt(String(budgetForm.categoryId || ""), 10);
    const amount = Number(budgetForm.amount);

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      setBudgetMutationError("Selecione uma categoria válida.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setBudgetMutationError("Informe um valor de meta maior que zero.");
      return;
    }

    setSavingBudget(true);
    setBudgetMutationError("");
    clearBudgetSuccessMessage();

    try {
      await transactionsService.createOrUpdateMonthlyBudget({
        categoryId,
        month: selectedSummaryMonth,
        amount,
      });
      await loadMonthlyBudgets();
      setBudgetModalOpen(false);
      setEditingBudget(null);
      setBudgetForm(DEFAULT_BUDGET_FORM);
      showBudgetSuccessMessage("Meta salva com sucesso.");
    } catch (error) {
      setBudgetMutationError(getApiErrorMessage(error, "Não foi possível salvar a meta."));
    } finally {
      setSavingBudget(false);
    }
  };

  const handleDeleteBudget = (budget: MonthlyBudget) => {
    setPendingDeleteBudget(budget);
  };

  const handleConfirmDeleteBudget = async () => {
    if (!pendingDeleteBudget) return;
    const budget = pendingDeleteBudget;
    setPendingDeleteBudget(null);
    setBudgetsError("");
    clearBudgetSuccessMessage();

    try {
      await transactionsService.deleteMonthlyBudget(budget.id);
      await loadMonthlyBudgets();
      showBudgetSuccessMessage("Meta removida.");
    } catch (error) {
      setBudgetsError(getApiErrorMessage(error, "Não foi possível remover a meta."));
    }
  };

  const loadTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    setRequestError("");

    try {
      const response = await transactionsService.listPage({
        limit: pageSize,
        offset: currentOffset,
        sort: selectedSort,
        ...(selectedQuery ? { q: selectedQuery } : {}),
        from: periodRange.startDate || undefined,
        to: periodRange.endDate || undefined,
        type:
          selectedCategory !== CATEGORY_ALL
            ? (selectedCategory as TransactionType)
            : undefined,
        categoryId: selectedTransactionCategoryId
          ? Number(selectedTransactionCategoryId)
          : undefined,
      });

      setTransactions(normalizeTransactions(response.data));
      setPaginationMeta({
        page: response.meta.page,
        limit: response.meta.limit,
        offset: response.meta.offset,
        total: response.meta.total,
        totalPages: response.meta.totalPages,
      });
    } catch (error) {
      setTransactions([]);
      const fallbackPage = getPageFromOffset(currentOffset, pageSize);
      setPaginationMeta({
        page: fallbackPage,
        limit: pageSize,
        offset: currentOffset,
        total: 0,
        totalPages: 1,
      });
      setRequestError(getApiErrorMessage(error, "Não foi possível carregar as transações."));
    } finally {
      setLoadingTransactions(false);
    }
  }, [
    currentOffset,
    pageSize,
    periodRange,
    selectedCategory,
    selectedQuery,
    selectedSort,
    selectedTransactionCategoryId,
  ]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    const maxOffset =
      paginationMeta.total > 0
        ? Math.max((paginationMeta.totalPages - 1) * paginationMeta.limit, 0)
        : 0;

    if (currentOffset > maxOffset) {
      setCurrentOffset(maxOffset);
    }
  }, [currentOffset, paginationMeta.limit, paginationMeta.total, paginationMeta.totalPages]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set("limit", String(pageSize));
    params.set("offset", String(currentOffset));
    params.set("sort", selectedSort);
    params.set("summaryMonth", selectedSummaryMonth);

    if (selectedQuery) {
      params.set("q", selectedQuery);
    } else {
      params.delete("q");
    }

    if (selectedCategory !== CATEGORY_ALL) {
      params.set("type", selectedCategory);
    } else {
      params.delete("type");
    }

    if (selectedTransactionCategoryId) {
      params.set("categoryId", selectedTransactionCategoryId);
    } else {
      params.delete("categoryId");
    }

    if (selectedPeriod !== PERIOD_ALL) {
      params.set("period", selectedPeriod);
    } else {
      params.delete("period");
    }

    if (selectedPeriod === PERIOD_CUSTOM && customStartDate) {
      params.set("from", customStartDate);
    } else {
      params.delete("from");
    }

    if (selectedPeriod === PERIOD_CUSTOM && customEndDate) {
      params.set("to", customEndDate);
    } else {
      params.delete("to");
    }

    const nextSearch = params.toString();
    const currentSearch = window.location.search.startsWith("?")
      ? window.location.search.slice(1)
      : window.location.search;

    if (nextSearch !== currentSearch) {
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
      window.history.replaceState(null, "", nextUrl);
    }
  }, [
    currentOffset,
    customEndDate,
    customStartDate,
    pageSize,
    selectedCategory,
    selectedPeriod,
    selectedQuery,
    selectedSort,
    selectedSummaryMonth,
    selectedTransactionCategoryId,
  ]);

  const filteredTransactions = useMemo(() => {
    return transactions;
  }, [transactions]);

  const transactionsWithCategoryName = useMemo(() => {
    return filteredTransactions.map((transaction) => ({
      ...transaction,
      categoryName:
        transaction.categoryId === null
          ? "Sem categoria"
          : categoryNameById.get(transaction.categoryId as number) || "Categoria removida",
    }));
  }, [categoryNameById, filteredTransactions]);

  const chartData = useMemo(() => {
    return [
      { name: "Entradas", total: monthlySummary.income },
      { name: "Saídas", total: monthlySummary.expense },
    ];
  }, [monthlySummary.expense, monthlySummary.income]);

  const summaryByCategoryExpenses = useMemo(() => {
    if (!Array.isArray(monthlySummary.byCategory)) {
      return [];
    }

    return monthlySummary.byCategory
      .map((categoryItem) => {
        const normalizedCategoryId = Number(categoryItem?.categoryId);
        const normalizedExpense = Number(categoryItem?.expense);
        const normalizedCategoryName =
          typeof categoryItem?.categoryName === "string" &&
          categoryItem.categoryName.trim()
            ? categoryItem.categoryName.trim()
            : "Sem categoria";

        return {
          categoryId:
            Number.isInteger(normalizedCategoryId) && normalizedCategoryId > 0
              ? normalizedCategoryId
              : null,
          categoryName: normalizedCategoryName,
          expense: Number.isFinite(normalizedExpense) ? normalizedExpense : 0,
        };
      })
      .filter((categoryItem) => categoryItem.expense > 0)
      .sort((a, b) => {
        if (a.categoryId === null && b.categoryId !== null) return 1;
        if (b.categoryId === null && a.categoryId !== null) return -1;
        return b.expense - a.expense;
      });
  }, [monthlySummary.byCategory]);

  const monthOverMonthMetrics = useMemo(
    () => ({
      balance: calculateMonthOverMonthMetric(
        "balance",
        monthlySummaryCompare.delta.balance,
        monthlySummaryCompare.delta.balancePct,
      ),
      income: calculateMonthOverMonthMetric(
        "income",
        monthlySummaryCompare.delta.income,
        monthlySummaryCompare.delta.incomePct,
      ),
      expense: calculateMonthOverMonthMetric(
        "expense",
        monthlySummaryCompare.delta.expense,
        monthlySummaryCompare.delta.expensePct,
      ),
    }),
    [
      monthlySummaryCompare.delta.balance,
      monthlySummaryCompare.delta.balancePct,
      monthlySummaryCompare.delta.expense,
      monthlySummaryCompare.delta.expensePct,
      monthlySummaryCompare.delta.income,
      monthlySummaryCompare.delta.incomePct,
    ],
  );
  const topCategoryMovers = useMemo(
    () =>
      Array.isArray(monthlySummaryCompare.byCategoryDelta)
        ? monthlySummaryCompare.byCategoryDelta
            .filter(
              (item) =>
                typeof item?.categoryName === "string" &&
                item.categoryName.trim() &&
                (Number(item?.current) !== 0 || Number(item?.previous) !== 0),
            )
            .map((item) => {
              const normalizedDelta = Number(item.delta) || 0;
              const normalizedDirection: MonthOverMonthDirection =
                normalizedDelta > 0 ? "up" : normalizedDelta < 0 ? "down" : "flat";

              return {
                categoryId:
                  Number.isInteger(Number(item.categoryId)) && Number(item.categoryId) > 0
                    ? Number(item.categoryId)
                    : null,
                categoryName: item.categoryName.trim(),
                delta: normalizedDelta,
                deltaPct:
                  item.deltaPct === null
                    ? null
                    : Number.isFinite(Number(item.deltaPct))
                      ? Number(item.deltaPct)
                      : 0,
                direction: normalizedDirection,
                tone:
                  normalizedDirection === "up"
                    ? ("bad" as MonthOverMonthTone)
                    : normalizedDirection === "down"
                      ? ("good" as MonthOverMonthTone)
                      : ("neutral" as MonthOverMonthTone),
              };
            })
            .sort((leftItem, rightItem) => Math.abs(rightItem.delta) - Math.abs(leftItem.delta))
            .slice(0, 3)
        : [],
    [monthlySummaryCompare.byCategoryDelta],
  );
  const hasMeaningfulCategoryBreakdown = useMemo(
    () =>
      summaryByCategoryExpenses.some(
        (item) =>
          item.categoryId !== null || item.categoryName.trim().toLowerCase() !== "sem categoria",
      ),
    [summaryByCategoryExpenses],
  );
  const hasMeaningfulCategoryMovers = useMemo(
    () =>
      topCategoryMovers.some(
        (item) =>
          item.categoryId !== null || item.categoryName.trim().toLowerCase() !== "sem categoria",
      ),
    [topCategoryMovers],
  );
  const budgetAlerts = useMemo(
    () =>
      monthlyBudgets
        .filter(
          (budget): budget is MonthlyBudget & { status: BudgetAlertStatus } =>
            budget.status === "near_limit" || budget.status === "exceeded",
        )
        .sort((leftBudget, rightBudget) => {
          const severityDifference =
            BUDGET_ALERT_SEVERITY[rightBudget.status] - BUDGET_ALERT_SEVERITY[leftBudget.status];

          if (severityDifference !== 0) {
            return severityDifference;
          }

          return rightBudget.percentage - leftBudget.percentage;
        }),
    [monthlyBudgets],
  );
  const proactiveNearLimitBudget = useMemo(
    () =>
      monthlyBudgets
        .filter(
          (budget): budget is MonthlyBudget & { status: "near_limit" } =>
            budget.status === "near_limit",
        )
        .sort((leftBudget, rightBudget) => rightBudget.percentage - leftBudget.percentage)[0] ||
      null,
    [monthlyBudgets],
  );

  const openCreateModal = () => {
    if (transactions.length === 0) {
      trackActivationEvent("transaction_modal_opened");
    }
    setBudgetModalOpen(false);
    setEditingTransaction(null);
    setModalRequestError("");
    setModalOpen(true);
  };

  const openEditModal = (transaction: TransactionWithCategoryName) => {
    setBudgetModalOpen(false);
    setEditingTransaction(transaction);
    setModalRequestError("");
    setModalOpen(true);
  };

  const handleSaveTransaction = async ({
    value,
    type,
    date,
    description,
    notes,
    categoryId,
  }: TransactionModalPayload) => {
    setRequestError("");
    setModalRequestError("");

    try {
      if (editingTransaction) {
        await transactionsService.update(editingTransaction.id, {
          value,
          type,
          category_id: categoryId,
          date,
          description,
          notes,
        });
      } else {
        if (transactions.length === 0 && !hasTrackedFirstTransactionRef.current) {
          hasTrackedFirstTransactionRef.current = true;
          trackActivationEvent("first_transaction_created");
          setShowActivationBanner(true);
        }
        await transactionsService.create({
          value,
          type,
          category_id: categoryId,
          date,
          description,
          notes,
        });
      }

      setEditingTransaction(null);
      setModalRequestError("");
      setModalOpen(false);
      await loadTransactions();
      await loadMonthlySummary();
      await loadMonthlyBudgets();
      await loadCategories();
    } catch (error) {
      const fallbackMessage = editingTransaction
        ? "Não foi possível atualizar a transação."
        : "Não foi possível cadastrar a transação.";
      const apiMessage = getApiErrorMessage(error, fallbackMessage);

      if (apiMessage === "Categoria nao encontrada.") {
        setModalRequestError(
          "A categoria selecionada foi removida. Escolha outra categoria ou use Sem categoria.",
        );
        return;
      }

      setModalRequestError(apiMessage);
    }
  };

  const requestDeleteTransaction = (id: number) => {
    setBudgetModalOpen(false);
    setPendingDeleteTransactionId(id);
  };

  const closeDeleteDialog = () => {
    setPendingDeleteTransactionId(null);
  };

  const confirmDeleteTransaction = async () => {
    if (!pendingDeleteTransactionId) {
      return;
    }

    setRequestError("");

    try {
      await transactionsService.remove(pendingDeleteTransactionId);
      scheduleUndo(pendingDeleteTransactionId);
      setPendingDeleteTransactionId(null);
      await loadTransactions();
      await loadMonthlySummary();
      await loadMonthlyBudgets();
    } catch (error) {
      setRequestError(getApiErrorMessage(error, "Não foi possível excluir a transação."));
    }
  };

  const restoreDeletedTransaction = async () => {
    if (!undoState?.transactionId) {
      return;
    }

    setRequestError("");

    try {
      await transactionsService.restore(undoState.transactionId);
      clearUndoState();
      await loadTransactions();
      await loadMonthlySummary();
      await loadMonthlyBudgets();
    } catch (error) {
      setRequestError(getApiErrorMessage(error, "Não foi possível desfazer a exclusão."));
    }
  };

  const handleBulkDeleteTransactions = async (ids: number[]) => {
    setRequestError("");
    try {
      await transactionsService.bulkDeleteTransactions(ids);
      await loadTransactions();
      await loadMonthlySummary();
      await loadMonthlyBudgets();
    } catch (error) {
      setRequestError(getApiErrorMessage(error, "Não foi possível excluir as transações."));
    }
  };

  const handleExportCsv = async () => {
    setRequestError("");
    setExportingCsv(true);

    const exportFilters = {
      from: periodRange.startDate || undefined,
      to: periodRange.endDate || undefined,
      type:
        selectedCategory !== CATEGORY_ALL
          ? (selectedCategory as TransactionType)
          : undefined,
      categoryId: selectedTransactionCategoryId
        ? Number(selectedTransactionCategoryId)
        : undefined,
    };

    try {
      const exportResponse = await transactionsService.exportCsv(exportFilters);
      const csvBlob =
        exportResponse.blob instanceof Blob
          ? exportResponse.blob
          : new Blob([exportResponse.blob], { type: "text/csv;charset=utf-8" });
      const fallbackFileName = `transacoes-${getTodayISODate()}.csv`;

      downloadBlobFile(csvBlob, exportResponse.fileName || fallbackFileName);
    } catch (error) {
      setRequestError(getApiErrorMessage(error, "Não foi possível exportar o CSV."));
    } finally {
      setExportingCsv(false);
    }
  };

  const closeMobileActionsMenu = () => {
    setMobileActionsMenuOpen(false);
  };

  const toggleMobileActionsMenu = () => {
    setMobileActionsMenuOpen((previousState) => !previousState);
  };

  const handleExportCsvFromMenu = () => {
    closeMobileActionsMenu();
    void handleExportCsv();
  };

  const handleOpenImportModal = () => {
    closeMobileActionsMenu();
    setImportModalOpen(true);
  };

  const handleOpenImportHistoryModal = () => {
    closeMobileActionsMenu();
    setImportHistoryModalOpen(true);
  };

  const handleOpenBills = () => {
    closeMobileActionsMenu();
    onOpenBills?.();
  };

  const handleOpenDueSoonBills = () => {
    closeMobileActionsMenu();
    onOpenBills?.("due_soon");
  };

  const handleOpenCreditCards = () => {
    closeMobileActionsMenu();
    onOpenCreditCards?.();
  };

  const handleOpenIncomeSources = () => {
    closeMobileActionsMenu();
    onOpenIncomeSources?.();
  };

  const handleOpenTax = () => {
    closeMobileActionsMenu();
    onOpenTax?.();
  };

  const handleOpenCategoriesSettings = () => {
    closeMobileActionsMenu();
    onOpenCategoriesSettings?.();
  };

  const handleOpenBillingSettings = () => {
    closeMobileActionsMenu();
    onOpenBillingSettings?.();
  };

  const handleOpenProfileSettings = () => {
    closeMobileActionsMenu();
    onOpenProfileSettings?.();
  };

  const handleOpenSecuritySettings = () => {
    closeMobileActionsMenu();
    onOpenSecuritySettings?.();
  };

  const handleLogoutFromActionsMenu = () => {
    closeMobileActionsMenu();
    onLogout?.();
  };

  const handleImportDataChanged = useCallback(async () => {
    await loadTransactions();
    await loadMonthlySummary();
    await loadMonthlyBudgets();
  }, [loadMonthlyBudgets, loadMonthlySummary, loadTransactions]);

  const handleImportCommitted = useCallback(async (result?: unknown | null) => {
    if (result == null) {
      await handleImportDataChanged();
    }
    setImportModalOpen(false);
  }, [handleImportDataChanged]);

  const handleOpenImportHistoryAfterImport = useCallback(async (result?: unknown | null) => {
    if (result == null) {
      await handleImportDataChanged();
    }
    setImportModalOpen(false);
    setImportHistoryModalOpen(true);
  }, [handleImportDataChanged]);

  const handleImportSessionReverted = useCallback(async () => {
    await handleImportDataChanged();
  }, [handleImportDataChanged]);

  const handleViewBudgetTransactions = (budget: MonthlyBudget) => {
    const monthRange = getMonthRange(selectedSummaryMonth);
    setSelectedTransactionCategoryId(String(budget.categoryId));
    setSelectedPeriod(PERIOD_CUSTOM);
    setCustomStartDate(monthRange.startDate);
    setCustomEndDate(monthRange.endDate);
    setCurrentOffset(DEFAULT_OFFSET);
    scrollToListTop();
  };
  const handleViewCategoryMoverTransactions = (categoryId: number | null) => {
    const monthRange = getMonthRange(selectedSummaryMonth);

    setSelectedTransactionCategoryId(
      Number.isInteger(Number(categoryId)) && Number(categoryId) > 0 ? String(categoryId) : "",
    );
    setSelectedPeriod(PERIOD_CUSTOM);
    setCustomStartDate(monthRange.startDate);
    setCustomEndDate(monthRange.endDate);
    setCurrentOffset(DEFAULT_OFFSET);
    scrollToListTop();
  };

  const goToOffset = (nextOffset: number) => {
    const maxOffset =
      paginationMeta.total > 0
        ? Math.max((paginationMeta.totalPages - 1) * paginationMeta.limit, 0)
        : 0;
    const clampedOffset = Math.min(Math.max(nextOffset, 0), maxOffset);

    if (clampedOffset === currentOffset) {
      return;
    }

    setCurrentOffset(clampedOffset);
    scrollToListTop();
  };

  const handlePreviousPage = () => {
    goToOffset(currentOffset - pageSize);
  };

  const handleNextPage = () => {
    goToOffset(currentOffset + pageSize);
  };

  const handleFirstPage = () => {
    goToOffset(DEFAULT_OFFSET);
  };

  const handleLastPage = () => {
    const lastOffset =
      paginationMeta.total > 0
        ? Math.max((paginationMeta.totalPages - 1) * paginationMeta.limit, 0)
        : DEFAULT_OFFSET;
    goToOffset(lastOffset);
  };

  const handlePageSizeChange = (nextPageSize: string) => {
    const parsedPageSize = Number.parseInt(nextPageSize, 10);

    if (!PAGE_SIZE_OPTIONS.includes(parsedPageSize)) {
      return;
    }

    setPageSize(parsedPageSize);
    setCurrentOffset(DEFAULT_OFFSET);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(parsedPageSize));
    }

    scrollToListTop();
  };

  const filterButtons: SelectedCategory[] = [CATEGORY_ALL, CATEGORY_ENTRY, CATEGORY_EXIT];
  const todayISO = getTodayISODate();
  const currentMonthRange = useMemo(
    () => getCurrentMonthRange(new Date(`${todayISO}T00:00:00`)),
    [todayISO],
  );
  const isFiltersContentVisible = isFiltersPanelOpen;
  const shouldShowPresets = !hasActiveFilters;
  const hasMonthlySummaryData =
    monthlySummary.income > 0 ||
    monthlySummary.expense > 0 ||
    monthlySummary.byCategory.length > 0;
  const hasMonthlyBudgetsData = monthlyBudgets.length > 0;
  const canCreateBudget = categories.length > 0 && !isLoadingBudgets && !isSavingBudget;
  const visibleFilterPresets = FILTER_PRESETS;
  const isPresetActive = (presetId: (typeof FILTER_PRESETS)[number]["id"]): boolean => {
    if (presetId === "this-month") {
      return (
        selectedPeriod === PERIOD_CUSTOM &&
        customStartDate === currentMonthRange.startDate &&
        customEndDate === currentMonthRange.endDate
      );
    }

    return false;
  };
  const currentPage = paginationMeta.page;
  const rangeStart = paginationMeta.total === 0 ? 0 : paginationMeta.offset + 1;
  const rangeEnd = Math.min(
    paginationMeta.offset + filteredTransactions.length,
    paginationMeta.total,
  );

  return (
    <div className="App min-h-screen bg-cf-bg-page pb-10">
      <header className="w-full bg-cf-header-bg py-3 shadow-md sm:py-4">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <div className="hidden lg:block" />
              <div className="flex flex-col items-center text-center lg:justify-self-center">
                <h1 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">
                  <span className="text-brand-1">Control</span>
                  <span className="text-cf-text-primary">Finance</span>
                </h1>
                <p className="mt-1 text-xs text-cf-text-secondary sm:text-sm">
                  Controle financeiro pessoal com importação, pendências, cartões, fontes de renda e apoio fiscal.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
            {useMobileActionsMenu ? (
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isMobileActionsMenuOpen}
                  aria-controls={MOBILE_ACTIONS_MENU_ID}
                  onClick={toggleMobileActionsMenu}
                  ref={mobileActionsButtonRef}
                  className="whitespace-nowrap rounded border border-cf-border bg-cf-surface px-2.5 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                >
                  Acoes
                </button>
                {isMobileActionsMenuOpen ? (
                  <div
                    role="menu"
                    id={MOBILE_ACTIONS_MENU_ID}
                    aria-label="Acoes rapidas"
                    ref={mobileActionsMenuRef}
                    className="absolute right-0 top-full z-20 mt-1 flex w-44 flex-col gap-1 rounded border border-cf-border bg-cf-surface p-1 shadow-lg"
                  >
                    {onOpenBills ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleOpenBills}
                        className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                      >
                        Pendências
                      </button>
                    ) : null}
                    {onOpenCreditCards ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleOpenCreditCards}
                        className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                      >
                        Cartões
                      </button>
                    ) : null}
                    {onOpenIncomeSources ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleOpenIncomeSources}
                        className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                      >
                        Fontes de Renda
                      </button>
                    ) : null}
                    {onOpenTax ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleOpenTax}
                        className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                      >
                        Central do Leão
                      </button>
                    ) : null}
                    {onOpenCategoriesSettings ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleOpenCategoriesSettings}
                        className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                      >
                        Categorias
                      </button>
                    ) : null}
                    {(onOpenBills || onOpenCreditCards || onOpenIncomeSources || onOpenTax || onOpenCategoriesSettings) ? (
                      <div className="my-1 h-px bg-cf-border" role="separator" />
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      ref={firstMobileActionsItemRef}
                      onClick={handleExportCsvFromMenu}
                      disabled={isExportingCsv}
                      className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isExportingCsv ? "Exportando CSV..." : "Exportar CSV"}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleOpenImportModal}
                      className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                    >
                      Importar extrato
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleOpenImportHistoryModal}
                      className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                    >
                      Histórico de importações
                    </button>
                    {(onOpenProfileSettings || onOpenBillingSettings || onOpenSecuritySettings) ? (
                      <div className="my-1 h-px bg-cf-border" role="separator" />
                    ) : null}
                    {onOpenProfileSettings ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleOpenProfileSettings}
                        className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                      >
                        Perfil
                      </button>
                    ) : null}
                    {onOpenBillingSettings ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleOpenBillingSettings}
                        className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                      >
                        Assinatura
                      </button>
                    ) : null}
                    {onOpenSecuritySettings ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleOpenSecuritySettings}
                        className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                      >
                        Segurança
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={cycleTheme}
                      className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                    >
                      {themeLabel}
                    </button>
                    {onLogout ? (
                      <>
                        <div className="my-1 h-px bg-cf-border" role="separator" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleLogoutFromActionsMenu}
                          className="rounded px-2 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          Sair
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cycleTheme}
                  aria-label={themeAriaLabel}
                  className="whitespace-nowrap rounded border border-cf-border bg-cf-surface px-2.5 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                >
                  {themeLabel}
                </button>
                {(onOpenProfileSettings || onOpenBillingSettings || onOpenSecuritySettings || onLogout) ? (
                  <div className="relative">
                    <button
                      type="button"
                      ref={contaButtonRef}
                      aria-haspopup="menu"
                      aria-expanded={isContaMenuOpen ? "true" : "false"}
                      onClick={() => setContaMenuOpen((v) => !v)}
                      className="whitespace-nowrap rounded border border-cf-border bg-cf-surface px-2.5 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                    >
                      Conta
                    </button>
                    {isContaMenuOpen ? (
                      <div
                        role="menu"
                        aria-label="Conta"
                        ref={contaMenuRef}
                        className="absolute right-0 top-full z-20 mt-1 flex w-40 flex-col gap-1 rounded border border-cf-border bg-cf-surface p-1 shadow-lg"
                      >
                        {onOpenProfileSettings ? (
                          <button
                            type="button"
                            role="menuitem"
                            ref={firstContaItemRef}
                            onClick={() => { setContaMenuOpen(false); onOpenProfileSettings(); }}
                            className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                          >
                            Perfil
                          </button>
                        ) : null}
                        {onOpenBillingSettings ? (
                          <button
                            type="button"
                            role="menuitem"
                            ref={onOpenProfileSettings ? undefined : firstContaItemRef}
                            onClick={() => { setContaMenuOpen(false); onOpenBillingSettings(); }}
                            className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                          >
                            Assinatura
                          </button>
                        ) : null}
                        {onOpenSecuritySettings ? (
                          <button
                            type="button"
                            role="menuitem"
                            ref={!onOpenProfileSettings && !onOpenBillingSettings ? firstContaItemRef : undefined}
                            onClick={() => { setContaMenuOpen(false); onOpenSecuritySettings(); }}
                            className="rounded px-2 py-2 text-left text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                          >
                            Segurança
                          </button>
                        ) : null}
                        {onLogout ? (
                          <>
                            <div className="my-1 h-px bg-cf-border" role="separator" />
                            <button
                              type="button"
                              role="menuitem"
                              ref={!onOpenProfileSettings && !onOpenBillingSettings && !onOpenSecuritySettings ? firstContaItemRef : undefined}
                              onClick={() => { setContaMenuOpen(false); onLogout(); }}
                              className="rounded px-2 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              Sair
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
            <button
              onClick={openCreateModal}
              className="whitespace-nowrap rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2"
            >
              Registrar novo valor
            </button>
              </div>
            </div>

            {!useMobileActionsMenu ? (
              <nav
                aria-label="Atalhos principais"
                className="flex flex-wrap items-center justify-center gap-2 rounded border border-cf-border bg-cf-surface/70 p-2"
              >
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={isExportingCsv}
                  className="whitespace-nowrap rounded border border-cf-border bg-cf-surface px-2.5 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isExportingCsv ? "Exportando CSV..." : "Exportar CSV"}
                </button>
                <button
                  type="button"
                  onClick={handleOpenImportModal}
                  className="whitespace-nowrap rounded border border-cf-border bg-cf-surface px-2.5 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                >
                  Importar extrato
                </button>
                <button
                  type="button"
                  onClick={handleOpenImportHistoryModal}
                  className="whitespace-nowrap rounded border border-cf-border bg-cf-surface px-2.5 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                >
                  Histórico de importações
                </button>
                {onOpenBills ? (
                  <button
                    type="button"
                    onClick={handleOpenBills}
                    className="whitespace-nowrap rounded border border-cf-border bg-cf-surface px-2.5 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                  >
                    Pendências
                  </button>
                ) : null}
                {onOpenCreditCards ? (
                  <button
                    type="button"
                    onClick={handleOpenCreditCards}
                    className="whitespace-nowrap rounded border border-cf-border bg-cf-surface px-2.5 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                  >
                    Cartões
                  </button>
                ) : null}
                {onOpenIncomeSources ? (
                  <button
                    type="button"
                    onClick={handleOpenIncomeSources}
                    className="whitespace-nowrap rounded border border-cf-border bg-cf-surface px-2.5 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                  >
                    Fontes de Renda
                  </button>
                ) : null}
                {onOpenTax ? (
                  <button
                    type="button"
                    onClick={handleOpenTax}
                    className="whitespace-nowrap rounded border border-cf-border bg-cf-surface px-2.5 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                  >
                    Central do Leão
                  </button>
                ) : null}
                {onOpenCategoriesSettings ? (
                  <button
                    type="button"
                    onClick={handleOpenCategoriesSettings}
                    className="whitespace-nowrap rounded border border-cf-border bg-cf-surface px-2.5 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                  >
                    Categorias
                  </button>
                ) : null}
              </nav>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto mt-8 w-full max-w-6xl space-y-8 px-4 sm:mt-10 sm:px-6">
        {!isLoadingTransactions && transactions.length === 0 ? (
          <WelcomeCard
            onAddTransaction={openCreateModal}
            onOpenProfileSettings={onOpenProfileSettings}
          />
        ) : null}

        {showActivationBanner && (
          <div className="flex items-center justify-between rounded border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-400">
            <span>
              Primeira transação registrada. Seu saldo já está atualizado acima ↑
            </span>
            <button
              type="button"
              onClick={() => setShowActivationBanner(false)}
              className="ml-4 shrink-0 text-green-700 opacity-60 hover:opacity-100 dark:text-green-400"
              aria-label="Fechar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        <FinancialAlertBanner />

        <section ref={filtersPanelRef}>
          <div className="space-y-4 rounded border border-cf-border bg-cf-surface p-4">
            <div className="flex items-start justify-between gap-3 rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
              <h2 className="text-base font-semibold text-cf-text-primary">Resumo financeiro</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFiltersPanelOpen(!isFiltersPanelOpen)}
                  aria-expanded={isFiltersPanelOpen}
                  className="whitespace-nowrap rounded border border-cf-border bg-cf-surface px-2.5 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                >
                  {isFiltersPanelOpen ? "Ocultar" : "Filtros"}
                </button>
              </div>
            </div>

            {hasActiveFilters && appliedChips.length > 0 ? (
              <div className="w-full max-w-full space-y-2 overflow-hidden rounded border border-cf-border bg-cf-bg-subtle p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-cf-text-primary">
                    Filtros ativos ({activeFiltersCount})
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleEditFilters}
                      className="rounded border border-cf-border bg-cf-surface px-2 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                    >
                      Editar filtros
                    </button>
                    <button
                      type="button"
                      className="rounded border border-cf-border bg-cf-surface px-2 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                      onClick={() => applyFilterPreset("clear")}
                    >
                      Limpar tudo
                    </button>
                  </div>
                </div>
                <div className="w-full max-w-full overflow-x-auto">
                  <div className="flex flex-nowrap items-center gap-2 pb-1">
                    {appliedChips.map((chip) => (
                      <span
                        key={chip.id}
                        className="inline-flex whitespace-nowrap items-center gap-1 rounded-full border border-cf-border bg-cf-surface py-1 pl-2.5 pr-1.5 text-xs font-medium text-cf-text-primary"
                      >
                        {chip.text}
                        {chip.removable ? (
                          <button
                            type="button"
                            aria-label={`Remover filtro: ${chip.removeLabel}`}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-cf-text-secondary transition-colors hover:bg-cf-bg-subtle hover:text-cf-text-primary focus:outline-none focus:ring-2 focus:ring-brand-1 focus:ring-offset-1"
                            onClick={() => handleRemoveAppliedChip(chip.id)}
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              className="h-3.5 w-3.5"
                            >
                              <path d="M4 4L12 12" />
                              <path d="M12 4L4 12" />
                            </svg>
                          </button>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {isFiltersContentVisible ? (
              <div className="space-y-4">
                <div className="space-y-3 rounded border border-cf-border bg-cf-bg-subtle p-3">
                  {shouldShowPresets ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {visibleFilterPresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          aria-pressed={isPresetActive(preset.id)}
                          onClick={() => applyFilterPreset(preset.id)}
                          className={`min-w-[88px] rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            isPresetActive(preset.id)
                              ? "border-brand-1 bg-brand-3 text-brand-1"
                              : "border-cf-border bg-cf-surface text-cf-text-primary hover:bg-cf-bg-subtle"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-cf-text-secondary">
                      Tipo
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {filterButtons.map((category) => {
                        const active = selectedCategory === category;

                        return (
                          <button
                            key={category}
                            aria-label={FILTER_BUTTON_ARIA_LABELS[category]}
                            onClick={() => {
                              setSelectedCategory(category);
                              setCurrentOffset(DEFAULT_OFFSET);
                            }}
                            className={`min-w-[84px] rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${
                              active
                                ? "border-brand-1 bg-brand-3 text-brand-1"
                                : "border-cf-border bg-cf-surface text-cf-text-secondary"
                            }`}
                          >
                            {FILTER_BUTTON_LABELS[category]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded border border-cf-border bg-cf-surface p-3">
            <label
              htmlFor="periodo"
              className="mb-2 block text-sm font-medium text-cf-text-primary"
            >
              Período
            </label>
            <select
              id="periodo"
              value={selectedPeriod}
              onChange={(event) => {
                const nextPeriod = event.target.value as SelectedPeriod;
                setSelectedPeriod(nextPeriod);
                setCurrentOffset(DEFAULT_OFFSET);

                if (nextPeriod !== PERIOD_CUSTOM) {
                  setCustomStartDate("");
                  setCustomEndDate("");
                }
              }}
              className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-secondary"
            >
              {PERIOD_OPTIONS.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>

            <div className="mt-3">
              <label
                htmlFor="categoria-filtro"
                className="mb-1 block text-xs font-medium text-cf-text-primary"
              >
                Categoria
              </label>
              <select
                id="categoria-filtro"
                value={selectedTransactionCategoryId}
                onChange={(event) => {
                  setSelectedTransactionCategoryId(event.target.value);
                  setCurrentOffset(DEFAULT_OFFSET);
                }}
                className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-secondary"
              >
                <option value="">Todas</option>
                {categories.map((categoryOption) => (
                  <option key={categoryOption.id} value={String(categoryOption.id)}>
                    {categoryOption.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3">
              <label
                htmlFor="ordenacao-transacoes"
                className="mb-1 block text-xs font-medium text-cf-text-primary"
              >
                Ordenar por
              </label>
              <select
                id="ordenacao-transacoes"
                value={selectedSort}
                onChange={(event) => {
                  setSelectedSort(normalizeSortOption(event.target.value));
                  setCurrentOffset(DEFAULT_OFFSET);
                }}
                className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-secondary"
              >
                {SORT_OPTIONS.map((sortOption) => (
                  <option key={sortOption.value} value={sortOption.value}>
                    {sortOption.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3">
              <label htmlFor="busca-transacoes" className="mb-1 block text-xs font-medium text-cf-text-primary">
                Buscar
              </label>
              <form onSubmit={handleApplyQueryFilter} className="flex gap-2">
                <input
                  ref={searchInputRef}
                  id="busca-transacoes"
                  type="text"
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  onKeyDown={handleQueryInputKeyDown}
                  placeholder="Descrição ou observações"
                  className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-secondary"
                />
                <button
                  type="submit"
                  className="rounded border border-cf-border bg-cf-surface px-3 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                >
                  Aplicar
                </button>
              </form>
            </div>

                  {selectedPeriod === PERIOD_CUSTOM ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="data-inicial"
                          className="mb-1 block text-xs font-medium text-cf-text-primary"
                        >
                          Data inicial
                        </label>
                        <input
                          id="data-inicial"
                          type="date"
                          value={customStartDate}
                          onChange={(event) => {
                            setCustomStartDate(event.target.value);
                            setCurrentOffset(DEFAULT_OFFSET);
                          }}
                          className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-secondary"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="data-final"
                          className="mb-1 block text-xs font-medium text-cf-text-primary"
                        >
                          Data final
                        </label>
                        <input
                          id="data-final"
                          type="date"
                          value={customEndDate}
                          onChange={(event) => {
                            setCustomEndDate(event.target.value);
                            setCurrentOffset(DEFAULT_OFFSET);
                          }}
                          className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-secondary"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <div className="space-y-6">
          <section ref={summarySectionRef}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium text-cf-text-primary">Visão do mês</h3>
                <p className="mt-1 text-xs text-cf-text-secondary">
                  Saldo, entradas e saídas de movimentações realizadas (sem pendências ou projeções).
                </p>
              </div>
              <input
                type="month"
                aria-label="Mês do resumo"
                value={selectedSummaryMonth}
                onChange={(event) => setSelectedSummaryMonth(event.target.value)}
                className="rounded border border-cf-border bg-cf-surface px-2 py-1 text-sm text-cf-text-primary"
              />
            </div>
            {summaryError ? (
              <div
                className="mb-3 flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                role="status"
                aria-live="polite"
              >
                <span>{summaryError}</span>
                <button
                  type="button"
                  onClick={loadMonthlySummary}
                  className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  Tentar novamente
                </button>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded border border-brand-1 bg-cf-bg-subtle px-4 py-3.5">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Saldo</p>
                <p className="text-xl font-semibold text-cf-text-primary">
                  {isLoadingSummary ? "Carregando..." : money(monthlySummary.balance)}
                </p>
                <p
                  className={`mt-1 text-xs font-medium ${
                    isLoadingSummary || summaryError || momError
                      ? MOM_TONE_CLASSNAMES.neutral
                      : MOM_TONE_CLASSNAMES[monthOverMonthMetrics.balance.tone]
                  }`}
                  data-testid="mom-balance"
                >
                  {isLoadingSummary
                    ? "Vs. mês anterior: calculando..."
                    : summaryError || momError
                      ? "Vs. mês anterior: indisponível"
                      : formatMonthOverMonthSummary(monthOverMonthMetrics.balance)}
                </p>
              </div>
              <div className="rounded border border-brand-1 bg-cf-bg-subtle px-4 py-3.5">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Entradas</p>
                <p className="text-xl font-semibold text-cf-text-primary">
                  {isLoadingSummary ? "Carregando..." : money(monthlySummary.income)}
                </p>
                <p
                  className={`mt-1 text-xs font-medium ${
                    isLoadingSummary || summaryError || momError
                      ? MOM_TONE_CLASSNAMES.neutral
                      : MOM_TONE_CLASSNAMES[monthOverMonthMetrics.income.tone]
                  }`}
                  data-testid="mom-income"
                >
                  {isLoadingSummary
                    ? "Vs. mês anterior: calculando..."
                    : summaryError || momError
                      ? "Vs. mês anterior: indisponível"
                      : formatMonthOverMonthSummary(monthOverMonthMetrics.income)}
                </p>
              </div>
              <div className="rounded border border-brand-1 bg-cf-bg-subtle px-4 py-3.5">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Saídas</p>
                <p className="text-xl font-semibold text-cf-text-primary">
                  {isLoadingSummary ? "Carregando..." : money(monthlySummary.expense)}
                </p>
                <p
                  className={`mt-1 text-xs font-medium ${
                    isLoadingSummary || summaryError || momError
                      ? MOM_TONE_CLASSNAMES.neutral
                      : MOM_TONE_CLASSNAMES[monthOverMonthMetrics.expense.tone]
                  }`}
                  data-testid="mom-expense"
                >
                  {isLoadingSummary
                    ? "Vs. mês anterior: calculando..."
                    : summaryError || momError
                      ? "Vs. mês anterior: indisponível"
                      : formatMonthOverMonthSummary(monthOverMonthMetrics.expense)}
                </p>
              </div>
            </div>
            {!isLoadingSummary && !summaryError && momError ? (
              <div className="mt-2 rounded border border-cf-border bg-cf-surface px-3 py-2 text-sm text-cf-text-secondary">
                {momError}
              </div>
            ) : null}
            {!isLoadingSummary && !summaryError && !hasMonthlySummaryData ? (
              <div className="mt-2 rounded border border-cf-border bg-cf-surface px-3 py-2 text-sm text-cf-text-secondary">
                Sem dados para o mês selecionado.
              </div>
            ) : null}
          </section>
          <section className="space-y-4" aria-labelledby="operational-overview-title">
            <div>
              <h3
                id="operational-overview-title"
                className="text-sm font-medium text-cf-text-primary"
              >
                Painel operacional
              </h3>
              <p className="mt-1 text-xs text-cf-text-secondary">
                O que pede ação agora: projeção, pendências, cartões, renda principal e sinais de risco.
              </p>
              <p className="mt-1 text-xs text-cf-text-secondary">
                Níveis operacionais padronizados: normal, atenção e risco.
              </p>
            </div>

            <OperationalSummaryPanel onOpenDueSoonBills={handleOpenDueSoonBills} />

            <section className="space-y-3" aria-labelledby="critical-cards-title">
              <div className="flex items-center justify-between gap-2">
                <h4 id="critical-cards-title" className="text-xs font-semibold uppercase tracking-wide text-cf-text-secondary">
                  Cards críticos
                </h4>
                <span className="text-xs text-cf-text-secondary">Prioridade de triagem</span>
              </div>

              <div className="flex flex-col gap-5">
                <ForecastCard onOpenProfileSettings={onOpenProfileSettings} />
                <BillsSummaryWidget onOpenBills={handleOpenBills} />
                <CreditCardsSummaryWidget onOpenCreditCards={handleOpenCreditCards} />
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

            <div className="grid gap-5 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <SalaryWidget />
              </div>
              <div className="space-y-5">
                <BankAccountsWidget />
                <ConsignadoOverviewWidget />
              </div>
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="health-goals-title">
            <div>
              <h3 id="health-goals-title" className="text-sm font-medium text-cf-text-primary">
                Saúde e metas
              </h3>
              <p className="mt-1 text-xs text-cf-text-secondary">
                Leitura de sustentação: saúde financeira e metas após triagem operacional.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Suspense fallback={null}>
                <HealthOverview />
              </Suspense>

              <Suspense fallback={null}>
                <GoalsSection />
              </Suspense>
            </div>

            <section>
            <div className="rounded border border-cf-border bg-cf-surface p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-cf-text-primary">Metas do mês</h3>
                  <span className="text-xs text-cf-text-secondary">{selectedSummaryMonth}</span>
                </div>
                <button
                  type="button"
                  onClick={openCreateBudgetModal}
                  disabled={!canCreateBudget}
                  className="rounded border border-cf-border bg-cf-surface px-3 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
                >
                  + Nova meta
                </button>
              </div>
              {budgetsError ? (
                <div
                  className="mb-3 flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                  role="status"
                  aria-live="polite"
                >
                  <span>{budgetsError}</span>
                  <button
                    type="button"
                    onClick={loadMonthlyBudgets}
                    className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : null}
              {!budgetsError && budgetSuccessMessage ? (
                <div
                  className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
                  role="status"
                  aria-live="polite"
                >
                  {budgetSuccessMessage}
                </div>
              ) : null}
              {!isLoadingBudgets && !budgetsError && proactiveNearLimitBudget ? (
                <div
                  className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                  role="status"
                  aria-live="polite"
                  data-testid="budget-near-limit-banner"
                >
                  {`Alerta: você já utilizou ${formatPercentage(proactiveNearLimitBudget.percentage)} da meta de ${proactiveNearLimitBudget.categoryName} neste mês.`}
                </div>
              ) : null}
              {!isLoadingBudgets && !budgetsError && budgetAlerts.length > 0 ? (
                <div
                  className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-3"
                  role="region"
                  aria-label="Alertas de orçamento"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Alertas de orçamento
                    </h4>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      {budgetAlerts.length}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {budgetAlerts.map((budget) => (
                      <li
                        key={`budget-alert-${budget.id}`}
                        data-testid="budget-alert-item"
                        className="rounded border border-amber-200 bg-cf-surface px-3 py-2 text-sm text-cf-text-primary"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="font-semibold text-cf-text-primary">{budget.categoryName}</p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${BUDGET_STATUS_BADGE_CLASSNAMES[budget.status]}`}
                          >
                            {BUDGET_STATUS_LABELS[budget.status]}
                          </span>
                        </div>
                        <p className="text-xs text-cf-text-secondary">
                          Uso: {formatPercentage(budget.percentage)} ({formatCurrency(budget.actual)} de{" "}
                          {formatCurrency(budget.budget)})
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            aria-label={`Ver transações: ${budget.categoryName}`}
                            onClick={() => handleViewBudgetTransactions(budget)}
                            className="rounded border border-cf-border bg-cf-surface px-2 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                          >
                            Ver transações
                          </button>
                          <button
                            type="button"
                            aria-label={`Ajustar meta: ${budget.categoryName}`}
                            onClick={() => openEditBudgetModal(budget)}
                            className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                          >
                            Ajustar meta
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {isLoadingBudgets ? (
                <div className="space-y-2" role="status" aria-live="polite">
                  {Array.from({ length: 3 }).map((_unusedValue, index) => (
                    <div
                      key={`budgets-skeleton-${index + 1}`}
                      className="h-16 animate-pulse rounded border border-cf-border bg-cf-bg-subtle"
                    />
                  ))}
                  <span className="sr-only">Carregando metas do mês...</span>
                </div>
              ) : null}
              {!isLoadingBudgets && !budgetsError && !hasMonthlyBudgetsData ? (
                <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm text-cf-text-secondary">
                  <p>Nenhuma meta cadastrada para o mês selecionado.</p>
                  <button
                    type="button"
                    onClick={openCreateBudgetModal}
                    disabled={!canCreateBudget}
                    className="mt-2 rounded border border-cf-border bg-cf-surface px-3 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Criar meta
                  </button>
                </div>
              ) : null}
              {!isLoadingBudgets && !budgetsError && hasMonthlyBudgetsData ? (
                <ul className="space-y-2">
                  {monthlyBudgets.map((budget) => {
                    const safeStatus =
                      budget.status === "near_limit" || budget.status === "exceeded"
                        ? budget.status
                        : "ok";
                    const progressWidth = `${Math.min(Math.max(budget.percentage, 0), 100)}%`;

                    return (
                      <li
                        key={budget.id}
                        className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm text-cf-text-primary"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="font-semibold text-cf-text-primary">{budget.categoryName}</p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${BUDGET_STATUS_BADGE_CLASSNAMES[safeStatus]}`}
                          >
                            {BUDGET_STATUS_LABELS[safeStatus]}
                          </span>
                        </div>
                        <div className="mb-2 h-2 w-full rounded-full bg-cf-border">
                          <div
                            className={`h-2 rounded-full ${BUDGET_STATUS_BAR_CLASSNAMES[safeStatus]}`}
                            style={{ width: progressWidth }}
                            title={safeStatus === "exceeded" ? "Acima de 100%" : undefined}
                          />
                        </div>
                        <div className="grid gap-1 text-xs text-cf-text-secondary sm:grid-cols-2">
                          <span>Orcado: {formatCurrency(budget.budget)}</span>
                          <span>Realizado: {formatCurrency(budget.actual)}</span>
                          <span>Restante: {formatCurrency(budget.remaining)}</span>
                          <span>Uso: {formatPercentage(budget.percentage)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            aria-label={`Editar meta: ${budget.categoryName}`}
                            onClick={() => openEditBudgetModal(budget)}
                            className="rounded border border-cf-border bg-cf-surface px-2 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            aria-label={`Excluir meta: ${budget.categoryName}`}
                            onClick={() => handleDeleteBudget(budget)}
                            className="rounded border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            Excluir
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            </section>
          </section>

          <section className="space-y-4" aria-labelledby="analytics-overview-title">
            <div>
              <h3 id="analytics-overview-title" className="text-sm font-medium text-cf-text-primary">
                Análise do período
              </h3>
              <p className="mt-1 text-xs text-cf-text-secondary">
                Leitura complementar para depois de revisar o painel operacional e as metas do mês.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded border border-cf-border bg-cf-surface p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-cf-text-secondary">
                  Despesas por categoria
                </h4>
                {isLoadingSummary ? (
                  <p className="mt-3 text-sm text-cf-text-secondary">Carregando categorias...</p>
                ) : summaryError ? (
                  <p className="mt-3 text-sm text-cf-text-secondary">
                    Nao foi possível montar a distribuição por categoria agora.
                  </p>
                ) : hasMeaningfulCategoryBreakdown ? (
                  <div className="mt-3">
                    <Suspense
                      fallback={
                        <div className="rounded border border-cf-border bg-cf-surface p-4 text-sm text-cf-text-secondary">
                          Carregando categorias...
                        </div>
                      }
                    >
                      <CategoryTreemap data={summaryByCategoryExpenses} />
                    </Suspense>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-cf-border bg-cf-bg-subtle px-3 py-3">
                    <p className="text-sm text-cf-text-secondary">
                      Categorize suas saídas para liberar uma visão mais útil das despesas por
                      categoria.
                    </p>
                    <p className="mt-1 text-[11px] text-cf-text-secondary">
                      Registre movimentações com categoria para destravar esta leitura.
                    </p>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={openCreateModal}
                        className="rounded border border-cf-border bg-cf-surface px-2.5 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                      >
                        Registrar valor
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div
                className="rounded border border-cf-border bg-cf-surface p-3"
                role="region"
                aria-label="Top variações por categoria"
              >
                <h4 className="text-xs font-semibold uppercase tracking-wide text-cf-text-secondary">
                  Top variações por categoria
                </h4>
                {isLoadingSummary ? (
                  <p className="mt-3 text-sm text-cf-text-secondary">
                    Aguardando comparativo do mês...
                  </p>
                ) : summaryError || momError ? (
                  <p className="mt-3 text-sm text-cf-text-secondary">
                    Comparativo por categoria indisponível no momento.
                  </p>
                ) : hasMeaningfulCategoryMovers ? (
                  <ul className="mt-2 space-y-2">
                    {topCategoryMovers.map((item) => (
                      <li
                        key={`category-mover-${item.categoryId ?? item.categoryName}`}
                        data-testid="category-mover-item"
                        className="rounded border border-cf-border bg-cf-bg-subtle px-2.5 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-cf-text-primary">{item.categoryName}</p>
                          <span
                            className={`text-xs font-semibold ${MOM_TONE_CLASSNAMES[item.tone]}`}
                          >
                            {`${getDirectionArrow(item.direction)} ${formatSignedPercentage(item.deltaPct)} (${formatSignedCurrency(item.delta)})`}
                          </span>
                        </div>
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            aria-label={`Ver transações categoria: ${item.categoryName}`}
                            onClick={() => handleViewCategoryMoverTransactions(item.categoryId)}
                            className="rounded border border-cf-border bg-cf-surface px-2 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                          >
                            Ver transações
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3 rounded-lg border border-cf-border bg-cf-bg-subtle px-3 py-3">
                    <p className="text-sm text-cf-text-secondary">
                      As maiores variações aparecem quando houver despesas categorizadas em mais de um
                      mês.
                    </p>
                    <p className="mt-1 text-[11px] text-cf-text-secondary">
                      Revise a lista de movimentações para completar a categorização do período.
                    </p>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={scrollToListTop}
                        aria-label="Ver movimentações para categorizar"
                        className="rounded border border-cf-border bg-cf-surface px-2.5 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                      >
                        Ver movimentações
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <section>
              {trendError ? (
                <div className="rounded border border-cf-border bg-cf-surface p-4 text-center text-sm text-cf-text-primary">
                  {trendError}
                </div>
              ) : isLoadingTrend ? (
                <div
                  className="rounded border border-cf-border bg-cf-surface p-4"
                  role="status"
                  aria-live="polite"
                >
                  <div className="h-64 animate-pulse rounded bg-cf-bg-subtle" />
                  <span className="sr-only">Carregando evolução...</span>
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div className="rounded border border-cf-border bg-cf-surface p-4 text-sm text-cf-text-primary">
                      Carregando evolução...
                    </div>
                  }
                >
                  <TrendChart
                    data={trend}
                    onMonthClick={handleTrendMonthClick}
                    selectedMonth={selectedSummaryMonth}
                  />
                </Suspense>
              )}
            </section>

            <section>
              <Suspense
                fallback={
                  <div className="rounded border border-cf-border bg-cf-surface p-4 text-sm text-cf-text-primary">
                    Carregando grafico...
                  </div>
                }
              >
                <TransactionChart data={chartData} />
              </Suspense>
            </section>
          </section>

          <section className="space-y-3" aria-labelledby="transactions-overview-title">
            <div>
              <h3 id="transactions-overview-title" className="text-sm font-medium text-cf-text-primary">
                Movimentações
              </h3>
              <p className="mt-1 text-xs text-cf-text-secondary">
                Detalhe completo para revisão depois da triagem operacional e da análise do período.
              </p>
            </div>

            <section
              ref={listSectionRef}
              className="rounded border border-cf-border bg-cf-surface px-4 py-3.5"
            >
              {requestError ? (
                <div className="p-4 text-center">
                  <p className="text-sm font-medium text-red-600">{requestError}</p>
                  <button
                    onClick={loadTransactions}
                    className="mt-2 font-medium text-brand-1 hover:text-brand-2"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : isLoadingTransactions ? (
                <div className="space-y-2 p-2" role="status" aria-live="polite">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`transactions-skeleton-${index + 1}`}
                      className="h-20 animate-pulse rounded border border-cf-border bg-cf-bg-subtle"
                    />
                  ))}
                  <span className="sr-only">Carregando transações...</span>
                </div>
              ) : filteredTransactions.length === 0 ? (
                hasActiveFilters ? (
                  <div className="p-4 text-center text-cf-text-primary">
                    Nenhum valor encontrado para os filtros selecionados.
                  </div>
                ) : (
                  <div className="p-4 text-center">
                    <p className="text-cf-text-primary">Nenhum valor cadastrado.</p>
                    <button
                      onClick={openCreateModal}
                      className="font-medium text-brand-1 hover:text-brand-2"
                    >
                      Registrar valor
                    </button>
                  </div>
                )
              ) : (
                <TransactionList
                  transactions={transactionsWithCategoryName}
                  onDelete={requestDeleteTransaction}
                  onEdit={openEditModal}
                  onBulkDelete={handleBulkDeleteTransactions}
                />
              )}

              {!requestError && !isLoadingTransactions ? (
                <div className="mt-2 border-t border-cf-border px-2 pt-3 text-sm text-cf-text-primary">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Mostrando {rangeStart}-{rangeEnd} de {paginationMeta.total}
                    </span>
                    <label className="flex items-center gap-2 text-xs font-semibold">
                      Itens por pagina
                      <select
                        aria-label="Itens por pagina"
                        value={pageSize}
                        onChange={(event) => handlePageSizeChange(event.target.value)}
                        className="rounded border border-cf-border bg-cf-surface px-2 py-1 text-sm text-cf-text-primary"
                      >
                        {PAGE_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {paginationMeta.totalPages > 2 ? (
                      <button
                        type="button"
                        onClick={handleFirstPage}
                        disabled={currentPage <= 1}
                        className="rounded border border-cf-border px-3 py-1 font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Primeira
                      </button>
                    ) : (
                      <span />
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handlePreviousPage}
                        disabled={currentPage <= 1}
                        className="rounded border border-cf-border px-3 py-1 font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Anterior
                      </button>
                      <span>
                        Pagina {currentPage} de {paginationMeta.totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={handleNextPage}
                        disabled={currentPage >= paginationMeta.totalPages}
                        className="rounded border border-cf-border px-3 py-1 font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Proxima
                      </button>
                    </div>
                    {paginationMeta.totalPages > 2 ? (
                      <button
                        type="button"
                        onClick={handleLastPage}
                        disabled={currentPage >= paginationMeta.totalPages}
                        className="rounded border border-cf-border px-3 py-1 font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Ultima
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          </section>
        </div>
      </main>

      {undoState ? (
        <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-500 -translate-x-1/2 rounded border border-brand-1 bg-cf-surface px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-cf-text-primary">Transação removida.</p>
            <button
              type="button"
              onClick={restoreDeletedTransaction}
              className="rounded border border-brand-1 px-3 py-1 text-xs font-semibold text-brand-1 hover:bg-brand-3"
            >
              Desfazer
            </button>
          </div>
        </div>
      ) : null}

      {isBudgetModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="budget-modal-title"
            className="w-full max-w-sm rounded bg-cf-surface p-4 shadow-lg"
          >
            <h3 id="budget-modal-title" className="text-base font-semibold text-cf-text-primary">
              Meta do mês
            </h3>
            <p className="mt-1 text-xs text-cf-text-secondary">Mês selecionado: {selectedSummaryMonth}</p>
            {editingBudget ? (
              <div className="mt-2 rounded border border-cf-border bg-cf-bg-subtle px-2 py-1 text-xs text-cf-text-secondary">
                <p>
                  Editando: <strong>{editingBudget.categoryName}</strong>
                </p>
                <p>Categoria bloqueada no modo edicao</p>
              </div>
            ) : null}

            {budgetMutationError ? (
              <p className="mt-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-700" role="alert">
                {budgetMutationError}
              </p>
            ) : null}

            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor="budget-category" className="mb-1 block text-xs font-medium text-cf-text-primary">
                  Categoria da meta
                </label>
                <select
                  id="budget-category"
                  value={budgetForm.categoryId}
                  onChange={(event) =>
                    setBudgetForm((previousState) => ({
                      ...previousState,
                      categoryId: event.target.value,
                    }))
                  }
                  disabled={isSavingBudget || Boolean(editingBudget)}
                  className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary disabled:bg-cf-bg-subtle disabled:text-cf-text-secondary"
                >
                  <option value="">Selecione...</option>
                  {categories.map((categoryOption) => (
                    <option key={categoryOption.id} value={String(categoryOption.id)}>
                      {categoryOption.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="budget-amount" className="mb-1 block text-xs font-medium text-cf-text-primary">
                  Valor da meta
                </label>
                <input
                  id="budget-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={budgetForm.amount}
                  onChange={(event) =>
                    setBudgetForm((previousState) => ({
                      ...previousState,
                      amount: event.target.value,
                    }))
                  }
                  disabled={isSavingBudget}
                  className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary disabled:bg-cf-bg-subtle disabled:text-cf-text-secondary"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeBudgetModal}
                disabled={isSavingBudget}
                className="rounded border border-cf-border px-3 py-1.5 text-sm font-semibold text-cf-text-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveBudget}
                disabled={isSavingBudget}
                className="rounded bg-brand-1 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingBudget ? "Salvando..." : "Salvar meta"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={pendingDeleteTransactionId !== null}
        title="Confirmar exclusão"
        description="Deseja realmente excluir esta transação?"
        confirmLabel="Confirmar exclusão"
        onConfirm={confirmDeleteTransaction}
        onCancel={closeDeleteDialog}
      />

      <ConfirmDialog
        isOpen={pendingDeleteBudget !== null}
        title={`Excluir meta de "${pendingDeleteBudget?.categoryName}"?`}
        confirmLabel="Confirmar"
        onConfirm={handleConfirmDeleteBudget}
        onCancel={() => setPendingDeleteBudget(null)}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTransaction(null);
          setModalRequestError("");
        }}
        onClearSubmitError={() => setModalRequestError("")}
        submitErrorMessage={modalRequestError}
        onSave={handleSaveTransaction}
        categories={categories}
        hasLoadedCategories={hasLoadedCategories}
        initialTransaction={editingTransaction}
      />

      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        reason={upgradeModalReason}
        feature={upgradeModalFeature}
        context={upgradeModalContext}
        onClose={() => setUpgradeModalOpen(false)}
      />

      <ImportCsvModal
        isOpen={isImportModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={handleImportCommitted}
        onOpenHistory={handleOpenImportHistoryAfterImport}
        onDataChanged={handleImportDataChanged}
      />

      <ImportHistoryModal
        isOpen={isImportHistoryModalOpen}
        onClose={() => setImportHistoryModalOpen(false)}
        onImportSessionReverted={handleImportSessionReverted}
      />
    </div>
  );
};

export default App;
