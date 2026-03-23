import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { profileService } from "../services/profile.service";
import { securityService } from "../services/security.service";
import { getApiErrorMessage } from "../utils/apiError";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

interface SecuritySettingsProps {
  onBack?: () => void;
  onLogout?: () => void;
}

const SecuritySettings = ({
  onBack = undefined,
  onLogout = undefined,
}: SecuritySettingsProps): JSX.Element => {
  // Account state from GET /me
  const [hasPassword, setHasPassword] = useState<boolean>(true);
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [isLoadingAccount, setIsLoadingAccount] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const passwordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Google link state
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleSuccess, setGoogleSuccess] = useState(false);

  const loadAccountInfo = useCallback(async () => {
    setIsLoadingAccount(true);
    setLoadError(null);
    try {
      const me = await profileService.getMe();
      // hasPassword defaults to true (conservative) if field not yet returned by API
      setHasPassword(me.hasPassword !== false);
      setLinkedProviders(me.linkedProviders ?? []);
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "Não foi possível carregar as informações da conta."));
    } finally {
      setIsLoadingAccount(false);
    }
  }, []);

  useEffect(() => {
    void loadAccountInfo();
    return () => {
      if (passwordTimerRef.current) clearTimeout(passwordTimerRef.current);
    };
  }, [loadAccountInfo]);

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!PASSWORD_REGEX.test(newPassword)) {
      setPasswordError("Senha fraca: use no mínimo 8 caracteres com letras e números.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("As senhas não coincidem.");
      return;
    }

    setIsSavingPassword(true);
    try {
      await securityService.changePassword({
        ...(hasPassword ? { currentPassword } : {}),
        newPassword,
      });
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // After setting a password, user now has one
      setHasPassword(true);
      passwordTimerRef.current = setTimeout(() => setPasswordSuccess(false), 4000);
    } catch (error) {
      setPasswordError(
        getApiErrorMessage(error, "Não foi possível alterar a senha. Tente novamente."),
      );
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleGoogleSuccess = async (credential: string) => {
    setIsLinkingGoogle(true);
    setGoogleError(null);
    setGoogleSuccess(false);
    try {
      await securityService.linkGoogle(credential);
      setGoogleSuccess(true);
      setLinkedProviders((prev) => (prev.includes("google") ? prev : [...prev, "google"]));
    } catch (error) {
      setGoogleError(
        getApiErrorMessage(error, "Não foi possível vincular a conta Google. Tente novamente."),
      );
    } finally {
      setIsLinkingGoogle(false);
    }
  };

  const isGoogleLinked = linkedProviders.includes("google");

  return (
    <div className="min-h-screen bg-cf-bg-page py-6">
      <main className="mx-auto w-full max-w-4xl space-y-4 px-4 sm:px-6">
        <section className="rounded border border-cf-border bg-cf-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-cf-text-primary">Settings - Seguranca</h1>
              <p className="mt-1 text-sm text-cf-text-secondary">
                Gerencie sua senha e metodos de acesso vinculados.
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

          {isLoadingAccount ? (
            <div className="mt-4 space-y-3" role="status" aria-live="polite">
              <div className="h-10 animate-pulse rounded border border-cf-border bg-cf-bg-subtle" />
              <div className="h-10 animate-pulse rounded border border-cf-border bg-cf-bg-subtle" />
              <span className="sr-only">Carregando informações de segurança...</span>
            </div>
          ) : null}

          {!isLoadingAccount && loadError ? (
            <div
              className="mt-4 flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              <span>{loadError}</span>
              <button
                type="button"
                onClick={loadAccountInfo}
                className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Tentar novamente
              </button>
            </div>
          ) : null}

          {!isLoadingAccount && !loadError ? (
            <div className="mt-4 space-y-6">
              {/* ── Password section ── */}
              <div className="rounded border border-cf-border bg-cf-bg-subtle p-4">
                <h2 className="text-sm font-semibold text-cf-text-primary">
                  {hasPassword ? "Alterar senha" : "Definir senha"}
                </h2>
                {!hasPassword ? (
                  <p className="mt-1 text-xs text-cf-text-secondary">
                    Sua conta usa somente o Google para acesso. Defina uma senha para tambem poder
                    entrar com email e senha.
                  </p>
                ) : null}

                <form onSubmit={handlePasswordSubmit} noValidate className="mt-3 space-y-3">
                  {hasPassword ? (
                    <div>
                      <label
                        htmlFor="current_password"
                        className="block text-sm font-semibold text-cf-text-primary"
                      >
                        Senha atual
                      </label>
                      <input
                        id="current_password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        className="mt-1 w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1"
                      />
                    </div>
                  ) : null}

                  <div>
                    <label
                      htmlFor="new_password"
                      className="block text-sm font-semibold text-cf-text-primary"
                    >
                      Nova senha
                    </label>
                    <input
                      id="new_password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                      className="mt-1 w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1"
                    />
                    <p className="mt-0.5 text-xs text-cf-text-secondary">
                      Minimo 8 caracteres com letras e numeros.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="confirm_password"
                      className="block text-sm font-semibold text-cf-text-primary"
                    >
                      Confirmar nova senha
                    </label>
                    <input
                      id="confirm_password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                      className="mt-1 w-full rounded border border-cf-border-input bg-cf-surface px-3 py-1.5 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1"
                    />
                  </div>

                  {passwordError ? (
                    <div
                      className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                      role="alert"
                    >
                      {passwordError}
                    </div>
                  ) : null}

                  {passwordSuccess ? (
                    <div
                      className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
                      role="status"
                      aria-live="polite"
                    >
                      Senha alterada com sucesso.
                    </div>
                  ) : null}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSavingPassword}
                      className="rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingPassword
                        ? "Salvando..."
                        : hasPassword
                          ? "Alterar senha"
                          : "Definir senha"}
                    </button>
                  </div>
                </form>
              </div>

              {/* ── Google link section ── */}
              <div className="rounded border border-cf-border bg-cf-bg-subtle p-4">
                <h2 className="text-sm font-semibold text-cf-text-primary">Acesso com Google</h2>

                {isGoogleLinked ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-700">
                      <span aria-hidden="true">✓</span> Google vinculado
                    </span>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-cf-text-secondary">
                      Vincule sua conta Google para entrar sem senha.
                    </p>
                    {isLinkingGoogle ? (
                      <p className="text-sm text-cf-text-secondary">Vinculando...</p>
                    ) : (
                      <GoogleLogin
                        onSuccess={(credentialResponse) => {
                          const idToken = credentialResponse.credential;
                          if (!idToken) return;
                          void handleGoogleSuccess(idToken);
                        }}
                        onError={() => {
                          setGoogleError("Falha ao autenticar com Google. Tente novamente.");
                        }}
                      />
                    )}
                    {googleError ? (
                      <div
                        className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                        role="alert"
                      >
                        {googleError}
                      </div>
                    ) : null}
                    {googleSuccess ? (
                      <div
                        className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
                        role="status"
                        aria-live="polite"
                      >
                        Conta Google vinculada com sucesso.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
};

export default SecuritySettings;
