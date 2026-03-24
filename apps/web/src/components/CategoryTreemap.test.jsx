import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CategoryTreemap from "./CategoryTreemap";

vi.mock("recharts", () => {
  const ResponsiveContainer = ({ children }) => (
    <div data-testid="responsive-container">{children}</div>
  );
  const Treemap = ({ data, content }) => (
    <div data-testid="treemap">
      {data.map((item, i) =>
        React.cloneElement(content, {
          key: item.name,
          x: 0,
          y: i * 40,
          width: 200,
          height: 60,
          name: item.name,
          colorIndex: item.colorIndex,
          value: item.size,
          total: item.total,
        }),
      )}
    </div>
  );
  const Tooltip = () => null;

  return { ResponsiveContainer, Treemap, Tooltip };
});

const buildData = (overrides = []) =>
  overrides.length > 0
    ? overrides
    : [
        { categoryId: 1, categoryName: "Alimentação", expense: 450 },
        { categoryId: 2, categoryName: "Transporte", expense: 200 },
        { categoryId: 3, categoryName: "Saúde", expense: 150 },
      ];

describe("CategoryTreemap", () => {
  it("exibe empty state quando data esta vazio", () => {
    render(<CategoryTreemap data={[]} />);
    expect(screen.getByText("Sem gastos por categoria neste período.")).toBeInTheDocument();
  });

  it("exibe empty state quando todas as despesas sao zero", () => {
    render(
      <CategoryTreemap
        data={[
          { categoryId: 1, categoryName: "Alimentação", expense: 0 },
          { categoryId: 2, categoryName: "Transporte", expense: 0 },
        ]}
      />,
    );
    expect(screen.getByText("Sem gastos por categoria neste período.")).toBeInTheDocument();
  });

  it("renderiza o titulo e o treemap quando ha dados validos", () => {
    render(<CategoryTreemap data={buildData()} />);
    expect(screen.getByText("Despesas por categoria")).toBeInTheDocument();
    expect(screen.getByTestId("treemap")).toBeInTheDocument();
  });

  it("renderiza celulas com nome de cada categoria", () => {
    render(<CategoryTreemap data={buildData()} />);
    expect(screen.getByText("Alimentação")).toBeInTheDocument();
    expect(screen.getByText("Transporte")).toBeInTheDocument();
    expect(screen.getByText("Saúde")).toBeInTheDocument();
  });

  it("exibe porcentagem correta na celula com maior gasto", () => {
    render(<CategoryTreemap data={buildData()} />);
    // Alimentação: 450 / 800 = 56.3%
    expect(screen.getByText("56.3%")).toBeInTheDocument();
  });

  it("trunca nome longo com reticencias na celula", () => {
    render(
      <CategoryTreemap
        data={[{ categoryId: 1, categoryName: "Nome Muito Longo Mesmo", expense: 300 }]}
      />,
    );
    expect(screen.getByText("Nome Muito L…")).toBeInTheDocument();
  });
});
