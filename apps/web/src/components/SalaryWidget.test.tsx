import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SalaryWidget from "./SalaryWidget";
import { salaryService, type SalaryProfile } from "../services/salary.service";

vi.mock("../services/salary.service", () => ({
  salaryService: {
    getProfile:    vi.fn(),
    upsertProfile: vi.fn(),
  },
}));

// ─── Builders ─────────────────────────────────────────────────────────────────

const buildProfile = (overrides: Partial<SalaryProfile> = {}): SalaryProfile => ({
  id:          1,
  userId:      1,
  grossSalary: 5000,
  dependents:  0,
  paymentDay:  5,
  createdAt:   "2026-02-01T00:00:00Z",
  updatedAt:   "2026-02-01T00:00:00Z",
  calculation: {
    grossMonthly: 5000,
    inssMonthly:  501.51,
    irrfMonthly:  336.67,
    netMonthly:   4161.82,
    netAnnual:    49941.84,
    taxAnnual:    10058.16,
  },
  ...overrides,
});

const renderWidget = () => render(<SalaryWidget />);

// ─── Loading ──────────────────────────────────────────────────────────────────

describe("SalaryWidget — loading", () => {
  it("exibe estado de carregamento enquanto busca dados", () => {
    vi.mocked(salaryService.getProfile).mockReturnValue(new Promise(() => {}));
    renderWidget();
    expect(screen.getByText("Carregando salário...")).toBeInTheDocument();
  });
});

// ─── Empty state (sem perfil) ─────────────────────────────────────────────────

describe("SalaryWidget — sem perfil (404)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salaryService.getProfile).mockResolvedValue(null);
  });

  it("exibe CTA para criar perfil", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText("Definir salário bruto")).toBeInTheDocument();
    });
    expect(screen.getByText(/Calcule seu salário líquido/)).toBeInTheDocument();
  });

  it("abre formulário ao clicar no CTA", async () => {
    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Definir salário bruto")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Definir salário bruto"));

    expect(screen.getByLabelText("Salário bruto (R$)")).toBeInTheDocument();
    expect(screen.getByLabelText("Dependentes")).toBeInTheDocument();
    expect(screen.getByLabelText("Dia de pagamento")).toBeInTheDocument();
  });
});

// ─── Com perfil ───────────────────────────────────────────────────────────────

describe("SalaryWidget — com perfil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salaryService.getProfile).mockResolvedValue(buildProfile());
  });

  it("exibe título Salário líquido", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText("Salário líquido")).toBeInTheDocument();
    });
  });

  it("exibe líquido mensal formatado", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getAllByText(/4\.161/).length).toBeGreaterThan(0);
    });
  });

  it("exibe bruto, INSS e IRRF no breakdown", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText("Salário bruto")).toBeInTheDocument();
    });
    expect(screen.getByText("(-) INSS")).toBeInTheDocument();
    expect(screen.getByText("(-) IRRF")).toBeInTheDocument();
  });

  it("exibe botão Editar", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });
  });
});

// ─── Edição ───────────────────────────────────────────────────────────────────

describe("SalaryWidget — edição", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salaryService.getProfile).mockResolvedValue(buildProfile());
  });

  it("abre formulário ao clicar em Editar", async () => {
    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Editar"));

    expect(screen.getByLabelText("Salário bruto (R$)")).toBeInTheDocument();
  });

  it("formulário pré-preenchido com dados atuais", async () => {
    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Editar"));

    const grossInput = screen.getByLabelText("Salário bruto (R$)") as HTMLInputElement;
    expect(grossInput.value).toBe("5000");
  });

  it("cancela edição e volta para exibição", async () => {
    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Editar"));
    await user.click(screen.getByText("Cancelar"));

    expect(screen.queryByLabelText("Salário bruto (R$)")).not.toBeInTheDocument();
    expect(screen.getByText("Editar")).toBeInTheDocument();
  });

  it("salva perfil atualizado e fecha formulário", async () => {
    const updatedProfile = buildProfile({
      grossSalary: 6000,
      calculation: { ...buildProfile().calculation, grossMonthly: 6000, netMonthly: 5000 },
    });
    vi.mocked(salaryService.upsertProfile).mockResolvedValue(updatedProfile);

    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Editar"));

    const grossInput = screen.getByLabelText("Salário bruto (R$)");
    await user.clear(grossInput);
    await user.type(grossInput, "6000");

    await user.click(screen.getByText("Salvar"));

    await waitFor(() => {
      expect(screen.queryByLabelText("Salário bruto (R$)")).not.toBeInTheDocument();
    });

    expect(vi.mocked(salaryService.upsertProfile)).toHaveBeenCalledWith(
      expect.objectContaining({ gross_salary: 6000 }),
    );
  });

  it("exibe erro ao salvar com salário inválido (0)", async () => {
    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Editar"));

    const grossInput = screen.getByLabelText("Salário bruto (R$)");
    await user.clear(grossInput);
    await user.type(grossInput, "0");

    await user.click(screen.getByText("Salvar"));

    expect(screen.getByRole("alert")).toHaveTextContent("Informe um salário bruto válido.");
    expect(vi.mocked(salaryService.upsertProfile)).not.toHaveBeenCalled();
  });

  it("exibe erro de rede ao salvar", async () => {
    vi.mocked(salaryService.upsertProfile).mockRejectedValue(new Error("Network Error"));

    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Editar"));

    await user.click(screen.getByText("Salvar"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Erro ao salvar. Tente novamente.");
    });
  });
});

// ─── Criação via formulário (sem perfil) ──────────────────────────────────────

describe("SalaryWidget — criação via formulário", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salaryService.getProfile).mockResolvedValue(null);
  });

  it("cria perfil e exibe breakdown após salvar", async () => {
    const newProfile = buildProfile({ grossSalary: 3000 });
    vi.mocked(salaryService.upsertProfile).mockResolvedValue(newProfile);

    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Definir salário bruto")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Definir salário bruto"));

    const grossInput = screen.getByLabelText("Salário bruto (R$)");
    await user.clear(grossInput);
    await user.type(grossInput, "3000");

    await user.click(screen.getByText("Salvar"));

    await waitFor(() => {
      expect(screen.queryByLabelText("Salário bruto (R$)")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Editar")).toBeInTheDocument();
  });
});
