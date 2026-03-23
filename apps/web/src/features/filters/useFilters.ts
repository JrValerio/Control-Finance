import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CATEGORY_ALL,
  CATEGORY_ENTRY,
  getTodayISODate,
  PERIOD_ALL,
  PERIOD_CUSTOM,
  resolvePeriodRange,
} from "../../components/DatabaseUtils";

// ── Types ───────────────────────────────────────────────────────────────────

export type SelectedCategory = "Todos" | "Entrada" | "Saida";
export type SelectedPeriod =
  | "Todo período"
  | "Hoje"
  | "Últimos 7 dias"
  | "Últimos 30 dias"
  | "Personalizado";
export type FilterPresetId = "this-month" | "clear";
export type RemovableChipId = "q" | "type" | "period" | "category" | "sort";

export interface AppliedChip {
  id: RemovableChipId;
  text: string;
  removable: boolean;
  removeLabel: string;
}

export interface FilterState {
  selectedCategory: SelectedCategory;
  selectedPeriod: SelectedPeriod;
  selectedSort: string;
  selectedQuery: string;
  selectedTransactionCategoryId: string;
  customStartDate: string;
  customEndDate: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_SORT = "date:asc";

export const SORT_OPTIONS = [
  { value: "date:asc", label: "Data (mais antigas)" },
  { value: "date:desc", label: "Data (mais recentes)" },
  { value: "amount:desc", label: "Valor (maior)" },
  { value: "amount:asc", label: "Valor (menor)" },
  { value: "description:asc", label: "Descricao (A-Z)" },
  { value: "description:desc", label: "Descricao (Z-A)" },
] as const;

const SORT_OPTION_VALUES = new Set<string>(SORT_OPTIONS.map((o) => o.value));
const MOBILE_FILTERS_BREAKPOINT = 640;

// ── Utilities ────────────────────────────────────────────────────────────────

export const getCurrentMonthRange = (referenceDate = new Date()) => {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);
  return {
    startDate: getTodayISODate(startDate),
    endDate: getTodayISODate(endDate),
  };
};

export const normalizeSortOption = (value: string | null | undefined): string => {
  if (typeof value !== "string") return DEFAULT_SORT;
  const normalized = value.trim().toLowerCase();
  return SORT_OPTION_VALUES.has(normalized) ? normalized : DEFAULT_SORT;
};

export const isSelectedPeriod = (value: string | null): value is SelectedPeriod =>
  value === "Todo período" ||
  value === "Hoje" ||
  value === "Últimos 7 dias" ||
  value === "Últimos 30 dias" ||
  value === "Personalizado";

export const isCompactFiltersPanelMode = (): boolean =>
  typeof window !== "undefined" && window.innerWidth < MOBILE_FILTERS_BREAKPOINT;

export const hasInitialActiveFilters = (filters: FilterState): boolean =>
  filters.selectedCategory !== CATEGORY_ALL ||
  filters.selectedPeriod !== PERIOD_ALL ||
  Boolean(filters.selectedTransactionCategoryId) ||
  Boolean(filters.selectedQuery);

// ── Hook interface ───────────────────────────────────────────────────────────

export interface UseFiltersOptions {
  initialState: FilterState;
  onPaginationReset?: () => void;
  scrollToListTop?: () => void;
  categoryNameById?: Map<number, string>;
}

