// Envio de e-mail pelo servidor usando a API REST do EmailJS (a mesma conta
// usada na loja de planos). O conteúdo é montado aqui (emails.ts) e enviado
// para UM modelo genérico do EmailJS com os campos:
//   {{to_email}}, {{to_name}}, {{subject}}, {{{content_html}}}, {{reply_to}}, {{from_name}}
// Como sai do servidor, só é enviado e-mail de pedido real (ninguém usa o
// site para disparar mensagens em nome da loja).

import type { EnvGetter } from "./http.ts";

export interface EmailMessage {
  to: string;
  toName: string;
  subject: string;
  html: string;
  replyTo?: string | null;
  fromName: string;
}

export type EmailResult = { ok: true } | { ok: false; error: string };

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailResult>;
}

export interface EmailJsConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey: string;
  endpoint: string;
  timeoutMs: number;
}

export const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";

export class EmailJsSender implements EmailSender {
  constructor(private readonly config: EmailJsConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchImpl(this.config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          service_id: this.config.serviceId,
          template_id: this.config.templateId,
          user_id: this.config.publicKey,
          accessToken: this.config.privateKey,
          template_params: {
            to_email: message.to,
            to_name: message.toName,
            subject: message.subject,
            content_html: message.html,
            reply_to: message.replyTo ?? "",
            from_name: message.fromName,
          },
        }),
      });
      if (response.ok) return { ok: true };
      const text = (await response.text()).slice(0, 200);
      return { ok: false, error: `EmailJS ${response.status}: ${text}` };
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      return { ok: false, error: aborted ? "Tempo esgotado ao enviar o e-mail." : "Falha de rede ao enviar o e-mail." };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Devolve o remetente configurado ou null (e-mail desligado). */
export function emailSenderFromEnv(getEnv: EnvGetter, fetchImpl: typeof fetch = fetch): EmailSender | null {
  const serviceId = getEnv("EMAILJS_SERVICE_ID");
  const templateId = getEnv("EMAILJS_TEMPLATE_ID");
  const publicKey = getEnv("EMAILJS_PUBLIC_KEY");
  const privateKey = getEnv("EMAILJS_PRIVATE_KEY");
  if (!serviceId || !templateId || !publicKey || !privateKey) return null;
  return new EmailJsSender({
    serviceId,
    templateId,
    publicKey,
    privateKey,
    endpoint: getEnv("EMAILJS_ENDPOINT") || EMAILJS_ENDPOINT,
    timeoutMs: Number(getEnv("EMAIL_TIMEOUT_MS") ?? "") || 8000,
  }, fetchImpl);
}
