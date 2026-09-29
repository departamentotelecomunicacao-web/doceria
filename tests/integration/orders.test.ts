import { describe, expect, it } from "vitest";
import { callFunction, createTestProduct, getStock, newKey, orderPayload, service } from "../helpers/local";

type OrderResponse = { order: { orderId: string; code: string; publicToken: string; totalCents: number; replayed: boolean; status: string } };
type ErrorResponse = { error: { code: string; message: string; data: Record<string, unknown> | null } };

describe("criação de pedido (Edge Function + banco)", () => {
  it("concorrência: estoque 1, dois clientes ao mesmo tempo, só um reserva", async () => {
    const product = await createTestProduct({ stock: 1, priceCents: 3000 });
    const [a, b] = await Promise.all([
      callFunction<OrderResponse | ErrorResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 3000 })),
      callFunction<OrderResponse | ErrorResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 3000 })),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const failed = [a, b].find((r) => r.status === 409)!.body as ErrorResponse;
    expect(failed.error.code).toBe("OUT_OF_STOCK");
    expect(await getStock(product.id)).toEqual({ stock_available: 0, stock_reserved: 1 });
  });

  it("concorrência: 10 compradores disputando 3 unidades", async () => {
    const product = await createTestProduct({ stock: 3, priceCents: 2500 });
    const results = await Promise.all(
      Array.from({ length: 10 }, async () =>
        callFunction("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2500 }))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
    expect(await getStock(product.id)).toEqual({ stock_available: 0, stock_reserved: 3 });
  });

  it("duplo clique / reenvio: mesma chave não cria outro pedido", async () => {
    const product = await createTestProduct({ stock: 10, priceCents: 2500 });
    const payload = await orderPayload({ items: [{ productId: product.id, quantity: 2 }], expectedTotalCents: 5000, key: newKey() });
    const results = await Promise.all(Array.from({ length: 5 }, () => callFunction<OrderResponse>("create-order", payload)));
    const codes = new Set(results.map((r) => r.body.order.code));
    expect(codes.size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 200 && r.body.order.replayed)).toHaveLength(4);
    expect(await getStock(product.id)).toEqual({ stock_available: 8, stock_reserved: 2 });

    // Retry depois de "timeout": mesma resposta.
    const retry = await callFunction<OrderResponse>("create-order", payload);
    expect(retry.body.order.code).toBe([...codes][0]);
  });

  it("mesma chave com outro conteúdo é rejeitada", async () => {
    const product = await createTestProduct({ stock: 10, priceCents: 2500 });
    const key = newKey();
    const first = await callFunction("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2500, key }));
    expect(first.status).toBe(201);
    const second = await callFunction<ErrorResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 2 }], expectedTotalCents: 5000, key }));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("produto alterado durante o checkout: pede confirmação do novo total", async () => {
    const product = await createTestProduct({ stock: 10, priceCents: 2000 });
    // Admin muda o preço depois que o cliente abriu o checkout.
    await service(`products?id=eq.${product.id}`, { method: "PATCH", body: JSON.stringify({ price_cents: 2600 }) });
    const stale = await callFunction<ErrorResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2000 }));
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("PRICE_CHANGED");
    expect(stale.body.error.data?.totalCents).toBe(2600);
    expect(await getStock(product.id)).toEqual({ stock_available: 10, stock_reserved: 0 });

    const confirmed = await callFunction<OrderResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2600 }));
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.order.totalCents).toBe(2600);
  });

  it("produto esgotado bloqueia a compra", async () => {
    const product = await createTestProduct({ stock: 0 });
    const result = await callFunction<ErrorResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2500 }));
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("OUT_OF_STOCK");
  });

  it("pedido expirado devolve a reserva ao estoque", async () => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const created = await callFunction<OrderResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 2 }], expectedTotalCents: 5000, paymentMethod: "PIX" }));
    expect(created.body.order.status).toBe("AWAITING_PAYMENT");
    expect(await getStock(product.id)).toEqual({ stock_available: 3, stock_reserved: 2 });

    await service(`orders?id=eq.${created.body.order.orderId}`, { method: "PATCH", body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }) });
    await service("rpc/expire_stale_orders", { method: "POST", body: "{}" });

    expect(await getStock(product.id)).toEqual({ stock_available: 5, stock_reserved: 0 });
    const order = await service<{ status: string }[]>(`orders?select=status&id=eq.${created.body.order.orderId}`);
    expect(order.body[0].status).toBe("EXPIRED");
  });
});
