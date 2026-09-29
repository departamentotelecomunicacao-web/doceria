// POST /functions/v1/delivery-quote
// Calcula o frete de um endereço: rota real (provedor de mapas, com cache) +
// regras de preço do banco. Chave do Google existe somente aqui no backend.

import { Db, dbConfigFromEnv } from "../_shared/db.ts";
import { resolveRouteQuote } from "../_shared/delivery.ts";
import { AppError } from "../_shared/errors.ts";
import { clientIp, createHandler, jsonResponse, log, readJsonBody } from "../_shared/http.ts";
import { createRoutingProvider } from "../_shared/routing/index.ts";
import { enforceRateLimit, requesterHash, routingBudgetGuard } from "../_shared/security.ts";
import { parseQuoteRequest } from "../_shared/validation.ts";

const getEnv = (name: string) => Deno.env.get(name);
const db = new Db(dbConfigFromEnv(getEnv));
const routing = createRoutingProvider(getEnv);
const cacheTtlHours = Number(getEnv("ROUTE_CACHE_TTL_HOURS") ?? "") || 168;
const routingBudget = routingBudgetGuard(db, Number(getEnv("ROUTING_MAX_CALLS_PER_HOUR") ?? "") || 300);
const rateLimit = Number(getEnv("QUOTE_RATE_LIMIT_PER_10_MIN") ?? "") || 30;

interface FeeResult {
  available: boolean;
  reason?: string;
  feeCents?: number;
  baseFeeCents?: number;
  freeDeliveryApplied?: boolean;
  freeDeliveryMinSubtotalCents?: number | null;
  maxDistanceMeters?: number;
}

Deno.serve(createHandler(getEnv, "delivery-quote", async (req, cors) => {
  const parsed = parseQuoteRequest(await readJsonBody(req, 4096));
  if (!parsed.ok) {
    throw new AppError(400, "INVALID_ADDRESS", "Confira os campos do endereço.", { fields: parsed.errors });
  }

  const requester = await requesterHash(clientIp(req), getEnv("RATE_LIMIT_SALT"));
  await enforceRateLimit(db, { scope: "quote", limit: rateLimit, windowSeconds: 600 }, requester);

  const config = await db.rpc<{ deliveryEnabled: boolean }>("get_public_store_config");
  if (!config.deliveryEnabled) {
    throw new AppError(409, "DELIVERY_UNAVAILABLE", "Entrega indisponível no momento.", {
      reason: "DELIVERY_DISABLED",
    });
  }

  const quote = await resolveRouteQuote({
    db,
    routing,
    address: parsed.value.address,
    requesterHash: requester,
    cacheTtlHours,
    beforeProviderCall: routingBudget,
    onProviderResult: (result, ms) =>
      log("delivery-quote.provider", {
        provider: result.provider,
        ok: result.ok,
        reason: result.ok ? undefined : result.reason,
        detail: result.ok ? undefined : result.detail,
        ms,
      }),
  });

  const fee = await db.rpc<FeeResult>("compute_delivery_fee", {
    p_distance_m: quote.distanceMeters,
    p_subtotal_cents: parsed.value.subtotalCents,
  });

  if (!quote.cached) {
    await db.update("delivery_quotes", `id=eq.${quote.quoteId}`, {
      fee_cents: fee.available ? fee.feeCents : null,
      available: fee.available,
      unavailable_reason: fee.available ? null : fee.reason ?? null,
    }).catch(() => undefined);
  }

  log("delivery-quote.result", {
    city: quote.normalized.city,
    cached: quote.cached,
    distanceMeters: quote.distanceMeters,
    available: fee.available,
  });

  return jsonResponse({
    available: fee.available,
    reason: fee.available ? null : fee.reason ?? "OUT_OF_AREA",
    distanceMeters: quote.distanceMeters,
    distanceKm: Math.round(quote.distanceMeters / 100) / 10,
    durationMinutes: quote.durationSeconds === null ? null : Math.max(1, Math.round(quote.durationSeconds / 60)),
    feeCents: fee.available ? fee.feeCents : null,
    baseFeeCents: fee.available ? fee.baseFeeCents : null,
    freeDeliveryApplied: fee.freeDeliveryApplied ?? false,
    freeDeliveryMinSubtotalCents: fee.freeDeliveryMinSubtotalCents ?? null,
    maxDistanceMeters: fee.maxDistanceMeters ?? null,
    expiresAt: quote.expiresAt,
  }, 200, cors);
}));
