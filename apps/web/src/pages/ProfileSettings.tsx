import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { profileService, type UserProfile } from "../services/profile.service";
import { getApiErrorMessage } from "../utils/apiError";

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

interface ProfileSettingsProps {
  onBack?: () => void;
  onLogout?: () => void;
}

const ProfileSettings = ({
  onBack = undefined,
  onLogout = undefined,
}: ProfileSettingsProps): JSX.Element => {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [salaryMonthly, setSalaryMonthly] = useState("");
  const [payday, setPayday] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

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
      const p: UserProfile | null = me.profile;
      setDisplayName(p?.displayName ?? "");
      setSalaryMonthly(p?.salaryMonthly !== null && p?.salaryMonthly !== undefined
        ? String(p.salaryMonthly)
        : "");
      setPayday(p?.payday !== null && p?.payday !== undefined ? String(p.payday) : "");
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
      setSaveError(getApiErrorMessage(error, "Não foi possível salvar o perfil. Tente novamente."));
    } finally {
      setIsSaving(false);
    }
  };

  const avatarPreview = avatarUrl.trim();

  return (
    <div className="min-h-screen bg-cf-bg-page py-6">
      <main className="mx-auto w-full max-w-4xl space-y-4 px-4 sm:px-6">
        <section className="rounded border border-cf-border bg-cf-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-cf-text-primary">Settings - Perfil</h1>
              <p className="mt-1 text-sm text-cf-text-secondary">
                Personalize seu nome, salário e preferências de conta.
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

          {isLoading ? (
            <div className="mt-4 space-y-3" role="status" aria-live="polite">
              <div className="h-16 animate-pulse rounded border border-cf-border bg-cf-bg-subtle" />
              <div className="h-10 animate-pulse rounded border border-cf-border bg-cf-bg-subtle" />
              <div className="h-10 animate-pulse rounded border border-cf-border bg-cf-bg-subtle" />
              <span className="sr-only">Carregando perfil...</span>
            </div>
          ) : null}

          {!isLoading && loadError ? (
            <div
              className="mt-4 flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
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
            <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
              {/* Avatar preview */}
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
                    Deve comecar com https://. Deixe vazio para usar as iniciais.
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
                  placeholder="Como voce quer ser chamado"
                  className="mt-1 w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1"
                />
              </div>

              {/* Email (read-only) */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-semibold text-cf-text-primary"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  readOnly
                  className="mt-1 w-full rounded border border-cf-border bg-cf-bg-subtle px-3 py-1.5 text-sm text-cf-text-secondary"
                />
              </div>

              {/* Salary + Payday row */}
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

              {/* Actions */}
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
          ) : null}
        </section>
      </main>
    </div>
  );
};

export default ProfileSettings;
