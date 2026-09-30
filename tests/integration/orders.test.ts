import { describe, expect, it } from "vitest";
import { callFunction, createTestProduct, getStock, newKey, orderPayload, rest, service, signIn } from "../helpers/local";

type OrderResponse = { order: { orderId: string; code: string; publicToken: string; totalCents: number; replayed: boolean }; emailSent: boolean };
type ErrorResponse = { error: { code: string; message: string; data: Record<string, unknown> | null } };

describe("criação de pedido (Edge Function + banco)", () => {
  it("concorrência: estoque 1, dois clientes ao mesmo tempo, só um compra", async () => {
    const product = await createTestProduct({ stock: 1, priceCents: 3000 });
    const [a, b] = await Promise.all([
      callFunction<OrderResponse | ErrorResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 3000 })),
      callFunction<OrderResponse | ErrorResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 3000 })),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const failed = [a, b].find((r) => r.status === 409)!.body as ErrorResponse;
    expect(failed.error.code).toBe("OUT_OF_STOCK");
    expect(await getStock(product.id)).toBe(0);
  });

  it("concorrência: 10 compradores disputando 3 unidades", async () => {
    const product = await createTestProduct({ stock: 3, priceCents: 2500 });
    const results = await Promise.all(
      Array.from({ length: 10 }, async () =>
        callFunction("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2500 }))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
    expect(await getStock(product.id)).toBe(0);
  });

  it("produto sem controle de estoque vende sem limite e continua sem controle", async () => {
    const product = await createTestProduct({ stock: null, priceCents: 1000 });
    const results = await Promise.all(
      Array.from({ length: 5 }, async () =>
        callFunction("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 20 }], expectedTotalCents: 20000 }))),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await getStock(product.id)).toBeNull();
  });

  it("duplo clique / reenvio: mesma chave não cria outro pedido", async () => {
    const product = await createTestProduct({ stock: 10, priceCents: 2500 });
    const payload = await orderPayload({ items: [{ productId: product.id, quantity: 2 }], expectedTotalCents: 5000, key: newKey() });
    const results = await Promise.all(Array.from({ length: 5 }, () => callFunction<OrderResponse>("create-order", payload)));
    const codes = new Set(results.map((r) => r.body.order.code));
    expect(codes.size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 200 && r.body.order.replayed)).toHaveLength(4);
    expect(await getStock(product.id)).toBe(8);

    const retry = await callFunction<OrderResponse>("create-order", payload);
    expect(retry.body.order.code).toBe([...codes][0]);
  });

  it("mesma chave com outro conteúdo é recusada", async () => {
    const product = await createTestProduct({ stock: 10, priceCents: 2500 });
    const key = newKey();
    const first = await callFunction("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2500, key }));
    expect(first.status).toBe(201);
    const second = await callFunction<ErrorResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 2 }], expectedTotalCents: 5000, key }));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("preço alterado durante o checkout: pede confirmação do novo total", async () => {
    const product = await createTestProduct({ stock: 10, priceCents: 2000 });
    await service(`products?id=eq.${product.id}`, { method: "PATCH", body: JSON.stringify({ price_cents: 2600 }) });
    const stale = await callFunction<ErrorResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2000 }));
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("PRICE_CHANGED");
    expect(stale.body.error.data?.totalCents).toBe(2600);
    expect(await getStock(product.id)).toBe(10);

    const confirmed = await callFunction<OrderResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2600 }));
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.order.totalCents).toBe(2600);
  });

  it("entrega usa a taxa fixa configurada; retirada é grátis", async () => {
    const product = await createTestProduct({ stock: null, priceCents: 1000 });
    const delivery = await callFunction<OrderResponse>("create-order", await orderPayload({
      items: [{ productId: product.id, quantity: 2 }], expectedTotalCents: 2500, type: "DELIVERY",
    }));
    expect(delivery.status).toBe(201);
    expect(delivery.body.order.totalCents).toBe(2500);

    const pickup = await callFunction<OrderResponse>("create-order", await orderPayload({
      items: [{ productId: product.id, quantity: 2 }], expectedTotalCents: 2000, type: "PICKUP",
    }));
    expect(pickup.status).toBe(201);
    expect(pickup.body.order.totalCents).toBe(2000);
  });

  it("cancelamento pelo painel devolve o estoque", async () => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const created = await callFunction<OrderResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 2 }], expectedTotalCents: 5000 }));
    expect(await getStock(product.id)).toBe(3);

    const token = await signIn("atendente@doceria.local");
    const canceled = await rest("rpc/admin_set_status", {
      method: "POST",
      token,
      body: JSON.stringify({ p_order_id: created.body.order.orderId, p_status: "CANCELED", p_message: "teste" }),
    });
    expect(canceled.status).toBe(200);
    expect(await getStock(product.id)).toBe(5);
  });

  it("produto esgotado bloqueia a compra", async () => {
    const product = await createTestProduct({ stock: 0 });
    const result = await callFunction<ErrorResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2500 }));
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("OUT_OF_STOCK");
  });
});
