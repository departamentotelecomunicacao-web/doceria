import { describe, expect, it } from "vitest";
import { SUPABASE_URL, callFunction, createTestProduct, orderPayload, rest, signIn } from "../helpers/local";

type ErrorResponse = { error: { code: string } };

describe("segurança: acesso público", () => {
  it.each(["orders", "customers", "customer_addresses", "store_settings", "inventory_movements", "audit_logs", "delivery_quotes", "payment_records"])(
    "visitante não lê %s",
    async (table) => {
      const result = await rest(`${table}?select=*`);
      expect([401, 403]).toContain(result.status);
    },
  );

  it("visitante não altera preço nem estoque", async () => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const price = await rest(`products?id=eq.${product.id}`, { method: "PATCH", body: JSON.stringify({ price_cents: 1 }) });
    expect([401, 403]).toContain(price.status);
    const stock = await rest(`products?id=eq.${product.id}`, { method: "PATCH", body: JSON.stringify({ stock_available: 999 }) });
    expect([401, 403]).toContain(stock.status);
  });

  it("visitante não chama funções internas nem administrativas", async () => {
    for (const fn of ["create_order", "admin_transition_order", "inventory_adjust", "admin_dashboard", "get_routing_origin", "expire_stale_orders"]) {
      const result = await rest(`rpc/${fn}`, { method: "POST", body: "{}" });
      expect([401, 403, 404]).toContain(result.status);
    }
  });

  it("token de pedido manipulado não abre outro pedido", async () => {
    for (const token of ["a".repeat(48), "0".repeat(48), "../orders", "' or 1=1 --", "1"]) {
      const result = await rest("rpc/get_public_order", { method: "POST", body: JSON.stringify({ p_token: token }) });
      expect(result.status).toBe(200);
      expect(result.body).toBeNull();
    }
  });
});

describe("segurança: manipulação do pedido", () => {
  it("rejeita preço, total, frete e distância enviados pelo navegador", async () => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const payload = await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2500 });
    const tampered = [
      { ...payload, totalCents: 1 },
      { ...payload, deliveryFeeCents: 0 },
      { ...payload, items: [{ productId: product.id, quantity: 1, priceCents: 1 }] },
      { ...payload, fulfillment: { ...payload.fulfillment, distanceKm: 1 } },
      { ...payload, stock: 999 },
    ];
    for (const body of tampered) {
      const result = await callFunction<ErrorResponse>("create-order", body);
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("INVALID_PAYLOAD");
    }
  });

  it("valor esperado modificado não altera o valor cobrado", async () => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const result = await callFunction<ErrorResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 100 }));
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("PRICE_CHANGED");
  });

  it.each([[-1], [0], [100000], [2.5]])("quantidade %s é rejeitada", async (quantity) => {
    const product = await createTestProduct({ stock: 5 });
    const result = await callFunction<ErrorResponse>("create-order", await orderPayload({ items: [{ productId: product.id, quantity }], expectedTotalCents: 2500 }));
    expect(result.status).toBe(400);
  });

  it("produto inexistente é rejeitado", async () => {
    const result = await callFunction<ErrorResponse>("create-order", await orderPayload({
      items: [{ productId: "99999999-9999-4999-8999-999999999999", quantity: 1 }],
      expectedTotalCents: 2500,
    }));
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("PRODUCT_UNAVAILABLE");
  });

  it("corpo inválido e métodos não permitidos", async () => {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-order`, { method: "GET" });
    expect(response.status).toBe(405);
    const garbage = await callFunction<ErrorResponse>("create-order", "não é json de pedido");
    expect(garbage.status).toBe(400);
  });
});

describe("segurança: papéis da equipe", () => {
  it("operador não altera preço (RLS) e não gerencia equipe", async () => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const token = await signIn("operador@doceria.local");
    const update = await rest<unknown[]>(`products?id=eq.${product.id}`, {
      method: "PATCH",
      token,
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ price_cents: 1 }),
    });
    expect(update.body).toEqual([]);
    const team = await callFunction<ErrorResponse>("admin-users", { action: "list" }, token);
    expect(team.status).toBe(403);
  });

  it("admin-users sem sessão é rejeitado", async () => {
    const result = await callFunction<ErrorResponse>("admin-users", { action: "list" });
    expect(result.status).toBe(401);
  });

  it("dono lista a equipe", async () => {
    const token = await signIn("owner@doceria.local");
    const result = await callFunction<{ members: unknown[] }>("admin-users", { action: "list" }, token);
    expect(result.status).toBe(200);
    expect(result.body.members.length).toBeGreaterThanOrEqual(3);
  });
});
