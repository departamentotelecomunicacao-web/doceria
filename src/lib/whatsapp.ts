import { formatBRL } from "./money";

export interface WhatsAppOrderData {
  code: string;
  items: { name: string; quantity: number; lineTotalCents: number }[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  fulfillmentType: "PICKUP" | "DELIVERY";
  addressLine?: string | null;
  scheduleLabel?: string | null;
  paymentLabel?: string | null;
}

/** Mensagem do pedido no formato combinado com a loja. */
export function buildOrderMessage(order: WhatsAppOrderData): string {
  const lines: string[] = [`Olá! Gostaria de fazer o pedido #${order.code}.`, ""];
  for (const item of order.items) {
    lines.push(`${item.quantity}x ${item.name} — ${formatBRL(item.lineTotalCents)}`);
  }
  lines.push("", `Subtotal: ${formatBRL(order.subtotalCents)}`);
  if (order.fulfillmentType === "DELIVERY") {
    lines.push(`Entrega: ${order.deliveryFeeCents === 0 ? "grátis" : formatBRL(order.deliveryFeeCents)}`);
  }
  lines.push("", `Total: ${formatBRL(order.totalCents)}`);
  if (order.paymentLabel) lines.push(`Pagamento: ${order.paymentLabel}`);
  lines.push("");
  if (order.fulfillmentType === "DELIVERY") {
    lines.push("Entrega:", order.addressLine ?? "");
  } else {
    lines.push("Retirada na loja");
  }
  if (order.scheduleLabel) lines.push(`Horário: ${order.scheduleLabel}`);
  return lines.join("\n").trim();
}

/** Mensagem de contato quando o cálculo automático de entrega falha. */
export function buildDeliveryHelpMessage(input: {
  items: { name: string; quantity: number }[];
  addressLine: string;
}): string {
  const lines = ["Olá! Quero fazer um pedido com entrega, mas o site não conseguiu calcular o frete.", ""];
  for (const item of input.items) lines.push(`${item.quantity}x ${item.name}`);
  lines.push("", "Endereço:", input.addressLine);
  return lines.join("\n");
}

export function whatsappLink(phoneDigits: string | null | undefined, message?: string): string | null {
  const digits = (phoneDigits ?? "").replace(/\D/g, "");
  if (digits.length < 12) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}

export function formatAddressLine(address: {
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string | null;
}): string {
  const complement = address.complement ? `, ${address.complement}` : "";
  const reference = address.reference ? ` (Ref.: ${address.reference})` : "";
  return `${address.street}, ${address.number}${complement} - ${address.neighborhood}, ${address.city}/${address.state}${reference}`;
}
