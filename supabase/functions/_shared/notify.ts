// Devolutivas por e-mail: carrega o pedido, monta a mensagem, envia e registra
// o resultado em order_notifications (o painel mostra e permite reenviar).
// Falha no e-mail nunca desfaz o pedido.

import type { Db } from "./db.ts";
import type { EmailSender } from "./email.ts";
import {
  type CustomerEmailKind,
  type EmailKind,
  type OrderEmailData,
  type OrderStatus,
  renderCustomerEmail,
  renderStoreEmail,
  statusEmailKind,
} from "./emails.ts";
import { log } from "./http.ts";

export interface NotifyDeps {
  db: Db;
  sender: EmailSender | null;
  siteUrl: string;
}

export type NotifyStatus = "SENT" | "FAILED" | "SKIPPED";
export interface NotifyResult {
  kind: EmailKind | null;
  status: NotifyStatus;
  reason?: string;
}

interface OrderRow {
  id: string;
  code: string;
  public_token: string;
  status: OrderStatus;
  fulfillment_type: OrderEmailData["fulfillmentType"];
  payment_method: OrderEmailData["paymentMethod"];
  is_paid: boolean;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  address_street: string | null;
  address_number: string | null;
  address_district: string | null;
  address_complement: string | null;
  address_reference: string | null;
  scheduled_date: string;
  scheduled_period: OrderEmailData["scheduledPeriod"];
  subtotal_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  cash_change_for_cents: number | null;
  customer_notes: string | null;
}

interface SettingsRow {
  store_name: string;
  whatsapp_phone: string | null;
  notify_email: string | null;
  pickup_address: string;
  delivery_city: string;
  pix_key: string;
  pix_holder: string;
  email_customer_on_status: boolean;
}

interface Loaded {
  data: OrderEmailData;
  settings: SettingsRow;
  orderId: string;
}

async function load(db: Db, orderId: string, siteUrl: string): Promise<Loaded | null> {
  const [orders, items, settings] = await Promise.all([
    db.select<OrderRow>("orders", `select=*&id=eq.${orderId}`),
    db.select<{ product_name: string; quantity: number; unit_price_cents: number; line_total_cents: number }>(
      "order_items",
      `select=product_name,quantity,unit_price_cents,line_total_cents&order_id=eq.${orderId}&order=product_name.asc`,
    ),
    db.select<SettingsRow>("store_settings", "select=*&id=eq.true"),
  ]);
  const o = orders[0];
  const s = settings[0];
  if (!o || !s) return null;

  return {
    orderId,
    settings: s,
    data: {
      storeName: s.store_name,
      storeWhatsapp: s.whatsapp_phone,
      code: o.code,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      customerEmail: o.customer_email,
      status: o.status,
      fulfillmentType: o.fulfillment_type,
      address: o.fulfillment_type === "DELIVERY" && o.address_street
        ? {
          street: o.address_street,
          number: o.address_number ?? "",
          district: o.address_district ?? "",
          complement: o.address_complement,
          reference: o.address_reference,
        }
        : null,
      deliveryCity: s.delivery_city,
      pickupAddress: s.pickup_address || null,
      scheduledDate: o.scheduled_date,
      scheduledPeriod: o.scheduled_period,
      paymentMethod: o.payment_method,
      isPaid: o.is_paid,
      cashChangeForCents: o.cash_change_for_cents,
      items: items.map((i) => ({
        name: i.product_name,
        quantity: i.quantity,
        unitPriceCents: i.unit_price_cents,
        lineTotalCents: i.line_total_cents,
      })),
      subtotalCents: o.subtotal_cents,
      deliveryFeeCents: o.delivery_fee_cents,
      totalCents: o.total_cents,
      notes: o.customer_notes,
      pix: o.payment_method === "PIX" && s.pix_key ? { key: s.pix_key, holder: s.pix_holder || null } : null,
      orderUrl: `${siteUrl.replace(/\/$/, "")}/pedido/${o.public_token}`,
    },
  };
}

