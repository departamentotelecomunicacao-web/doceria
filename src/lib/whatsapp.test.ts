import { describe, expect, it } from "vitest";
import { buildCustomerOrderMessage, buildStatusMessage, formatAddressLine, whatsappLink, type WhatsAppOrderData } from "./whatsapp";

const order: WhatsAppOrderData = {
  code: "K7Q3MA",
  customerName: "Ana Souza",
  items: [
    { name: "Cookie Chocolate", quantity: 2, lineTotalCents: 2400 },
    { name: "Cookie Red Velvet", quantity: 1, lineTotalCents: 1500 },
  ],
  deliveryFeeCents: 500,
  totalCents: 4400,
  fulfillmentType: "DELIVERY",
  district: "Centro",
  scheduledDate: "2026-10-01",
  scheduledPeriod: "AFTERNOON",
  paymentMethod: "PIX",
};

describe("mensagens de WhatsApp", () => {
  it("cliente para a loja: itens no formato combinado, entrega, agenda e pagamento", () => {
    expect(buildCustomerOrderMessage(order)).toBe(
      [
        "Olá! Acabei de fazer o pedido #K7Q3MA pelo site.",
        "",
        "2x Cookie Chocolate — R$ 24,00",
        "1x Cookie Red Velvet — R$ 15,00",
        "Entrega: R$ 5,00",
        "Total: R$ 44,00",
        "",
        "Entrega em Centro",
        "Quinta-feira, 01/10, período da tarde",
        "Pagamento: PIX",
        "",
        "Vou enviar o comprovante do PIX por aqui.",
      ].join("\n"),
    );
  });

  it("retirada não mostra taxa", () => {
    const message = buildCustomerOrderMessage({ ...order, fulfillmentType: "PICKUP", deliveryFeeCents: 0, totalCents: 3900, paymentMethod: "CASH" });
    expect(message).not.toContain("Entrega");
    expect(message).toContain("Retirada");
    expect(message).not.toContain("comprovante");
  });

  it("equipe para o cliente: mensagem de cada status com o primeiro nome", () => {
    expect(buildStatusMessage("CONFIRMED", order)).toBe(
      "Olá, Ana! Seu pedido #K7Q3MA está confirmado para Quinta-feira, 01/10, período da tarde. Total: R$ 44,00.",
    );
    expect(buildStatusMessage("OUT_FOR_DELIVERY", { ...order, orderUrl: "https://loja/pedido/x" }))
      .toBe("Olá, Ana! Seu pedido #K7Q3MA saiu para entrega e chega em breve.\n\nAcompanhe: https://loja/pedido/x");
    expect(buildStatusMessage("CANCELED", order)).toContain("foi cancelado");
  });

  it("gera link wa.me somente com número válido", () => {
    expect(whatsappLink("+5528999990000", "Olá & tudo?")).toBe("https://wa.me/5528999990000?text=Ol%C3%A1%20%26%20tudo%3F");
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink("123")).toBeNull();
  });

  it("formata endereço com complemento e referência", () => {
    expect(formatAddressLine({ street: "Rua A", number: "1", complement: "Apto 2", district: "Centro", reference: "Perto da praça" }))
      .toBe("Rua A, 1, Apto 2 - Centro (Ref.: Perto da praça)");
  });
});
