import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../hooks/useAuth";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const WEAK_PASSWORD_MESSAGE =
  "Senha fraca: use no mínimo 8 caracteres com letras e números.";

type AuthMode = "login" | "register";

const isStrongPassword = (password: string): boolean => {
  const normalizedPassword = password.trim();
  return PASSWORD_REGEX.test(normalizedPassword);
};

const Login = (): JSX.Element => {
  const navigate = useNavigate();
  const {
    isAuthenticated,
    isLoading,
    errorMessage,
    login,
    register,
    loginWithGoogle,
    clearError,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/app", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const resetErrors = () => {
    setLocalError("");
    clearError();
  };

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    resetErrors();
    setShowPassword(false);

    if (nextMode === "login") {
      setConfirmPassword("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetErrors();

    if (!email.trim() || !password.trim()) {
      setLocalError("Email e senha são obrigatórios.");
      return;
    }

    try {
      if (mode === "register") {
        if (!isStrongPassword(password)) {
          setLocalError(WEAK_PASSWORD_MESSAGE);
          return;
        }

        if (password.trim() !== confirmPassword.trim()) {
          setLocalError("As senhas não conferem.");
          return;
        }

        await register({
          name,
          email,
          password,
        });
      }

      await login({ email, password });
      navigate("/app", { replace: true });
    } catch {
      // Erro de API tratado no contexto.
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-cf-bg-page p-4">
      <section className="w-full max-w-md rounded bg-cf-surface p-6 shadow-lg">
        <h1 className="text-3xl font-semibold text-cf-text-primary">
          <span className="text-brand-1">Control</span>Finance
        </h1>
        <p className="mt-2 text-sm text-cf-text-secondary">
          Entre para acessar o dashboard financeiro.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => handleModeChange("login")}
            className={`rounded px-3 py-2 text-sm font-medium ${
              mode === "login"
                ? "bg-brand-1 text-white"
                : "bg-cf-bg-subtle text-cf-text-primary"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("register")}
            className={`rounded px-3 py-2 text-sm font-medium ${
              mode === "register"
                ? "bg-brand-1 text-white"
                : "bg-cf-bg-subtle text-cf-text-primary"
            }`}
          >
            Criar conta
          </button>
        </div>

        <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <div>
              <label
                htmlFor="nome"
                className="mb-1 block text-sm font-medium text-cf-text-primary"
              >
                Nome
              </label>
              <input
                id="nome"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-secondary"
              />
            </div>
          ) : null}

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-cf-text-primary"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-secondary"
              autoComplete="email"
            />
          </div>

          <div>
            <label
              htmlFor="senha"
              className="mb-1 block text-sm font-medium text-cf-text-primary"
            >
              Senha
            </label>
            <div className="relative">
              <input
                id="senha"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded border border-cf-border-input px-3 py-2 pr-10 text-sm text-cf-text-secondary"
                autoComplete={showPassword ? "off" : mode === "register" ? "new-password" : "current-password"}
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

          {mode === "register" ? (
            <div>
              <label
                htmlFor="confirmar-senha"
                className="mb-1 block text-sm font-medium text-cf-text-primary"
              >
                Confirmar senha
              </label>
              <div className="relative">
                <input
                  id="confirmar-senha"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded border border-cf-border-input px-3 py-2 pr-10 text-sm text-cf-text-secondary"
                  autoComplete={showPassword ? "off" : "new-password"}
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
          ) : null}

          {localError ? (
            <p className="text-sm font-medium text-red-600">{localError}</p>
          ) : null}

          {!localError && errorMessage ? (
            <p className="text-sm font-medium text-red-600">{errorMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded bg-brand-1 px-4 py-2 font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading
              ? "Processando..."
              : mode === "register"
                ? "Criar conta e entrar"
                : "Entrar"}
          </button>

          <div className="flex items-center gap-2">
            <hr className="flex-1 border-cf-border" />
            <span className="text-xs text-cf-text-secondary">ou</span>
            <hr className="flex-1 border-cf-border" />
          </div>

          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                const idToken = credentialResponse.credential;
                if (!idToken) return;
                try {
                  await loginWithGoogle({ idToken });
                } catch {
                  // Error is set in AuthContext and displayed via errorMessage
                }
              }}
              onError={() => {
                // Google's own UI surfaces errors; no additional handling needed
              }}
              text="continue_with"
              size="large"
            />
          </div>
        </form>
      </section>
    </main>
  );
};

export default Login;
