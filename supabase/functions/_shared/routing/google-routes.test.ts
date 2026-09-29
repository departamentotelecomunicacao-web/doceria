import { describe, expect, it, vi } from "vitest";
import { GoogleRoutesProvider, isImpreciseGeocode, parseDurationSeconds } from "./google-routes.ts";
import { createRoutingProvider } from "./index.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const origin = { lat: -20.848889, lng: -41.112778 };
const destination = { address: "Rua Teste, 42 - Centro, Cachoeiro de Itapemirim - ES, 29300-000, Brasil" };

describe("GoogleRoutesProvider", () => {
  it("envia requisição sem trânsito, com FieldMask mínima e chave no cabeçalho", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      routes: [{ distanceMeters: 2100, duration: "253s" }],
      geocodingResults: { destination: { geocoderStatus: {}, type: ["street_address"] } },
    }));
    const provider = new GoogleRoutesProvider({ apiKey: "key-123", fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await provider.computeRoute(origin, destination);

    expect(result).toEqual({ ok: true, provider: "google-routes", distanceMeters: 2100, durationSeconds: 253 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("key-123");
    expect(headers["X-Goog-FieldMask"]).toBe("routes.distanceMeters,routes.duration,geocodingResults");
    const body = JSON.parse(String(init.body));
    expect(body.routingPreference).toBe("TRAFFIC_UNAWARE");
    expect(body.travelMode).toBe("DRIVE");
    expect(body.origin).toEqual({ location: { latLng: { latitude: origin.lat, longitude: origin.lng } } });
    expect(body.destination).toEqual({ address: destination.address });
  });

  it("sem chave configurada não chama a API", async () => {
    const fetchImpl = vi.fn();
    const provider = new GoogleRoutesProvider({ apiKey: undefined, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.computeRoute(origin, destination)).resolves.toMatchObject({ ok: false, reason: "NOT_CONFIGURED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("endereço geocodificado só em nível de cidade é impreciso (não inventa distância)", async () => {
    const provider = new GoogleRoutesProvider({
      apiKey: "k",
      fetchImpl: (async () => jsonResponse({
        routes: [{ distanceMeters: 3000, duration: "400s" }],
        geocodingResults: { destination: { type: ["locality", "political"] } },
      })) as unknown as typeof fetch,
    });
    await expect(provider.computeRoute(origin, destination)).resolves.toMatchObject({ ok: false, reason: "IMPRECISE_ADDRESS" });
  });

  it("geocoder sem resultado vira NOT_FOUND", async () => {
    const provider = new GoogleRoutesProvider({
      apiKey: "k",
      fetchImpl: (async () => jsonResponse({ geocodingResults: { destination: { geocoderStatus: { code: 5 } } } })) as unknown as typeof fetch,
    });
    await expect(provider.computeRoute(origin, destination)).resolves.toMatchObject({ ok: false, reason: "NOT_FOUND" });
  });

  it("falha 5xx tenta uma vez de novo e depois devolve PROVIDER_ERROR", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: {} }, 503));
    const provider = new GoogleRoutesProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.computeRoute(origin, destination)).resolves.toMatchObject({ ok: false, reason: "PROVIDER_ERROR" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("chave inválida (403) vira NOT_CONFIGURED sem nova tentativa", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: {} }, 403));
    const provider = new GoogleRoutesProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.computeRoute(origin, destination)).resolves.toMatchObject({ ok: false, reason: "NOT_CONFIGURED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("tempo esgotado vira TIMEOUT", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const provider = new GoogleRoutesProvider({ apiKey: "k", timeoutMs: 20, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.computeRoute(origin, destination)).resolves.toMatchObject({ ok: false, reason: "TIMEOUT" });
  });

  it("distância omitida (proto3 zero) é tratada como 0", async () => {
    const provider = new GoogleRoutesProvider({ apiKey: "k", fetchImpl: (async () => jsonResponse({ routes: [{}] })) as unknown as typeof fetch });
    await expect(provider.computeRoute(origin, destination)).resolves.toMatchObject({ ok: true, distanceMeters: 0, durationSeconds: null });
  });
});

describe("auxiliares", () => {
  it("parseDurationSeconds", () => {
    expect(parseDurationSeconds("540s")).toBe(540);
    expect(parseDurationSeconds("12.6s")).toBe(13);
    expect(parseDurationSeconds(undefined)).toBeNull();
    expect(parseDurationSeconds("5m")).toBeNull();
  });
  it("isImpreciseGeocode", () => {
    expect(isImpreciseGeocode({ type: ["street_address"] })).toBe(false);
    expect(isImpreciseGeocode({ type: ["route"] })).toBe(false);
    expect(isImpreciseGeocode({ type: ["postal_code"] })).toBe(true);
    expect(isImpreciseGeocode(undefined)).toBe(false);
  });
  it("fábrica usa Google por padrão e rejeita provedor desconhecido", () => {
    expect(createRoutingProvider(() => undefined).name).toBe("google-routes");
    expect(() => createRoutingProvider((name) => (name === "ROUTING_PROVIDER" ? "mapbox" : undefined))).toThrow(/não suportado/);
  });
});
