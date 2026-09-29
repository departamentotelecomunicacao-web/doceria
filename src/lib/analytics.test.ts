// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { onAnalyticsEvent, track } from "./analytics";

describe("analytics", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.__doceriaEvents = [];
  });

  it("não duplica purchase/order_created do mesmo pedido", () => {
    const received: string[] = [];
    const stop = onAnalyticsEvent((event) => received.push(event));
    expect(track("purchase", { transaction_id: "ABC123", value: 44 }, { dedupeKey: "ABC123" })).toBe(true);
    expect(track("purchase", { transaction_id: "ABC123", value: 44 }, { dedupeKey: "ABC123" })).toBe(false);
    expect(track("purchase", { transaction_id: "XYZ999", value: 10 }, { dedupeKey: "XYZ999" })).toBe(true);
    stop();
    expect(received).toEqual(["purchase", "purchase"]);
  });

  it("eventos sem chave podem se repetir (ex.: add_to_cart)", () => {
    expect(track("add_to_cart", { value: 12 })).toBe(true);
    expect(track("add_to_cart", { value: 12 })).toBe(true);
    expect(window.__doceriaEvents?.filter((e) => e.event === "add_to_cart")).toHaveLength(2);
  });
});
