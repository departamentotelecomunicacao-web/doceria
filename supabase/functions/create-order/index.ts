// POST /functions/v1/create-order
// Recebe somente IDs de produtos, quantidades, dados do cliente e endereço.
// Preço, subtotal, frete, total e estoque são definidos no banco (função
// atômica public.create_order). Idempotente por idempotencyKey.

import { Db, dbConfigFromEnv } from "../_shared/db.ts";
import { resolveRouteQuote } from "../_shared/delivery.ts";
import { AppError } from "../_shared/errors.ts";
import { clientIp, createHandler, jsonResponse, log, readJsonBody } from "../_shared/http.ts";
import { getPaymentProvider } from "../_shared/payments.ts";
import { createRoutingProvider } from "../_shared/routing/index.ts";
import { enforceRateLimit, requesterHash, routingBudgetGuard } from "../_shared/security.ts";
import { parseOrderRequest } from "../_shared/validation.ts";

const getEnv = (name: string) => Deno.env.get(name);
const db = new Db(dbConfigFromEnv(getEnv));
const routing = createRoutingProvider(getEnv);
const cacheTtlHours = Number(getEnv("ROUTE_CACHE_TTL_HOURS") ?? "") || 168;
const routingBudget = routingBudgetGuard(db, Number(getEnv("ROUTING_MAX_CALLS_PER_HOUR") ?? "") || 300);
const rateLimit = Number(getEnv("ORDER_RATE_LIMIT_PER_10_MIN") ?? "") || 12;

interface OrderSummary {
  orderId: string;
  code: string;
  publicToken: string;
  status: string;
  paymentStatus: string;
  paymentMethod: "PIX" | "CASH" | "CARD";
  fulfillmentType: string;
  totalCents: number;
  replayed: boolean;
}

Deno.serve(createHandler(getEnv, "create-order", async (req, cors) => {
  const parsed = parseOrderRequest(await readJsonBody(req, 16_384));
  if (!parsed.ok) {
    throw new AppError(400, "INVALID_PAYLOAD", "Confira os dados do pedido.", { fields: parsed.errors });
  }
  const order = parsed.value;

  const requester = await requesterHash(clientIp(req), getEnv("RATE_LIMIT_SALT"));
  await enforceRateLimit(db, { scope: "order", limit: rateLimit, windowSeconds: 600 }, requester);

  // Entrega: a distância é sempre obtida/validada no servidor. Nada que o
  // navegador envie sobre distância ou frete é considerado.
  let quoteId: string | null = null;
  if (order.fulfillment.type === "DELIVERY" && order.fulfillment.address) {
    const quote = await resolveRouteQuote({
      db,
      routing,
      address: order.fulfillment.address,
      requesterHash: requester,
      cacheTtlHours,
      beforeProviderCall: routingBudget,
      onProviderResult: (result, ms) =>
        log("create-order.provider", {
          provider: result.provider,
          ok: result.ok,
          reason: result.ok ? undefined : result.reason,
          ms,
        }),
    });
    quoteId = quote.quoteId;
  }

  const summary = await db.rpc<OrderSummary>("create_order", {
    p_payload: order,
    p_quote_id: quoteId,
  });

  const payment = await getPaymentProvider(summary.paymentMethod).initiate({
    orderId: summary.orderId,
    code: summary.code,
    totalCents: summary.totalCents,
    paymentMethod: summary.paymentMethod,
  });

  log("create-order.created", {
    code: summary.code,
    replayed: summary.replayed,
    fulfillment: summary.fulfillmentType,
    method: summary.paymentMethod,
    totalCents: summary.totalCents,
  });

  return jsonResponse({ order: summary, payment }, summary.replayed ? 200 : 201, cors);
}));
