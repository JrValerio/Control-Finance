import { useEffect, useRef, useState } from "react";
import { useMaskedCurrency } from "../context/DiscreetModeContext";
import { getApiErrorMessage } from "../utils/apiError";
import type { Goal, CreateGoalPayload, GoalIcon } from "../services/goals.service";
import { GOAL_ICONS, goalsService } from "../services/goals.service";
import { forecastService } from "../services/forecast.service";
import GoalFormModal from "./GoalFormModal";
import ConfirmDialog from "./ConfirmDialog";

// ── Goal Card ────────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal: Goal;
  projectedBalance: number | null;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onContribute: (goalId: number, amount: number) => Promise<void>;
}

function GoalCard({ goal, projectedBalance, onEdit, onDelete, onContribute }: GoalCardProps) {
  const money = useMaskedCurrency();
  const [showContrib, setShowContrib] = useState(false);
  const [contribAmt, setContribAmt] = useState("");
  const [contributing, setContributing] = useState(false);
  const [contribError, setContribError] = useState<string | null>(null);
  const contribInputRef = useRef<HTMLInputElement>(null);

  const pct = goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
    : 0;

  const barColor =
    pct >= 100 ? "bg-green-500" :
    pct >= 60  ? "bg-brand-1" :
    pct >= 30  ? "bg-amber-500" :
                 "bg-cf-text-secondary";

  const emoji = GOAL_ICONS[goal.icon as GoalIcon] ?? "🎯";

  const deadline = new Date(`${goal.targetDate}T00:00:00`).toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
  });

  const isAtRisk =
    goal.monthlyNeeded > 0 &&
    projectedBalance !== null &&
    goal.monthlyNeeded > projectedBalance;

  const handleContribOpen = () => {
    setContribAmt("");
    setContribError(null);
    setShowContrib(true);
    setTimeout(() => contribInputRef.current?.focus(), 50);
  };

  const handleContribSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(contribAmt);
    if (!Number.isFinite(amt) || amt <= 0) {
      setContribError("Valor inválido.");
      return;
    }
    if (goal.currentAmount + amt > goal.targetAmount) {
      setContribError("Ultrapassaria o valor alvo.");
      return;
    }
    setContributing(true);
    setContribError(null);
    try {
      await onContribute(goal.id, amt);
      setShowContrib(false);
      setContribAmt("");
    } catch (err) {
      setContribError(getApiErrorMessage(err, "Erro ao registrar."));
    } finally {
      setContributing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded border border-cf-border bg-cf-surface p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">{emoji}</span>
          <span className="text-sm font-semibold text-cf-text-primary leading-snug">{goal.title}</span>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onEdit(goal)}
            aria-label={`Editar meta ${goal.title}`}
            className="rounded p-1 text-cf-text-secondary hover:bg-cf-bg-subtle hover:text-cf-text-primary"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onDelete(goal)}
            aria-label={`Excluir meta ${goal.title}`}
            className="rounded p-1 text-cf-text-secondary hover:bg-cf-bg-subtle hover:text-red-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-cf-text-secondary">
            {money(goal.currentAmount)} de {money(goal.targetAmount)}
          </span>
          <span className="text-xs font-semibold text-cf-text-primary">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-cf-bg-subtle">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Footer stats */}
      <div className="flex items-center justify-between text-xs text-cf-text-secondary">
        {goal.monthlyNeeded > 0 ? (
          <span className="flex items-center gap-1">
            <span className="font-semibold text-cf-text-primary">{money(goal.monthlyNeeded)}</span>
            /mês necessário
            {isAtRisk && (
              <span
                title="Esta meta consome mais do que seu saldo projetado este mês."
                aria-label="Meta em risco: necessidade mensal supera saldo projetado"
                className="inline-flex items-center justify-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-500"
              >
                ⚠ risco
              </span>
            )}
          </span>
        ) : (
          <span className="font-semibold text-green-500">Meta atingida 🎉</span>
        )}
        <span>até {deadline}</span>
      </div>

      {/* Quick contribution */}
      {goal.monthlyNeeded > 0 && (
        <div className="border-t border-cf-border pt-2">
          {!showContrib ? (
            <button
              type="button"
              onClick={handleContribOpen}
              className="text-xs font-medium text-brand-1 hover:underline"
            >
              + Registrar poupança
            </button>
          ) : (
            <form onSubmit={handleContribSubmit} className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-cf-text-secondary">R$</span>
              <input
                ref={contribInputRef}
                type="number"
                min="0.01"
                step="0.01"
                value={contribAmt}
                onChange={(e) => { setContribAmt(e.target.value); setContribError(null); }}
                placeholder="0,00"
                aria-label="Valor da contribuição"
                className="w-24 rounded border border-cf-border-input bg-cf-bg-subtle px-2 py-1 text-xs text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1"
              />
              <button
                type="submit"
                disabled={contributing}
                className="rounded bg-brand-1 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-2 disabled:opacity-50"
              >
                {contributing ? "…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setShowContrib(false)}
                className="text-xs text-cf-text-secondary hover:text-cf-text-primary"
              >
                ✕
              </button>
              {contribError && (
                <span className="text-xs text-red-500" role="alert">{contribError}</span>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ── Goals Section ────────────────────────────────────────────────────────────

type ModalMode = { type: "create" } | { type: "edit"; goal: Goal };

export default function GoalsSection() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projectedBalance, setProjectedBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    setError(null);
    try {
      const [goalsData, forecast] = await Promise.all([
        goalsService.list(),
        forecastService
          .getCurrent({ feature: "forecast", widget: "goals-section", operation: "load" })
          .catch(() => null),
      ]);
      setGoals(goalsData);
      setProjectedBalance(forecast?.adjustedProjectedBalance ?? null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao carregar metas."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const handleSave = async (data: {
    title: string;
    target_amount: number;
    current_amount: number;
    target_date: string;
    icon: GoalIcon;
    notes: string | null;
  }) => {
    if (!modal) return;

    if (modal.type === "create") {
      const payload: CreateGoalPayload = {
        title: data.title,
        target_amount: data.target_amount,
        current_amount: data.current_amount,
        target_date: data.target_date,
        icon: data.icon,
        notes: data.notes,
      };
      const created = await goalsService.create(payload);
      setGoals((prev) => [...prev, created]);
    } else {
      const updated = await goalsService.update(modal.goal.id, {
        title: data.title,
        target_amount: data.target_amount,
        current_amount: data.current_amount,
        target_date: data.target_date,
        icon: data.icon,
        notes: data.notes,
      });
      setGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    }

    setModal(null);
  };

  const handleContribute = async (goalId: number, amount: number) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    const updated = await goalsService.update(goalId, {
      current_amount: Number((goal.currentAmount + amount).toFixed(2)),
    });
    setGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await goalsService.remove(deleteTarget.id);
      setGoals((prev) => prev.filter((g) => g.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao excluir meta."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section>
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-cf-text-primary">Metas de Poupança</h3>
            <p className="text-xs text-cf-text-secondary">
              Acompanhe o progresso dos seus objetivos financeiros
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModal({ type: "create" })}
            className="shrink-0 rounded bg-brand-1 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-2"
          >
            + Nova meta
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded border border-cf-border bg-cf-bg-subtle" />
            ))}
          </div>
        ) : error ? (
          <div
            className="flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => { setLoading(true); void fetchData(); }}
              className="shrink-0 text-xs font-semibold underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="text-3xl">🎯</span>
            <p className="text-sm font-medium text-cf-text-primary">Nenhuma meta ainda</p>
            <p className="text-xs text-cf-text-secondary">
              Crie sua primeira meta e acompanhe o progresso mês a mês.
            </p>
            <button
              type="button"
              onClick={() => setModal({ type: "create" })}
              className="mt-1 rounded bg-brand-1 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-2"
            >
              Criar meta
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                projectedBalance={projectedBalance}
                onEdit={(g) => setModal({ type: "edit", goal: g })}
                onDelete={setDeleteTarget}
                onContribute={handleContribute}
              />
            ))}
          </div>
        )}
      </div>

      <GoalFormModal
        isOpen={modal !== null}
        goal={modal?.type === "edit" ? modal.goal : null}
        onSave={handleSave}
        onCancel={() => setModal(null)}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Excluir meta"
        description={`Tem certeza que deseja excluir "${deleteTarget?.title}"? Esta ação não pode ser desfeita.`}
        confirmLabel={deleting ? "Excluindo…" : "Excluir"}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
