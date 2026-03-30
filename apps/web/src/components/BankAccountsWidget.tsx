import { useEffect, useState, useCallback } from "react";
import { useMaskedCurrency } from "../context/DiscreetModeContext";
import {
  bankAccountsService,
  type BankAccountItem,
  type BankAccountsSummary,
} from "../services/bank-accounts.service";
import { aiService, type BankAccountInsight } from "../services/ai.service";

const EMPTY_SUMMARY: BankAccountsSummary = {
  totalBalance: 0,
  totalLimitTotal: 0,
  totalLimitUsed: 0,
  totalLimitAvailable: 0,
  accountsCount: 0,
};

interface FormState {
  name: string;
  bankName: string;
  balance: string;
  limitTotal: string;
}

const EMPTY_FORM: FormState = { name: "", bankName: "", balance: "", limitTotal: "" };

interface ModalState {
  open: boolean;
  editing: BankAccountItem | null;
}

const statusOf = (account: BankAccountItem) => {
  if (account.limitUsed > 0 && account.limitUsed >= account.limitTotal && account.limitTotal > 0) {
    return "critical";
  }
  if (account.balance < 0) return "limit_in_use";
  return "healthy";
};

const BankAccountsWidget = (): JSX.Element => {
  const [accounts, setAccounts] = useState<BankAccountItem[]>([]);
  const [summary, setSummary] = useState<BankAccountsSummary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [modal, setModal] = useState<ModalState>({ open: false, editing: null });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [insight, setInsight] = useState<BankAccountInsight | null>(null);
  const money = useMaskedCurrency();

  const load = useCallback(() => {
    setIsLoading(true);
    bankAccountsService
      .list()
      .then((result) => {
        setAccounts(result.accounts);
        setSummary(result.summary);
        setHasError(false);
      })
      .catch(() => {
        setHasError(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Insight fetched once on mount — it's a soft signal, not synchronized with every edit.
  useEffect(() => {
    aiService.getBankAccountInsight().then(setInsight).catch(() => {/* non-blocking */});
  }, []);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setModal({ open: true, editing: null });
  };

  const openEdit = (account: BankAccountItem) => {
    setForm({
      name: account.name,
      bankName: account.bankName ?? "",
      balance: String(account.balance),
      limitTotal: account.limitTotal > 0 ? String(account.limitTotal) : "",
    });
    setFormError(null);
    setModal({ open: true, editing: account });
  };

  const closeModal = () => {
    setModal({ open: false, editing: null });
    setFormError(null);
  };

  const handleSave = async () => {
    const balanceNum = Number(form.balance.replace(",", "."));
    const limitNum = form.limitTotal.trim() ? Number(form.limitTotal.replace(",", ".")) : 0;

    if (!form.name.trim()) {
      setFormError("Informe o nome da conta.");
      return;
    }
    if (!Number.isFinite(balanceNum)) {
      setFormError("Saldo inválido.");
      return;
    }
    if (!Number.isFinite(limitNum) || limitNum < 0) {
      setFormError("Limite inválido.");
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const payload = {
        name: form.name.trim(),
        bankName: form.bankName.trim() || null,
        balance: balanceNum,
        limitTotal: limitNum,
      };

      if (modal.editing) {
        await bankAccountsService.update(modal.editing.id, payload);
      } else {
        await bankAccountsService.create(payload);
      }

      closeModal();
      load();
    } catch {
      setFormError("Erro ao salvar. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await bankAccountsService.delete(id);
      setConfirmDeleteId(null);
      load();
    } catch {
      /* ignore */
    }
  };

  if (isLoading) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <p className="text-xs text-cf-text-secondary">Carregando contas bancárias...</p>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <h3 className="mb-1 text-sm font-medium text-cf-text-primary">Conta corrente</h3>
        <p className="text-sm text-cf-text-secondary">
          Não foi possível carregar as contas bancárias.
        </p>
      </div>
    );
  }

  const hasAccounts = summary.accountsCount > 0;
  const usingLimit = summary.totalLimitUsed > 0;

  return (
    <>
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-cf-text-primary">Conta corrente</h3>
            <p className="text-xs text-cf-text-secondary">
              {hasAccounts
                ? summary.accountsCount === 1
                  ? "1 conta cadastrada"
                  : `${summary.accountsCount} contas cadastradas`
                : "Nenhuma conta cadastrada ainda."}
            </p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="rounded border border-cf-border px-2 py-1 text-xs text-cf-text-secondary hover:bg-cf-bg-subtle hover:text-cf-text-primary"
          >
            + Adicionar
          </button>
        </div>

        {/* Empty state */}
        {!hasAccounts ? (
          <div className="rounded border border-dashed border-cf-border bg-cf-bg-subtle px-3 py-3 text-sm text-cf-text-secondary">
            Cadastre sua conta para acompanhar saldo atual, limite disponível e posição real do banco.
          </div>
        ) : (
          <>
            {/* Summary metrics */}
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Saldo total */}
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Saldo em conta</p>
                <p
                  className={`text-sm font-semibold ${
                    summary.totalBalance < 0 ? "text-red-600" : "text-cf-text-primary"
                  }`}
                >
                  {money(summary.totalBalance)}
                </p>
                <p className="text-xs text-cf-text-secondary">Dinheiro disponível</p>
              </div>

              {/* Limite disponível */}
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">
                  Limite disponível
                </p>
                <p
                  className={`text-sm font-semibold ${
                    usingLimit ? "text-amber-700" : "text-cf-text-primary"
                  }`}
                >
                  {money(summary.totalLimitAvailable)}
                </p>
                <p
                  className={`text-xs ${usingLimit ? "text-amber-700" : "text-cf-text-secondary"}`}
                >
                  {usingLimit
                    ? `${money(summary.totalLimitUsed)} em uso`
                    : `de ${money(summary.totalLimitTotal)} total`}
                </p>
              </div>

              {/* Posição real */}
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Posição real</p>
                <p
                  className={`text-sm font-semibold ${
                    summary.totalBalance + summary.totalLimitAvailable <= 0
                      ? "text-red-600"
                      : "text-cf-text-primary"
                  }`}
                >
                  {money(summary.totalBalance + summary.totalLimitAvailable)}
                </p>
                <p className="text-xs text-cf-text-secondary">Saldo + limite livre</p>
              </div>
            </div>

            {/* AI insight banner */}
            {insight ? (
              <div
                className={`mb-3 flex items-start gap-2 rounded border px-3 py-2 ${
                  insight.type === "critical"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : insight.type === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                <span className="mt-0.5 flex-shrink-0 text-xs font-semibold uppercase tracking-wide">
                  {insight.riskLabel}
                </span>
                <span className="text-xs leading-relaxed">{insight.message}</span>
              </div>
            ) : null}

            {/* Account list */}
            <div className="space-y-2">
              {accounts.map((account) => {
                const status = statusOf(account);
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between gap-2 rounded border border-cf-border bg-cf-bg-subtle px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${
                            status === "critical"
                              ? "bg-red-500"
                              : status === "limit_in_use"
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          }`}
                        />
                        <p className="truncate text-xs font-medium text-cf-text-primary">
                          {account.name}
                        </p>
                        {account.bankName ? (
                          <p className="truncate text-xs text-cf-text-secondary">
                            · {account.bankName}
                          </p>
                        ) : null}
                      </div>
                      <p
                        className={`mt-0.5 text-xs ${
                          account.balance < 0 ? "text-red-600" : "text-cf-text-secondary"
                        }`}
                      >
                        {money(account.balance)}
                        {account.limitTotal > 0
                          ? ` · limite ${money(account.limitTotal)}`
                          : null}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(account)}
                        className="rounded px-2 py-0.5 text-xs text-cf-text-secondary hover:bg-cf-border hover:text-cf-text-primary"
                      >
                        Editar
                      </button>
                      {confirmDeleteId === account.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDelete(account.id)}
                            className="rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded px-2 py-0.5 text-xs text-cf-text-secondary hover:bg-cf-border"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(account.id)}
                          className="rounded px-2 py-0.5 text-xs text-cf-text-secondary hover:bg-cf-border hover:text-red-600"
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modal.open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="w-full max-w-sm rounded border border-cf-border bg-cf-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-cf-text-primary">
              {modal.editing ? "Editar conta" : "Nova conta bancária"}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-cf-text-secondary">
                  Nome da conta *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Itaú conta corrente"
                  className="w-full rounded border border-cf-border-input bg-cf-bg-page px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-cf-text-secondary">
                  Banco (opcional)
                </label>
                <input
                  type="text"
                  value={form.bankName}
                  onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                  placeholder="Ex: Itaú"
                  className="w-full rounded border border-cf-border-input bg-cf-bg-page px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-cf-text-secondary">
                  Saldo atual (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.balance}
                  onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
                  placeholder="0,00 — pode ser negativo se usar limite"
                  className="w-full rounded border border-cf-border-input bg-cf-bg-page px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-cf-text-secondary">
                  Limite da conta / cheque especial (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.limitTotal}
                  onChange={(e) => setForm((f) => ({ ...f, limitTotal: e.target.value }))}
                  placeholder="0,00 — deixe em branco se não houver limite"
                  className="w-full rounded border border-cf-border-input bg-cf-bg-page px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
                />
              </div>
            </div>

            {formError ? (
              <p className="mt-3 text-xs text-red-600">{formError}</p>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={isSaving}
                className="rounded border border-cf-border px-3 py-1.5 text-xs text-cf-text-secondary hover:bg-cf-bg-subtle"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="rounded bg-brand-1 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {isSaving ? "Salvando..." : modal.editing ? "Salvar alterações" : "Adicionar conta"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default BankAccountsWidget;
