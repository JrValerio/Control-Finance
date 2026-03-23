import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CategoriesSettings from "./CategoriesSettings";
import { categoriesService } from "../services/categories.service";

vi.mock("../services/categories.service", () => ({
  categoriesService: {
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    restoreCategory: vi.fn(),
  },
}));

const buildCategory = (overrides = {}) => ({
  id: 1,
  userId: 1,
  name: "Alimentacao",
  normalizedName: "alimentacao",
  deletedAt: null,
  createdAt: "2026-02-01T12:00:00.000Z",
  ...overrides,
});

const renderPage = (initialPath = "/app/settings/categories") =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="*"
          element={<CategoriesSettings onBack={vi.fn()} onLogout={vi.fn()} />}
        />
      </Routes>
    </MemoryRouter>,
  );

describe("CategoriesSettings", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    categoriesService.listCategories.mockResolvedValue([buildCategory()]);
    categoriesService.createCategory.mockResolvedValue(buildCategory({ id: 2, name: "Mercado" }));
    categoriesService.updateCategory.mockResolvedValue(buildCategory());
    categoriesService.deleteCategory.mockResolvedValue(buildCategory({ deletedAt: "2026-02-12T10:00:00.000Z" }));
    categoriesService.restoreCategory.mockResolvedValue(buildCategory());
  });

  it("lista categorias ativas por padrao e permite incluir removidas", async () => {
    const user = userEvent.setup();

    categoriesService.listCategories
      .mockResolvedValueOnce([buildCategory({ id: 1, name: "Alimentacao" })])
      .mockResolvedValueOnce([
        buildCategory({ id: 1, name: "Alimentacao" }),
        buildCategory({
          id: 2,
          name: "Transporte",
          normalizedName: "transporte",
          deletedAt: "2026-02-12T10:00:00.000Z",
        }),
      ]);

    renderPage();

    expect(await screen.findByText("Alimentacao")).toBeInTheDocument();
    expect(categoriesService.listCategories).toHaveBeenNthCalledWith(1, false);

    await user.click(screen.getByLabelText("Incluir removidas"));

    expect(await screen.findByText("Transporte")).toBeInTheDocument();
    expect(categoriesService.listCategories).toHaveBeenNthCalledWith(2, true);
    expect(screen.getByText("Removida")).toBeInTheDocument();
  });

  it("cria categoria e recarrega listagem", async () => {
    const user = userEvent.setup();

    categoriesService.listCategories
      .mockResolvedValueOnce([buildCategory({ id: 1, name: "Alimentacao" })])
      .mockResolvedValueOnce([
        buildCategory({ id: 1, name: "Alimentacao" }),
        buildCategory({ id: 2, name: "Mercado", normalizedName: "mercado" }),
      ]);

    renderPage();

    expect(await screen.findByText("Alimentacao")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Nova categoria" }));
    await user.type(screen.getByLabelText("Nome"), "Mercado");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => {
      expect(categoriesService.createCategory).toHaveBeenCalledWith("Mercado");
    });

    expect(await screen.findByText("Categoria criada.")).toBeInTheDocument();
    expect(await screen.findByText("Mercado")).toBeInTheDocument();
  });

  it("restaura categoria removida quando includeDeleted esta ativo", async () => {
    const user = userEvent.setup();
    const removedCategory = buildCategory({
      id: 7,
      name: "Transporte",
      normalizedName: "transporte",
      deletedAt: "2026-02-15T09:30:00.000Z",
    });

    categoriesService.listCategories
      .mockResolvedValueOnce([removedCategory])
      .mockResolvedValueOnce([buildCategory({ id: 7, name: "Transporte" })]);
    categoriesService.restoreCategory.mockResolvedValueOnce(
      buildCategory({ id: 7, name: "Transporte" }),
    );

    renderPage("/app/settings/categories?includeDeleted=true");

    expect(await screen.findByText("Transporte")).toBeInTheDocument();
    expect(categoriesService.listCategories).toHaveBeenNthCalledWith(1, true);

    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    await user.click(await screen.findByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(categoriesService.restoreCategory).toHaveBeenCalledWith(7);
    });

    expect(await screen.findByText("Categoria restaurada.")).toBeInTheDocument();
  });
});
