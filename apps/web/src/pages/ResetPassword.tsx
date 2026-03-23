import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authService } from "../services/auth.service";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const WEAK_PASSWORD_MESSAGE =
  "Senha fraca: use no mínimo 8 caracteres com letras e números.";

const ResetPassword = (): JSX.Element => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("Link de redefinição inválido ou expirado.");
      return;
    }

    if (!newPassword.trim()) {
      setError("Nova senha é obrigatória.");
      return;
    }

    if (!PASSWORD_REGEX.test(newPassword.trim())) {
      setError(WEAK_PASSWORD_MESSAGE);
      return;
    }

    if (newPassword.trim() !== confirmPassword.trim()) {
      setError("As senhas não conferem.");
      return;
    }

    setIsLoading(true);
    try {
      await authService.resetPassword({ token, newPassword: newPassword.trim() });
      setSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao redefinir senha.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-cf-bg-page p-4">
      <section className="w-full max-w-md rounded bg-cf-surface p-6 shadow-lg">
        <h1 className="text-3xl font-semibold text-cf-text-primary">
          <span className="text-brand-1">Control</span>Finance
        </h1>

        {success ? (
          <div className="mt-6">
            <p className="text-sm text-cf-text-secondary">
              Senha redefinida com sucesso.
            </p>
            <p className="mt-4 text-sm text-cf-text-secondary">
              <Link to="/login" className="text-brand-1 hover:underline">
                Ir para o login
              </Link>
            </p>
          </div>
        ) : !token ? (
          <div className="mt-6">
            <p className="text-sm text-cf-text-secondary">
              Link de redefinição inválido ou expirado.
            </p>
            <p className="mt-4 text-sm text-cf-text-secondary">
              <Link to="/forgot-password" className="text-brand-1 hover:underline">
                Solicitar novo link
              </Link>
            </p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-cf-text-secondary">
              Crie uma nova senha para sua conta.
            </p>

            <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="nova-senha"
                  className="mb-1 block text-sm font-medium text-cf-text-primary"
                >
                  Nova senha
                </label>
                <div className="relative">
                  <input
                    id="nova-senha"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full rounded border border-cf-border-input px-3 py-2 pr-10 text-sm text-cf-text-secondary"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-cf-text-secondary hover:text-cf-text-primary"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirmar-senha"
                  className="mb-1 block text-sm font-medium text-cf-text-primary"
                >
                  Confirmar nova senha
                </label>
                <div className="relative">
                  <input
                    id="confirmar-senha"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full rounded border border-cf-border-input px-3 py-2 pr-10 text-sm text-cf-text-secondary"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-cf-text-secondary hover:text-cf-text-primary"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error ? (
                <p className="text-sm font-medium text-red-600">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded bg-brand-1 px-4 py-2 font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "Salvando..." : "Redefinir senha"}
              </button>
            </form>

            <p className="mt-4 text-sm text-cf-text-secondary">
              <Link to="/login" className="text-brand-1 hover:underline">
                Voltar para o login
              </Link>
            </p>
          </>
        )}
      </section>
    </main>
  );
};

export default ResetPassword;
