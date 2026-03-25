import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AIInsightPanel from "./AIInsightPanel";
import type { AiInsight } from "../services/ai.service";

const buildInsight = (overrides: Partial<AiInsight> = {}): AiInsight => ({
  id: "insight_1_123456",
  type: "success",
  title: "Dica do Especialista",
  message: "Seu saldo está ótimo. Reserve R$ 300 para emergências.",
  action_label: "Ver detalhes",
  ...overrides,
});

describe("AIInsightPanel", () => {
  it("renderiza shimmer de loading quando isLoading e true", () => {
    render(<AIInsightPanel insight={null} isLoading />);
    expect(screen.getByRole("status", { name: /carregando/i })).toBeInTheDocument();
    expect(screen.queryByText("Dica do Especialista")).toBeNull();
  });

  it("retorna null quando nao esta carregando e insight e null", () => {
    const { container } = render(<AIInsightPanel insight={null} isLoading={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renderiza titulo e mensagem do insight quando insight e valido", () => {
    render(<AIInsightPanel insight={buildInsight()} isLoading={false} />);
    expect(screen.getByText(/Dica do Especialista/)).toBeInTheDocument();
    expect(screen.getByText("Seu saldo está ótimo. Reserve R$ 300 para emergências.")).toBeInTheDocument();
  });

  it("nao renderiza shimmer quando insight esta presente e isLoading e false", () => {
    render(<AIInsightPanel insight={buildInsight()} isLoading={false} />);
    expect(screen.queryByRole("status", { name: /carregando/i })).toBeNull();
  });

  it("aplica estilo warning para type warning", () => {
    render(<AIInsightPanel insight={buildInsight({ type: "warning" })} isLoading={false} />);
    const panel = screen.getByText(/Dica do Especialista/).closest("div");
    expect(panel?.className).toContain("amber");
  });

  it("aplica estilo success para type success", () => {
    render(<AIInsightPanel insight={buildInsight({ type: "success" })} isLoading={false} />);
    const panel = screen.getByText(/Dica do Especialista/).closest("div");
    expect(panel?.className).toContain("green");
  });

  it("aplica estilo info para type info", () => {
    render(<AIInsightPanel insight={buildInsight({ type: "info" })} isLoading={false} />);
    const panel = screen.getByText(/Dica do Especialista/).closest("div");
    expect(panel?.className).toContain("blue");
  });
});
