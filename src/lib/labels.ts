import type { DayPeriod, FulfillmentType, OrderStatus, PaymentMethod } from "@/types/domain";

export function orderStatusLabel(status: OrderStatus, type?: FulfillmentType): string {
  if (status === "DELIVERED") return type === "PICKUP" ? "Retirado" : "Entregue";
  return ORDER_STATUS_LABEL[status];
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  RECEIVED: "Recebido",
  CONFIRMED: "Confirmado",
  PREPARING: "Em preparo",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  READY_FOR_PICKUP: "Pronto para retirada",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
};

/** Texto para o cliente na página do pedido. */
export const ORDER_STATUS_CUSTOMER: Record<OrderStatus, string> = {
  RECEIVED: "Recebemos seu pedido e vamos confirmar em breve.",
  CONFIRMED: "Pedido confirmado! Já está na nossa agenda.",
  PREPARING: "Seus cookies estão sendo preparados.",
  OUT_FOR_DELIVERY: "Seu pedido saiu para entrega.",
  READY_FOR_PICKUP: "Seu pedido está pronto para retirada.",
  DELIVERED: "Pedido concluído. Bom apetite!",
  CANCELED: "Este pedido foi cancelado.",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: "PIX",
  CASH: "Dinheiro",
  CARD: "Cartão na entrega/retirada",
};

export const FULFILLMENT_LABEL: Record<FulfillmentType, string> = {
  PICKUP: "Retirada",
  DELIVERY: "Entrega",
};

export const PERIOD_LABEL: Record<DayPeriod, string> = {
  MORNING: "Manhã",
  AFTERNOON: "Tarde",
  EVENING: "Noite",
};

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  RECEIVED: "accent",
  CONFIRMED: "info",
  PREPARING: "info",
  OUT_FOR_DELIVERY: "info",
  READY_FOR_PICKUP: "success",
  DELIVERED: "neutral",
  CANCELED: "danger",
};

/** Próximos status possíveis (espelha public.order_next_statuses). */
export function nextStatuses(status: OrderStatus, type: FulfillmentType): OrderStatus[] {
  const ready: OrderStatus = type === "DELIVERY" ? "OUT_FOR_DELIVERY" : "READY_FOR_PICKUP";
  switch (status) {
    case "RECEIVED": return ["CONFIRMED", "CANCELED"];
    case "CONFIRMED": return ["PREPARING", ready, "CANCELED"];
    case "PREPARING": return [ready, "CANCELED"];
    case "OUT_FOR_DELIVERY":
    case "READY_FOR_PICKUP": return ["DELIVERED", "CANCELED"];
    default: return [];
  }
}

/** Status que ainda pedem ação da equipe. */
export const OPEN_STATUSES: OrderStatus[] = ["RECEIVED", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"];

export function isSoldOut(product: { stock: number | null }): boolean {
  return product.stock !== null && product.stock <= 0;
}
