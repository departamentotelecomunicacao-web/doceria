import { randomUUID } from "node:crypto";
import { adminLogin, callFunction, createTestProduct, emailsTo, expect, getStock, orderPayload, test } from "./fixtures";

async function createOrder(productId: string, quantity: number, priceCents: number, options: { email?: string; type?: "PICKUP" | "DELIVERY" } = {}) {
  const type = options.type ?? "PICKUP";
  const fee = type === "DELIVERY" ? 500 : 0;
  const result = await callFunction<{ order: { orderId: string; code: string } }>(
    "create-order",
    await orderPayload({ items: [{ productId, quantity }], expectedTotalCents: priceCents * quantity + fee, email: options.email ?? null, type }),
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
    await page.getByLabel("E-mail").fill("dono@doceria.local");
    await page.getByLabel("Senha").fill("senha-errada-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  });

  test("atendente confirma o pedido, o cliente recebe e-mail e o WhatsApp vem pronto", async ({ page }) => {
    const email = `e2e-${randomUUID().slice(0, 8)}@example.com`;
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const order = await createOrder(product.id, 2, 2500, { email, type: "DELIVERY" });

    await adminLogin(page, "atendente@doceria.local");
    await expect(page.getByTestId("summary-new")).not.toHaveText("0");
    const card = page.locator(`[data-order-code="${order.code}"]`).first();
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.getByTestId("admin-order-code")).toHaveText(`#${order.code}`);
    await expect(page.getByTestId("delivery-address")).toContainText("Rua dos Testes");

    await page.getByTestId("next-status").click();
    await expect(page.getByTestId("admin-order-status")).toContainText("Confirmado");
    await expect(page.getByText("E-mail enviado ao cliente")).toBeVisible();
    await expect(page.getByTestId("email-log")).toContainText("Pedido confirmado");
    expect((await emailsTo(email)).map((e) => e.subject)).toEqual([
      `Recebemos seu pedido #${order.code}`,
      `Pedido #${order.code} confirmado`,
    ]);

    const wa = decodeURIComponent((await page.getByTestId("whatsapp-customer").getAttribute("href"))!);
    expect(wa).toContain(`Seu pedido #${order.code} está confirmado`);

    await page.getByTestId("next-status").click();
    await expect(page.getByTestId("admin-order-status")).toContainText("Em preparo");
    await page.getByTestId("next-status").click();
    await expect(page.getByTestId("admin-order-status")).toContainText("Saiu para entrega");

    await page.getByTestId("toggle-paid").click();
    await expect(page.getByTestId("admin-order-status")).toContainText("Pago");
    await page.getByTestId("next-status").click();
    await expect(page.getByTestId("admin-order-status")).toContainText("Entregue");
    await expect(page.getByTestId("next-status")).toHaveCount(0);
  });

  test("ajuste de frete recalcula o total do pedido", async ({ page }) => {
    const product = await createTestProduct({ stock: null, priceCents: 1000 });
    const order = await createOrder(product.id, 2, 1000, { type: "DELIVERY" });
    await adminLogin(page, "atendente@doceria.local");
    await page.goto(`/admin/pedidos/${order.orderId}`);
    await expect(page.getByTestId("order-total")).toHaveText("R$ 25,00");
    await page.getByTestId("edit-fee").click();
    await page.getByTestId("fee-input").fill("8,00");
    await page.getByTestId("save-fee").click();
    await expect(page.getByTestId("order-total")).toHaveText("R$ 28,00");
  });

  test("pedido cancelado devolve o estoque", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const order = await createOrder(product.id, 2, 2500);
    expect(await getStock(product.id)).toBe(3);
    await adminLogin(page);
    await page.goto(`/admin/pedidos/${order.orderId}`);
    await page.getByTestId("cancel-order").click();
    await page.getByLabel("Motivo").fill("Cliente desistiu");
    await page.getByTestId("confirm-cancel").click();
    await expect(page.getByTestId("admin-order-status")).toContainText("Cancelado");
    expect(await getStock(product.id)).toBe(5);
  });

  test("atendente marca produto como esgotado e a loja deixa de vender", async ({ page }) => {
    const product = await createTestProduct({ stock: 4, priceCents: 2500, name: `Esgota ${Date.now()}` });
    await adminLogin(page, "atendente@doceria.local");
    await page.goto("/admin/produtos");
    await page.getByPlaceholder("Buscar produto").fill(product.name);
    const row = page.locator(`[data-testid="admin-product-row"][data-product-slug="${product.slug}"]`);
    await row.getByTestId("stock-input").fill("0");
    await row.getByTestId("save-stock").click();
    await expect(page.getByText("Produto atualizado")).toBeVisible();
    expect(await getStock(product.id)).toBe(0);
    await expect(row.getByRole("link", { name: "Editar" })).toHaveCount(0);

    await page.goto(`/produto/${product.slug}`);
    await expect(page.getByTestId("sold-out-notice")).toBeVisible();
  });

  test("dono altera a taxa de entrega e o checkout usa o novo valor", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/configuracoes?aba=entrega");
    const fee = page.getByTestId("delivery-fee");
    await expect(fee).toHaveValue("5,00");
    await fee.fill("6,50");
    await page.getByTestId("save-delivery").click();
    await expect(page.getByText("Configurações salvas")).toBeVisible();
    try {
      const product = await createTestProduct({ stock: null, priceCents: 1000 });
      await page.goto(`/produto/${product.slug}`);
      await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
      await page.goto("/checkout");
      await page.getByRole("radio", { name: /Entrega/ }).check();
      await expect(page.getByTestId("summary-delivery")).toHaveText("R$ 6,50");
    } finally {
      await page.goto("/admin/configuracoes?aba=entrega");
      await page.getByTestId("delivery-fee").fill("5,00");
      await page.getByTestId("save-delivery").click();
      await expect(page.getByText("Configurações salvas")).toBeVisible();
    }
  });

  test("atendente não vê configurações", async ({ page }) => {
    await adminLogin(page, "atendente@doceria.local");
    await expect(page.getByRole("link", { name: "Pedidos" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Configurações" })).toHaveCount(0);
    await page.goto("/admin/configuracoes");
    await expect(page).toHaveURL(/\/admin\/pedidos/);
  });

  test("sessão expirada volta ao login com aviso", async ({ page }) => {
    await adminLogin(page);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      const raw = window.localStorage.getItem("doceria-admin-auth");
      if (!raw) throw new Error("sessão não encontrada");
      const session = JSON.parse(raw);
      session.expires_at = Math.floor(Date.now() / 1000) - 60;
      session.refresh_token = "token-invalido";
      window.localStorage.setItem("doceria-admin-auth", JSON.stringify(session));
    });
    await page.getByRole("link", { name: /Produtos/ }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText("Sua sessão expirou. Entre novamente.")).toBeVisible();
  });
});
