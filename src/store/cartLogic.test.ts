import { describe, expect, it } from "vitest";
import type { Product } from "@/types/domain";
import { addLine, cartFingerprint, maxPurchasable, reconcileCart, setLineQuantity } from "./cartLogic";

function product(overrides: Partial<Product>): Product {
  return {
    id: "p1", category_id: null, name: "Cookie", slug: "cookie", short_description: "", description: "",
    price_cents: 1200, compare_at_price_cents: null, stock_available: 10, stock_reserved: 0, low_stock_threshold: 2,
    max_per_order: 24, is_active: true, is_featured: false, sort_order: 0, allergens: [], ingredients: "",
    weight_grams: null, created_at: "", updated_at: "", images: [], ...overrides,
  };
}

describe("carrinho", () => {
  it("limita a quantidade ao estoque e ao máximo por pedido", () => {
    expect(maxPurchasable(product({ stock_available: 3, max_per_order: 24 }))).toBe(3);
    expect(maxPurchasable(product({ stock_available: 50, max_per_order: 6 }))).toBe(6);
    expect(addLine([{ productId: "p1", quantity: 2 }], "p1", 5, 4)).toEqual([{ productId: "p1", quantity: 4 }]);
    expect(setLineQuantity([{ productId: "p1", quantity: 2 }], "p1", 0, 4)).toEqual([]);
  });

  it("recalcula com o preço atual do banco, não com o salvo", () => {
    const result = reconcileCart([{ productId: "p1", quantity: 2 }], [product({ price_cents: 1500 })]);
    expect(result.subtotalCents).toBe(3000);
    expect(result.count).toBe(2);
  });

  it("remove esgotados/inativos e reduz ao disponível", () => {
    const result = reconcileCart(
      [
        { productId: "p1", quantity: 5 },
        { productId: "p2", quantity: 1 },
        { productId: "p3", quantity: 1 },
        { productId: "p4", quantity: 1 },
      ],
      [
        product({ id: "p1", stock_available: 3 }),
        product({ id: "p2", stock_available: 0 }),
        product({ id: "p3", is_active: false }),
      ],
    );
    expect(result.lines).toEqual([{ productId: "p1", quantity: 3 }]);
    expect(result.issues.map((issue) => issue.issue)).toEqual(["REDUCED", "SOLD_OUT", "UNAVAILABLE", "UNAVAILABLE"]);
  });

  it("assinatura independe da ordem", () => {
    expect(cartFingerprint([{ productId: "b", quantity: 1 }, { productId: "a", quantity: 2 }]))
      .toBe(cartFingerprint([{ productId: "a", quantity: 2 }, { productId: "b", quantity: 1 }]));
  });
});
