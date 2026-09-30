// Devolutiva por e-mail (EmailJS via stub local). O pedido nunca depende do
// e-mail: se o envio falhar, o pedido é criado e a falha fica registrada.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  callFunction,
  createTestProduct,
  emailsTo,
  failEmails,
  orderPayload,
  resetEmails,
  rest,
  sentEmails,
  service,
  signIn,
} from "../helpers/local";

type OrderResponse = { order: { orderId: string; code: string; publicToken: string; totalCents: number }; emailSent: boolean };
type NotifyResponse = { kind: string | null; status: "SENT" | "FAILED" | "SKIPPED"; reason?: string };

const uniqueEmail = () => `cliente-${randomUUID().slice(0, 8)}@example.com`;

async function notifications(orderId: string) {
  const result = await service<{ kind: string; status: string; recipient: string }[]>(
    `order_notifications?select=kind,status,recipient&order_id=eq.${orderId}&order=id`,
  );
  return result.body;
}

async function newOrder(email: string | null) {
  const product = await createTestProduct({ stock: null, priceCents: 1500 });
  const response = await callFunction<OrderResponse>("create-order", await orderPayload({
    items: [{ productId: product.id, quantity: 2 }], expectedTotalCents: 3500, type: "DELIVERY", paymentMethod: "PIX", email,
  }));
  expect(response.status).toBe(201);
  return response.body;
}

afterAll(async () => {
  await resetEmails();
  await service("store_settings?id=eq.true", { method: "PATCH", body: JSON.stringify({ email_customer_on_status: true }) });
});

describe("devolutiva por e-mail", () => {
  it("pedido com e-mail: confirmação ao cliente e aviso à loja", async () => {
    const email = uniqueEmail();
    const { order, emailSent } = await newOrder(email);
    expect(emailSent).toBe(true);

    const toCustomer = await emailsTo(email);
    expect(toCustomer).toHaveLength(1);
    expect(toCustomer[0].subject).toBe(`Recebemos seu pedido #${order.code}`);
    expect(toCustomer[0].content_html).toContain("R$ 35,00");
    expect(toCustomer[0].content_html).toContain(`/pedido/${order.publicToken}`);

    const toStore = (await emailsTo("pedidos@doceria.local")).filter((e) => e.subject.includes(order.code));
    expect(toStore).toHaveLength(1);
    expect(toStore[0].reply_to).toBe(email);

    const log = await notifications(order.orderId);
    expect(log.map((n) => `${n.kind}:${n.status}`).sort()).toEqual(["ORDER_RECEIVED:SENT", "STORE_NEW_ORDER:SENT"]);

    const publicOrder = await rest<{ emailSent: boolean }>("rpc/get_public_order", { method: "POST", body: JSON.stringify({ p_token: order.publicToken }) });
    expect(publicOrder.body.emailSent).toBe(true);
  });

  it("pedido sem e-mail: só a loja é avisada", async () => {
    const { order, emailSent } = await newOrder(null);
    expect(emailSent).toBe(false);
    const log = await notifications(order.orderId);
    expect(log.map((n) => n.kind)).toEqual(["STORE_NEW_ORDER"]);
  });

  it("EmailJS fora do ar não impede o pedido e a falha fica registrada", async () => {
    await failEmails();
    try {
      const { order, emailSent } = await newOrder(uniqueEmail());
      expect(emailSent).toBe(false);
      const log = await notifications(order.orderId);
      expect(log.every((n) => n.status === "FAILED")).toBe(true);
    } finally {
      await resetEmails();
    }
  });

  it("mudança de status avisa o cliente uma vez; reenvio manual funciona", async () => {
    const email = uniqueEmail();
    const { order } = await newOrder(email);
    const token = await signIn("atendente@doceria.local");

    await rest("rpc/admin_set_status", { method: "POST", token, body: JSON.stringify({ p_order_id: order.orderId, p_status: "CONFIRMED" }) });
    const first = await callFunction<NotifyResponse>("notify-order", { orderId: order.orderId, kind: "STATUS" }, token);
    expect(first.body).toEqual({ kind: "ORDER_CONFIRMED", status: "SENT" });
    const again = await callFunction<NotifyResponse>("notify-order", { orderId: order.orderId, kind: "STATUS" }, token);
    expect(again.body.status).toBe("SKIPPED");

    const resend = await callFunction<NotifyResponse>("notify-order", { orderId: order.orderId, kind: "RECEIVED", force: true }, token);
    expect(resend.body.status).toBe("SENT");

    const subjects = (await emailsTo(email)).map((e) => e.subject);
    expect(subjects).toEqual([
      `Recebemos seu pedido #${order.code}`,
      `Pedido #${order.code} confirmado`,
      `Recebemos seu pedido #${order.code}`,
    ]);
  });

  it("aviso de status desligado nas configurações", async () => {
    await service("store_settings?id=eq.true", { method: "PATCH", body: JSON.stringify({ email_customer_on_status: false }) });
    const { order } = await newOrder(uniqueEmail());
    const token = await signIn("atendente@doceria.local");
    await rest("rpc/admin_set_status", { method: "POST", token, body: JSON.stringify({ p_order_id: order.orderId, p_status: "CONFIRMED" }) });
    const result = await callFunction<NotifyResponse>("notify-order", { orderId: order.orderId, kind: "STATUS" }, token);
    expect(result.body.status).toBe("SKIPPED");
    await service("store_settings?id=eq.true", { method: "PATCH", body: JSON.stringify({ email_customer_on_status: true }) });
  });

  it("notify-order exige login da equipe e corpo válido", async () => {
    const before = (await sentEmails()).length;
    const anonymous = await callFunction("notify-order", { orderId: randomUUID(), kind: "STATUS" });
    expect(anonymous.status).toBe(401);
    const token = await signIn("atendente@doceria.local");
    const invalid = await callFunction("notify-order", { orderId: "x", kind: "STATUS" }, token);
    expect(invalid.status).toBe(400);
    const extra = await callFunction("notify-order", { orderId: randomUUID(), kind: "STATUS", to: "alguem@x.com" }, token);
    expect(extra.status).toBe(400);
    const missing = await callFunction("notify-order", { orderId: randomUUID(), kind: "STATUS" }, token);
    expect(missing.status).toBe(404);
    expect((await sentEmails()).length).toBe(before);
  });
});
