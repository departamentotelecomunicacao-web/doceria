import type { FulfillmentType, OrderStatus, PaymentMethod, PaymentStatus, StockStatus } from "@/types/domain";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "Novo",
  AWAITING_PAYMENT: "Aguardando pagamento",
  CONFIRMED: "Confirmado",
  PREPARING: "Em preparo",
  READY: "Pronto",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
  EXPIRED: "Expirado",
};

/** Texto para o cliente na página do pedido. */
export const ORDER_STATUS_CUSTOMER: Record<OrderStatus, string> = {
  NEW: "Recebemos seu pedido e vamos confirmar em breve.",
  AWAITING_PAYMENT: "Aguardando o pagamento via PIX para confirmar.",
  CONFIRMED: "Pedido confirmado! Já está na nossa fila.",
  PREPARING: "Seus cookies estão sendo preparados.",
  READY: "Seu pedido está pronto.",
  OUT_FOR_DELIVERY: "Seu pedido saiu para entrega.",
  COMPLETED: "Pedido entregue. Bom apetite!",
  CANCELED: "Este pedido foi cancelado.",
  EXPIRED: "O prazo deste pedido expirou e ele não foi concluído.",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Pendente",
  MANUAL_CONFIRMATION: "Em conferência",
  PAID: "Pago",
  FAILED: "Falhou",
  REFUNDED: "Reembolsado",
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

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  AVAILABLE: "Disponível",
  LOW: "Baixo",
  SOLD_OUT: "Esgotado",
};

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  NEW: "accent",
  AWAITING_PAYMENT: "warning",
  CONFIRMED: "info",
  PREPARING: "info",
  READY: "success",
  OUT_FOR_DELIVERY: "info",
  COMPLETED: "neutral",
  CANCELED: "danger",
  EXPIRED: "danger",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, Tone> = {
  PENDING: "warning",
  MANUAL_CONFIRMATION: "info",
  PAID: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
};

export function stockStatusOf(product: { stock_available: number; low_stock_threshold: number }): StockStatus {
  if (product.stock_available <= 0) return "SOLD_OUT";
  if (product.stock_available <= product.low_stock_threshold) return "LOW";
  return "AVAILABLE";
}
