// Conteúdo dos e-mails de devolutiva (cliente) e de aviso de pedido novo
// (loja). Funções puras: testadas com Vitest e usadas pelas Edge Functions.

import { formatBrazilPhone } from "./validation.ts";
import type { DayPeriod, FulfillmentType, PaymentMethod } from "./validation.ts";

export type OrderStatus =
  | "RECEIVED" | "CONFIRMED" | "PREPARING" | "OUT_FOR_DELIVERY" | "READY_FOR_PICKUP" | "DELIVERED" | "CANCELED";

export type CustomerEmailKind =
  | "ORDER_RECEIVED" | "ORDER_CONFIRMED" | "ORDER_OUT_FOR_DELIVERY" | "ORDER_READY_FOR_PICKUP" | "ORDER_CANCELED";
export type EmailKind = CustomerEmailKind | "STORE_NEW_ORDER";

export interface OrderEmailData {
  storeName: string;
  storeWhatsapp: string | null;
  code: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  address: {
    street: string;
    number: string;
    district: string;
    complement: string | null;
    reference: string | null;
  } | null;
  deliveryCity: string;
  pickupAddress: string | null;
  scheduledDate: string;
  scheduledPeriod: DayPeriod;
  paymentMethod: PaymentMethod;
  isPaid: boolean;
  cashChangeForCents: number | null;
  items: Array<{ name: string; quantity: number; unitPriceCents: number; lineTotalCents: number }>;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  notes: string | null;
  pix: { key: string; holder: string | null } | null;
  orderUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

/** Status que geram e-mail ao cliente (Entregue não gera, para poupar a cota). */
export function statusEmailKind(status: OrderStatus): CustomerEmailKind | null {
  switch (status) {
    case "CONFIRMED": return "ORDER_CONFIRMED";
    case "OUT_FOR_DELIVERY": return "ORDER_OUT_FOR_DELIVERY";
    case "READY_FOR_PICKUP": return "ORDER_READY_FOR_PICKUP";
    case "CANCELED": return "ORDER_CANCELED";
    default: return null;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function brl(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centavos = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}R$ ${reais},${centavos}`;
}

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const PERIOD_LABEL: Record<DayPeriod, string> = { MORNING: "manhã", AFTERNOON: "tarde", EVENING: "noite" };
const PAYMENT_LABEL: Record<PaymentMethod, string> = { PIX: "PIX", CASH: "Dinheiro", CARD: "Cartão na entrega/retirada" };

export function formatSchedule(date: string, period: DayPeriod): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}, período da ${PERIOD_LABEL[period]}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function whatsappLink(phone: string | null, text: string): string | null {
  if (!phone) return null;
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------------------
// Blocos de HTML (estilos inline: clientes de e-mail ignoram <style>)
// ---------------------------------------------------------------------------
const C = { ink: "#3b2418", muted: "#7a6352", line: "#eadfce", bg: "#fbf6ee", accent: "#b7742f" };

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${C.ink};color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px;margin:4px 8px 4px 0">${escapeHtml(label)}</a>`;
}

function itemsTable(data: OrderEmailData): string {
  const rows = data.items.map((item) =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid ${C.line}">${item.quantity}x ${escapeHtml(item.name)}</td>` +
    `<td style="padding:6px 0;border-bottom:1px solid ${C.line};text-align:right;white-space:nowrap">${brl(item.lineTotalCents)}</td></tr>`
  ).join("");
  const fee = data.fulfillmentType === "DELIVERY"
    ? `<tr><td style="padding:4px 0;color:${C.muted}">Entrega</td><td style="padding:4px 0;text-align:right;color:${C.muted}">${brl(data.deliveryFeeCents)}</td></tr>`
    : `<tr><td style="padding:4px 0;color:${C.muted}">Retirada</td><td style="padding:4px 0;text-align:right;color:${C.muted}">grátis</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px">${rows}` +
    `<tr><td style="padding:8px 0 4px;color:${C.muted}">Subtotal</td><td style="padding:8px 0 4px;text-align:right;color:${C.muted}">${brl(data.subtotalCents)}</td></tr>` +
    fee +
    `<tr><td style="padding:8px 0;font-weight:bold;font-size:17px">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold;font-size:17px">${brl(data.totalCents)}</td></tr></table>`;
}

function fulfillmentBlock(data: OrderEmailData, full: boolean): string {
  const when = escapeHtml(formatSchedule(data.scheduledDate, data.scheduledPeriod));
  if (data.fulfillmentType === "PICKUP") {
    const where = data.pickupAddress ? `<br>Local: ${escapeHtml(data.pickupAddress)}` : "";
    return `<p style="margin:0 0 4px"><strong>Retirada</strong>: ${when}${where}</p>`;
  }
  const a = data.address;
  const line = a
    ? full
      ? `${escapeHtml(a.street)}, ${escapeHtml(a.number)}${a.complement ? `, ${escapeHtml(a.complement)}` : ""} - ${escapeHtml(a.district)}, ${escapeHtml(data.deliveryCity)}` +
        (a.reference ? `<br>Referência: ${escapeHtml(a.reference)}` : "")
      : `${escapeHtml(a.street)}, ${escapeHtml(a.number)} - ${escapeHtml(a.district)}`
    : "";
  return `<p style="margin:0 0 4px"><strong>Entrega</strong>: ${when}<br>${line}</p>`;
}

function paymentBlock(data: OrderEmailData): string {
  let extra = "";
  if (data.paymentMethod === "CASH" && data.cashChangeForCents) extra = ` (troco para ${brl(data.cashChangeForCents)})`;
  const paid = data.isPaid ? " · pago" : "";
  let pix = "";
  if (data.pix && !data.isPaid && data.status !== "CANCELED") {
    pix = `<div style="margin:12px 0;padding:12px 14px;background:#fff;border:1px dashed ${C.accent};border-radius:12px">` +
      `<strong>Pague com PIX</strong><br>Chave: <span style="font-family:monospace;font-size:15px">${escapeHtml(data.pix.key)}</span>` +
      (data.pix.holder ? `<br>Favorecido: ${escapeHtml(data.pix.holder)}` : "") +
      `<br><span style="color:${C.muted}">Valor: ${brl(data.totalCents)}. Envie o comprovante pelo WhatsApp.</span></div>`;
  }
  return `<p style="margin:0 0 4px"><strong>Pagamento</strong>: ${PAYMENT_LABEL[data.paymentMethod]}${extra}${paid}</p>${pix}`;
}

function layout(data: OrderEmailData, heading: string, intro: string, body: string): string {
  return `<div style="background:${C.bg};padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:${C.ink}">` +
    `<div style="max-width:560px;margin:0 auto;background:${C.bg}">` +
    `<p style="margin:0 0 16px;font-size:14px;letter-spacing:2px;text-transform:uppercase;color:${C.accent};font-weight:bold">${escapeHtml(data.storeName)}</p>` +
    `<h1 style="margin:0 0 8px;font-size:24px;line-height:1.25">${escapeHtml(heading)}</h1>` +
    `<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:${C.muted}">${intro}</p>` +
    `<div style="background:#fff;border:1px solid ${C.line};border-radius:16px;padding:18px 20px;font-size:15px;line-height:1.5">${body}</div>` +
    `<p style="margin:20px 0 0;font-size:12px;color:${C.muted}">Pedido #${escapeHtml(data.code)} · ${escapeHtml(data.storeName)}. Este é um e-mail automático.</p>` +
    `</div></div>`;
}

// ---------------------------------------------------------------------------
// E-mails
// ---------------------------------------------------------------------------
export function renderCustomerEmail(kind: CustomerEmailKind, data: OrderEmailData): RenderedEmail {
  const name = escapeHtml(firstName(data.customerName));
  const code = data.code;
  const wa = whatsappLink(data.storeWhatsapp, `Olá! Sobre o pedido #${code}.`);
  const actions = button(data.orderUrl, "Acompanhar pedido") + (wa ? button(wa, "Falar no WhatsApp") : "");
  const summary = `${itemsTable(data)}<div style="height:12px"></div>${fulfillmentBlock(data, true)}${paymentBlock(data)}` +
    `<div style="margin-top:16px">${actions}</div>`;

  switch (kind) {
    case "ORDER_RECEIVED":
      return {
        subject: `Recebemos seu pedido #${code}`,
        html: layout(data, "Pedido recebido!", `Oi, ${name}! Seu pedido chegou para a gente. Vamos conferir e confirmar em breve.`, summary),
      };
    case "ORDER_CONFIRMED":
      return {
        subject: `Pedido #${code} confirmado`,
        html: layout(data, "Pedido confirmado", `Oi, ${name}! Seu pedido foi confirmado e já está na nossa agenda.`, summary),
      };
    case "ORDER_OUT_FOR_DELIVERY":
      return {
        subject: `Pedido #${code} saiu para entrega`,
        html: layout(data, "Saiu para entrega", `Oi, ${name}! Seu pedido está a caminho.`, summary),
      };
    case "ORDER_READY_FOR_PICKUP":
      return {
        subject: `Pedido #${code} pronto para retirada`,
        html: layout(data, "Pronto para retirada", `Oi, ${name}! Seu pedido está pronto esperando por você.`, summary),
      };
    case "ORDER_CANCELED":
      return {
        subject: `Pedido #${code} cancelado`,
        html: layout(data, "Pedido cancelado", `Oi, ${name}. Seu pedido foi cancelado. Se tiver dúvidas, fale com a gente pelo WhatsApp.`,
          `${itemsTable(data)}<div style="margin-top:16px">${wa ? button(wa, "Falar no WhatsApp") : ""}</div>`),
      };
  }
}

export function renderStoreEmail(data: OrderEmailData): RenderedEmail {
  const phone = formatBrazilPhone(data.customerPhone);
  const waCustomer = whatsappLink(data.customerPhone, `Olá, ${firstName(data.customerName)}! Recebemos seu pedido #${data.code}.`);
  const body =
    `<p style="margin:0 0 4px"><strong>${escapeHtml(data.customerName)}</strong><br>WhatsApp: ${escapeHtml(phone)}` +
    (data.customerEmail ? `<br>E-mail: ${escapeHtml(data.customerEmail)}` : "") + `</p><div style="height:8px"></div>` +
    itemsTable(data) + `<div style="height:12px"></div>` + fulfillmentBlock(data, true) + paymentBlock({ ...data, pix: null }) +
    (data.notes ? `<p style="margin:8px 0 0"><strong>Observação</strong>: ${escapeHtml(data.notes)}</p>` : "") +
    `<div style="margin-top:16px">${waCustomer ? button(waCustomer, "Chamar cliente no WhatsApp") : ""}</div>`;
  const where = data.fulfillmentType === "DELIVERY" ? `entrega em ${data.address?.district ?? ""}` : "retirada";
  return {
    subject: `Novo pedido #${data.code} · ${brl(data.totalCents)} · ${where}`,
    html: layout(data, `Novo pedido #${data.code}`, "Um pedido acabou de chegar pelo site. Confirme no painel.", body),
  };
}
