import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  categoriesService,
  type CategoryItem,
} from "../services/categories.service";
import { getApiErrorMessage, getApiErrorStatus } from "../utils/apiError";

const parseIncludeDeletedParam = (value: string | null | undefined): boolean =>
  String(value || "").toLowerCase() === "true";

const resolveCategoryMutationErrorMessage = (error: unknown, fallbackMessage: string): string => {
  const status = getApiErrorStatus(error);

  if (status === 409) {
    return "Categoria já existe.";
  }

  if (status === 404) {
    return "Categoria não encontrada.";
  }

  return getApiErrorMessage(error, fallbackMessage);
};

interface CategoriesSettingsProps {
  onBack?: () => void;
  onLogout?: () => void;
}

const CategoriesSettings = ({
  onBack = undefined,
  onLogout = undefined,
}: CategoriesSettingsProps): JSX.Element => {
  const [searchParams, setSearchParams] = useSearchParams();
  const includeDeleted = useMemo(
    () => parseIncludeDeletedParam(searchParams.get("includeDeleted")),
    [searchParams],
  );
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoadingCategories, setLoadingCategories] = useState(false);
  const [isCategoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [categoryFormName, setCategoryFormName] = useState("");
  const [isSavingCategory, setSavingCategory] = useState(false);
  const [pageErrorMessage, setPageErrorMessage] = useState("");
  const [categoryModalErrorMessage, setCategoryModalErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    setPageErrorMessage("");

    try {
      const response = await categoriesService.listCategories(includeDeleted);
      setCategories(Array.isArray(response) ? response : []);
    } catch (error) {
      setCategories([]);
      setPageErrorMessage(getApiErrorMessage(error, "Não foi possível carregar as categorias."));
    } finally {
      setLoadingCategories(false);
    }
  }, [includeDeleted]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const openCreateCategoryModal = () => {
    setEditingCategory(null);
    setCategoryFormName("");
    setCategoryModalErrorMessage("");
    setCategoryModalOpen(true);
  };

  const openRenameCategoryModal = (category: CategoryItem) => {
    setEditingCategory(category);
    setCategoryFormName(category?.name || "");
    setCategoryModalErrorMessage("");
    setCategoryModalOpen(true);
  };

  const closeCategoryModal = () => {
    if (isSavingCategory) {
      return;
    }

    setCategoryModalOpen(false);
    setEditingCategory(null);
    setCategoryFormName("");
    setCategoryModalErrorMessage("");
  };

  const handleSubmitCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = String(categoryFormName || "").trim();
    if (!normalizedName) {
      setCategoryModalErrorMessage("Nome da categoria é obrigatório.");
      return;
    }

    setSavingCategory(true);
    setCategoryModalErrorMessage("");
    setPageErrorMessage("");
    setSuccessMessage("");

    try {
      if (editingCategory?.id) {
        await categoriesService.updateCategory(editingCategory.id, normalizedName);
        setSuccessMessage("Categoria atualizada.");
      } else {
        await categoriesService.createCategory(normalizedName);
        setSuccessMessage("Categoria criada.");
      }

      closeCategoryModal();
      await loadCategories();
    } catch (error) {
      setCategoryModalErrorMessage(
        resolveCategoryMutationErrorMessage(error, "Não foi possível salvar a categoria."),
      );
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = (category: CategoryItem) => {
    setPendingConfirm({
      title: `Remover categoria "${category.name}"?`,
      onConfirm: async () => {
        setPageErrorMessage("");
        setSuccessMessage("");
        try {
          await categoriesService.deleteCategory(category.id);
          setSuccessMessage("Categoria removida.");
          await loadCategories();
        } catch (error) {
          setPageErrorMessage(
            resolveCategoryMutationErrorMessage(error, "Não foi possível remover a categoria."),
          );
        }
      },
    });
  };

  const handleRestoreCategory = (category: CategoryItem) => {
    setPendingConfirm({
      title: `Restaurar categoria "${category.name}"?`,
      onConfirm: async () => {
        setPageErrorMessage("");
        setSuccessMessage("");
        try {
          await categoriesService.restoreCategory(category.id);
          setSuccessMessage("Categoria restaurada.");
          await loadCategories();
        } catch (error) {
          setPageErrorMessage(
            resolveCategoryMutationErrorMessage(error, "Não foi possível restaurar a categoria."),
          );
        }
      },
    });
  };

  const handleToggleIncludeDeleted = (nextCheckedState: boolean) => {
    const nextParams = new URLSearchParams(searchParams);

    if (nextCheckedState) {
      nextParams.set("includeDeleted", "true");
    } else {
      nextParams.delete("includeDeleted");
    }

    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="min-h-screen bg-cf-bg-page py-6">
      <main className="mx-auto w-full max-w-4xl space-y-4 px-4 sm:px-6">
        <section className="rounded border border-cf-border bg-cf-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-cf-text-primary">Settings - Categorias</h1>
              <p className="mt-1 text-sm text-cf-text-secondary">
                Gerencie categorias ativas e removidas para os lançamentos.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                className="rounded border border-cf-border bg-cf-surface px-3 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
              >
                Voltar ao dashboard
              </button>
              {onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded border border-cf-border bg-cf-surface px-3 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                >
                  Sair
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-cf-text-primary">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(event) => handleToggleIncludeDeleted(event.target.checked)}
              />
              Incluir removidas
            </label>
            <button
              type="button"
              onClick={openCreateCategoryModal}
              className="rounded bg-brand-1 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-2"
            >
              + Nova categoria
            </button>
          </div>

          {pageErrorMessage ? (
            <div
              className="mt-3 flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              <span>{pageErrorMessage}</span>
              <button
                type="button"
                onClick={loadCategories}
                className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Tentar novamente
              </button>
            </div>
          ) : null}

          {!pageErrorMessage && successMessage ? (
            <p
              className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
              role="status"
              aria-live="polite"
            >
              {successMessage}
            </p>
          ) : null}

          {isLoadingCategories ? (
            <div className="mt-3 space-y-2" role="status" aria-live="polite">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`categories-skeleton-${index + 1}`}
                  className="h-12 animate-pulse rounded border border-cf-border bg-cf-bg-subtle"
                />
              ))}
              <span className="sr-only">Carregando categorias...</span>
            </div>
          ) : null}

          {!isLoadingCategories && categories.length === 0 ? (
            <div className="mt-3 rounded border border-cf-border bg-cf-bg-subtle px-3 py-3 text-sm text-cf-text-secondary">
              Nenhuma categoria encontrada para o filtro atual.
            </div>
          ) : null}

          {!isLoadingCategories && categories.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {categories.map((category) => {
                const isDeleted = Boolean(category.deletedAt);

                return (
                  <li
                    key={category.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded border border-cf-border bg-cf-surface px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-cf-text-primary">{category.name}</p>
                      <p className="text-xs text-cf-text-secondary">
                        {isDeleted ? "Removida" : "Ativa"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isDeleted ? (
                        <button
                          type="button"
                          onClick={() => handleRestoreCategory(category)}
                          className="rounded border border-green-300 bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-100"
                        >
                          Restaurar
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openRenameCategoryModal(category)}
                            className="rounded border border-cf-border bg-cf-surface px-2 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                          >
                            Renomear
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(category)}
                            className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            Remover
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      </main>

      <ConfirmDialog
        isOpen={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ""}
        onConfirm={() => {
          const action = pendingConfirm;
          setPendingConfirm(null);
          void action?.onConfirm();
        }}
        onCancel={() => setPendingConfirm(null)}
      />

      {isCategoryModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-modal-title"
            className="w-full max-w-sm rounded bg-cf-surface p-4 shadow-lg"
          >
            <h2 id="category-modal-title" className="text-base font-semibold text-cf-text-primary">
              {editingCategory ? "Renomear categoria" : "Nova categoria"}
            </h2>

            {categoryModalErrorMessage ? (
              <p
                className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                role="alert"
              >
                {categoryModalErrorMessage}
              </p>
            ) : null}

            <form onSubmit={handleSubmitCategory} className="mt-3 space-y-3">
              <div>
                <label htmlFor="category-name" className="mb-1 block text-xs font-medium text-cf-text-primary">
                  Nome
                </label>
                <input
                  id="category-name"
                  type="text"
                  value={categoryFormName}
                  onChange={(event) => {
                    setCategoryFormName(event.target.value);
                    setCategoryModalErrorMessage("");
                  }}
                  placeholder="Ex.: Alimentacao"
                  className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCategoryModal}
                  disabled={isSavingCategory}
                  className="rounded border border-cf-border px-3 py-1.5 text-sm font-semibold text-cf-text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="rounded bg-brand-1 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingCategory ? "Salvando..." : editingCategory ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CategoriesSettings;
