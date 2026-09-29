import { describe, expect, it } from "vitest";
import { address, callFunction, createTestProduct, orderPayload, service, stubRequests } from "../helpers/local";

type Quote = { available: boolean; reason: string | null; distanceMeters: number; feeCents: number | null; freeDeliveryApplied: boolean };
type ErrorResponse = { error: { code: string; message: string; data: Record<string, unknown> | null } };

describe("frete pela rota real", () => {
  it("calcula pela faixa de distância e reaproveita a cotação do mesmo endereço", async () => {
    const destination = address("Gilberto Machado");
    const before = await stubRequests();
    const first = await callFunction<Quote>("delivery-quote", { address: destination, subtotalCents: 2400 });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ available: true, distanceMeters: 4200, feeCents: 700 });

    // Mesmo endereço escrito de outro jeito: sem nova chamada ao provedor.
    const variant = { ...destination, street: destination.street.toUpperCase().replace("RUA", "R."), cep: "29300000", state: "es" };
    const second = await callFunction<Quote>("delivery-quote", { address: variant, subtotalCents: 2400 });
    expect(second.body.feeCents).toBe(700);
    expect(await stubRequests()).toBe(before + 1);
  });

  it("frete grátis acima do subtotal configurado", async () => {
    const result = await callFunction<Quote>("delivery-quote", { address: address("Centro"), subtotalCents: 20000 });
    expect(result.body).toMatchObject({ available: true, feeCents: 0, freeDeliveryApplied: true });
  });

  it("fora da área: não cria pedido de entrega", async () => {
    const destination = address("Itaoca");
    const quote = await callFunction<Quote>("delivery-quote", { address: destination, subtotalCents: 2400 });
    expect(quote.body).toMatchObject({ available: false, reason: "OUT_OF_AREA" });

    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const order = await callFunction<ErrorResponse>("create-order", await orderPayload({
      type: "DELIVERY", address: destination, items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2500,
    }));
    expect(order.status).toBe(409);
    expect(order.body.error.code).toBe("DELIVERY_UNAVAILABLE");
  });

  it("API de mapas indisponível: não inventa distância e oferece WhatsApp", async () => {
    const destination = address("Centro", "Rua Falha Total");
    const quote = await callFunction<ErrorResponse>("delivery-quote", { address: destination, subtotalCents: 2400 });
    expect(quote.status).toBe(503);
    expect(quote.body.error).toMatchObject({ code: "ROUTING_UNAVAILABLE", message: "Não foi possível calcular a entrega automaticamente.", data: { fallback: "WHATSAPP" } });

    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const order = await callFunction<ErrorResponse>("create-order", await orderPayload({
      type: "DELIVERY", address: destination, items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 3000,
    }));
    expect(order.status).toBe(503);
    const stock = await service<{ stock_available: number }[]>(`products?select=stock_available&id=eq.${product.id}`);
    expect(stock.body[0].stock_available).toBe(5);
  });

  it("tempo esgotado na API de mapas também cai no fallback", async () => {
    const result = await callFunction<ErrorResponse>("delivery-quote", { address: address("Centro", "Rua Lenta"), subtotalCents: 2400 });
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("ROUTING_UNAVAILABLE");
  }, 30_000);

  it("endereço impreciso ou inexistente pede revisão", async () => {
    const imprecise = await callFunction<ErrorResponse>("delivery-quote", { address: address("Centro", "Rua Imprecisa"), subtotalCents: 2400 });
    expect(imprecise.status).toBe(422);
    expect(imprecise.body.error.code).toBe("ADDRESS_IMPRECISE");
    const missing = await callFunction<ErrorResponse>("delivery-quote", { address: address("Centro", "Rua Inexistente"), subtotalCents: 2400 });
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe("ADDRESS_NOT_FOUND");
  });

  it("pedido de entrega recalcula o frete no servidor", async () => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const destination = address("Independência");
    const wrong = await callFunction<ErrorResponse>("create-order", await orderPayload({
      type: "DELIVERY", address: destination, items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2500 + 500,
    }));
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.code).toBe("PRICE_CHANGED");
    expect(wrong.body.error.data?.deliveryFeeCents).toBe(1000);

    const ok = await callFunction<{ order: { deliveryFeeCents: number; totalCents: number } }>("create-order", await orderPayload({
      type: "DELIVERY", address: destination, items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 3500,
    }));
    expect(ok.status).toBe(201);
    expect(ok.body.order).toMatchObject({ deliveryFeeCents: 1000, totalCents: 3500 });
  });
});
