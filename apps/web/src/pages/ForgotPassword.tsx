import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { authService } from "../services/auth.service";

const ForgotPassword = (): JSX.Element => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email é obrigatório.");
      return;
    }

    setIsLoading(true);
    try {
      await authService.forgotPassword({ email: email.trim() });
      setSubmitted(true);
    } catch {
      // Show generic error — do not reveal server-side details
      setError("Não foi possível processar a solicitação. Tente novamente.");
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

        {submitted ? (
          <div className="mt-6">
            <p className="text-sm text-cf-text-secondary">
              Se o e-mail estiver cadastrado, enviaremos as instruções para
              redefinição de senha em instantes.
            </p>
            <p className="mt-4 text-sm text-cf-text-secondary">
              <Link to="/login" className="text-brand-1 hover:underline">
                Voltar para o login
              </Link>
            </p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-cf-text-secondary">
              Informe seu e-mail para receber o link de redefinição de senha.
            </p>

            <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-sm font-medium text-cf-text-primary"
                >
                  E-mail
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

              {error ? (
                <p className="text-sm font-medium text-red-600">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded bg-brand-1 px-4 py-2 font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "Enviando..." : "Enviar link de redefinição"}
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

export default ForgotPassword;
