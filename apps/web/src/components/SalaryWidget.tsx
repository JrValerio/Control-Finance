import { useEffect, useState } from "react";
import { salaryService, type SalaryProfile } from "../services/salary.service";
import { formatCurrency } from "../utils/formatCurrency";

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  grossSalary: string;
  dependents: string;
  paymentDay: string;
}

const EMPTY_FORM: FormState = { grossSalary: "", dependents: "0", paymentDay: "5" };

const profileToForm = (p: SalaryProfile): FormState => ({
  grossSalary: String(p.grossSalary),
  dependents:  String(p.dependents),
  paymentDay:  String(p.paymentDay),
});

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function ProfileView({
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
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-brand-1 hover:underline"
        >
          Editar
        </button>
      </div>

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

function ProfileForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: FormState;
  onSave: (form: FormState) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<FormState>(initial);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-cf-text-primary">Salário líquido</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label
            htmlFor="sw-gross"
            className="mb-1 block text-xs font-medium text-cf-text-secondary"
          >
            Salário bruto (R$)
          </label>
          <input
            id="sw-gross"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={form.grossSalary}
            onChange={set("grossSalary")}
            placeholder="Ex: 5000"
            className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="sw-dep"
              className="mb-1 block text-xs font-medium text-cf-text-secondary"
            >
              Dependentes
            </label>
            <input
              id="sw-dep"
              type="number"
              min="0"
              step="1"
              value={form.dependents}
              onChange={set("dependents")}
              className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1"
            />
          </div>

          <div>
            <label
              htmlFor="sw-day"
              className="mb-1 block text-xs font-medium text-cf-text-secondary"
            >
              Dia de pagamento
            </label>
            <input
              id="sw-day"
              type="number"
              min="1"
              max="31"
              step="1"
              value={form.paymentDay}
              onChange={set("paymentDay")}
              className="w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1"
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-xs text-red-500">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded bg-brand-1 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded border border-cf-border px-3 py-1.5 text-xs font-medium text-cf-text-secondary hover:bg-cf-bg-subtle disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

const SalaryWidget = (): JSX.Element | null => {
  const [profile, setProfile] = useState<SalaryProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    salaryService
      .getProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (form: FormState) => {
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
        gross_salary: gross,
        dependents:   dep,
        payment_day:  day,
      });
      setProfile(updated);
      setEditing(false);
    } catch {
      setSaveError("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setSaveError(null);
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
      {editing || !profile ? (
        <ProfileForm
          initial={profile ? profileToForm(profile) : EMPTY_FORM}
          onSave={handleSave}
          onCancel={handleCancel}
          saving={saving}
          error={saveError}
        />
      ) : (
        <ProfileView profile={profile} onEdit={() => setEditing(true)} />
      )}

      {!profile && !editing ? (
        <div className="text-center">
          <p className="mb-2 text-xs text-cf-text-secondary">
            Calcule seu salário líquido (CLT) com INSS e IRRF 2026.
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded bg-brand-1 px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Definir salário bruto
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default SalaryWidget;