async function alreadySent(db: Db, orderId: string, kind: EmailKind): Promise<boolean> {
  const rows = await db.select<{ id: number }>(
    "order_notifications",
    `select=id&order_id=eq.${orderId}&kind=eq.${kind}&status=eq.SENT&limit=1`,
  );
  return rows.length > 0;
}

async function deliver(
  deps: NotifyDeps,
  orderId: string,
  kind: EmailKind,
  to: string,
  toName: string,
  content: { subject: string; html: string },
  fromName: string,
  replyTo: string | null,
): Promise<NotifyResult> {
  let result: NotifyResult;
  if (!deps.sender) {
    result = { kind, status: "SKIPPED", reason: "E-mail não configurado." };
  } else {
    const sent = await deps.sender.send({ to, toName, subject: content.subject, html: content.html, fromName, replyTo });
    result = sent.ok ? { kind, status: "SENT" } : { kind, status: "FAILED", reason: sent.error };
  }
  try {
    await deps.db.insert("order_notifications", {
      order_id: orderId,
      kind,
      channel: "EMAIL",
      recipient: to,
      status: result.status,
      error: result.reason?.slice(0, 300) ?? null,
    });
  } catch {
    // Registro é auxiliar; o envio já aconteceu (ou não) e isso não deve quebrar o fluxo.
  }
  log("notify.email", { kind, status: result.status });
  return result;
}

/** Pedido novo: confirmação ao cliente (se deixou e-mail) e aviso à loja. */
export async function notifyOrderCreated(deps: NotifyDeps, orderId: string): Promise<NotifyResult[]> {
  const loaded = await load(deps.db, orderId, deps.siteUrl);
  if (!loaded) return [];
  const { data, settings } = loaded;
  const jobs: Promise<NotifyResult>[] = [];

  if (data.customerEmail && !(await alreadySent(deps.db, orderId, "ORDER_RECEIVED"))) {
    jobs.push(deliver(deps, orderId, "ORDER_RECEIVED", data.customerEmail, data.customerName,
      renderCustomerEmail("ORDER_RECEIVED", data), data.storeName, settings.notify_email));
  }
  if (settings.notify_email && !(await alreadySent(deps.db, orderId, "STORE_NEW_ORDER"))) {
    jobs.push(deliver(deps, orderId, "STORE_NEW_ORDER", settings.notify_email, data.storeName,
      renderStoreEmail(data), `${data.storeName} · site`, data.customerEmail));
  }
  return Promise.all(jobs);
}

/**
 * E-mail ao cliente sobre o status atual (Confirmado, Saiu para entrega,
 * Pronto para retirada, Cancelado) ou reenvio da confirmação de recebimento.
 */
export async function notifyCustomer(
  deps: NotifyDeps,
  orderId: string,
  options: { kind: "STATUS" | "RECEIVED"; force: boolean },
): Promise<NotifyResult | null> {
  const loaded = await load(deps.db, orderId, deps.siteUrl);
  if (!loaded) return null;
  const { data, settings } = loaded;

  const kind: CustomerEmailKind | null = options.kind === "RECEIVED" ? "ORDER_RECEIVED" : statusEmailKind(data.status);
  if (!kind) return { kind: null, status: "SKIPPED", reason: "Este status não tem e-mail." };
  if (!data.customerEmail) return { kind, status: "SKIPPED", reason: "Cliente não informou e-mail." };
  if (options.kind === "STATUS" && !options.force && !settings.email_customer_on_status) {
    return { kind, status: "SKIPPED", reason: "Aviso por e-mail desligado nas configurações." };
  }
  if (!options.force && (await alreadySent(deps.db, orderId, kind))) {
    return { kind, status: "SKIPPED", reason: "E-mail já enviado." };
  }
  return deliver(deps, orderId, kind, data.customerEmail, data.customerName,
    renderCustomerEmail(kind, data), data.storeName, settings.notify_email);
}
