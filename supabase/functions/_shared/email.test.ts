import { describe, expect, it, vi } from "vitest";
import { EmailJsSender, emailSenderFromEnv } from "./email.ts";

const config = {
  serviceId: "service_x",
  templateId: "template_x",
  publicKey: "public_x",
  privateKey: "private_x",
  endpoint: "https://api.emailjs.com/api/v1.0/email/send",
  timeoutMs: 1000,
};
const message = { to: "ana@example.com", toName: "Ana", subject: "Oi", html: "<p>Oi</p>", fromName: "Doceria", replyTo: null };

describe("EmailJsSender", () => {
  it("envia para a API REST com chave privada e os campos do modelo", async () => {
    const fetchMock = vi.fn(async () => new Response("OK", { status: 200 }));
    const result = await new EmailJsSender(config, fetchMock as unknown as typeof fetch).send(message);
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(config.endpoint);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ service_id: "service_x", template_id: "template_x", user_id: "public_x", accessToken: "private_x" });
    expect(body.template_params).toMatchObject({ to_email: "ana@example.com", subject: "Oi", content_html: "<p>Oi</p>", reply_to: "" });
  });

  it("devolve falha sem lançar erro quando o EmailJS recusa", async () => {
    const fetchMock = vi.fn(async () => new Response("The Public Key is invalid", { status: 400 }));
    const result = await new EmailJsSender(config, fetchMock as unknown as typeof fetch).send(message);
    expect(result.ok).toBe(false);
  });

  it("devolve falha em erro de rede", async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const result = await new EmailJsSender(config, fetchMock as unknown as typeof fetch).send(message);
    expect(result).toEqual({ ok: false, error: "Falha de rede ao enviar o e-mail." });
  });

  it("sem as quatro chaves configuradas, o e-mail fica desligado", () => {
    expect(emailSenderFromEnv(() => undefined)).toBeNull();
    const env: Record<string, string> = { EMAILJS_SERVICE_ID: "s", EMAILJS_TEMPLATE_ID: "t", EMAILJS_PUBLIC_KEY: "p", EMAILJS_PRIVATE_KEY: "k" };
    expect(emailSenderFromEnv((name) => env[name])).not.toBeNull();
  });
});
