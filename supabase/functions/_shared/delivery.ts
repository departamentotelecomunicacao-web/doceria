// Resolve a distância de rota para um endereço, reaproveitando cotações
// recentes (mesma origem + mesmo destino normalizado) para economizar chamadas
// à API de mapas. Nunca inventa distância: se o provedor falhar, devolve erro
// e o cliente é orientado a seguir pelo WhatsApp.

import type { Db } from "./db.ts";
import { AppError } from "./errors.ts";
import type { RouteResult, RoutingProvider, Waypoint } from "./routing/index.ts";
import { type AddressInput, addressToRoutingQuery } from "./validation.ts";

interface NormalizedAddress extends AddressInput {
  destinationHash: string;
}

interface RoutingOrigin {
  address: string;
  lat: number | null;
  lng: number | null;
  configured: boolean;
  hash: string;
}

interface QuoteRow {
  id: string;
  distance_meters: number;
  duration_seconds: number | null;
  expires_at: string;
}

export interface RouteQuote {
  quoteId: string;
  distanceMeters: number;
  durationSeconds: number | null;
  expiresAt: string;
  cached: boolean;
  normalized: NormalizedAddress;
}

export interface ResolveRouteOptions {
  db: Db;
  routing: RoutingProvider;
  address: AddressInput;
  requesterHash: string;
  cacheTtlHours: number;
  now?: () => Date;
  /**
   * Executado antes de cada chamada paga ao provedor (cache miss). Usado para
   * o teto global de chamadas por hora: excedido, não chamamos a API.
   */
  beforeProviderCall?: () => Promise<boolean>;
  onProviderResult?: (result: RouteResult, ms: number) => void;
}

export const WHATSAPP_FALLBACK = { fallback: "WHATSAPP" } as const;

export async function resolveRouteQuote(options: ResolveRouteOptions): Promise<RouteQuote> {
  const { db, routing, address, requesterHash } = options;
  const now = options.now ?? (() => new Date());

  const normalized = await db.rpc<NormalizedAddress>("normalize_delivery_address", { p_address: address });
  const origin = await db.rpc<RoutingOrigin>("get_routing_origin");

  if (!origin.configured) {
    throw new AppError(
      503,
      "DELIVERY_NOT_CONFIGURED",
      "Não foi possível calcular a entrega automaticamente.",
      { ...WHATSAPP_FALLBACK },
    );
  }

  const nowIso = now().toISOString();
  const cached = await db.select<QuoteRow>(
    "delivery_quotes",
    [
      "select=id,distance_meters,duration_seconds,expires_at",
      `origin_hash=eq.${origin.hash}`,
      `destination_hash=eq.${normalized.destinationHash}`,
      "status=eq.OK",
      `expires_at=gt.${encodeURIComponent(nowIso)}`,
      "order=created_at.desc",
      "limit=1",
    ].join("&"),
  );

  if (cached.length > 0) {
    const row = cached[0];
    return {
      quoteId: row.id,
      distanceMeters: row.distance_meters,
      durationSeconds: row.duration_seconds,
      expiresAt: row.expires_at,
      cached: true,
      normalized,
    };
  }

  const originWaypoint: Waypoint = origin.lat !== null && origin.lng !== null
    ? { lat: Number(origin.lat), lng: Number(origin.lng) }
    : { address: origin.address };

  if (options.beforeProviderCall && !(await options.beforeProviderCall())) {
    throw new AppError(
      503,
      "ROUTING_UNAVAILABLE",
      "Não foi possível calcular a entrega automaticamente.",
      { ...WHATSAPP_FALLBACK },
    );
  }

  const startedAt = Date.now();
  const result = await routing.computeRoute(originWaypoint, { address: addressToRoutingQuery(normalized) });
  options.onProviderResult?.(result, Date.now() - startedAt);

  const base = {
    origin_hash: origin.hash,
    destination_hash: normalized.destinationHash,
    neighborhood: normalized.neighborhood,
    city: normalized.city,
    provider: result.provider,
    requester_hash: requesterHash,
  };

  if (result.ok) {
    const expiresAt = new Date(now().getTime() + options.cacheTtlHours * 3600_000).toISOString();
    const row = await db.insert<QuoteRow>("delivery_quotes", {
      ...base,
      status: "OK",
      distance_meters: result.distanceMeters,
      duration_seconds: result.durationSeconds,
      expires_at: expiresAt,
    });
    return {
      quoteId: row.id,
      distanceMeters: result.distanceMeters,
      durationSeconds: result.durationSeconds,
      expiresAt: row.expires_at,
      cached: false,
      normalized,
    };
  }

  // Registra a falha (monitoramento); nunca é reutilizada como cotação válida.
  const failureStatus = result.reason === "NOT_FOUND"
    ? "NOT_FOUND"
    : result.reason === "IMPRECISE_ADDRESS"
    ? "IMPRECISE_ADDRESS"
    : "PROVIDER_ERROR";
  await db.insert("delivery_quotes", {
    ...base,
    status: failureStatus,
    expires_at: new Date(now().getTime() + 10 * 60_000).toISOString(),
  }).catch(() => undefined);

  if (result.reason === "NOT_FOUND") {
    throw new AppError(
      422,
      "ADDRESS_NOT_FOUND",
      "Não encontramos este endereço. Confira rua, número, bairro e CEP.",
      { ...WHATSAPP_FALLBACK },
    );
  }
  if (result.reason === "IMPRECISE_ADDRESS") {
    throw new AppError(
      422,
      "ADDRESS_IMPRECISE",
      "Não conseguimos localizar o endereço com precisão. Confira a rua e o número.",
      { ...WHATSAPP_FALLBACK },
    );
  }
  throw new AppError(
    503,
    "ROUTING_UNAVAILABLE",
    "Não foi possível calcular a entrega automaticamente.",
    { ...WHATSAPP_FALLBACK },
  );
}
