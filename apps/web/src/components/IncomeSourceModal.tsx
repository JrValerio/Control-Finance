import { useCallback, useEffect, useState } from "react";
import {
  incomeSourcesService,
  type IncomeSourceWithDeductions,
  type CreateIncomeSourcePayload,
} from "../services/incomeSources.service";

interface CategoryOption {
  id: number;
  name: string;
}

interface IncomeSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (source: IncomeSourceWithDeductions) => void;
  initialSource?: IncomeSourceWithDeductions | null;
  categories?: CategoryOption[];
}

const IncomeSourceModal = ({
  isOpen,
  onClose,
  onSaved,
  initialSource = null,
  categories = [],
}: IncomeSourceModalProps): JSX.Element | null => {
  const isEditing = Boolean(initialSource);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [defaultDay, setDefaultDay] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    if (initialSource) {
      setName(initialSource.name);
      setCategoryId(initialSource.categoryId ? String(initialSource.categoryId) : "");
      setDefaultDay(initialSource.defaultDay ? String(initialSource.defaultDay) : "");
      setNotes(initialSource.notes ?? "");
    } else {
      setName("");
      setCategoryId("");
      setDefaultDay("");
      setNotes("");
    }
    setErrorMessage("");
    setIsSaving(false);
  }, [isOpen, initialSource]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrorMessage("");

      const trimmedName = name.trim();
      if (!trimmedName) {
        setErrorMessage("Nome é obrigatório.");
        return;
      }

      const dayNum = defaultDay ? parseInt(defaultDay, 10) : null;
      if (dayNum !== null && (isNaN(dayNum) || dayNum < 1 || dayNum > 31)) {
        setErrorMessage("Dia deve ser entre 1 e 31.");
        return;
      }

      setIsSaving(true);
      try {
        const payload: CreateIncomeSourcePayload = {
          name: trimmedName,
          categoryId: categoryId ? Number(categoryId) : null,
          defaultDay: dayNum,
          notes: notes.trim() || null,
        };

        const saved = isEditing && initialSource
          ? await incomeSourcesService.update(initialSource.id, payload)
          : await incomeSourcesService.create(payload);

        onSaved(saved);
      } catch (error) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        setErrorMessage(
          err?.response?.data?.message || err?.message || "Não foi possível salvar.",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [name, categoryId, defaultDay, notes, isEditing, initialSource, onSaved],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen items-start justify-center bg-black/50 p-6 sm:items-center"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="w-full max-w-md rounded-lg bg-cf-surface p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-cf-text-primary">
            {isEditing ? "Editar fonte de renda" : "Nova fonte de renda"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-cf-text-secondary transition-colors hover:text-cf-text-primary"
            aria-label="Fechar modal"
          >
            X
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="source-name" className="text-sm font-medium text-cf-text-primary">
              Nome <span className="text-red-500">*</span>
            </label>
            <input
              id="source-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Pensao INSS"
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1 bg-cf-surface"
              disabled={isSaving}
              maxLength={200}
            />
          </div>

          {/* Dia padrao */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="source-default-day" className="text-sm font-medium text-cf-text-primary">
              Dia de credito{" "}
              <span className="text-xs font-normal text-cf-text-secondary">(opcional, 1–31)</span>
            </label>
            <input
              id="source-default-day"
              type="number"
              min={1}
              max={31}
              value={defaultDay}
              onChange={(e) => setDefaultDay(e.target.value)}
              placeholder="Ex: 5"
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1 bg-cf-surface"
              disabled={isSaving}
            />
          </div>

          {/* Categoria */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="source-category" className="text-sm font-medium text-cf-text-primary">
              Categoria{" "}
              <span className="text-xs font-normal text-cf-text-secondary">(opcional)</span>
            </label>
            <select
              id="source-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-primary bg-cf-surface focus:outline-none focus:ring-1 focus:ring-brand-1"
              disabled={isSaving}
            >
              <option value="">Sem categoria</option>
              {categories.map((cat) => (
                <option key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Notas */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="source-notes" className="text-sm font-medium text-cf-text-primary">
              Notas{" "}
              <span className="text-xs font-normal text-cf-text-secondary">(opcional)</span>
            </label>
            <textarea
              id="source-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observacoes..."
              rows={2}
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1 bg-cf-surface resize-none"
              disabled={isSaving}
            />
          </div>

          {errorMessage ? (
            <div
              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded border border-cf-border px-4 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IncomeSourceModal;
