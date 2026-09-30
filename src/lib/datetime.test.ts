import { describe, expect, it } from "vitest";
import { formatDateChip, formatDateTime, formatScheduleLong, formatScheduleShort, storeDateKey, summarizeWeekdays } from "./datetime";

describe("datas no fuso da loja (America/Sao_Paulo)", () => {
  it("formata independentemente do fuso do aparelho", () => {
    // 02:30 UTC ainda é o dia anterior em São Paulo (UTC-3).
    expect(storeDateKey("2026-10-01T02:30:00Z")).toBe("2026-09-30");
    expect(formatDateTime("2026-10-01T15:00:00Z")).toBe("01/10/2026 às 12:00");
  });

  it("agenda por data e período", () => {
    expect(formatScheduleLong("2026-10-01", "AFTERNOON")).toBe("Quinta-feira, 01/10, período da tarde");
    expect(formatScheduleShort("2026-10-01", "MORNING", "2026-10-01")).toBe("Hoje · Manhã");
    expect(formatScheduleShort("2026-10-02", "EVENING", "2026-10-01")).toBe("Amanhã · Noite");
    expect(formatScheduleShort("2026-10-05", "AFTERNOON", "2026-10-01")).toBe("Seg 05/10 · Tarde");
  });

  it("botões de data", () => {
    expect(formatDateChip("2026-10-01", "2026-10-01")).toEqual({ top: "Hoje", bottom: "01/10" });
    expect(formatDateChip("2026-10-02", "2026-10-01")).toEqual({ top: "Amanhã", bottom: "02/10" });
    expect(formatDateChip("2026-10-03", "2026-10-01")).toEqual({ top: "Sáb", bottom: "03/10" });
    // Virada de mês
    expect(formatDateChip("2026-11-01", "2026-10-31")).toEqual({ top: "Amanhã", bottom: "01/11" });
  });

  it("resume os dias de funcionamento", () => {
    expect(summarizeWeekdays([1, 2, 3, 4, 5, 6])).toBe("Segunda a sábado");
    expect(summarizeWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe("Todos os dias");
    expect(summarizeWeekdays([5, 6])).toBe("Sexta, Sábado");
  });
});
