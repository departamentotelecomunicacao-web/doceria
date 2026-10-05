// POST /functions/v1/create-order
// Recebe só IDs de produtos, quantidades, contato, endereço, data e forma de
// pagamento. Preço, frete fixo, total e estoque são definidos no banco
// (public.create_order, atômica e idempotente). A comunicação com o cliente
// acontece pelo WhatsApp (mensagem pronta na página do pedido e no painel).

import { Db, dbConfigFromEnv } from "../_shared/db.ts";
import { AppError } from "../_shared/errors.ts";
import { clientIp, createHandler, jsonResponse, log, readJsonBody } from "../_shared/http.ts";
import { enforceRateLimit, requesterHash } from "../_shared/security.ts";
import { parseOrderRequest } from "../_shared/validation.ts";

const getEnv = (name: string) => Deno.env.get(name);
const db = new Db(dbConfigFromEnv(getEnv));
const rateLimit = Number(getEnv("ORDER_RATE_LIMIT_PER_10_MIN") ?? "") || 12;

interface OrderSummary {
  orderId: string;
  code: string;
  publicToken: string;
  status: string;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  replayed: boolean;
}

Deno.serve(createHandler(getEnv, "create-order", async (req, cors) => {
  const parsed = parseOrderRequest(await readJsonBody(req, 16_384));
  if (!parsed.ok) {
    throw new AppError(400, "INVALID_PAYLOAD", "Confira os dados do pedido.", { fields: parsed.errors });
  }

  const requester = await requesterHash(clientIp(req), getEnv("RATE_LIMIT_SALT"));
  await enforceRateLimit(db, { scope: "order", limit: rateLimit, windowSeconds: 600 }, requester);

  const summary = await db.rpc<OrderSummary>("create_order", { p_payload: parsed.value });

  log("create-order.created", {
    code: summary.code,
    replayed: summary.replayed,
    fulfillment: parsed.value.fulfillment.type,
    method: parsed.value.paymentMethod,
    totalCents: summary.totalCents,
  });

  return jsonResponse(
    {
      order: {
        orderId: summary.orderId,
        code: summary.code,
        publicToken: summary.publicToken,
        totalCents: summary.totalCents,
        replayed: summary.replayed,
      },
    },
    summary.replayed ? 200 : 201,
    cors,
  );
}));
