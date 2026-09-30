import { describe, expect, it } from "vitest";
import { brl, escapeHtml, formatSchedule, type OrderEmailData, renderCustomerEmail, renderStoreEmail, statusEmailKind } from "./emails.ts";

const data: OrderEmailData = {
  storeName: "Doceria",
  storeWhatsapp: "+5528999990000",
  code: "K7Q3MA",
  customerName: "Ana <b>Souza</b>",
  customerPhone: "+5528999887766",
  customerEmail: "ana@example.com",
  status: "RECEIVED",
  fulfillmentType: "DELIVERY",
  address: { street: "Rua A", number: "10", district: "Centro", complement: "Apto 2", reference: null },
  deliveryCity: "Cachoeiro de Itapemirim - ES",
  pickupAddress: null,
  scheduledDate: "2026-10-01",
  scheduledPeriod: "AFTERNOON",
  paymentMethod: "PIX",
  isPaid: false,
  cashChangeForCents: null,
  items: [{ name: "Cookie Clássico", quantity: 3, unitPriceCents: 1200, lineTotalCents: 3600 }],
  subtotalCents: 3600,
  deliveryFeeCents: 500,
  totalCents: 4100,
  notes: "Portão azul",
  pix: { key: "pix@doceria.com", holder: "Doceria" },
  orderUrl: "https://loja.exemplo/pedido/abc",
};

describe("e-mails de pedido", () => {
  it("formata dinheiro e agenda sem depender de Intl", () => {
    expect(brl(4100)).toBe("R$ 41,00");
    expect(brl(123456)).toBe("R$ 1.234,56");
    expect(formatSchedule("2026-10-01", "AFTERNOON")).toBe("quinta-feira, 01/10, período da tarde");
  });

  it("confirmação ao cliente com itens, total, PIX e link", () => {
    const email = renderCustomerEmail("ORDER_RECEIVED", data);
    expect(email.subject).toBe("Recebemos seu pedido #K7Q3MA");
    expect(email.html).toContain("3x Cookie Clássico");
    expect(email.html).toContain("R$ 41,00");
    expect(email.html).toContain("pix@doceria.com");
    expect(email.html).toContain("https://loja.exemplo/pedido/abc");
    expect(email.html).toContain("wa.me/5528999990000");
  });

  it("escapa HTML vindo do cliente", () => {
    const email = renderCustomerEmail("ORDER_RECEIVED", data);
    expect(email.html).not.toContain("<b>Souza</b>");
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
  });

  it("não mostra PIX quando já está pago ou cancelado", () => {
    expect(renderCustomerEmail("ORDER_CONFIRMED", { ...data, isPaid: true }).html).not.toContain("pix@doceria.com");
    expect(renderCustomerEmail("ORDER_CANCELED", { ...data, status: "CANCELED" }).html).not.toContain("pix@doceria.com");
  });

  it("aviso para a loja traz contato, endereço completo e observação", () => {
    const email = renderStoreEmail(data);
    expect(email.subject).toBe("Novo pedido #K7Q3MA · R$ 41,00 · entrega em Centro");
    expect(email.html).toContain("(28) 99988-7766");
    expect(email.html).toContain("Apto 2");
    expect(email.html).toContain("Portão azul");
    expect(email.html).not.toContain("pix@doceria.com");
  });

  it("só alguns status geram e-mail ao cliente", () => {
    expect(statusEmailKind("CONFIRMED")).toBe("ORDER_CONFIRMED");
    expect(statusEmailKind("READY_FOR_PICKUP")).toBe("ORDER_READY_FOR_PICKUP");
    expect(statusEmailKind("PREPARING")).toBeNull();
    expect(statusEmailKind("DELIVERED")).toBeNull();
  });
});
