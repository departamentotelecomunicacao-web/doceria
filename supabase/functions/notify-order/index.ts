// POST /functions/v1/notify-order   (equipe logada)
// Envia ao cliente o e-mail do status atual do pedido, ou reenvia a
// confirmação de recebimento. Chamado pelo painel depois de mudar o status.
// Corpo: { orderId, kind: "STATUS" | "RECEIVED", force?: boolean }

import { requireStaff } from "../_shared/auth.ts";
import { Db, dbConfigFromEnv } from "../_shared/db.ts";
import { emailSenderFromEnv } from "../_shared/email.ts";
import { AppError } from "../_shared/errors.ts";
import { createHandler, jsonResponse, parseAllowedOrigins, readJsonBody } from "../_shared/http.ts";
import { notifyCustomer } from "../_shared/notify.ts";
import { isUuid } from "../_shared/validation.ts";

const getEnv = (name: string) => Deno.env.get(name);
const db = new Db(dbConfigFromEnv(getEnv));
const sender = emailSenderFromEnv(getEnv);
const siteUrl = getEnv("SITE_URL") || parseAllowedOrigins(getEnv("ALLOWED_ORIGINS"))[0] || "";

Deno.serve(createHandler(getEnv, "notify-order", async (req, cors) => {
  await requireStaff(db, req);
  const body = (await readJsonBody(req, 2048)) as Record<string, unknown>;

  const allowedKeys = ["orderId", "kind", "force"];
  if (!body || typeof body !== "object" || Object.keys(body).some((k) => !allowedKeys.includes(k))) {
    throw new AppError(400, "INVALID_PAYLOAD", "Dados inválidos.");
  }
  if (!isUuid(body.orderId)) throw new AppError(400, "INVALID_ORDER", "Pedido inválido.");
  if (body.kind !== "STATUS" && body.kind !== "RECEIVED") throw new AppError(400, "INVALID_KIND", "Tipo de aviso inválido.");
  if (body.force !== undefined && typeof body.force !== "boolean") throw new AppError(400, "INVALID_PAYLOAD", "Dados inválidos.");

  const result = await notifyCustomer({ db, sender, siteUrl }, body.orderId, {
    kind: body.kind,
    force: body.force === true,
  });
  if (!result) throw new AppError(404, "ORDER_NOT_FOUND", "Pedido não encontrado.");

  return jsonResponse(result, 200, cors);
}));
