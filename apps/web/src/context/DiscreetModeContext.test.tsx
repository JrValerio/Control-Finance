import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiscreetModeProvider, useDiscreetMode, useMaskedCurrency } from "./DiscreetModeContext";

const STORAGE_KEY = "cf.discreet_mode";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DiscreetModeProvider>{children}</DiscreetModeProvider>
);

describe("useDiscreetMode", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("defaults to false when localStorage is empty", () => {
    const { result } = renderHook(() => useDiscreetMode(), { wrapper });
    expect(result.current.isDiscreet).toBe(false);
  });

  it("reads initial state from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "1");
    const { result } = renderHook(() => useDiscreetMode(), { wrapper });
    expect(result.current.isDiscreet).toBe(true);
  });

  it("toggle flips isDiscreet from false to true", async () => {
    const { result } = renderHook(() => useDiscreetMode(), { wrapper });
    act(() => result.current.toggle());
    expect(result.current.isDiscreet).toBe(true);
  });

  it("toggle persists true to localStorage", () => {
    const { result } = renderHook(() => useDiscreetMode(), { wrapper });
    act(() => result.current.toggle());
    expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("toggle removes localStorage key when turning off", () => {
    localStorage.setItem(STORAGE_KEY, "1");
    const { result } = renderHook(() => useDiscreetMode(), { wrapper });
    act(() => result.current.toggle());
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.isDiscreet).toBe(false);
  });

  it("toggle is stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useDiscreetMode(), { wrapper });
    const firstToggle = result.current.toggle;
    rerender();
    expect(result.current.toggle).toBe(firstToggle);
  });
});

describe("useMaskedCurrency", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("formats normally when discreet mode is off", () => {
    const { result } = renderHook(() => useMaskedCurrency(), { wrapper });
    expect(result.current(1234.56)).toBe("R$\u00a01.234,56");
  });

  it("returns mask string when discreet mode is on", () => {
    localStorage.setItem(STORAGE_KEY, "1");
    const { result } = renderHook(() => useMaskedCurrency(), { wrapper });
    expect(result.current(1234.56)).toBe("R$ ••••");
  });

  it("updates immediately after toggle", async () => {
    const { result } = renderHook(
      () => ({ mode: useDiscreetMode(), money: useMaskedCurrency() }),
      { wrapper },
    );
    expect(result.current.money(100)).not.toBe("R$ ••••");
    act(() => result.current.mode.toggle());
    expect(result.current.money(100)).toBe("R$ ••••");
  });

  it("works without provider (defaults to unmasked)", () => {
    const { result } = renderHook(() => useMaskedCurrency());
    expect(result.current(500)).not.toBe("R$ ••••");
  });
});

describe("Modo Discreto toggle UI", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("switch reflects and updates isDiscreet state", async () => {
    const user = userEvent.setup();
    render(
      <DiscreetModeProvider>
        <SwitchUnderTest />
      </DiscreetModeProvider>,
    );
    const btn = screen.getByRole("switch");
    expect(btn).toHaveAttribute("aria-checked", "false");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-checked", "true");
  });
});

// Minimal switch component that wires directly to context
const SwitchUnderTest = () => {
  const { isDiscreet, toggle } = useDiscreetMode();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDiscreet}
      onClick={toggle}
    >
      toggle
    </button>
  );
};
