import type { DayPeriod, FulfillmentType, OrderStatus, PaymentMethod } from "@/types/domain";
import { formatScheduleLong } from "./datetime";
import { PAYMENT_METHOD_LABEL } from "./labels";
import { formatBRL } from "./money";

export interface WhatsAppOrderData {
  code: string;
  customerName: string;
  items: { name: string; quantity: number; lineTotalCents: number }[];
  deliveryFeeCents: number;
  totalCents: number;
  fulfillmentType: FulfillmentType;
  district?: string | null;
  scheduledDate: string;
  scheduledPeriod: DayPeriod;
  paymentMethod: PaymentMethod;
  orderUrl?: string | null;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Mensagem que o cliente envia à loja depois de finalizar no site. */
export function buildCustomerOrderMessage(order: WhatsAppOrderData): string {
  const lines: string[] = [`Olá! Acabei de fazer o pedido #${order.code} pelo site.`, ""];
  for (const item of order.items) {
    lines.push(`${item.quantity}x ${item.name} — ${formatBRL(item.lineTotalCents)}`);
  }
  if (order.fulfillmentType === "DELIVERY") lines.push(`Entrega: ${formatBRL(order.deliveryFeeCents)}`);
  lines.push(`Total: ${formatBRL(order.totalCents)}`, "");
  lines.push(order.fulfillmentType === "DELIVERY" ? `Entrega${order.district ? ` em ${order.district}` : ""}` : "Retirada");
  lines.push(formatScheduleLong(order.scheduledDate, order.scheduledPeriod));
  lines.push(`Pagamento: ${PAYMENT_METHOD_LABEL[order.paymentMethod]}`);
  if (order.paymentMethod === "PIX") lines.push("", "Vou enviar o comprovante do PIX por aqui.");
  return lines.join("\n");
}

/** Mensagem pronta que a equipe envia ao cliente, conforme o status. */
export function buildStatusMessage(status: OrderStatus, order: WhatsAppOrderData): string {
  const name = firstName(order.customerName);
  const code = `#${order.code}`;
  const when = formatScheduleLong(order.scheduledDate, order.scheduledPeriod);
  const link = order.orderUrl ? `\n\nAcompanhe: ${order.orderUrl}` : "";
  switch (status) {
    case "RECEIVED":
      return `Olá, ${name}! Recebemos seu pedido ${code} (${formatBRL(order.totalCents)}). Já vamos confirmar.${link}`;
    case "CONFIRMED":
      return `Olá, ${name}! Seu pedido ${code} está confirmado para ${when}. Total: ${formatBRL(order.totalCents)}.${link}`;
    case "PREPARING":
      return `Olá, ${name}! Seu pedido ${code} já está sendo preparado.${link}`;
    case "OUT_FOR_DELIVERY":
      return `Olá, ${name}! Seu pedido ${code} saiu para entrega e chega em breve.${link}`;
    case "READY_FOR_PICKUP":
      return `Olá, ${name}! Seu pedido ${code} está pronto para retirada.${link}`;
    case "DELIVERED":
      return `Olá, ${name}! Obrigado pelo pedido ${code}. Esperamos que goste! Se puder, conta pra gente o que achou.`;
    case "CANCELED":
      return `Olá, ${name}. Seu pedido ${code} foi cancelado. Qualquer dúvida, é só responder esta mensagem.`;
  }
}

/** Link wa.me. Aceita +55DDDNÚMERO ou só dígitos com o 55. */
export function whatsappLink(phone: string | null | undefined, message?: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 12) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}

export function formatAddressLine(address: {
  street: string | null;
  number: string | null;
  district: string | null;
  complement?: string | null;
  reference?: string | null;
}): string {
  const complement = address.complement ? `, ${address.complement}` : "";
  const reference = address.reference ? ` (Ref.: ${address.reference})` : "";
  return `${address.street ?? ""}, ${address.number ?? ""}${complement} - ${address.district ?? ""}${reference}`;
}
