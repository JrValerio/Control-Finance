import { useEffect, useState } from "react";
import {
  salaryService,
  type Consignacao,
  type ConsignacaoType,
  type ProfileType,
  type SalaryProfile,
} from "../services/salary.service";
import { formatCurrency } from "../utils/formatCurrency";

// ─── Form state types ──────────────────────────────────────────────────────────

interface CltFormState {
  grossSalary: string;
  dependents: string;
  paymentDay: string;
}

interface BenefitFormState {
  grossBenefit: string;
  birthYear: string;
  dependents: string;
  paymentDay: string;
}

const EMPTY_CLT: CltFormState = { grossSalary: "", dependents: "0", paymentDay: "5" };
const EMPTY_BENEFIT: BenefitFormState = { grossBenefit: "", birthYear: "", dependents: "0", paymentDay: "5" };
const CONSIGNACAO_DESCRIPTION_MAX_LENGTH = 100;
const SALARY_PROFILE_UPDATED_EVENT = "salary-profile-updated";

const profileToCltForm = (p: SalaryProfile): CltFormState => ({
  grossSalary: String(p.grossSalary),
  dependents:  String(p.dependents),
  paymentDay:  String(p.paymentDay),
});

const profileToBenefitForm = (p: SalaryProfile): BenefitFormState => ({
  grossBenefit: String(p.grossSalary),
  birthYear:    p.birthYear != null ? String(p.birthYear) : "",
  dependents:   String(p.dependents),
  paymentDay:   String(p.paymentDay),
});

// ─── Shared sub-components ────────────────────────────────────────────────────

