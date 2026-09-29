import { adminLogin, callFunction, createTestProduct, expect, orderPayload, stock, test } from "./fixtures";

async function createOrder(productId: string, quantity: number, priceCents: number, paymentMethod: "CASH" | "PIX" = "CASH") {
  const result = await callFunction<{ order: { orderId: string; code: string } }>(
    "create-order",
    await orderPayload({ items: [{ productId, quantity }], expectedTotalCents: priceCents * quantity, paymentMethod }),
  );
  expect(result.status).toBe(201);
  return result.body.order;
}

test.describe("painel", () => {
  test("acesso ao painel sem login leva ao login", async ({ page }) => {
    await page.goto("/admin/pedidos");
    await expect(page).toHaveURL(/\/admin\/login\?voltar=/);
    await expect(page.getByTestId("login-form")).toBeVisible();
  });

  test("senha errada mostra mensagem clara", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("E-mail").fill("owner@doceria.local");
    await page.getByLabel("Senha").fill("senha-errada-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  });

  test("pedido aparece no painel, é confirmado e o estoque é consumido", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const order = await createOrder(product.id, 2, 2500);
    expect(await stock(product.id)).toEqual({ stock_available: 3, stock_reserved: 2 });

    await adminLogin(page, "operador@doceria.local");
    await page.goto("/admin/pedidos");
    const row = page.locator(`[data-order-code="${order.code}"]`).first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByTestId("admin-order-code")).toHaveText(`#${order.code}`);

    await page.getByTestId("transition-CONFIRMED").click();
    await expect(page.getByTestId("admin-order-status")).toContainText("Confirmado");
    expect(await stock(product.id)).toEqual({ stock_available: 3, stock_reserved: 0 });

    await page.getByTestId("transition-PREPARING").click();
    await expect(page.getByTestId("admin-order-status")).toContainText("Em preparo");
    await page.getByTestId("transition-READY").click();
    await expect(page.getByTestId("admin-order-status")).toContainText("Pronto");
    await expect(page.getByText("Confirmado → Em preparo")).toBeVisible();
  });

  test("pedido cancelado devolve o estoque", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const order = await createOrder(product.id, 2, 2500);
    await adminLogin(page);
    await page.goto(`/admin/pedidos/${order.orderId}`);
    await page.getByTestId("open-cancel").click();
    await expect(page.getByTestId("confirm-cancel")).toBeDisabled();
    await page.getByTestId("cancel-reason").fill("Cliente desistiu");
    await page.getByTestId("confirm-cancel").click();
    await expect(page.getByTestId("admin-order-status")).toContainText("Cancelado");
    expect(await stock(product.id)).toEqual({ stock_available: 5, stock_reserved: 0 });
  });

  test("PIX: confirmar pagamento confirma o pedido", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const order = await createOrder(product.id, 1, 2500, "PIX");
    await adminLogin(page);
    await page.goto(`/admin/pedidos/${order.orderId}`);
    await page.getByTestId("confirm-payment-and-order").click();
    await expect(page.getByTestId("admin-order-status")).toContainText("Confirmado");
    await expect(page.getByTestId("admin-order-status")).toContainText("Pago");
  });

  test("entrada de estoque com motivo obrigatório", async ({ page }) => {
    const product = await createTestProduct({ stock: 2, priceCents: 2500 });
    await adminLogin(page, "operador@doceria.local");
    await page.goto("/admin/estoque");
    await page.getByPlaceholder("Buscar produto").fill(product.name);
    await page.getByTestId(`stock-in-${product.slug}`).filter({ visible: true }).click();
    await page.getByTestId("stock-quantity").fill("6");
    await expect(page.getByTestId("confirm-stock")).toBeDisabled();
    await page.getByTestId("stock-reason").fill("Fornada do dia");
    await page.getByTestId("confirm-stock").click();
    await expect(page.getByText("Entrada registrada")).toBeVisible();
    expect(await stock(product.id)).toEqual({ stock_available: 8, stock_reserved: 0 });
  });

  test("operador não vê áreas de administrador", async ({ page }) => {
    await adminLogin(page, "operador@doceria.local");
    await expect(page.getByRole("link", { name: "Pedidos" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Configurações" })).toHaveCount(0);
    await page.goto("/admin/configuracoes");
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("sessão administrativa expirada volta ao login com aviso", async ({ page }) => {
    await adminLogin(page);
    await page.waitForLoadState("networkidle");
    // Simula o token vencido e um refresh token revogado; a próxima ação do
    // painel tenta renovar a sessão, falha e deve levar ao login com aviso.
    await page.evaluate(() => {
      const raw = window.localStorage.getItem("doceria-admin-auth");
      if (!raw) throw new Error("sessão não encontrada");
      const session = JSON.parse(raw);
      session.expires_at = Math.floor(Date.now() / 1000) - 60;
      session.refresh_token = "token-invalido";
      window.localStorage.setItem("doceria-admin-auth", JSON.stringify(session));
    });
    await page.getByRole("link", { name: /Pedidos/ }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText("Sua sessão expirou. Entre novamente.")).toBeVisible();
  });
});
