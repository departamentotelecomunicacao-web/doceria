import { adminLogin, callFunction, createTestProduct, expect, getStock, orderPayload, test } from "./fixtures";

// Operação pelo celular: ver pedido, confirmar, marcar pago e ajustar produto.
test("painel pelo celular: confirma pedido, marca pago e ajusta quantidade", async ({ page, isMobile }) => {
  test.skip(!isMobile, "cenário móvel");
  const product = await createTestProduct({ stock: 4, priceCents: 2500 });
  const created = await callFunction<{ order: { orderId: string; code: string } }>(
    "create-order",
    await orderPayload({ items: [{ productId: product.id, quantity: 1 }], expectedTotalCents: 2500 }),
  );
  await adminLogin(page, "atendente@doceria.local");
  await page.locator(`[data-testid="order-card"][data-order-code="${created.body.order.code}"]`).click();
  await page.getByTestId("next-status").click();
  await expect(page.getByTestId("admin-order-status")).toContainText("Confirmado");
  await page.getByTestId("toggle-paid").click();
  await expect(page.getByTestId("admin-order-status")).toContainText("Pago");

  await page.getByRole("navigation", { name: "Atalhos" }).getByRole("link", { name: /Produtos/ }).click();
  await page.getByPlaceholder("Buscar produto").fill(product.name);
  const row = page.locator(`[data-testid="admin-product-row"][data-product-slug="${product.slug}"]`);
  await row.getByTestId("stock-input").fill("10");
  await row.getByTestId("save-stock").click();
  await expect(page.getByText("Produto atualizado")).toBeVisible();
  expect(await getStock(product.id)).toBe(10);
});
