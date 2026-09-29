import { adminLogin, callFunction, createTestProduct, expect, orderPayload, test } from "./fixtures";

// Operação pelo celular: ver pedido, aceitar, mudar status e ajustar estoque.
test("admin pelo celular: aceita pedido e ajusta estoque", async ({ page, isMobile }) => {
  test.skip(!isMobile, "cenário móvel");
  const product = await createTestProduct({ stock: 4, priceCents: 2500 });
  const created = await callFunction<{ order: { orderId: string; code: string } }>(
    "create-order",
    await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2500 }),
  );
  await adminLogin(page, "operador@doceria.local");
  await page.getByRole("navigation", { name: "Atalhos" }).getByRole("link", { name: /Pedidos/ }).click();
  await page.locator(`[data-testid="order-card"][data-order-code="${created.body.order.code}"]`).click();
  await page.getByTestId("transition-CONFIRMED").click();
  await expect(page.getByTestId("admin-order-status")).toContainText("Confirmado");

  await page.getByRole("navigation", { name: "Atalhos" }).getByRole("link", { name: /Estoque/ }).click();
  await page.getByPlaceholder("Buscar produto").fill(product.name);
  await page.getByTestId(`stock-in-${product.slug}`).filter({ visible: true }).click();
  await page.getByTestId("stock-quantity").fill("3");
  await page.getByTestId("stock-reason").fill("Fornada da tarde");
  await page.getByTestId("confirm-stock").click();
  await expect(page.getByText("Entrada registrada")).toBeVisible();
});
