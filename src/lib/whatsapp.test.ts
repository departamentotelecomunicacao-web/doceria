import { describe, expect, it } from "vitest";
import { buildOrderMessage, formatAddressLine, whatsappLink } from "./whatsapp";

describe("mensagem de WhatsApp", () => {
  it("segue o formato combinado", () => {
    const message = buildOrderMessage({
      code: "K7Q3MA",
      items: [
        { name: "Cookie Chocolate", quantity: 2, lineTotalCents: 2400 },
        { name: "Cookie Red Velvet", quantity: 1, lineTotalCents: 1500 },
      ],
      subtotalCents: 3900,
      deliveryFeeCents: 500,
      totalCents: 4400,
      fulfillmentType: "DELIVERY",
      addressLine: "Rua Teste, 42 - Centro, Cachoeiro de Itapemirim/ES",
    });
    expect(message).toBe(
      [
        "Olá! Gostaria de fazer o pedido #K7Q3MA.",
        "",
        "2x Cookie Chocolate — R$ 24,00",
        "1x Cookie Red Velvet — R$ 15,00",
        "",
        "Subtotal: R$ 39,00",
        "Entrega: R$ 5,00",
        "",
        "Total: R$ 44,00",
        "",
        "Entrega:",
        "Rua Teste, 42 - Centro, Cachoeiro de Itapemirim/ES",
      ].join("\n"),
    );
  });

  it("retirada não mostra taxa de entrega", () => {
    const message = buildOrderMessage({
      code: "AAAAAA",
      items: [{ name: "Cookie", quantity: 1, lineTotalCents: 1200 }],
      subtotalCents: 1200,
      deliveryFeeCents: 0,
      totalCents: 1200,
      fulfillmentType: "PICKUP",
    });
    expect(message).not.toContain("Entrega:");
    expect(message).toContain("Retirada na loja");
  });

  it("gera link wa.me somente com número válido", () => {
    expect(whatsappLink("5528999990000", "Olá & tudo?")).toBe("https://wa.me/5528999990000?text=Ol%C3%A1%20%26%20tudo%3F");
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink("123")).toBeNull();
  });

  it("formata endereço com complemento e referência", () => {
    expect(formatAddressLine({ street: "Rua A", number: "1", complement: "Apto 2", neighborhood: "Centro", city: "Cachoeiro", state: "ES", reference: "Perto da praça" }))
      .toBe("Rua A, 1, Apto 2 - Centro, Cachoeiro/ES (Ref.: Perto da praça)");
  });
});
