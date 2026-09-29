import { describe, expect, it, vi } from "vitest";
import type { Db } from "./db.ts";
import { resolveRouteQuote } from "./delivery.ts";
import type { RoutingProvider } from "./routing/types.ts";

const address = { cep: "29300000", street: "Rua Teste", number: "42", neighborhood: "Centro", city: "Cachoeiro de Itapemirim", state: "ES" };

function fakeDb(options: { cached?: unknown[]; configured?: boolean } = {}) {
  const inserts: Record<string, unknown>[] = [];
  const db = {
    rpc: vi.fn(async (fn: string) => {
      if (fn === "normalize_delivery_address") return { ...address, complement: null, reference: null, destinationHash: "dest-hash" };
      if (fn === "get_routing_origin") return { address: "Origem", lat: -20.8, lng: -41.1, configured: options.configured ?? true, hash: "origin-hash" };
      throw new Error(`rpc inesperada ${fn}`);
    }),
    select: vi.fn(async () => options.cached ?? []),
    insert: vi.fn(async (_table: string, row: Record<string, unknown>) => {
      inserts.push(row);
      return { id: "quote-id", distance_meters: row.distance_meters, duration_seconds: row.duration_seconds, expires_at: row.expires_at };
    }),
  };
  return { db: db as unknown as Db, inserts, raw: db };
}

function provider(result: Awaited<ReturnType<RoutingProvider["computeRoute"]>>) {
  return { name: "fake", computeRoute: vi.fn(async () => result) };
}

describe("resolveRouteQuote", () => {
  it("usa a cotação em cache sem chamar o provedor pago", async () => {
    const { db } = fakeDb({ cached: [{ id: "cached", distance_meters: 2100, duration_seconds: 300, expires_at: "2099-01-01T00:00:00Z" }] });
    const routing = provider({ ok: true, provider: "fake", distanceMeters: 1, durationSeconds: 1 });
    const quote = await resolveRouteQuote({ db, routing, address, requesterHash: "h", cacheTtlHours: 168 });
    expect(quote).toMatchObject({ quoteId: "cached", distanceMeters: 2100, cached: true });
    expect(routing.computeRoute).not.toHaveBeenCalled();
  });

  it("salva a rota calculada com origem e destino em hash (sem endereço completo)", async () => {
    const { db, inserts } = fakeDb();
    const routing = provider({ ok: true, provider: "fake", distanceMeters: 4200, durationSeconds: 500 });
    const quote = await resolveRouteQuote({ db, routing, address, requesterHash: "h", cacheTtlHours: 168 });
    expect(quote).toMatchObject({ quoteId: "quote-id", distanceMeters: 4200, cached: false });
    expect(inserts[0]).toMatchObject({ status: "OK", origin_hash: "origin-hash", destination_hash: "dest-hash", neighborhood: "Centro" });
    expect(JSON.stringify(inserts[0])).not.toContain("Rua Teste");
  });

  it("teto global de chamadas atingido: não chama a API e oferece WhatsApp", async () => {
    const { db } = fakeDb();
    const routing = provider({ ok: true, provider: "fake", distanceMeters: 1, durationSeconds: 1 });
    await expect(resolveRouteQuote({ db, routing, address, requesterHash: "h", cacheTtlHours: 168, beforeProviderCall: async () => false }))
      .rejects.toMatchObject({ status: 503, code: "ROUTING_UNAVAILABLE", data: { fallback: "WHATSAPP" } });
    expect(routing.computeRoute).not.toHaveBeenCalled();
  });

  it("falha do provedor não inventa distância", async () => {
    const { db, inserts } = fakeDb();
    const routing = provider({ ok: false, provider: "fake", reason: "PROVIDER_ERROR" });
    await expect(resolveRouteQuote({ db, routing, address, requesterHash: "h", cacheTtlHours: 168 }))
      .rejects.toMatchObject({ code: "ROUTING_UNAVAILABLE" });
    expect(inserts[0]).toMatchObject({ status: "PROVIDER_ERROR" });
    expect(inserts[0]).not.toHaveProperty("distance_meters");
  });

  it("origem não configurada pede configuração (fallback WhatsApp)", async () => {
    const { db } = fakeDb({ configured: false });
    const routing = provider({ ok: true, provider: "fake", distanceMeters: 1, durationSeconds: 1 });
    await expect(resolveRouteQuote({ db, routing, address, requesterHash: "h", cacheTtlHours: 168 }))
      .rejects.toMatchObject({ code: "DELIVERY_NOT_CONFIGURED" });
  });
});
