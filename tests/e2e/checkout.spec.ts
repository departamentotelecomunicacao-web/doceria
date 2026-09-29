import { addToCartFromProductPage, createTestProduct, expect, fillCustomer, rest, setPrice, stock, test, uniqueMobile, signIn } from "./fixtures";

async function goToCheckout(page: import("@playwright/test").Page) {
  await page.goto("/carrinho");
  await page.getByTestId("go-to-checkout").click();
  await expect(page.getByRole("heading", { name: "Finalizar pedido" })).toBeVisible();
}

async function countOrdersForPhone(phoneDigits: string) {
  const token = await signIn("owner@doceria.local");
  const result = await rest<{ id: string }[]>(`orders?select=id&customer_phone=eq.%2B55${phoneDigits}`, { token });
  return result.body.length;
}

test.describe("checkout", () => {
  test("retirada com PIX: pedido criado e página do pedido com chave PIX e WhatsApp", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    await addToCartFromProductPage(page, product, 2);
    await goToCheckout(page);
    await fillCustomer(page, uniqueMobile());
    await page.getByRole("radio", { name: /PIX/ }).check();
    await expect(page.getByTestId("summary-total")).toHaveText("R$ 50,00");
    await page.getByTestId("place-order").click();

    await expect(page).toHaveURL(/\/pedido\/[a-f0-9]{48}\?novo=1/);
    await expect(page.getByTestId("order-created")).toBeVisible();
    await expect(page.getByTestId("order-status")).toHaveText("Aguardando pagamento");
    await expect(page.getByTestId("order-total")).toHaveText("R$ 50,00");
    await expect(page.getByTestId("pix-key")).toHaveText("pix@doceria.local");
    const code = (await page.getByTestId("order-code").textContent())!.replace("#", "");
    const whatsapp = page.getByTestId("send-whatsapp");
    const href = decodeURIComponent((await whatsapp.getAttribute("href"))!);
    expect(href).toContain(`Olá! Gostaria de fazer o pedido #${code}.`);
    expect(href).toContain(`2x ${product.name}`);
    expect(href).toContain("Total: R$ 50,00");

    // Reserva feita no servidor.
    expect(await stock(product.id)).toEqual({ stock_available: 3, stock_reserved: 2 });
    // Evento order_created uma única vez; purchase não (pagamento pendente).
    const events = await page.evaluate(() =>
      ((window as unknown as { __doceriaEvents?: { event: string }[] }).__doceriaEvents ?? []).map((e) => e.event));
    expect(events.filter((e) => e === "purchase")).toHaveLength(0);
    expect(events.filter((e) => e === "order_created")).toHaveLength(1);
    // Carrinho limpo.
    await expect(page.getByTestId("cart-count")).toHaveText("0");
  });

  test("entrega: CEP preenche o endereço e o frete é calculado pela rota", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    await addToCartFromProductPage(page, product);
    await goToCheckout(page);
    await fillCustomer(page, uniqueMobile());
    await page.getByRole("radio", { name: /Entrega/ }).check();
    await page.getByLabel("CEP").fill("29300-500");
    await expect(page.getByLabel("Rua")).toHaveValue("Rua Exemplo do CEP");
    await expect(page.getByLabel("Bairro")).toHaveValue("Gilberto Machado");
    await page.getByLabel("Número").fill(String(Date.now()).slice(-4));

    await expect(page.getByTestId("delivery-quote")).toContainText("Entrega: R$ 7,00");
    await expect(page.getByTestId("delivery-quote")).toContainText("4,2 km");
    await expect(page.getByTestId("summary-delivery")).toHaveText("R$ 7,00");
    await expect(page.getByTestId("summary-total")).toHaveText("R$ 32,00");
    await page.getByRole("radio", { name: /Dinheiro/ }).check();
    await page.getByTestId("place-order").click();

    await expect(page).toHaveURL(/\/pedido\//);
    await expect(page.getByTestId("order-total")).toHaveText("R$ 32,00");
    await expect(page.getByText("Rua Exemplo do CEP", { exact: false })).toBeVisible();
    await expect(page.getByTestId("order-status")).toHaveText("Novo");
  });

  test("API de mapas indisponível: mensagem clara e opção de WhatsApp", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    await addToCartFromProductPage(page, product);
    await goToCheckout(page);
    await fillCustomer(page);
    await page.getByRole("radio", { name: /Entrega/ }).check();
    await page.getByLabel("CEP").fill("29300-000");
    await page.getByLabel("Rua").fill("Rua Falha Geral");
    await page.getByLabel("Número").fill("10");
    await page.getByLabel("Bairro").fill("Centro");

    await expect(page.getByText("Não foi possível calcular a entrega automaticamente.")).toBeVisible();
    await expect(page.getByTestId("whatsapp-fallback")).toHaveAttribute("href", /wa\.me\/5528999990000\?text=/);
    await expect(page.getByTestId("place-order")).toBeDisabled();
    await page.getByRole("button", { name: "Mudar para retirada" }).click();
    await expect(page.getByTestId("place-order")).toBeEnabled();
  });

  test("fora da área de entrega oferece retirada", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    await addToCartFromProductPage(page, product);
    await goToCheckout(page);
    await fillCustomer(page);
    await page.getByRole("radio", { name: /Entrega/ }).check();
    await page.getByLabel("CEP").fill("29300-000");
    await page.getByLabel("Rua").fill("Estrada Longe");
    await page.getByLabel("Número").fill("1");
    await page.getByLabel("Bairro").fill("Itaoca");
    await expect(page.getByText("Fora da nossa área de entrega")).toBeVisible();
    await expect(page.getByTestId("place-order")).toBeDisabled();
  });

  test("duplo clique no botão cria um único pedido", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2500 });
    const phone = uniqueMobile();
    await addToCartFromProductPage(page, product);
    await goToCheckout(page);
    await fillCustomer(page, phone);
    await page.getByTestId("place-order").dblclick();
    await expect(page).toHaveURL(/\/pedido\//);
    expect(await countOrdersForPhone(phone.replace(/\D/g, ""))).toBe(1);
    expect(await stock(product.id)).toEqual({ stock_available: 4, stock_reserved: 1 });
  });

  test("preço alterado durante o checkout exige confirmar o novo total", async ({ page }) => {
    const product = await createTestProduct({ stock: 5, priceCents: 2000 });
    await addToCartFromProductPage(page, product);
    await goToCheckout(page);
    await fillCustomer(page, uniqueMobile());
    await expect(page.getByTestId("summary-total")).toHaveText("R$ 20,00");

    await setPrice(product.id, 2400);
    await page.getByTestId("place-order").click();
    await expect(page.getByText("Os valores foram atualizados")).toBeVisible();
    await expect(page.getByText("R$ 24,00").first()).toBeVisible();
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
    // Outro cliente compra tudo antes.
    const other = await import("../helpers/local");
    const payload = await other.orderPayload({ items: [{ productId: product.id, quantity: 3 }], expectedTotalCents: 6000 });
    expect((await other.callFunction("create-order", payload)).status).toBe(201);

    await page.getByTestId("place-order").click();
    // O carrinho é corrigido com aviso e nenhum pedido novo é criado.
    await expect(page.getByText("Carrinho atualizado")).toBeVisible();
    await expect(page.getByText("Seu carrinho está vazio")).toBeVisible();
    expect(await stock(product.id)).toEqual({ stock_available: 0, stock_reserved: 3 });
  });
});
