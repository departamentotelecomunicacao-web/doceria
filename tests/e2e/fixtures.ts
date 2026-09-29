import { test as base, expect, type Page } from "@playwright/test";
import { callFunction, createTestProduct, orderPayload, rest, signIn, type TestProduct } from "../helpers/local";

export { expect };
export { createTestProduct, callFunction, orderPayload, rest, signIn };
export type { TestProduct };

// ViaCEP é externo: nos testes respondemos com dados fixos (determinismo).
const VIACEP: Record<string, unknown> = {
  "29300500": { logradouro: "Rua Exemplo do CEP", bairro: "Gilberto Machado", localidade: "Cachoeiro de Itapemirim", uf: "ES" },
};

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    await page.route("**://viacep.com.br/**", async (route) => {
      const cep = route.request().url().match(/ws\/(\d{8})/)?.[1] ?? "";
      await route.fulfill({ json: VIACEP[cep] ?? { erro: true } });
    });
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
  await page.getByLabel("WhatsApp / telefone").fill(phone);
}

export async function adminLogin(page: Page, email = "owner@doceria.local") {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("doceria-local-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/admin\/dashboard/);
}

export async function stock(productId: string) {
  const token = await signIn("owner@doceria.local");
  const result = await rest<{ stock_available: number; stock_reserved: number }[]>(
    `products?select=stock_available,stock_reserved&id=eq.${productId}`, { token },
  );
  return result.body[0];
}

export async function setPrice(productId: string, priceCents: number) {
  const token = await signIn("owner@doceria.local");
  await rest(`products?id=eq.${productId}`, { method: "PATCH", token, body: JSON.stringify({ price_cents: priceCents }) });
}

export async function adjustStock(productId: string, quantity: number) {
  const token = await signIn("owner@doceria.local");
  const result = await rest("rpc/inventory_adjust", {
    method: "POST",
    token,
    body: JSON.stringify({ p_product_id: productId, p_type: "ADJUSTMENT", p_quantity: quantity, p_reason: "Teste E2E" }),
  });
  if (result.status !== 200) throw new Error(JSON.stringify(result.body));
}

export function uniqueMobile(): string {
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  return `(27) 9${n.slice(0, 4)}-${n.slice(4)}`;
}
