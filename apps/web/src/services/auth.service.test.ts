import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { authService } from "./auth.service";

vi.mock("./api", () => ({
  api: {
    post: vi.fn(),
    delete: vi.fn(),
  },
  withApiRequestContext: vi.fn((context) => ({ headers: {} })),
}));

const postMock = vi.mocked(api.post);
const deleteMock = vi.mocked(api.delete);

const VALID_USER = { id: 1, name: "Amaro", email: "amaro@control.finance" };

describe("auth service", () => {
  beforeEach(() => {
    postMock.mockReset();
    deleteMock.mockReset();
  });

  // ─── login ────────────────────────────────────────────────────────────────────

  it("retorna user quando payload de login e valido", async () => {
    postMock.mockResolvedValueOnce({ data: { user: VALID_USER } });

    await expect(
      authService.login({ email: "amaro@control.finance", password: "abc12345" }),
    ).resolves.toEqual({ user: VALID_USER });
  });

  it("falha quando resposta de login nao possui user valido", async () => {
    postMock.mockResolvedValueOnce({
      data: { user: { id: 1, name: "Amaro" } }, // falta email
    });

    await expect(
      authService.login({ email: "amaro@control.finance", password: "abc12345" }),
    ).rejects.toThrow("Resposta de autenticacao invalida.");
  });

  it("falha quando resposta de login nao possui user", async () => {
    postMock.mockResolvedValueOnce({ data: {} });

    await expect(
      authService.login({ email: "amaro@control.finance", password: "abc12345" }),
    ).rejects.toThrow("Resposta de autenticacao invalida.");
  });

  // ─── register ────────────────────────────────────────────────────────────────

  it("retorna user quando payload de registro e valido", async () => {
    postMock.mockResolvedValueOnce({ data: { user: VALID_USER } });

    await expect(
      authService.register({
        name: "Amaro",
        email: "amaro@control.finance",
        password: "abc12345",
      }),
    ).resolves.toEqual({ user: VALID_USER });
  });

  it("falha quando resposta de registro nao possui user", async () => {
    postMock.mockResolvedValueOnce({ data: {} });

    await expect(
      authService.register({
        name: "Amaro",
        email: "amaro@control.finance",
        password: "abc12345",
      }),
    ).rejects.toThrow("Resposta de autenticacao invalida.");
  });

  // ─── loginWithGoogle ──────────────────────────────────────────────────────────

  it("retorna user quando Google login e valido", async () => {
    postMock.mockResolvedValueOnce({ data: { user: VALID_USER } });

    await expect(
      authService.loginWithGoogle({ idToken: "fake-google-token" }),
    ).resolves.toEqual({ user: VALID_USER });
  });

  // ─── refresh ─────────────────────────────────────────────────────────────────

  it("retorna user ao chamar refresh com sucesso", async () => {
    postMock.mockResolvedValueOnce({ data: { user: VALID_USER } });

    await expect(authService.refresh()).resolves.toEqual({ user: VALID_USER });
    expect(postMock).toHaveBeenCalled();
  });

  it("propaga erro quando refresh falha", async () => {
    postMock.mockRejectedValueOnce(new Error("401"));

    await expect(authService.refresh()).rejects.toThrow("401");
  });

  // ─── logout ───────────────────────────────────────────────────────────────────

  it("chama DELETE /auth/logout ao fazer logout", async () => {
    deleteMock.mockResolvedValueOnce({});

    await expect(authService.logout()).resolves.toBeUndefined();
    expect(deleteMock).toHaveBeenCalledWith("/auth/logout");
  });
});
