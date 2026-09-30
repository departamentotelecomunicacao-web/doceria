// POST /functions/v1/create-order
// Recebe só IDs de produtos, quantidades, contato, endereço, data e forma de
// pagamento. Preço, frete fixo, total e estoque são definidos no banco
// (public.create_order, atômica e idempotente). Depois envia a devolutiva por
// e-mail ao cliente e o aviso de pedido novo à loja.

import { Db, dbConfigFromEnv } from "../_shared/db.ts";
import { emailSenderFromEnv } from "../_shared/email.ts";
import { AppError } from "../_shared/errors.ts";
import { clientIp, createHandler, jsonResponse, log, parseAllowedOrigins, readJsonBody } from "../_shared/http.ts";
import { notifyOrderCreated } from "../_shared/notify.ts";
import { enforceRateLimit, requesterHash } from "../_shared/security.ts";
import { parseOrderRequest } from "../_shared/validation.ts";

const getEnv = (name: string) => Deno.env.get(name);
const db = new Db(dbConfigFromEnv(getEnv));
const sender = emailSenderFromEnv(getEnv);
const siteUrl = getEnv("SITE_URL") || parseAllowedOrigins(getEnv("ALLOWED_ORIGINS"))[0] || "";
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

  // A devolutiva sai uma vez só (reenvios do mesmo pedido não repetem o e-mail).
  let emailSent = false;
  try {
    const results = await notifyOrderCreated({ db, sender, siteUrl }, summary.orderId);
    emailSent = results.some((r) => r.kind === "ORDER_RECEIVED" && r.status === "SENT");
  } catch (error) {
    log("create-order.notify_error", { code: summary.code, error: String(error).slice(0, 200) });
  }

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
      emailSent,
    },
    summary.replayed ? 200 : 201,
    cors,
  );
}));
