import { test as base, expect, type Page } from "@playwright/test";
import { callFunction, createTestProduct, getStock, orderPayload, rest, service, signIn, type TestProduct } from "../helpers/local";

export { expect };
export { callFunction, createTestProduct, getStock, orderPayload, rest, service, signIn };
export type { TestProduct };

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    await use(page);
  },
});

export async function addToCartFromProductPage(page: Page, product: TestProduct, quantity = 1) {
  await page.goto(`/produto/${product.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
  for (let i = 1; i < quantity; i++) await page.getByRole("button", { name: "Aumentar quantidade" }).click();
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
}

export async function fillCustomer(page: Page, phone = "(28) 99911-2233") {
  await page.getByLabel("Nome", { exact: true }).fill("Cliente E2E");
  await page.getByLabel("WhatsApp", { exact: true }).fill(phone);
}

export async function adminLogin(page: Page, email = "dono@doceria.local") {
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: /E-mail/ }).fill(email);
  await page.getByLabel("Senha").fill("doceria-local-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/admin\/pedidos/);
}

export async function setPrice(productId: string, priceCents: number) {
  const token = await signIn("dono@doceria.local");
  await rest(`products?id=eq.${productId}`, { method: "PATCH", token, body: JSON.stringify({ price_cents: priceCents }) });
}

export function uniqueMobile(): string {
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  return `(27) 9${n.slice(0, 4)}-${n.slice(4)}`;
}
