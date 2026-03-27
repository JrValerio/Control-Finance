import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SalaryWidget from "./SalaryWidget";
import { salaryService, type SalaryProfile } from "../services/salary.service";

vi.mock("../services/salary.service", () => ({
  salaryService: {
    getProfile:        vi.fn(),
    upsertProfile:     vi.fn(),
    addConsignacao:    vi.fn(),
    deleteConsignacao: vi.fn(),
  },
}));

// ─── Builders ─────────────────────────────────────────────────────────────────

const buildCltProfile = (overrides: Partial<SalaryProfile> = {}): SalaryProfile => ({
  id:          1,
  userId:      1,
  profileType: "clt",
  birthYear:   null,
  grossSalary: 5000,
  dependents:  0,
  paymentDay:  5,
  createdAt:   "2026-02-01T00:00:00Z",
  updatedAt:   "2026-02-01T00:00:00Z",
  consignacoes: [],
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

const buildBenefitProfile = (overrides: Partial<SalaryProfile> = {}): SalaryProfile => ({
  id:          2,
  userId:      1,
  profileType: "inss_beneficiary",
  birthYear:   1955,
  grossSalary: 4958.67,
  dependents:  0,
  paymentDay:  5,
  createdAt:   "2026-02-01T00:00:00Z",
  updatedAt:   "2026-02-01T00:00:00Z",
  consignacoes: [],
  calculation: {
    grossMonthly:        4958.67,
    inssMonthly:         0,
    irrfMonthly:         7.58,
    consignacoesMonthly: 0,
    loanTotal:           0,
    cardTotal:           0,
    netMonthly:          4958.67,
    netAnnual:           59504.04,
    taxAnnual:           90.96,
    loanLimitAmount:     1735.53,
    cardLimitAmount:     247.93,
    isOverLoanLimit:     false,
    isOverCardLimit:     false,
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

// ─── Seletor de tipo ──────────────────────────────────────────────────────────

describe("SalaryWidget — seletor de tipo (sem perfil)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salaryService.getProfile).mockResolvedValue(null);
  });

  it("exibe dois botões de seleção de tipo", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByTestId("select-clt")).toBeInTheDocument();
    });
    expect(screen.getByTestId("select-beneficiary")).toBeInTheDocument();
  });

  it("exibe prompt de seleção de tipo de renda", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText("Como você recebe sua renda principal?")).toBeInTheDocument();
    });
  });

  it("abre formulário CLT ao selecionar Salário CLT", async () => {
    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByTestId("select-clt")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("select-clt"));

    expect(screen.getByLabelText("Salário bruto (R$)")).toBeInTheDocument();
    expect(screen.getByLabelText("Dependentes")).toBeInTheDocument();
    expect(screen.getByLabelText("Dia de pagamento")).toBeInTheDocument();
  });

  it("abre formulário beneficiário ao selecionar Benefício INSS", async () => {
    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByTestId("select-beneficiary")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("select-beneficiary"));

    expect(screen.getByLabelText("Benefício bruto (R$)")).toBeInTheDocument();
    expect(screen.getByLabelText("Ano de nascimento")).toBeInTheDocument();
  });

  it("Cancelar no formulário volta ao seletor de tipo", async () => {
    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByTestId("select-clt")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("select-clt"));
    await user.click(screen.getByText("Cancelar"));

    expect(screen.getByTestId("select-clt")).toBeInTheDocument();
    expect(screen.queryByLabelText("Salário bruto (R$)")).not.toBeInTheDocument();
  });
});

// ─── Perfil CLT — exibição ────────────────────────────────────────────────────

describe("SalaryWidget — perfil CLT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salaryService.getProfile).mockResolvedValue(buildCltProfile());
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

// ─── Perfil CLT — edição ──────────────────────────────────────────────────────

describe("SalaryWidget — edição CLT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salaryService.getProfile).mockResolvedValue(buildCltProfile());
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

  it("salva perfil CLT atualizado e fecha formulário", async () => {
    const updatedProfile = buildCltProfile({
      grossSalary: 6000,
      calculation: { ...buildCltProfile().calculation, grossMonthly: 6000, netMonthly: 5000 },
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
      expect.objectContaining({ profile_type: "clt", gross_salary: 6000 }),
    );
  });

  it("exibe erro ao salvar com salário inválido", async () => {
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
});

// ─── Perfil CLT — paywall anual ───────────────────────────────────────────────

describe("SalaryWidget — paywall anual CLT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exibe texto de upgrade quando netAnnual é null (free user)", async () => {
    const freeProfile = buildCltProfile({
      calculation: { ...buildCltProfile().calculation, netAnnual: null, taxAnnual: null },
    });
    vi.mocked(salaryService.getProfile).mockResolvedValue(freeProfile);

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Salário líquido")).toBeInTheDocument();
    });

    expect(screen.getByText("Líquido anual: disponível no Pro")).toBeInTheDocument();
  });

  it("exibe valor anual formatado quando netAnnual é número", async () => {
    vi.mocked(salaryService.getProfile).mockResolvedValue(buildCltProfile());

    renderWidget();

    await waitFor(() => {
      expect(screen.getAllByText(/4\.161/).length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/49\.941/)).toBeInTheDocument();
  });
});

