import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "./Login";

const mockUseAuth = vi.fn();

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@react-oauth/google", () => ({
  // eslint-disable-next-line react/prop-types
  GoogleLogin: ({ onSuccess }) => (
    <button
      type="button"
      data-testid="google-login-btn"
      onClick={() => onSuccess({ credential: "fake-google-id-token" })}
    >
      Continuar com Google
    </button>
  ),
}));

const createAuthMockState = (overrides = {}) => ({
  isAuthenticated: false,
  isLoading: false,
  errorMessage: "",
  login: vi.fn().mockResolvedValue({}),
  register: vi.fn().mockResolvedValue({}),
  loginWithGoogle: vi.fn().mockResolvedValue({}),
  clearError: vi.fn(),
  ...overrides,
});

const renderLoginPage = () => {
  return render(
    <MemoryRouter
      initialEntries={["/"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Login />
    </MemoryRouter>,
  );
};

describe("Login", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("bloqueia cadastro com senha fraca", async () => {
    const authState = createAuthMockState();
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(authState);
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    await user.type(screen.getByLabelText("Email"), "jr@controlfinance.dev");
    await user.type(screen.getByLabelText("Senha"), "1234567");
    await user.type(screen.getByLabelText("Confirmar senha"), "1234567");
    await user.click(screen.getByRole("button", { name: "Criar conta e entrar" }));

    expect(
      screen.getByText(
        "Senha fraca: use no mínimo 8 caracteres com letras e números.",
      ),
    ).toBeInTheDocument();
    expect(authState.register).not.toHaveBeenCalled();
    expect(authState.login).not.toHaveBeenCalled();
  }, 10000);

  it("bloqueia cadastro quando confirmacao de senha diverge", async () => {
    const authState = createAuthMockState();
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(authState);
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    await user.type(screen.getByLabelText("Email"), "jr@controlfinance.dev");
    await user.type(screen.getByLabelText("Senha"), "Senha123");
    await user.type(screen.getByLabelText("Confirmar senha"), "Senha124");
    await user.click(screen.getByRole("button", { name: "Criar conta e entrar" }));

    expect(screen.getByText("As senhas não conferem.")).toBeInTheDocument();
    expect(authState.register).not.toHaveBeenCalled();
    expect(authState.login).not.toHaveBeenCalled();
  }, 10000);

  it("alterna visibilidade da senha no modo login", async () => {
    mockUseAuth.mockReturnValue(createAuthMockState());
    const user = userEvent.setup();
    renderLoginPage();

    const input = screen.getByLabelText("Senha");
    const toggle = screen.getByRole("button", { name: "Mostrar senha" });

    expect(input).toHaveAttribute("type", "password");

    await user.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar senha" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("alterna visibilidade da senha no modo registro e reseta ao trocar de modo", async () => {
    mockUseAuth.mockReturnValue(createAuthMockState());
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    const senhaInput = screen.getByLabelText("Senha");
    const confirmarInput = screen.getByLabelText("Confirmar senha");
    const toggle = screen.getAllByRole("button", { name: "Mostrar senha" })[0];

    expect(senhaInput).toHaveAttribute("type", "password");
    expect(confirmarInput).toHaveAttribute("type", "password");

    await user.click(toggle);
    expect(senhaInput).toHaveAttribute("type", "text");
    expect(confirmarInput).toHaveAttribute("type", "text");

    // Trocar para login deve resetar showPassword
    await user.click(screen.getByRole("button", { name: "Login" }));
    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
  });

  it("realiza cadastro e login com senha valida", async () => {
    const authState = createAuthMockState();
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(authState);
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    await user.type(screen.getByLabelText("Nome"), "Junior");
    await user.type(screen.getByLabelText("Email"), "jr@controlfinance.dev");
    await user.type(screen.getByLabelText("Senha"), "Senha123");
    await user.type(screen.getByLabelText("Confirmar senha"), "Senha123");
    await user.click(screen.getByRole("button", { name: "Criar conta e entrar" }));

    await waitFor(() => {
      expect(authState.register).toHaveBeenCalledWith({
        name: "Junior",
        email: "jr@controlfinance.dev",
        password: "Senha123",
      });
      expect(authState.login).toHaveBeenCalledWith({
        email: "jr@controlfinance.dev",
        password: "Senha123",
      });
    });
  }, 10000);

  it("chama loginWithGoogle com id_token ao clicar no botao Google", async () => {
    const authState = createAuthMockState();
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(authState);
    renderLoginPage();

    await user.click(screen.getByTestId("google-login-btn"));

    await waitFor(() => {
      expect(authState.loginWithGoogle).toHaveBeenCalledWith({
        idToken: "fake-google-id-token",
      });
    });
  });
});