export interface UseFiltersReturn {
  selectedCategory: SelectedCategory;
  setSelectedCategory: (v: SelectedCategory) => void;
  selectedPeriod: SelectedPeriod;
  setSelectedPeriod: (v: SelectedPeriod) => void;
  selectedSort: string;
  setSelectedSort: (v: string) => void;
  selectedQuery: string;
  queryInput: string;
  setQueryInput: (v: string) => void;
  selectedTransactionCategoryId: string;
  setSelectedTransactionCategoryId: (v: string) => void;
  customStartDate: string;
  setCustomStartDate: (v: string) => void;
  customEndDate: string;
  setCustomEndDate: (v: string) => void;
  isFiltersPanelOpen: boolean;
  setIsFiltersPanelOpen: (v: boolean) => void;
  isMobileFiltersPanel: boolean;
  filtersPanelRef: RefObject<HTMLElement>;
  searchInputRef: RefObject<HTMLInputElement>;
  periodRange: { startDate: string | null; endDate: string | null };
  activeFiltersCount: number;
  hasActiveFilters: boolean;
  appliedChips: AppliedChip[];
  handleApplyQueryFilter: (event?: FormEvent<HTMLFormElement>) => void;
  handleQueryInputKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  handleRemoveAppliedChip: (chipId: RemovableChipId) => void;
  applyFilterPreset: (presetId: FilterPresetId) => void;
  handleEditFilters: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFilters({
  initialState,
  onPaginationReset,
  scrollToListTop,
  categoryNameById = new Map(),
}: UseFiltersOptions): UseFiltersReturn {
  const filtersPanelRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [selectedCategory, setSelectedCategory] = useState<SelectedCategory>(
    initialState.selectedCategory,
  );
  const [selectedPeriod, setSelectedPeriod] = useState<SelectedPeriod>(initialState.selectedPeriod);
  const [selectedSort, setSelectedSort] = useState(initialState.selectedSort || DEFAULT_SORT);
  const [selectedQuery, setSelectedQuery] = useState(initialState.selectedQuery || "");
  const [queryInput, setQueryInput] = useState(initialState.selectedQuery || "");
  const [selectedTransactionCategoryId, setSelectedTransactionCategoryId] = useState(
    initialState.selectedTransactionCategoryId,
  );
  const [customStartDate, setCustomStartDate] = useState(initialState.customStartDate);
  const [customEndDate, setCustomEndDate] = useState(initialState.customEndDate);
  const [isMobileFiltersPanel, setIsMobileFiltersPanel] = useState(() =>
    isCompactFiltersPanelMode(),
  );
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState(
    () => hasInitialActiveFilters(initialState),
  );

  // Sync responsive layout on window resize
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncMobileFiltersMode = () => {
      const isMobileMode = isCompactFiltersPanelMode();
      setIsMobileFiltersPanel(isMobileMode);
    };

    syncMobileFiltersMode();
    window.addEventListener("resize", syncMobileFiltersMode);
    return () => window.removeEventListener("resize", syncMobileFiltersMode);
  }, []);

  const periodRange = useMemo(
    () => resolvePeriodRange(selectedPeriod, { startDate: customStartDate, endDate: customEndDate }),
    [selectedPeriod, customStartDate, customEndDate],
  );

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== CATEGORY_ALL) count += 1;
    if (selectedPeriod !== PERIOD_ALL) count += 1;
    if (selectedTransactionCategoryId) count += 1;
    if (selectedQuery) count += 1;
    return count;
  }, [selectedCategory, selectedPeriod, selectedQuery, selectedTransactionCategoryId]);

  const hasActiveFilters = activeFiltersCount > 0;

  // Auto-open filters panel on mobile when active filters exist
  useEffect(() => {
    if (!isMobileFiltersPanel || !hasActiveFilters) return;
    setIsFiltersPanelOpen(true);
  }, [hasActiveFilters, isMobileFiltersPanel]);

  const appliedChips = useMemo<AppliedChip[]>(() => {
    const chips: AppliedChip[] = [];

    if (selectedQuery) {
      chips.push({ id: "q", text: `Busca: "${selectedQuery}"`, removable: true, removeLabel: "Busca" });
    }

    if (selectedCategory !== CATEGORY_ALL) {
      const label = selectedCategory === CATEGORY_ENTRY ? "Entradas" : "Saidas";
      chips.push({ id: "type", text: `Tipo: ${label}`, removable: true, removeLabel: "Tipo" });
    }

    if (selectedPeriod !== PERIOD_ALL) {
      const text =
        selectedPeriod === PERIOD_CUSTOM
          ? `Período: ${customStartDate || "--"} -> ${customEndDate || "--"}`
          : `Período: ${selectedPeriod}`;
      chips.push({ id: "period", text, removable: true, removeLabel: "Período" });
    }

    if (selectedTransactionCategoryId) {
      const name = categoryNameById.get(Number(selectedTransactionCategoryId));
      chips.push({
        id: "category",
        text: `Categoria: ${name || `#${selectedTransactionCategoryId}`}`,
        removable: true,
        removeLabel: "Categoria",
      });
    }

    const sortLabel =
      SORT_OPTIONS.find((o) => o.value === selectedSort)?.label ?? selectedSort;
    chips.push({ id: "sort", text: `Ordenacao: ${sortLabel}`, removable: true, removeLabel: "Ordenacao" });

    return chips;
  }, [
    categoryNameById,
    customEndDate,
    customStartDate,
    selectedCategory,
    selectedPeriod,
    selectedQuery,
    selectedSort,
    selectedTransactionCategoryId,
  ]);

  const handleRemoveAppliedChip = useCallback(
    (chipId: RemovableChipId) => {
      let shouldFocusSearchInput = false;

      if (chipId === "q") {
        setQueryInput("");
        setSelectedQuery("");
        shouldFocusSearchInput = true;
      } else if (chipId === "type") {
        setSelectedCategory(CATEGORY_ALL);
      } else if (chipId === "period") {
        setSelectedPeriod(PERIOD_ALL);
        setCustomStartDate("");
        setCustomEndDate("");
      } else if (chipId === "category") {
        setSelectedTransactionCategoryId("");
      } else if (chipId === "sort") {
        setSelectedSort(DEFAULT_SORT);
      } else {
        return;
      }

      onPaginationReset?.();
      scrollToListTop?.();

      if (shouldFocusSearchInput) {
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => {
            searchInputRef.current?.focus();
          });
        } else {
          searchInputRef.current?.focus();
        }
      }
    },
    [onPaginationReset, scrollToListTop],
  );

  const handleApplyQueryFilter = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const normalizedQuery = queryInput.trim();
      setQueryInput(normalizedQuery);
      setSelectedQuery(normalizedQuery);
      onPaginationReset?.();
    },
    [queryInput, onPaginationReset],
  );

  const handleQueryInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Escape") return;

      const normalizedInput = queryInput.trim();
      const normalizedSelectedQuery = selectedQuery.trim();

      if (!normalizedInput && !normalizedSelectedQuery) return;

      event.preventDefault();

      if (normalizedSelectedQuery && normalizedInput === normalizedSelectedQuery) {
        handleRemoveAppliedChip("q");
        return;
      }

      if (normalizedInput) {
        setQueryInput("");
        return;
      }

      if (normalizedSelectedQuery) {
        handleRemoveAppliedChip("q");
      }
    },
    [queryInput, selectedQuery, handleRemoveAppliedChip],
  );

  const applyFilterPreset = useCallback(
    (presetId: FilterPresetId) => {
      if (presetId === "this-month") {
        const { startDate, endDate } = getCurrentMonthRange();
        setSelectedPeriod(PERIOD_CUSTOM);
        setCustomStartDate(startDate);
        setCustomEndDate(endDate);
        onPaginationReset?.();
        scrollToListTop?.();
        return;
      }

      if (presetId === "clear") {
        setSelectedCategory(CATEGORY_ALL);
        setSelectedPeriod(PERIOD_ALL);
        setCustomStartDate("");
        setCustomEndDate("");
        setSelectedTransactionCategoryId("");
        setQueryInput("");
        setSelectedQuery("");
        onPaginationReset?.();
        scrollToListTop?.();
      }
    },
    [onPaginationReset, scrollToListTop],
  );

  const handleEditFilters = useCallback(() => {
    setIsFiltersPanelOpen(true);

    const focusSearchInput = () => {
      searchInputRef.current?.focus();
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        filtersPanelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        window.requestAnimationFrame(focusSearchInput);
      });
      return;
    }

    filtersPanelRef.current?.scrollIntoView?.({ block: "start" });
    focusSearchInput();
  }, []);

  return {
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
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    isFiltersPanelOpen,
    setIsFiltersPanelOpen,
    isMobileFiltersPanel,
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
  };
}