function BreakdownRow({
  label,
  value,
  highlight,
  negative,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  negative?: boolean;
}) {
  const valueClass = highlight
    ? "font-semibold text-cf-text-primary"
    : negative
      ? "text-red-500"
      : "text-cf-text-secondary";

  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${highlight ? "font-medium text-cf-text-primary" : "text-cf-text-secondary"}`}>
        {label}
      </span>
      <span className={`text-xs ${valueClass}`}>{formatCurrency(value)}</span>
    </div>
  );
}

// ─── CLT form ─────────────────────────────────────────────────────────────────

function CltForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: CltFormState;
  onSave: (form: CltFormState) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<CltFormState>(initial);
  const set = (field: keyof CltFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} noValidate>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-cf-text-primary">Salário líquido</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="sw-gross" className="mb-1 block text-xs font-medium text-cf-text-secondary">
            Salário bruto (R$)
          </label>
          <input
            id="sw-gross"
            type="number" min="0.01" step="0.01" required
            value={form.grossSalary}
            onChange={set("grossSalary")}
            placeholder="Ex: 5000"
            className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sw-dep" className="mb-1 block text-xs font-medium text-cf-text-secondary">
              Dependentes
            </label>
            <input
              id="sw-dep"
              type="number" min="0" step="1"
              value={form.dependents}
              onChange={set("dependents")}
              className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1"
            />
          </div>

          <div>
            <label htmlFor="sw-day" className="mb-1 block text-xs font-medium text-cf-text-secondary">
              Dia de pagamento
            </label>
            <input
              id="sw-day"
              type="number" min="1" max="31" step="1"
              value={form.paymentDay}
              onChange={set("paymentDay")}
              className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1"
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-xs text-red-500">{error}</p>
        ) : null}

        <div className="flex gap-2 pt-1">
          <button
            type="submit" disabled={saving}
            className="flex-1 rounded bg-brand-1 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button" onClick={onCancel} disabled={saving}
            className="flex-1 rounded border border-cf-border px-3 py-1.5 text-xs font-medium text-cf-text-secondary hover:bg-cf-bg-subtle disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Beneficiary form ─────────────────────────────────────────────────────────

function BenefitForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: BenefitFormState;
  onSave: (form: BenefitFormState) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<BenefitFormState>(initial);
  const set = (field: keyof BenefitFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} noValidate>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-cf-text-primary">Benefício líquido</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="sw-gross-b" className="mb-1 block text-xs font-medium text-cf-text-secondary">
            Benefício bruto (R$)
          </label>
          <input
            id="sw-gross-b"
            type="number" min="0.01" step="0.01" required
            value={form.grossBenefit}
            onChange={set("grossBenefit")}
            placeholder="Ex: 4958.67"
            className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sw-birthyear" className="mb-1 block text-xs font-medium text-cf-text-secondary">
              Ano de nascimento
            </label>
            <input
              id="sw-birthyear"
              type="number" min="1900" max="2100" step="1"
              value={form.birthYear}
              onChange={set("birthYear")}
              placeholder="Ex: 1955"
              className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
            />
          </div>

          <div>
            <label htmlFor="sw-dep-b" className="mb-1 block text-xs font-medium text-cf-text-secondary">
              Dependentes
            </label>
            <input
              id="sw-dep-b"
              type="number" min="0" step="1"
              value={form.dependents}
              onChange={set("dependents")}
              className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1"
            />
          </div>
        </div>

        <div>
          <label htmlFor="sw-day-b" className="mb-1 block text-xs font-medium text-cf-text-secondary">
            Dia de recebimento
          </label>
          <input
            id="sw-day-b"
            type="number" min="1" max="31" step="1"
            value={form.paymentDay}
            onChange={set("paymentDay")}
            className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1"
          />
        </div>

        {error ? (
          <p role="alert" className="text-xs text-red-500">{error}</p>
        ) : null}

        <div className="flex gap-2 pt-1">
          <button
            type="submit" disabled={saving}
            className="flex-1 rounded bg-brand-1 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button" onClick={onCancel} disabled={saving}
            className="flex-1 rounded border border-cf-border px-3 py-1.5 text-xs font-medium text-cf-text-secondary hover:bg-cf-bg-subtle disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── CLT profile view ─────────────────────────────────────────────────────────

function CltProfileView({
  profile,
  onEdit,
}: {
  profile: SalaryProfile;
  onEdit: () => void;
}) {
  const { calculation } = profile;
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-cf-text-primary">Salário líquido</h3>
        <button type="button" onClick={onEdit} className="text-xs text-brand-1 hover:underline">
          Editar
        </button>
      </div>

      <div className="mb-3 rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
        <p className="text-xs text-cf-text-secondary">Líquido mensal</p>
        <p className="text-lg font-bold text-cf-text-primary">{formatCurrency(calculation.netMonthly)}</p>
        <p className="text-xs text-cf-text-secondary">
          {calculation.netAnnual == null
            ? "Líquido anual: disponível no Pro"
            : `${formatCurrency(calculation.netAnnual)} / ano`}
        </p>
      </div>

      <div className="space-y-1.5">
        <BreakdownRow label="Salário bruto"    value={calculation.grossMonthly} highlight />
        <BreakdownRow label="(-) INSS"         value={calculation.inssMonthly}  negative />
        <BreakdownRow label="(-) IRRF"         value={calculation.irrfMonthly}  negative />
        <div className="my-1.5 border-t border-cf-border" />
        <BreakdownRow label="= Líquido mensal" value={calculation.netMonthly}   highlight />
      </div>
    </>
  );
}

// ─── Consignação type labels ──────────────────────────────────────────────────

const CONSIG_TYPE_LABEL: Record<ConsignacaoType, string> = {
  loan:  "Empréstimo",
  card:  "Cartão",
  other: "Outro",
};

const CONSIG_TYPE_CLASS: Record<ConsignacaoType, string> = {
  loan:  "border-orange-200 bg-orange-50 text-orange-700",
  card:  "border-blue-200 bg-blue-50 text-blue-700",
  other: "border-cf-border bg-cf-bg-subtle text-cf-text-secondary",
};

// ─── Beneficiary profile view ─────────────────────────────────────────────────

function BenefitProfileView({
  profile,
  onEdit,
  onProfileUpdate,
}: {
  profile: SalaryProfile;
  onEdit: () => void;
  onProfileUpdate: (updated: SalaryProfile) => void;
}) {
  const { calculation, consignacoes } = profile;
  const loanLimit = calculation.loanLimitAmount ?? 0;
  const cardLimit = calculation.cardLimitAmount ?? 0;
  const loanTotal = calculation.loanTotal ?? 0;
  const cardTotal = calculation.cardTotal ?? 0;

  const [addingConsig, setAddingConsig] = useState(false);
  const [consigForm, setConsigForm] = useState({ description: "", amount: "", consignacaoType: "loan" as ConsignacaoType });
  const [savingConsig, setSavingConsig] = useState(false);
  const [consigError, setConsigError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleAddConsig = async () => {
    const amt = Number(consigForm.amount);
    if (!consigForm.description.trim()) {
      setConsigError("Informe a descrição.");
      return;
    }
    if (consigForm.description.trim().length > CONSIGNACAO_DESCRIPTION_MAX_LENGTH) {
      setConsigError(`Descrição deve ter no máximo ${CONSIGNACAO_DESCRIPTION_MAX_LENGTH} caracteres.`);
      return;
    }
    if (!amt || amt <= 0) {
      setConsigError("Informe um valor positivo.");
      return;
    }

    setSavingConsig(true);
    setConsigError(null);
    try {
      await salaryService.addConsignacao({
        description:      consigForm.description.trim(),
        amount:           amt,
        consignacao_type: consigForm.consignacaoType,
      });
      const updated = await salaryService.getProfile();
      if (updated) onProfileUpdate(updated);
      setAddingConsig(false);
      setConsigForm({ description: "", amount: "", consignacaoType: "loan" });
    } catch {
      setConsigError("Erro ao salvar. Tente novamente.");
    } finally {
      setSavingConsig(false);
    }
  };

  const handleDeleteConsig = async (c: Consignacao) => {
    setDeletingId(c.id);
    try {
      await salaryService.deleteConsignacao(c.id);
      const updated = await salaryService.getProfile();
      if (updated) onProfileUpdate(updated);
    } catch {
      // no-op: UI stays intact, user can retry
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-cf-text-primary">Benefício líquido</h3>
        <button type="button" onClick={onEdit} className="text-xs text-brand-1 hover:underline">
          Editar
        </button>
      </div>

      {/* Main card */}
      <div className="mb-3 rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
        <p className="text-xs text-cf-text-secondary">Líquido mensal</p>
        <p className="text-lg font-bold text-cf-text-primary">
          {formatCurrency(calculation.netMonthly)}
        </p>
        <p className="text-xs text-cf-text-secondary">
          {calculation.netAnnual == null
            ? "Líquido anual: disponível no Pro"
            : `${formatCurrency(calculation.netAnnual)} / ano`}
        </p>
      </div>

      {/* Breakdown */}
      <div className="space-y-1.5">
        <BreakdownRow label="Benefício bruto"       value={calculation.grossMonthly}                           highlight />
        <BreakdownRow label="(-) Consignações"      value={calculation.consignacoesMonthly ?? 0}               negative />
        <div className="my-1.5 border-t border-cf-border" />
        <BreakdownRow label="= Líquido mensal"      value={calculation.netMonthly}                             highlight />
        <BreakdownRow label="IRRF estimado"         value={calculation.irrfMonthly} />
      </div>

      {/* Margin alerts */}
      <div className="mt-3 space-y-1.5">
        <div className={`flex items-center justify-between rounded border px-2.5 py-1.5 text-xs ${
          calculation.isOverLoanLimit
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-cf-border bg-cf-bg-subtle text-cf-text-secondary"
        }`}>
          <span>Empréstimos</span>
          <span>
            {formatCurrency(loanTotal)} / {formatCurrency(loanLimit)}
            {calculation.isOverLoanLimit ? (
              <span className="ml-1 font-semibold">⚠ acima do limite 35%</span>
            ) : (
              <span className="ml-1 text-cf-text-secondary">máx 35%</span>
            )}
          </span>
        </div>

        <div className={`flex items-center justify-between rounded border px-2.5 py-1.5 text-xs ${
          calculation.isOverCardLimit
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-cf-border bg-cf-bg-subtle text-cf-text-secondary"
        }`}>
          <span>Cartão consignado</span>
          <span>
            {formatCurrency(cardTotal)} / {formatCurrency(cardLimit)}
            {calculation.isOverCardLimit ? (
              <span className="ml-1 font-semibold">⚠ acima do limite 5%</span>
            ) : (
              <span className="ml-1 text-cf-text-secondary">máx 5%</span>
            )}
          </span>
        </div>
      </div>

      {/* Consignações list */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-cf-text-primary">Descontos consignados</p>
          {!addingConsig ? (
            <button
              type="button"
              onClick={() => setAddingConsig(true)}
              className="text-xs text-brand-1 hover:underline"
              data-testid="add-consignacao-btn"
            >
              + Adicionar
            </button>
          ) : null}
        </div>

        {consignacoes.length === 0 && !addingConsig ? (
          <p className="text-xs text-cf-text-secondary">Nenhum desconto cadastrado.</p>
        ) : null}

        {consignacoes.length > 0 ? (
          <ul className="space-y-1.5">
            {consignacoes.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded border border-cf-border bg-cf-surface px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-cf-text-primary">{c.description}</p>
                  <span className={`inline-block rounded border px-1.5 py-0.5 text-xs ${CONSIG_TYPE_CLASS[c.consignacaoType]}`}>
                    {CONSIG_TYPE_LABEL[c.consignacaoType]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-cf-text-primary">{formatCurrency(c.amount)}</span>
                  <button
                    type="button"
                    disabled={deletingId === c.id}
                    onClick={() => void handleDeleteConsig(c)}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    aria-label={`Remover ${c.description}`}
                  >
                    {deletingId === c.id ? "..." : "✕"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {addingConsig ? (
          <div className="mt-2 rounded border border-cf-border bg-cf-bg-subtle p-3">
            <div className="space-y-2">
              <div>
                <label htmlFor="consig-desc" className="mb-0.5 block text-xs font-medium text-cf-text-secondary">
                  Descrição
                </label>
                <input
                  id="consig-desc"
                  type="text"
                  maxLength={CONSIGNACAO_DESCRIPTION_MAX_LENGTH}
                  value={consigForm.description}
                  onChange={(e) => setConsigForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Ex: BMG Empréstimo"
                  className="w-full rounded border border-cf-border-input bg-cf-surface px-2.5 py-1 text-xs text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="consig-amt" className="mb-0.5 block text-xs font-medium text-cf-text-secondary">
                    Valor (R$)
                  </label>
                  <input
                    id="consig-amt"
                    type="number" min="0.01" step="0.01"
                    value={consigForm.amount}
                    onChange={(e) => setConsigForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0,00"
                    className="w-full rounded border border-cf-border-input bg-cf-surface px-2.5 py-1 text-xs text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
                  />
                </div>

                <div>
                  <label htmlFor="consig-type" className="mb-0.5 block text-xs font-medium text-cf-text-secondary">
                    Tipo
                  </label>
                  <select
                    id="consig-type"
                    value={consigForm.consignacaoType}
                    onChange={(e) => setConsigForm((f) => ({ ...f, consignacaoType: e.target.value as ConsignacaoType }))}
                    className="w-full rounded border border-cf-border-input bg-cf-surface px-2.5 py-1 text-xs text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1"
                  >
                    <option value="loan">Empréstimo</option>
                    <option value="card">Cartão</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
              </div>

              {consigError ? (
                <p role="alert" className="text-xs text-red-500">{consigError}</p>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={savingConsig}
                  onClick={() => void handleAddConsig()}
                  className="flex-1 rounded bg-brand-1 px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {savingConsig ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  disabled={savingConsig}
                  onClick={() => { setAddingConsig(false); setConsigError(null); }}
                  className="flex-1 rounded border border-cf-border px-2.5 py-1 text-xs font-medium text-cf-text-secondary hover:bg-cf-surface disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

const SalaryWidget = (): JSX.Element | null => {
  const [profile, setProfile] = useState<SalaryProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [pendingType, setPendingType] = useState<ProfileType | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async (showLoading = false) => {
      if (showLoading && !cancelled) {
        setIsLoading(true);
      }

      try {
        const nextProfile = await salaryService.getProfile();
        if (!cancelled) {
          setProfile(nextProfile);
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
        }
      } finally {
        if (showLoading && !cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadProfile(true);

    const handleProfileUpdated = () => {
      void loadProfile(false);
    };

    window.addEventListener(SALARY_PROFILE_UPDATED_EVENT, handleProfileUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(SALARY_PROFILE_UPDATED_EVENT, handleProfileUpdated);
    };
  }, []);

  // Derived mode
  const activeType: ProfileType | null = editing
    ? (profile?.profileType ?? pendingType ?? "clt")
    : pendingType;
  const inForm      = editing || pendingType !== null;
  const inTypeSelect = !profile && !editing && pendingType === null;

  const handleCancel = () => {
    setEditing(false);
    setPendingType(null);
    setSaveError(null);
  };

  const handleSaveClt = async (form: CltFormState) => {
    const gross = Number(form.grossSalary);
    const dep   = Number(form.dependents);
    const day   = Number(form.paymentDay);

    if (!gross || gross <= 0) {
      setSaveError("Informe um salário bruto válido.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await salaryService.upsertProfile({
        profile_type: "clt",
        gross_salary: gross,
        dependents:   dep,
        payment_day:  day,
      });
      setProfile(updated);
      setEditing(false);
      setPendingType(null);
    } catch {
      setSaveError("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBenefit = async (form: BenefitFormState) => {
    const gross = Number(form.grossBenefit);
    const dep   = Number(form.dependents);
    const day   = Number(form.paymentDay);
    const year  = form.birthYear ? Number(form.birthYear) : null;

    if (!gross || gross <= 0) {
      setSaveError("Informe um valor de benefício válido.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await salaryService.upsertProfile({
        profile_type: "inss_beneficiary",
        gross_salary: gross,
        birth_year:   year,
        dependents:   dep,
        payment_day:  day,
      });
      setProfile(updated);
      setEditing(false);
      setPendingType(null);
    } catch {
      setSaveError("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <p className="text-xs text-cf-text-secondary">Carregando salário...</p>
      </div>
    );
  }

  return (
    <div className="rounded border border-cf-border bg-cf-surface p-4">
      {/* Type selector — no profile yet, no type chosen */}
      {inTypeSelect ? (
        <div>
          <p className="mb-3 text-xs text-cf-text-secondary">
            Como você recebe sua renda principal?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setPendingType("clt"); setEditing(true); }}
              className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5 text-left hover:border-brand-1 hover:bg-cf-surface"
              data-testid="select-clt"
            >
              <p className="text-xs font-semibold text-cf-text-primary">Salário CLT</p>
              <p className="mt-0.5 text-xs text-cf-text-secondary">Empregado com carteira assinada</p>
            </button>
            <button
              type="button"
              onClick={() => { setPendingType("inss_beneficiary"); setEditing(true); }}
              className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5 text-left hover:border-brand-1 hover:bg-cf-surface"
              data-testid="select-beneficiary"
            >
              <p className="text-xs font-semibold text-cf-text-primary">Benefício INSS</p>
              <p className="mt-0.5 text-xs text-cf-text-secondary">Aposentado ou pensionista</p>
            </button>
          </div>
        </div>
      ) : null}

      {/* CLT form */}
      {inForm && activeType === "clt" ? (
        <CltForm
          initial={profile?.profileType === "clt" ? profileToCltForm(profile) : EMPTY_CLT}
          onSave={handleSaveClt}
          onCancel={handleCancel}
          saving={saving}
          error={saveError}
        />
      ) : null}

      {/* Benefit form */}
      {inForm && activeType === "inss_beneficiary" ? (
        <BenefitForm
          initial={profile?.profileType === "inss_beneficiary" ? profileToBenefitForm(profile) : EMPTY_BENEFIT}
          onSave={handleSaveBenefit}
          onCancel={handleCancel}
          saving={saving}
          error={saveError}
        />
      ) : null}

      {/* CLT profile view */}
      {!inForm && profile?.profileType === "clt" ? (
        <CltProfileView profile={profile} onEdit={() => setEditing(true)} />
      ) : null}

      {/* Beneficiary profile view */}
      {!inForm && profile?.profileType === "inss_beneficiary" ? (
        <BenefitProfileView
          profile={profile}
          onEdit={() => setEditing(true)}
          onProfileUpdate={setProfile}
        />
      ) : null}
    </div>
  );
};

export default SalaryWidget;