// ─── Perfil CLT — criação ─────────────────────────────────────────────────────

describe("SalaryWidget — criação CLT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salaryService.getProfile).mockResolvedValue(null);
  });

  it("cria perfil CLT e exibe breakdown após salvar", async () => {
    const newProfile = buildCltProfile({ grossSalary: 3000 });
    vi.mocked(salaryService.upsertProfile).mockResolvedValue(newProfile);

    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByTestId("select-clt")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("select-clt"));

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

// ─── Perfil beneficiário — exibição ──────────────────────────────────────────

describe("SalaryWidget — perfil beneficiário INSS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salaryService.getProfile).mockResolvedValue(buildBenefitProfile());
  });

  it("exibe título Benefício líquido", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Benefício líquido" })).toBeInTheDocument();
    });
  });

  it("exibe breakdown: Benefício bruto, IRRF estimado e Consignações", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getAllByText("Benefício bruto").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("IRRF estimado")).toBeInTheDocument();
    expect(screen.getByText("Descontos do mês")).toBeInTheDocument();
    expect(screen.getByText("(-) Consignações")).toBeInTheDocument();
    expect(screen.getByText("Composição do benefício")).toBeInTheDocument();
  });

  it("exibe contexto de recebimento e perfil do benefício", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText(/Recebe dia/)).toBeInTheDocument();
    });
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("1955")).toBeInTheDocument();
    expect(screen.getByText("Beneficiário INSS")).toBeInTheDocument();
  });

  it("exibe alertas de limite de empréstimos e cartão", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText("Empréstimos")).toBeInTheDocument();
    });
    expect(screen.getByText("Cartão consignado")).toBeInTheDocument();
  });

  it("exibe mensagem de nenhum desconto quando consignações estão vazias", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText("Nenhum desconto cadastrado.")).toBeInTheDocument();
    });
  });

  it("exibe botão Editar", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });
  });
});

// ─── Perfil beneficiário — com consignações ───────────────────────────────────

describe("SalaryWidget — beneficiário com consignações", () => {
  const profileWithConsig = buildBenefitProfile({
    consignacoes: [
      { id: 1, salaryProfileId: 2, description: "BMG Empréstimo", amount: 456.78, consignacaoType: "loan", createdAt: "2026-01-01T00:00:00Z" },
      { id: 2, salaryProfileId: 2, description: "Cartão Banco X",  amount: 100.00, consignacaoType: "card", createdAt: "2026-01-02T00:00:00Z" },
    ],
    calculation: {
      ...buildBenefitProfile().calculation,
      consignacoesMonthly: 556.78,
      loanTotal:           456.78,
      cardTotal:           100.00,
      netMonthly:          4401.89,
      isOverLoanLimit:     false,
      isOverCardLimit:     false,
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salaryService.getProfile).mockResolvedValue(profileWithConsig);
  });

  it("exibe lista de consignações cadastradas", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText("BMG Empréstimo")).toBeInTheDocument();
    });
    expect(screen.getByText("Cartão Banco X")).toBeInTheDocument();
    expect(screen.getByText("2 desconto(s) lançados.")).toBeInTheDocument();
  });

  it("exibe badge de tipo para cada consignação", async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText("BMG Empréstimo")).toBeInTheDocument();
    });
    expect(screen.getByText("Empréstimo")).toBeInTheDocument();
    expect(screen.getByText("Cartão")).toBeInTheDocument();
  });

  it("recarrega o benefício quando recebe sincronização externa do INSS", async () => {
    const updatedProfile = buildBenefitProfile({
      paymentDay: 7,
      consignacoes: [
        {
          id: 11,
          salaryProfileId: 2,
          description: "216 CONSIGNACAO EMPRESTIMO BANCARIO",
          amount: 156,
          consignacaoType: "loan",
          createdAt: "2026-04-07T00:00:00Z",
        },
        {
          id: 12,
          salaryProfileId: 2,
          description: "217 EMPRESTIMO SOBRE A RMC",
          amount: 238,
          consignacaoType: "loan",
          createdAt: "2026-04-07T00:00:00Z",
        },
      ],
      calculation: {
        ...buildBenefitProfile().calculation,
        consignacoesMonthly: 394,
        loanTotal: 394,
        cardTotal: 0,
        netMonthly: 4564.67,
      },
    });

    vi.mocked(salaryService.getProfile)
      .mockResolvedValueOnce(buildBenefitProfile())
      .mockResolvedValue(updatedProfile);

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Nenhum desconto cadastrado.")).toBeInTheDocument();
    });

    window.dispatchEvent(new CustomEvent("salary-profile-updated"));

    await waitFor(() => {
      expect(screen.getByText("216 CONSIGNACAO EMPRESTIMO BANCARIO")).toBeInTheDocument();
    });

    expect(screen.getByText("217 EMPRESTIMO SOBRE A RMC")).toBeInTheDocument();
    expect(salaryService.getProfile).toHaveBeenCalledTimes(2);
  });
});

