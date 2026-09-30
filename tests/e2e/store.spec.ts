import { addToCartFromProductPage, createTestProduct, expect, setPrice, test } from "./fixtures";

test.describe("loja", () => {
  test("cliente abre a loja e vê os produtos", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver cardápio", exact: true })).toBeVisible();
    await expect(page.getByTestId("product-card").first()).toBeVisible();

    await page.getByRole("link", { name: "Ver cardápio", exact: true }).click();
    await expect(page).toHaveURL(/\/produtos/);
    // A URL muda antes da troca de tela: espera o cardápio para não contar os destaques da página inicial.
    await expect(page.getByRole("heading", { level: 1, name: "Escolha seus cookies" })).toBeVisible();
    await expect.poll(() => page.getByTestId("product-card").count()).toBeGreaterThanOrEqual(5);

    await page.getByRole("tab", { name: /Caixas/ }).click();
    await expect(page).toHaveURL(/categoria=caixas/);
    await expect(page.getByTestId("product-card")).toHaveCount(1);
  });

  test("cliente adiciona produto, altera quantidade e remove", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    await addToCartFromProductPage(page, product);
    await expect(page.getByTestId("cart-count")).toHaveText("1");

    await page.goto("/carrinho");
    const line = page.locator(`[data-testid="cart-line"][data-product-slug="${product.slug}"]`);
    await expect(line.getByTestId("line-total")).toHaveText("R$ 25,00");
    await line.getByRole("button", { name: "Aumentar quantidade" }).click();
    await line.getByRole("button", { name: "Aumentar quantidade" }).click();
    await expect(line.getByTestId("line-total")).toHaveText("R$ 75,00");
    await line.getByRole("button", { name: "Diminuir quantidade" }).click();
    await expect(line.getByTestId("line-total")).toHaveText("R$ 50,00");
    await expect(page.getByTestId("cart-subtotal")).toHaveText("R$ 50,00");

    await line.getByRole("button", { name: "Remover" }).click();
    await expect(page.getByText("Seu carrinho está vazio")).toBeVisible();
  });

  test("quantidade não passa do estoque", async ({ page }) => {
    const product = await createTestProduct({ stock: 2, priceCents: 2500 });
    await addToCartFromProductPage(page, product, 2);
    await page.goto("/carrinho");
    const line = page.locator(`[data-testid="cart-line"][data-product-slug="${product.slug}"]`);
    await expect(line.getByRole("button", { name: "Aumentar quantidade" })).toBeDisabled();
  });

  test("produto esgotado aparece, mas não pode ser comprado", async ({ page }) => {
    const product = await createTestProduct({ stock: 0, name: `Esgotado ${Date.now()}` });
    await page.goto("/produtos");
    const card = page.locator(`[data-testid="product-card"][data-product-slug="${product.slug}"]`);
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: `${product.name} esgotado` })).toBeDisabled();

    await page.goto(`/produto/${product.slug}`);
    await expect(page.getByTestId("sold-out-notice")).toBeVisible();
    await expect(page.getByRole("button", { name: "Adicionar ao carrinho" })).toHaveCount(0);
  });

  test("preço alterado no painel aparece sem novo deploy", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 1300 });
    await page.goto(`/produto/${product.slug}`);
    await expect(page.getByText("R$ 13,00").first()).toBeVisible();
    await setPrice(product.id, 1500);
    await page.reload();
    await expect(page.getByText("R$ 15,00").first()).toBeVisible();
  });

  test("rotas funcionam ao abrir ou atualizar direto (GitHub Pages)", async ({ page }) => {
    const product = await createTestProduct({ stock: 3 });
    const checkout = await page.request.get("/checkout");
    expect(checkout.status()).toBe(200);
    const dynamic = await page.request.get(`/produto/${product.slug}`);
    expect(dynamic.status()).toBe(404); // cai no 404.html, que é o próprio app
    await page.goto(`/produto/${product.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
    await page.goto("/rota-que-nao-existe");
    await expect(page.getByText("Essa página saiu do forno antes da hora")).toBeVisible();
  });
});
