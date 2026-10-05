import type { Page } from "@playwright/test";
import {
  addToCartFromProductPage,
  callFunction,
  createTestProduct,
  expect,
  fillCustomer,
  getStock,
  orderPayload,
  rest,
  setPrice,
  signIn,
  test,
  uniqueMobile,
} from "./fixtures";

async function goToCheckout(page: Page) {
  await page.goto("/carrinho");
  await page.getByTestId("go-to-checkout").click();
  await expect(page.getByRole("heading", { name: "Finalizar pedido" })).toBeVisible();
}

async function countOrdersForPhone(phoneDigits: string) {
  const token = await signIn("dono@doceria.local");
  const result = await rest<{ id: string }[]>(`orders?select=id&customer_phone=eq.%2B55${phoneDigits}`, { token });
  return result.body.length;
}

test.describe("checkout", () => {
  test("entrega com PIX: taxa fixa, sem e-mail e página do pedido com PIX e envio pelo WhatsApp", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    await addToCartFromProductPage(page, product, 2);
    await goToCheckout(page);
    await fillCustomer(page, uniqueMobile());
    // Toda a comunicação é pelo WhatsApp: o checkout não pede e-mail.
    await expect(page.getByRole("textbox", { name: /E-mail/ })).toHaveCount(0);

    await page.getByRole("radio", { name: /Entrega/ }).check();
    await page.getByLabel("Rua", { exact: true }).fill("Rua das Flores");
    await page.getByLabel("Número", { exact: true }).fill("12");
    await page.getByLabel("Bairro", { exact: true }).fill("Gilberto Machado");
    await expect(page.getByTestId("summary-delivery")).toHaveText("R$ 5,00");
    await expect(page.getByTestId("summary-total")).toHaveText("R$ 55,00");
    await page.getByRole("radio", { name: /PIX/ }).check();
    await page.getByTestId("period-MORNING").click();
    await page.getByTestId("place-order").click();

    await expect(page).toHaveURL(/\/pedido\/[a-f0-9]{48}\?novo=1/);
    await expect(page.getByTestId("order-created")).toContainText("envie o pedido");
    await expect(page.getByTestId("order-status")).toHaveText("Recebido");
    await expect(page.getByTestId("order-total")).toHaveText("R$ 55,00");
    await expect(page.getByTestId("pix-key")).toHaveText("pix@doceria.local");
    await expect(page.getByText("Bairro Gilberto Machado")).toBeVisible();
    await expect(page.getByText(/período da manhã/)).toBeVisible();

    const code = (await page.getByTestId("order-code").textContent())!.replace("#", "");
    const href = decodeURIComponent((await page.getByTestId("send-whatsapp").getAttribute("href"))!);
    expect(href).toContain("wa.me/5528999990000");
    expect(href).toContain(`Olá! Acabei de fazer o pedido #${code} pelo site.`);
    expect(href).toContain(`2x ${product.name} — R$ 50,00`);
    expect(href).toContain("Total: R$ 55,00");

    expect(await getStock(product.id)).toBe(3);
    await expect(page.getByTestId("cart-count")).toHaveText("0");
  });

  test("retirada é grátis e mostra o endereço da loja", async ({ page }) => {
    const product = await createTestProduct({ stock: null, priceCents: 1800 });
    await addToCartFromProductPage(page, product);
    await goToCheckout(page);
    await fillCustomer(page, uniqueMobile());
    await page.getByRole("radio", { name: /Retirada/ }).check();
    await expect(page.getByLabel("Rua", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("summary-delivery")).toHaveText("grátis");
    await expect(page.getByTestId("summary-total")).toHaveText("R$ 18,00");
    await page.getByRole("radio", { name: /Dinheiro/ }).check();
    await page.getByLabel("Troco para quanto?").fill("50");
    await page.getByTestId("place-order").click();

    await expect(page).toHaveURL(/\/pedido\//);
    await expect(page.getByTestId("order-total")).toHaveText("R$ 18,00");
    await expect(page.getByTestId("pickup-address")).toContainText("Rua de Exemplo, 100");
    await expect(page.getByText("troco para R$ 50,00")).toBeVisible();
  });

  test("dados obrigatórios: mostra os campos com erro sem enviar", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    await addToCartFromProductPage(page, product);
    await goToCheckout(page);
    await page.getByRole("radio", { name: /Entrega/ }).check();
    await page.getByTestId("place-order").click();
    await expect(page.getByText("Informe seu nome.")).toBeVisible();
    await expect(page.getByText("WhatsApp inválido. Use DDD + número.")).toBeVisible();
    await expect(page.getByText("Informe a rua.")).toBeVisible();
    await expect(page).toHaveURL(/\/checkout/);
  });

  test("duplo clique no botão cria um único pedido", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const phone = uniqueMobile();
    await addToCartFromProductPage(page, product);
    await goToCheckout(page);
    await fillCustomer(page, phone);
    await page.getByRole("radio", { name: /Retirada/ }).check();
    await page.getByTestId("place-order").dblclick();
    await expect(page).toHaveURL(/\/pedido\//);
    expect(await countOrdersForPhone(phone.replace(/\D/g, ""))).toBe(1);
    expect(await getStock(product.id)).toBe(4);
  });

  test("preço alterado durante o checkout exige confirmar o novo total", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2000 });
    await addToCartFromProductPage(page, product);
    await goToCheckout(page);
    await fillCustomer(page, uniqueMobile());
    await page.getByRole("radio", { name: /Retirada/ }).check();
    await expect(page.getByTestId("summary-total")).toHaveText("R$ 20,00");

    await setPrice(product.id, 2400);
    await page.getByTestId("place-order").click();
    await expect(page.getByText("Os valores foram atualizados")).toBeVisible();
    await expect(page.getByTestId("summary-total")).toHaveText("R$ 24,00");
    await expect(page).toHaveURL(/\/checkout/);

    await page.getByTestId("place-order").click();
    await expect(page).toHaveURL(/\/pedido\//);
    await expect(page.getByTestId("order-total")).toHaveText("R$ 24,00");
  });

  test("produto esgota durante o checkout: carrinho é ajustado e nada é cobrado", async ({ page }) => {
    const product = await createTestProduct({ stock: 3, priceCents: 2000 });
    await addToCartFromProductPage(page, product);
    await goToCheckout(page);
    await fillCustomer(page, uniqueMobile());
    await page.getByRole("radio", { name: /Retirada/ }).check();
    // Outro cliente compra tudo antes.
    const payload = await orderPayload({ items: [{ productId: product.id, quantity: 3 }], expectedTotalCents: 6000 });
    expect((await callFunction("create-order", payload)).status).toBe(201);

    await page.getByTestId("place-order").click();
    await expect(page.getByText("Carrinho atualizado")).toBeVisible();
    await expect(page.getByText("Seu carrinho está vazio")).toBeVisible();
    expect(await getStock(product.id)).toBe(0);
  });
});