// ─── Perfil beneficiário — alerta de limite excedido ─────────────────────────

describe("SalaryWidget — alertas de limite de consignação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exibe aviso quando empréstimos excedem 35% do benefício", async () => {
    const overLimitProfile = buildBenefitProfile({
      calculation: {
        ...buildBenefitProfile().calculation,
        loanTotal:       1908.10,
        isOverLoanLimit: true,
        loanLimitAmount: 1735.53,
      },
    });
    vi.mocked(salaryService.getProfile).mockResolvedValue(overLimitProfile);

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText(/acima do limite 35%/)).toBeInTheDocument();
    });
  });

  it("não exibe aviso quando dentro dos limites", async () => {
    vi.mocked(salaryService.getProfile).mockResolvedValue(buildBenefitProfile());

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Empréstimos")).toBeInTheDocument();
    });

    expect(screen.queryByText(/acima do limite/)).not.toBeInTheDocument();
  });
});

// ─── Perfil beneficiário — adicionar consignação ──────────────────────────────

describe("SalaryWidget — adicionar consignação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salaryService.getProfile).mockResolvedValue(buildBenefitProfile());
  });

  it("exibe formulário ao clicar em Adicionar", async () => {
    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByTestId("add-consignacao-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("add-consignacao-btn"));

    expect(screen.getByLabelText("Descrição")).toBeInTheDocument();
    expect(screen.getByLabelText("Descrição")).toHaveAttribute("maxLength", "100");
    expect(screen.getByLabelText("Valor (R$)")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo")).toBeInTheDocument();
  });

  it("salva consignação e atualiza perfil", async () => {
    const updatedProfile = buildBenefitProfile({
      consignacoes: [
        { id: 10, salaryProfileId: 2, description: "BMG", amount: 300, consignacaoType: "loan", createdAt: "2026-01-01T00:00:00Z" },
      ],
      calculation: { ...buildBenefitProfile().calculation, loanTotal: 300, consignacoesMonthly: 300 },
    });
    vi.mocked(salaryService.addConsignacao).mockResolvedValue({
      id: 10, salaryProfileId: 2, description: "BMG", amount: 300, consignacaoType: "loan", createdAt: "2026-01-01T00:00:00Z",
    });
    vi.mocked(salaryService.getProfile).mockResolvedValueOnce(buildBenefitProfile()).mockResolvedValue(updatedProfile);

    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByTestId("add-consignacao-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("add-consignacao-btn"));
    await user.type(screen.getByLabelText("Descrição"), "BMG");
    await user.type(screen.getByLabelText("Valor (R$)"), "300");
    await user.click(screen.getByText("Salvar"));

    await waitFor(() => {
      expect(vi.mocked(salaryService.addConsignacao)).toHaveBeenCalledWith(
        expect.objectContaining({ description: "BMG", amount: 300, consignacao_type: "loan" }),
      );
    });
  });

  it("exibe erro de validação ao tentar salvar sem descrição", async () => {
    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByTestId("add-consignacao-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("add-consignacao-btn"));
    await user.type(screen.getByLabelText("Valor (R$)"), "200");
    await user.click(screen.getByText("Salvar"));

    expect(screen.getByRole("alert")).toHaveTextContent("Informe a descrição.");
    expect(vi.mocked(salaryService.addConsignacao)).not.toHaveBeenCalled();
  });
});

// ─── Perfil beneficiário — edição ─────────────────────────────────────────────

describe("SalaryWidget — edição perfil beneficiário", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salaryService.getProfile).mockResolvedValue(buildBenefitProfile());
  });

  it("abre formulário beneficiário ao clicar em Editar", async () => {
    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Editar"));

    expect(screen.getByLabelText("Benefício bruto (R$)")).toBeInTheDocument();
    expect(screen.getByLabelText("Ano de nascimento")).toBeInTheDocument();
  });

  it("formulário pré-preenchido com benefício atual", async () => {
    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Editar"));

    const benefitInput = screen.getByLabelText("Benefício bruto (R$)") as HTMLInputElement;
    expect(benefitInput.value).toBe("4958.67");

    const birthYearInput = screen.getByLabelText("Ano de nascimento") as HTMLInputElement;
    expect(birthYearInput.value).toBe("1955");
  });

  it("salva perfil beneficiário com profile_type correto", async () => {
    vi.mocked(salaryService.upsertProfile).mockResolvedValue(buildBenefitProfile({ grossSalary: 5200 }));

    const user = userEvent.setup();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Editar"));

    const benefitInput = screen.getByLabelText("Benefício bruto (R$)");
    await user.clear(benefitInput);
    await user.type(benefitInput, "5200");

    await user.click(screen.getByText("Salvar"));

    await waitFor(() => {
      expect(vi.mocked(salaryService.upsertProfile)).toHaveBeenCalledWith(
        expect.objectContaining({ profile_type: "inss_beneficiary", gross_salary: 5200 }),
      );
    });
  });
});
