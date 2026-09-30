import { describe, expect, it } from "vitest";
import { centsToInput, formatBRL, parseBRLToCents } from "./money";

describe("money", () => {
  it("formata centavos em BRL", () => {
    expect(formatBRL(1250)).toBe("R$ 12,50");
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(0)).toBe("R$ 0,00");
    expect(formatBRL(null)).toBe("");
  });

  it.each([
    ["12,50", 1250],
    ["R$ 1.234,5", 123450],
    ["15", 1500],
    ["15.9", 1590],
    ["1.000", 100000],
    ["0,05", 5],
  ])("converte %s em centavos", (input, cents) => {
    expect(parseBRLToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "-5", "12,345", "1,2,3"])("rejeita %s", (input) => {
    expect(parseBRLToCents(input)).toBeNull();
  });

  it("evita erro de ponto flutuante", () => {
    expect(parseBRLToCents("0,29")).toBe(29);
    expect(parseBRLToCents("1,15")).toBe(115);
  });

  it("helpers de exibição", () => {
    expect(centsToInput(1500)).toBe("15,00");
  });
});
