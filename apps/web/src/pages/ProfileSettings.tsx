import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { profileService, type UserProfile } from "../services/profile.service";
import { getApiErrorMessage } from "../utils/apiError";
import { useDiscreetMode } from "../context/DiscreetModeContext";

const getInitials = (displayName: string | null, email: string): string => {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed[0].toUpperCase();
  return email[0]?.toUpperCase() ?? "?";
};

interface AvatarProps {
  avatarUrl: string;
  displayName: string;
  email: string;
}

const Avatar = ({ avatarUrl, displayName, email }: AvatarProps): JSX.Element => {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(displayName || null, email);
  const showImage = avatarUrl.startsWith("https://") && !imgError;

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  if (showImage) {
    return (
      <img
        src={avatarUrl}
        alt="Avatar"
        className="h-16 w-16 rounded-full object-cover"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-1 text-xl font-bold text-white">
      {initials}
    </div>
  );
};

const SectionHeading = ({ title, description }: { title: string; description?: string }) => (
  <div className="mb-4">
    <h2 className="text-sm font-semibold uppercase tracking-wide text-cf-text-secondary">
      {title}
    </h2>
    {description ? (
      <p className="mt-0.5 text-xs text-cf-text-secondary">{description}</p>
    ) : null}
  </div>
);

const calcDaysRemaining = (trialEndsAt: string | null): number => {
  if (!trialEndsAt) return 0;
  return Math.max(
    0,
    Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000),
  );
};

interface ProfileSettingsProps {
  onBack?: () => void;
  onLogout?: () => void;
  onOpenBilling?: () => void;
}

