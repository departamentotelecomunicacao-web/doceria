import { createTestProduct, expect, test } from "./fixtures";

// Simula a página do Wix com o cardápio em iframe (sandbox parecido com o do
// elemento HTML do Wix) e verifica que nada depende do domínio pai.
test.describe("cardápio incorporado (Wix)", () => {
  test("carrega no iframe, mede a altura e abre a loja para comprar", async ({ page, context }) => {
    // Ordem negativa: aparece entre os primeiros do cardápio incorporado.
    const product = await createTestProduct({ stock: 5, priceCents: 2500, sortOrder: -1 });
    await page.setContent(`
      <html><body style="margin:0;background:#fff">
        <h1>Site institucional</h1>
        <iframe id="cardapio" src="http://127.0.0.1:4173/embed?limite=6" style="width:100%;height:600px;border:0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"></iframe>
        <script>
          window.received = [];
          window.addEventListener("message", (e) => { if (e.data && e.data.source === "doceria-embed") window.received.push(e.data); });
        </script>
      </body></html>`);
    const frame = page.frameLocator("#cardapio");
    await expect(frame.getByTestId("product-card").first()).toBeVisible();
    await expect(frame.locator("header")).toHaveCount(0);

    await expect.poll(async () => page.evaluate(() => (window as unknown as { received: { type: string; height?: number }[] }).received.map((m) => m.type))).toContain("RESIZE");
    const height = await page.evaluate(() => (window as unknown as { received: { type: string; height?: number }[] }).received.find((m) => m.type === "RESIZE")?.height ?? 0);
    expect(height).toBeGreaterThan(200);

    const buy = frame.locator(`[data-testid="product-card"][data-product-slug="${product.slug}"]`).getByRole("link", { name: /Comprar/ });
    await expect(buy).toHaveAttribute("target", "_blank");
    await expect(buy).toHaveAttribute("href", new RegExp(`/produto/${product.slug}\\?adicionar=1`));
    const [popup] = await Promise.all([context.waitForEvent("page"), buy.click()]);
    await popup.waitForURL(/\/carrinho/);
    await expect(popup.getByTestId("cart-line")).toHaveCount(1);
    await popup.close();

    const types = await page.evaluate(() => (window as unknown as { received: { type: string }[] }).received.map((m) => m.type));
    expect(types).toEqual(expect.arrayContaining(["READY", "ADD_TO_CART", "OPEN_STORE"]));
  });

  test("funciona mesmo sem acesso a armazenamento (sandbox restrito)", async ({ page }) => {
    await page.setContent(`<iframe id="c" src="http://127.0.0.1:4173/embed?limite=2&fundo=creme" style="width:100%;height:500px;border:0" sandbox="allow-scripts allow-popups"></iframe>`);
    await expect(page.frameLocator("#c").getByTestId("product-card")).toHaveCount(2);
  });

  test("painel se recusa a abrir dentro de iframe", async ({ page }) => {
    await page.setContent(`<iframe id="a" src="http://127.0.0.1:4173/admin/login" style="width:100%;height:500px;border:0"></iframe>`);
    await expect(page.frameLocator("#a").getByText("o painel não pode ser aberto dentro de outro site")).toBeVisible();
  });
});
