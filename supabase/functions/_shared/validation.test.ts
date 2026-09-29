import { describe, expect, it } from "vitest";
import { addressToRoutingQuery, normalizeBrazilPhone, parseOrderRequest, parseQuoteRequest, validateAddress } from "./validation.ts";

const address = {
  cep: "29300-000",
  street: "Rua Teste",
  number: "42",
  neighborhood: "Centro",
  city: "Cachoeiro de Itapemirim",
  state: "es",
};

function validOrder(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: "0b9f7c1e-8a4f-4f2b-9d57-3a8c1e2f4b6d",
    customer: { name: "  Maria   Teste ", phone: "(28) 99988-7766", email: "Maria@Teste.com" },
    fulfillment: { type: "PICKUP", scheduledFor: "2026-10-01T15:00:00Z" },
    items: [{ productId: "22222222-2222-4222-8222-000000000001", quantity: 2 }],
    paymentMethod: "PIX",
    expectedTotalCents: 2400,
    ...overrides,
  };
}

describe("normalizeBrazilPhone", () => {
  it.each([
    ["(28) 99988-7766", "+5528999887766"],
    ["28999887766", "+5528999887766"],
    ["+55 28 99988-7766", "+5528999887766"],
    ["028 99988-7766", "+5528999887766"],
    ["0055 28 99988 7766", "+5528999887766"],
    ["(28) 3522-1234", "+552835221234"],
  ])("normaliza %s", (input, expected) => {
    expect(normalizeBrazilPhone(input)).toBe(expected);
  });

  it.each(["123", "(28) 8998-77661", "(01) 99988-7766", "(28) 1234-5678", "", "abc"])("rejeita %s", (input) => {
    expect(normalizeBrazilPhone(input)).toBeNull();
  });
});

describe("validateAddress", () => {
  it("normaliza CEP e UF", () => {
    const result = validateAddress(address);
    expect(result.ok && result.value).toMatchObject({ cep: "29300000", state: "ES", complement: null });
  });

  it("rejeita coordenadas ou distância enviadas pelo navegador", () => {
    const result = validateAddress({ ...address, lat: -20.8, lng: -41.1, distanceKm: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors)).toEqual(expect.arrayContaining(["address.lat", "address.lng", "address.distanceKm"]));
    }
  });

  it("exige campos obrigatórios", () => {
    const result = validateAddress({ cep: "123", street: "", number: "", neighborhood: "", city: "", state: "XX" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toHaveLength(6);
  });

  it("monta a consulta de rota legível", () => {
    const result = validateAddress(address);
    expect(result.ok && addressToRoutingQuery(result.value)).toBe(
      "Rua Teste, 42 - Centro, Cachoeiro de Itapemirim - ES, 29300-000, Brasil",
    );
  });
});

describe("parseOrderRequest", () => {
  it("aceita um pedido válido e normaliza dados", () => {
    const result = parseOrderRequest(validOrder());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.customer).toEqual({ name: "Maria Teste", phone: "+5528999887766", email: "maria@teste.com" });
      expect(result.value.cashChangeForCents).toBeNull();
    }
  });

  it("rejeita valores monetários vindos do navegador", () => {
    const result = parseOrderRequest(validOrder({ totalCents: 1, subtotalCents: 1, deliveryFeeCents: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(expect.arrayContaining(["totalCents", "subtotalCents", "deliveryFeeCents"]));
  });

  it("rejeita preço por item", () => {
    const result = parseOrderRequest(validOrder({ items: [{ productId: "22222222-2222-4222-8222-000000000001", quantity: 1, priceCents: 1 }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["items.0.priceCents"]).toBeDefined();
  });

  it.each([[-1], [0], [501], [1.5], ["2"], [Number.MAX_SAFE_INTEGER]])("rejeita quantidade %s", (quantity) => {
    const result = parseOrderRequest(validOrder({ items: [{ productId: "22222222-2222-4222-8222-000000000001", quantity }] }));
    expect(result.ok).toBe(false);
  });

  it("rejeita produto com id inválido e carrinho vazio", () => {
    expect(parseOrderRequest(validOrder({ items: [{ productId: "1; drop table", quantity: 1 }] })).ok).toBe(false);
    expect(parseOrderRequest(validOrder({ items: [] })).ok).toBe(false);
  });

  it("exige endereço para entrega e rejeita para retirada", () => {
    expect(parseOrderRequest(validOrder({ fulfillment: { type: "DELIVERY", scheduledFor: "2026-10-01T15:00:00Z" } })).ok).toBe(false);
    expect(parseOrderRequest(validOrder({ fulfillment: { type: "PICKUP", scheduledFor: "2026-10-01T15:00:00Z", address } })).ok).toBe(false);
    expect(parseOrderRequest(validOrder({ fulfillment: { type: "DELIVERY", scheduledFor: "2026-10-01T15:00:00Z", address } })).ok).toBe(true);
  });

  it("rejeita distância informada pelo cliente na entrega", () => {
    const result = parseOrderRequest(validOrder({ fulfillment: { type: "DELIVERY", scheduledFor: "2026-10-01T15:00:00Z", address, distanceKm: 1 } }));
    expect(result.ok).toBe(false);
  });

  it("mantém troco somente para dinheiro", () => {
    const cash = parseOrderRequest(validOrder({ paymentMethod: "CASH", cashChangeForCents: 5000 }));
    const pix = parseOrderRequest(validOrder({ paymentMethod: "PIX", cashChangeForCents: 5000 }));
    expect(cash.ok && cash.value.cashChangeForCents).toBe(5000);
    expect(pix.ok && pix.value.cashChangeForCents).toBeNull();
  });

  it("exige chave de idempotência e total esperado", () => {
    expect(parseOrderRequest(validOrder({ idempotencyKey: "curta" })).ok).toBe(false);
    expect(parseOrderRequest(validOrder({ expectedTotalCents: undefined })).ok).toBe(false);
    expect(parseOrderRequest(validOrder({ expectedTotalCents: -1 })).ok).toBe(false);
  });

  it("rejeita corpo que não é objeto", () => {
    expect(parseOrderRequest(null).ok).toBe(false);
    expect(parseOrderRequest([]).ok).toBe(false);
    expect(parseOrderRequest("pedido").ok).toBe(false);
  });
});

describe("parseQuoteRequest", () => {
  it("aceita endereço e subtotal", () => {
    expect(parseQuoteRequest({ address, subtotalCents: 2400 }).ok).toBe(true);
  });
  it("rejeita distância e campos extras", () => {
    expect(parseQuoteRequest({ address, distanceKm: 1 }).ok).toBe(false);
    expect(parseQuoteRequest({ address, subtotalCents: -5 }).ok).toBe(false);
  });
});
