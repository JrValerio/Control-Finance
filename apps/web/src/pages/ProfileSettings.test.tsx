import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfileSettings from "./ProfileSettings";
import { profileService } from "../services/profile.service";
import { DiscreetModeProvider } from "../context/DiscreetModeContext";

vi.mock("../services/profile.service", () => ({
  profileService: {
    getMe: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

const buildMe = (overrides = {}) => ({
  id: 1,
  name: "Jr",
  email: "jr@example.com",
  hasPassword: true,
  linkedProviders: [] as string[],
  trialEndsAt: null as string | null,
  trialExpired: false,
  profile: {
    displayName: "Jr Valerio",
    salaryMonthly: 5000,
    payday: 5,
    avatarUrl: null,
  },
  ...overrides,
});

const renderPage = (props: {
  onBack?: () => void;
  onLogout?: () => void;
  onOpenBilling?: () => void;
} = {}) =>
  render(
    <DiscreetModeProvider>
      <ProfileSettings {...props} />
    </DiscreetModeProvider>,
  );

describe("ProfileSettings — Dados da conta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(profileService.getMe).mockResolvedValue(buildMe());
    vi.mocked(profileService.updateProfile).mockResolvedValue({
      displayName: "Jr Valerio",
      salaryMonthly: 5000,
      payday: 5,
      avatarUrl: null,
    });
  });

  it("shows loading skeleton then renders account fields", async () => {
    renderPage();
    expect(screen.getByRole("status")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("E-mail")).toBeInTheDocument());
    expect(screen.getByDisplayValue("jr@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Jr Valerio")).toBeInTheDocument();
  });

  it("shows load error with retry button on failure", async () => {
    vi.mocked(profileService.getMe).mockRejectedValue(new Error("Network error"));
    renderPage();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Tentar novamente")).toBeInTheDocument();
  });

  it("shows Acesso via: Google when linkedProviders includes google", async () => {
    vi.mocked(profileService.getMe).mockResolvedValue(
      buildMe({ linkedProviders: ["google"], hasPassword: false }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(/Acesso via:/)).toBeInTheDocument());
    expect(screen.getByText(/Google/)).toBeInTheDocument();
  });

  it("shows both Senha and Google when both are configured", async () => {
    vi.mocked(profileService.getMe).mockResolvedValue(
      buildMe({ linkedProviders: ["google"], hasPassword: true }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(/Acesso via:/)).toBeInTheDocument());
    expect(screen.getByText(/Senha · Google/)).toBeInTheDocument();
  });

  it("submits profile update and shows success message", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText("Nome exibido")).toBeInTheDocument());

    const nameInput = screen.getByLabelText("Nome exibido");
    await user.clear(nameInput);
    await user.type(nameInput, "Novo Nome");
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));

    await waitFor(() =>
      expect(screen.getByText("Perfil salvo com sucesso.")).toBeInTheDocument(),
    );
    expect(profileService.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: "Novo Nome" }),
    );
  });
});

describe("ProfileSettings — Preferências (Modo Discreto)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(profileService.getMe).mockResolvedValue(buildMe());
  });

  it("renders Modo Discreto switch defaulting to off", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /modo discreto/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("switch", { name: /modo discreto/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("toggles Modo Discreto on click", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /modo discreto/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("switch", { name: /modo discreto/i }));
    expect(screen.getByRole("switch", { name: /modo discreto/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

describe("ProfileSettings — Preferências (Copiloto)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(profileService.getMe).mockResolvedValue(buildMe());
    vi.mocked(profileService.updateProfile).mockResolvedValue({
      displayName: "Jr Valerio",
      salaryMonthly: 5000,
      payday: 5,
      avatarUrl: null,
      aiTone: "pragmatic",
      aiInsightFrequency: "always",
    });
  });

  it("renders ai_tone radio group with pragmatic selected by default", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Pragmático/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("radio", { name: /Pragmático/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Motivador/i })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Sarcástico/i })).not.toBeChecked();
  });

  it("saves ai_tone immediately when radio is selected", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Motivador/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("radio", { name: /Motivador/i }));
    expect(profileService.updateProfile).toHaveBeenCalledWith({ ai_tone: "motivator" });
    expect(screen.getByRole("radio", { name: /Motivador/i })).toBeChecked();
  });

  it("renders ai_insight_frequency radio group with always selected by default", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Sempre/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("radio", { name: /Sempre/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Só quando há risco/i })).not.toBeChecked();
  });

  it("saves ai_insight_frequency immediately when radio is selected", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Só quando há risco/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("radio", { name: /Só quando há risco/i }));
    expect(profileService.updateProfile).toHaveBeenCalledWith({
      ai_insight_frequency: "risk_only",
    });
    expect(screen.getByRole("radio", { name: /Só quando há risco/i })).toBeChecked();
  });

  it("loads saved preferences from profile on mount", async () => {
    vi.mocked(profileService.getMe).mockResolvedValue(
      buildMe({
        profile: {
          displayName: "Jr Valerio",
          salaryMonthly: 5000,
          payday: 5,
          avatarUrl: null,
          aiTone: "sarcastic",
          aiInsightFrequency: "risk_only",
        },
      }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Sarcástico/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("radio", { name: /Sarcástico/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Só quando há risco/i })).toBeChecked();
  });
});

describe("ProfileSettings — Assinatura", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows trial active with days remaining", async () => {
    const futureDate = new Date(Date.now() + 7 * 86_400_000).toISOString();
    vi.mocked(profileService.getMe).mockResolvedValue(
      buildMe({ trialEndsAt: futureDate, trialExpired: false }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText("Trial ativo")).toBeInTheDocument());
    expect(screen.getByText(/dias? restante/i)).toBeInTheDocument();
  });

  it("shows trial expired with upgrade CTA", async () => {
    const pastDate = new Date(Date.now() - 86_400_000).toISOString();
    vi.mocked(profileService.getMe).mockResolvedValue(
      buildMe({ trialEndsAt: pastDate, trialExpired: true }),
    );
    const onOpenBilling = vi.fn();
    renderPage({ onOpenBilling });
    await waitFor(() => expect(screen.getByText("Trial expirado")).toBeInTheDocument());
    const upgradeBtn = screen.getByRole("button", { name: "Fazer upgrade" });
    expect(upgradeBtn).toBeInTheDocument();
    await userEvent.setup().click(upgradeBtn);
    expect(onOpenBilling).toHaveBeenCalledOnce();
  });

  it("does not show upgrade button when onOpenBilling is not provided", async () => {
    const pastDate = new Date(Date.now() - 86_400_000).toISOString();
    vi.mocked(profileService.getMe).mockResolvedValue(
      buildMe({ trialEndsAt: pastDate, trialExpired: true }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText("Trial expirado")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Fazer upgrade" })).not.toBeInTheDocument();
  });

  it("shows Acesso ativo when no trial info (plan details unknown)", async () => {
    vi.mocked(profileService.getMe).mockResolvedValue(
      buildMe({ trialEndsAt: null, trialExpired: false }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText("Acesso ativo")).toBeInTheDocument());
    expect(screen.getByText(/Detalhes do plano disponíveis em Faturamento/)).toBeInTheDocument();
  });
});