const ProfileSettings = ({
  onBack = undefined,
  onLogout = undefined,
  onOpenBilling = undefined,
}: ProfileSettingsProps): JSX.Element => {
  const { isDiscreetMode, toggleDiscreetMode } = useDiscreetMode();

  // Account fields
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [salaryMonthly, setSalaryMonthly] = useState("");
  const [payday, setPayday] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  // Auth info (read-only display)
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);

  // Subscription info (read-only display)
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [trialExpired, setTrialExpired] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const me = await profileService.getMe();
      setEmail(me.email);
      setHasPassword(me.hasPassword ?? null);
      setLinkedProviders(me.linkedProviders ?? []);
      setTrialEndsAt(me.trialEndsAt ?? null);
      setTrialExpired(me.trialExpired ?? false);
      const p: UserProfile | null = me.profile;
      setDisplayName(p?.displayName ?? "");
      setSalaryMonthly(
        p?.salaryMonthly !== null && p?.salaryMonthly !== undefined
          ? String(p.salaryMonthly)
          : "",
      );
      setPayday(
        p?.payday !== null && p?.payday !== undefined ? String(p.payday) : "",
      );
      setAvatarUrl(p?.avatarUrl ?? "");
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "Não foi possível carregar o perfil."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [loadProfile]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const salaryNum = salaryMonthly.trim() ? Number(salaryMonthly) : null;
    const paydayNum = payday.trim() ? Number(payday) : null;

    try {
      await profileService.updateProfile({
        display_name: displayName.trim() || null,
        salary_monthly: salaryNum,
        payday: paydayNum,
        avatar_url: avatarUrl.trim() || null,
      });
      setSaveSuccess(true);
      successTimerRef.current = setTimeout(() => setSaveSuccess(false), 4000);
    } catch (error) {
      setSaveError(
        getApiErrorMessage(error, "Não foi possível salvar o perfil. Tente novamente."),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const avatarPreview = avatarUrl.trim();
  const daysRemaining = calcDaysRemaining(trialEndsAt);

  const authMethodLabel = (() => {
    const methods: string[] = [];
    if (hasPassword) methods.push("Senha");
    if (linkedProviders.includes("google")) methods.push("Google");
    return methods.length > 0 ? methods.join(" · ") : null;
  })();

  return (
    <div className="min-h-screen bg-cf-bg-page py-6">
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 sm:px-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-cf-text-primary">Configurações</h1>
            <p className="mt-1 text-sm text-cf-text-secondary">
              Gerencie sua conta, preferências e plano.
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

        {/* Loading skeleton */}
        {isLoading ? (
          <div className="space-y-3" role="status" aria-live="polite">
            <div className="h-20 animate-pulse rounded border border-cf-border bg-cf-bg-subtle" />
            <div className="h-10 animate-pulse rounded border border-cf-border bg-cf-bg-subtle" />
            <div className="h-10 animate-pulse rounded border border-cf-border bg-cf-bg-subtle" />
            <span className="sr-only">Carregando perfil...</span>
          </div>
        ) : null}

        {/* Load error */}
        {!isLoading && loadError ? (
          <div
            className="flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            <span>{loadError}</span>
            <button
              type="button"
              onClick={loadProfile}
              className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        {!isLoading && !loadError ? (
          <>
            {/* ── Seção 1: Dados da conta ─────────────────────── */}
            <section className="rounded border border-cf-border bg-cf-surface p-5">
              <SectionHeading
                title="Dados da conta"
                description="Nome exibido, avatar e informações de acesso."
              />

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {/* Avatar + URL */}
                <div className="flex items-center gap-4">
                  <Avatar
                    avatarUrl={avatarPreview}
                    displayName={displayName}
                    email={email}
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor="avatar_url"
                      className="block text-sm font-semibold text-cf-text-primary"
                    >
                      URL do avatar
                    </label>
                    <input
                      id="avatar_url"
                      type="url"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-1 w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
                    />
                    <p className="mt-0.5 text-xs text-cf-text-secondary">
                      Deve começar com https://. Deixe vazio para usar as iniciais.
                    </p>
                  </div>
                </div>

                {/* Display name */}
                <div>
                  <label
                    htmlFor="display_name"
                    className="block text-sm font-semibold text-cf-text-primary"
                  >
                    Nome exibido
                  </label>
                  <input
                    id="display_name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={100}
                    placeholder="Como você quer ser chamado"
                    className="mt-1 w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
                  />
                </div>

                {/* Email (read-only) */}
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-semibold text-cf-text-primary"
                  >
                    E-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    readOnly
                    className="mt-1 w-full rounded border border-cf-border bg-cf-bg-subtle px-3 py-1.5 text-sm text-cf-text-secondary"
                  />
                  {authMethodLabel ? (
                    <p className="mt-0.5 text-xs text-cf-text-secondary">
                      Acesso via: {authMethodLabel}
                    </p>
                  ) : null}
                </div>

                {/* Salary + Payday */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="salary_monthly"
                      className="block text-sm font-semibold text-cf-text-primary"
                    >
                      Salário mensal (R$)
                    </label>
                    <input
                      id="salary_monthly"
                      type="number"
                      min="0"
                      step="0.01"
                      value={salaryMonthly}
                      onChange={(e) => setSalaryMonthly(e.target.value)}
                      placeholder="0,00"
                      className="mt-1 w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="payday"
                      className="block text-sm font-semibold text-cf-text-primary"
                    >
                      Dia do pagamento
                    </label>
                    <input
                      id="payday"
                      type="number"
                      min="1"
                      max="31"
                      step="1"
                      value={payday}
                      onChange={(e) => setPayday(e.target.value)}
                      placeholder="Ex: 5"
                      className="mt-1 w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
                    />
                    <p className="mt-0.5 text-xs text-cf-text-secondary">Dia do mês (1 a 31)</p>
                  </div>
                </div>

                {/* Feedback */}
                {saveError ? (
                  <div
                    className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                    role="alert"
                  >
                    {saveError}
                  </div>
                ) : null}
                {saveSuccess ? (
                  <div
                    className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
                    role="status"
                    aria-live="polite"
                  >
                    Perfil salvo com sucesso.
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? "Salvando..." : "Salvar perfil"}
                  </button>
                </div>
              </form>
            </section>

            {/* ── Seção 2: Preferências ───────────────────────── */}
            <section className="rounded border border-cf-border bg-cf-surface p-5">
              <SectionHeading
                title="Preferências"
                description="Configurações de exibição e privacidade."
              />

              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-cf-text-primary">Modo Discreto</p>
                  <p className="mt-0.5 text-xs text-cf-text-secondary">
                    Oculta valores monetários nas telas. Útil para usar o app em público.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDiscreetMode}
                  onClick={toggleDiscreetMode}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-1 focus:ring-offset-2 ${
                    isDiscreetMode ? "bg-brand-1" : "bg-cf-border"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      isDiscreetMode ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                  <span className="sr-only">
                    {isDiscreetMode ? "Desativar modo discreto" : "Ativar modo discreto"}
                  </span>
                </button>
              </div>
            </section>

            {/* ── Seção 3: Assinatura ─────────────────────────── */}
            <section className="rounded border border-cf-border bg-cf-surface p-5">
              <SectionHeading
                title="Assinatura"
                description="Status do seu plano e acesso às funcionalidades."
              />

              {trialEndsAt !== null && !trialExpired ? (
                <div className="flex items-center justify-between gap-4 rounded border border-green-200 bg-green-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-green-800">Trial ativo</p>
                    <p className="mt-0.5 text-xs text-green-700">
                      {daysRemaining > 0
                        ? `${daysRemaining} dia${daysRemaining !== 1 ? "s" : ""} restante${daysRemaining !== 1 ? "s" : ""} — acesso completo a todas as funcionalidades.`
                        : "Último dia de trial — acesso completo a todas as funcionalidades."}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                    Trial
                  </span>
                </div>
              ) : trialExpired ? (
                <div className="flex items-start justify-between gap-4 rounded border border-amber-200 bg-amber-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Trial expirado</p>
                    <p className="mt-0.5 text-xs text-amber-700">
                      Algumas funcionalidades estão limitadas. Faça upgrade para continuar usando o Especialista IA, exportação e projeção de saldo.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      Expirado
                    </span>
                    {onOpenBilling ? (
                      <button
                        type="button"
                        onClick={onOpenBilling}
                        className="rounded bg-brand-1 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-2"
                      >
                        Fazer upgrade
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4 rounded border border-cf-border bg-cf-bg-subtle px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-cf-text-primary">Acesso ativo</p>
                    <p className="mt-0.5 text-xs text-cf-text-secondary">
                      Detalhes do plano disponíveis em Faturamento.
                    </p>
                  </div>
                  {onOpenBilling ? (
                    <button
                      type="button"
                      onClick={onOpenBilling}
                      className="shrink-0 rounded border border-cf-border px-3 py-1 text-xs font-semibold text-cf-text-secondary hover:bg-cf-bg-subtle"
                    >
                      Ver plano
                    </button>
                  ) : null}
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
};

export default ProfileSettings;
