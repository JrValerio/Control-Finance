import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GoalsSection from "./GoalsSection";
import type { Goal } from "../services/goals.service";

vi.mock("../services/goals.service", () => ({
  GOAL_ICONS: {
    target: "🎯", plane: "✈️", home: "🏠", car: "🚗", graduation: "🎓",
    heart: "❤️", star: "⭐", gift: "🎁", briefcase: "💼", umbrella: "☂️",
  },
  goalsService: {
    list:   vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const { goalsService } = await import("../services/goals.service");

const buildGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 1,
  userId: 42,
  title: "Viagem Japão",
  targetAmount: 15000,
  currentAmount: 3000,
  targetDate: "2027-10-01",
  icon: "plane",
  notes: null,
  monthlyNeeded: 500,
  createdAt: "2026-03-25T00:00:00Z",
  updatedAt: "2026-03-25T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GoalsSection", () => {
  // ── Loading ──────────────────────────────────────────────────────────────

  it("exibe shimmer de loading enquanto carrega", () => {
    vi.mocked(goalsService.list).mockReturnValue(new Promise(() => {}));
    render(<GoalsSection />);
    expect(document.querySelector(".animate-pulse")).not.toBeNull();
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it("exibe estado vazio quando nao ha metas", async () => {
    vi.mocked(goalsService.list).mockResolvedValue([]);
    render(<GoalsSection />);
    await waitFor(() => expect(screen.getByText("Nenhuma meta ainda")).toBeInTheDocument());
  });

  // ── List ─────────────────────────────────────────────────────────────────

  it("renderiza cards quando ha metas", async () => {
    vi.mocked(goalsService.list).mockResolvedValue([buildGoal(), buildGoal({ id: 2, title: "Casa Própria" })]);
    render(<GoalsSection />);
    await waitFor(() => expect(screen.getByText("Viagem Japão")).toBeInTheDocument());
    expect(screen.getByText("Casa Própria")).toBeInTheDocument();
  });

  it("exibe porcentagem de progresso corretamente", async () => {
    vi.mocked(goalsService.list).mockResolvedValue([buildGoal({ targetAmount: 10000, currentAmount: 2000 })]);
    render(<GoalsSection />);
    await waitFor(() => expect(screen.getByText("20%")).toBeInTheDocument());
  });

  it("exibe mensagem de meta atingida quando monthlyNeeded e zero", async () => {
    vi.mocked(goalsService.list).mockResolvedValue([buildGoal({ monthlyNeeded: 0 })]);
    render(<GoalsSection />);
    await waitFor(() => expect(screen.getByText(/Meta atingida/)).toBeInTheDocument());
  });

  // ── Error ─────────────────────────────────────────────────────────────────

  it("exibe mensagem de erro quando list falha", async () => {
    vi.mocked(goalsService.list).mockRejectedValue(new Error("Falha na rede"));
    render(<GoalsSection />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  // ── Create ────────────────────────────────────────────────────────────────

  it("abre modal ao clicar em Nova meta", async () => {
    vi.mocked(goalsService.list).mockResolvedValue([]);
    render(<GoalsSection />);
    await waitFor(() => screen.getByText("Nenhuma meta ainda"));
    const btn = screen.getAllByText(/Nova meta/)[0];
    fireEvent.click(btn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Nova meta de poupança")).toBeInTheDocument();
  });

  it("cria meta e adiciona ao estado sem refetch", async () => {
    const newGoal = buildGoal({ id: 99, title: "Fundo de Emergência" });
    vi.mocked(goalsService.list).mockResolvedValue([]);
    vi.mocked(goalsService.create).mockResolvedValue(newGoal);

    render(<GoalsSection />);
    await waitFor(() => screen.getByText("Nenhuma meta ainda"));

    fireEvent.click(screen.getByText("Criar meta"));
    const dialog = await screen.findByRole("dialog");

    const d = within(dialog);
    fireEvent.change(d.getByPlaceholderText(/Viagem/), { target: { value: "Fundo de Emergência" } });
    fireEvent.change(d.getByPlaceholderText("15000"), { target: { value: "5000" } });
    fireEvent.change(d.getByLabelText(/data alvo/i), { target: { value: "2026-12-31" } });

    fireEvent.click(d.getByRole("button", { name: "Criar meta" }));

    await waitFor(() => expect(goalsService.create).toHaveBeenCalledWith(expect.objectContaining({
      title: "Fundo de Emergência",
      target_amount: 5000,
      target_date: "2026-12-31",
    })));
    await waitFor(() => expect(screen.getByText("Fundo de Emergência")).toBeInTheDocument());
  });

  // ── Edit ──────────────────────────────────────────────────────────────────

  it("abre modal de edicao com dados da meta pre-preenchidos", async () => {
    const goal = buildGoal();
    vi.mocked(goalsService.list).mockResolvedValue([goal]);
    render(<GoalsSection />);
    await waitFor(() => screen.getByText("Viagem Japão"));

    fireEvent.click(screen.getByLabelText("Editar meta Viagem Japão"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Editar meta")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Viagem Japão")).toBeInTheDocument();
  });

  it("atualiza meta no estado apos edicao bem-sucedida", async () => {
    const goal = buildGoal();
    const updated = { ...goal, title: "Viagem ao Japão (atualizado)", currentAmount: 5000 };
    vi.mocked(goalsService.list).mockResolvedValue([goal]);
    vi.mocked(goalsService.update).mockResolvedValue(updated);

    render(<GoalsSection />);
    await waitFor(() => screen.getByText("Viagem Japão"));

    fireEvent.click(screen.getByLabelText("Editar meta Viagem Japão"));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByText("Salvar alterações"));
    await waitFor(() => expect(goalsService.update).toHaveBeenCalledWith(1, expect.any(Object)));
    await waitFor(() => expect(screen.getByText("Viagem ao Japão (atualizado)")).toBeInTheDocument());
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  it("abre confirm dialog ao clicar em excluir", async () => {
    vi.mocked(goalsService.list).mockResolvedValue([buildGoal()]);
    render(<GoalsSection />);
    await waitFor(() => screen.getByText("Viagem Japão"));

    fireEvent.click(screen.getByLabelText("Excluir meta Viagem Japão"));
    await waitFor(() => expect(screen.getByText("Excluir meta")).toBeInTheDocument());
  });

  it("remove meta do estado apos confirmacao de exclusao", async () => {
    vi.mocked(goalsService.list).mockResolvedValue([buildGoal()]);
    vi.mocked(goalsService.remove).mockResolvedValue(undefined);

    render(<GoalsSection />);
    await waitFor(() => screen.getByText("Viagem Japão"));

    fireEvent.click(screen.getByLabelText("Excluir meta Viagem Japão"));
    await screen.findByText("Excluir meta");

    fireEvent.click(screen.getByText("Excluir", { selector: "button" }));
    await waitFor(() => expect(goalsService.remove).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText("Viagem Japão")).toBeNull());
  });
});
