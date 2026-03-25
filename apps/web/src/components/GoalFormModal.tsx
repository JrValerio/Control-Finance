import { useEffect, useRef, useState } from "react";
import type { Goal, GoalIcon } from "../services/goals.service";
import { GOAL_ICONS } from "../services/goals.service";

interface GoalFormModalProps {
  isOpen: boolean;
  goal?: Goal | null;
  onSave: (data: {
    title: string;
    target_amount: number;
    current_amount: number;
    target_date: string;
    icon: GoalIcon;
    notes: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}

const ICONS = Object.keys(GOAL_ICONS) as GoalIcon[];

export default function GoalFormModal({ isOpen, goal, onSave, onCancel }: GoalFormModalProps) {
  const [title, setTitle] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [icon, setIcon] = useState<GoalIcon>("target");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(goal?.title ?? "");
    setTargetAmount(goal ? String(goal.targetAmount) : "");
    setCurrentAmount(goal ? String(goal.currentAmount) : "");
    setTargetDate(goal?.targetDate ?? "");
    setIcon(goal?.icon ?? "target");
    setNotes(goal?.notes ?? "");
    setError(null);
    setSaving(false);
    setTimeout(() => firstInputRef.current?.focus(), 50);
  }, [isOpen, goal]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const ta = Number(targetAmount);
    const ca = Number(currentAmount) || 0;

    if (!title.trim()) return setError("Título é obrigatório.");
    if (!Number.isFinite(ta) || ta <= 0) return setError("Valor alvo deve ser maior que zero.");
    if (!Number.isFinite(ca) || ca < 0) return setError("Valor atual não pode ser negativo.");
    if (ca > ta) return setError("Valor atual não pode superar o valor alvo.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return setError("Data alvo inválida.");

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        target_amount: ta,
        current_amount: ca,
        target_date: targetDate,
        icon,
        notes: notes.trim() || null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar meta.";
      setError(msg);
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg bg-cf-surface p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="goal-modal-title" className="mb-4 text-base font-semibold text-cf-text-primary">
          {goal ? "Editar meta" : "Nova meta de poupança"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-cf-text-secondary">
              Título
            </label>
            <input
              ref={firstInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Viagem ao Japão"
              maxLength={200}
              className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
            />
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-cf-text-secondary">
                Valor alvo (R$)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="15000"
                className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-cf-text-secondary">
                Já guardado (R$)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label htmlFor="goal-target-date" className="mb-1 block text-xs font-medium text-cf-text-secondary">
              Data alvo
            </label>
            <input
              id="goal-target-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1"
            />
          </div>

          {/* Icon picker */}
          <div>
            <label className="mb-1 block text-xs font-medium text-cf-text-secondary">Ícone</label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map((key) => (
                <button
                  key={key}
                  type="button"
                  title={key}
                  onClick={() => setIcon(key)}
                  className={`flex h-9 w-9 items-center justify-center rounded border text-lg transition-colors ${
                    icon === key
                      ? "border-brand-1 bg-brand-1/10"
                      : "border-cf-border bg-cf-bg-subtle hover:border-brand-1/50"
                  }`}
                >
                  {GOAL_ICONS[key]}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-cf-text-secondary">
              Observações (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Detalhes sobre a meta…"
              className="w-full resize-none rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded border border-cf-border px-3 py-1.5 text-sm font-semibold text-cf-text-secondary hover:bg-cf-bg-subtle disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-brand-1 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:opacity-50"
            >
              {saving ? "Salvando…" : goal ? "Salvar alterações" : "Criar meta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
