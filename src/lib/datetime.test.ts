import { describe, expect, it } from "vitest";
import { formatDateTime, formatDayLabel, formatSlot, storeDateKey, summarizeWeeklyHours } from "./datetime";

describe("datas no fuso da loja (America/Sao_Paulo)", () => {
  it("formata independentemente do fuso do aparelho", () => {
    // 02:30 UTC ainda é dia anterior em São Paulo (UTC-3).
    expect(storeDateKey("2026-10-01T02:30:00Z")).toBe("2026-09-30");
    expect(formatDateTime("2026-10-01T15:00:00Z")).toBe("01/10/2026 às 12:00");
  });

  it("rótulos de dia relativos", () => {
    const now = new Date("2026-10-01T13:00:00Z");
    expect(formatDayLabel("2026-10-01T20:00:00Z", now)).toBe("Hoje");
    expect(formatDayLabel("2026-10-02T13:00:00Z", now)).toBe("Amanhã");
    expect(formatSlot({ start: "2026-10-01T21:00:00Z", end: "2026-10-01T22:00:00Z" }, now)).toBe("Hoje, 18:00 às 19:00");
  });

  it("agrupa dias com o mesmo horário", () => {
    const summary = summarizeWeeklyHours({
      "1": [["10:00", "18:00"]], "2": [["10:00", "18:00"]], "3": [["10:00", "18:00"]], "4": [["10:00", "18:00"]], "5": [["10:00", "18:00"]],
      "6": [["10:00", "14:00"]], "7": [],
    });
    expect(summary).toEqual([
      { days: "Segunda a sexta", hours: "10:00 às 18:00" },
      { days: "Sábado", hours: "10:00 às 14:00" },
      { days: "Domingo", hours: "Fechado" },
    ]);
  });
});
