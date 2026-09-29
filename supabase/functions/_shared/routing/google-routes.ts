import type { RouteResult, RoutingProvider, Waypoint } from "./types.ts";

// Google Routes API (computeRoutes).
// https://developers.google.com/maps/documentation/routes/compute_route_directions
//
// - routingPreference TRAFFIC_UNAWARE: preço previsível, sem trânsito.
// - FieldMask mínima (distância, duração e geocodificação) para reduzir custo.
// - geocodingResults permite detectar endereços imprecisos (ex.: só a cidade),
//   que gerariam uma distância plausível porém errada.

export const GOOGLE_ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

const FIELD_MASK = "routes.distanceMeters,routes.duration,geocodingResults";

// Tipos de geocodificação que indicam que o provedor não encontrou a rua.
const COARSE_TYPES = new Set([
  "country",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "locality",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
  "neighborhood",
  "postal_code",
  "political",
  "colloquial_area",
]);

interface GoogleWaypoint {
  address?: string;
  location?: { latLng: { latitude: number; longitude: number } };
}

interface GeocodedWaypoint {
  geocoderStatus?: { code?: number; message?: string };
  type?: string[];
  partialMatch?: boolean;
}

interface ComputeRoutesResponse {
  routes?: Array<{ distanceMeters?: number; duration?: string }>;
  geocodingResults?: {
    origin?: GeocodedWaypoint;
    destination?: GeocodedWaypoint;
  };
}

export interface GoogleRoutesOptions {
  apiKey: string | undefined;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function toGoogleWaypoint(point: Waypoint): GoogleWaypoint {
  if (typeof point.lat === "number" && typeof point.lng === "number") {
    return { location: { latLng: { latitude: point.lat, longitude: point.lng } } };
  }
  return { address: point.address ?? "" };
}

export function parseDurationSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  return match ? Math.round(Number(match[1])) : null;
}

export function isImpreciseGeocode(result: GeocodedWaypoint | undefined): boolean {
  if (!result || !Array.isArray(result.type) || result.type.length === 0) return false;
  return result.type.every((type) => COARSE_TYPES.has(type));
}

export class GoogleRoutesProvider implements RoutingProvider {
  readonly name = "google-routes";
  private readonly apiKey: string | undefined;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GoogleRoutesOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? GOOGLE_ROUTES_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async computeRoute(origin: Waypoint, destination: Waypoint): Promise<RouteResult> {
    if (!this.apiKey) {
      return { ok: false, provider: this.name, reason: "NOT_CONFIGURED", detail: "missing api key" };
    }

    const body = JSON.stringify({
      origin: toGoogleWaypoint(origin),
      destination: toGoogleWaypoint(destination),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      computeAlternativeRoutes: false,
      languageCode: "pt-BR",
      regionCode: "br",
      units: "METRIC",
    });

    // Uma nova tentativa apenas para falhas transitórias (5xx/rede).
    let lastFailure: RouteResult | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.request(body);
      if (result.ok || (result.reason !== "PROVIDER_ERROR" && result.reason !== "TIMEOUT")) {
        return result;
      }
      lastFailure = result;
      if (result.reason === "TIMEOUT") break;
    }
    return lastFailure!;
  }

  private async request(body: string): Promise<RouteResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey!,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return {
        ok: false,
        provider: this.name,
        reason: aborted ? "TIMEOUT" : "PROVIDER_ERROR",
        detail: aborted ? `timeout after ${this.timeoutMs}ms` : String(error).slice(0, 200),
      };
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, provider: this.name, reason: "NOT_CONFIGURED", detail: `http ${response.status}` };
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      // 400 com endereço não geocodificável é tratado como "não encontrado".
      if (response.status === 400 && /waypoint|geocod|address/i.test(text)) {
        return { ok: false, provider: this.name, reason: "NOT_FOUND", detail: text.slice(0, 200) };
      }
      return { ok: false, provider: this.name, reason: "PROVIDER_ERROR", detail: `http ${response.status}` };
    }

    let data: ComputeRoutesResponse;
    try {
      data = (await response.json()) as ComputeRoutesResponse;
    } catch {
      return { ok: false, provider: this.name, reason: "PROVIDER_ERROR", detail: "invalid json" };
    }

    const destinationGeocode = data.geocodingResults?.destination;
    if (destinationGeocode?.geocoderStatus?.code && destinationGeocode.geocoderStatus.code !== 0) {
      return { ok: false, provider: this.name, reason: "NOT_FOUND", detail: "destination geocoder status" };
    }
    if (isImpreciseGeocode(destinationGeocode)) {
      return {
        ok: false,
        provider: this.name,
        reason: "IMPRECISE_ADDRESS",
        detail: `types=${destinationGeocode?.type?.join("|")}`,
      };
    }

    const route = data.routes?.[0];
    if (!route) {
      return { ok: false, provider: this.name, reason: "NOT_FOUND", detail: "no route" };
    }

    // proto3 JSON omite zero: origem e destino idênticos resultam em distância 0.
    const distanceMeters = typeof route.distanceMeters === "number" ? route.distanceMeters : 0;
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
      return { ok: false, provider: this.name, reason: "PROVIDER_ERROR", detail: "invalid distance" };
    }

    return {
      ok: true,
      provider: this.name,
      distanceMeters: Math.round(distanceMeters),
      durationSeconds: parseDurationSeconds(route.duration),
    };
  }
}
