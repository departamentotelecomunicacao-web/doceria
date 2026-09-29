// Arquitetura de pagamentos. O MVP usa o provedor MANUAL (PIX com chave,
// dinheiro e cartão na entrega/retirada). Um gateway futuro (Mercado Pago,
// Stripe etc.) implementa PaymentProvider e confirma pagamentos SOMENTE via
// webhook assinado ou consulta ao gateway: nunca porque o navegador informou.

import type { PaymentMethod } from "./validation.ts";

export interface PaymentOrderRef {
  orderId: string;
  code: string;
  totalCents: number;
  paymentMethod: PaymentMethod;
}

export interface PaymentInitiation {
  provider: string;
  /** MANUAL: instruções; REDIRECT/QR_CODE: reservado para gateways. */
  kind: "MANUAL" | "REDIRECT" | "QR_CODE";
  instructions: string;
  checkoutUrl?: string;
}

export interface PaymentProvider {
  readonly id: string;
  supports(method: PaymentMethod): boolean;
  initiate(order: PaymentOrderRef): Promise<PaymentInitiation>;
}

export class ManualPaymentProvider implements PaymentProvider {
  readonly id = "MANUAL";

  supports(method: PaymentMethod): boolean {
    return method === "PIX" || method === "CASH" || method === "CARD";
  }

  initiate(order: PaymentOrderRef): Promise<PaymentInitiation> {
    const instructions: Record<PaymentMethod, string> = {
      PIX: "Faça o PIX com a chave exibida na página do pedido e envie o comprovante pelo WhatsApp. O pedido é confirmado após a conferência.",
      CASH: "Pagamento em dinheiro no momento da entrega ou retirada.",
      CARD: "Pagamento com cartão (maquininha) no momento da entrega ou retirada.",
    };
    return Promise.resolve({
      provider: this.id,
      kind: "MANUAL",
      instructions: instructions[order.paymentMethod],
    });
  }
}

const providers: PaymentProvider[] = [new ManualPaymentProvider()];

export function getPaymentProvider(method: PaymentMethod): PaymentProvider {
  const provider = providers.find((candidate) => candidate.supports(method));
  if (!provider) throw new Error(`Nenhum provedor de pagamento para ${method}`);
  return provider;
}
