// Utilitários HTTP das Edge Functions (sem dependências externas).

import { AppError } from "./errors.ts";

export type EnvGetter = (name: string) => string | undefined;

export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/** CORS restrito às origens configuradas em ALLOWED_ORIGINS. */
export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (origin && allowed.includes(origin.replace(/\/$/, ""))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function errorResponse(error: AppError, headers: Record<string, string> = {}): Response {
  return jsonResponse(
    { error: { code: error.code, message: error.message, data: error.data ?? null } },
    error.status,
    headers,
  );
}

/** Lê JSON com limite de tamanho (evita corpos gigantes). */
export async function readJsonBody(req: Request, maxBytes = 16_384): Promise<unknown> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Formato de requisição inválido.");
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new AppError(413, "PAYLOAD_TOO_LARGE", "Requisição muito grande.");
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new AppError(413, "PAYLOAD_TOO_LARGE", "Requisição muito grande.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, "INVALID_JSON", "Dados inválidos.");
  }
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? req.headers.get("cf-connecting-ip") ?? "unknown";
}

/** Log estruturado. Nunca registre nome, telefone, e-mail ou endereço. */
export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
}

/**
 * Envolve o handler com CORS, restrição de método e tratamento de erros.
 * Erros inesperados viram uma mensagem genérica em português (sem stack trace).
 */
export function createHandler(
  getEnv: EnvGetter,
  name: string,
  handler: (req: Request, cors: Record<string, string>) => Promise<Response>,
): (req: Request) => Promise<Response> {
  const allowed = parseAllowedOrigins(getEnv("ALLOWED_ORIGINS"));
  return async (req: Request) => {
    const cors = corsHeaders(req.headers.get("origin"), allowed);
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (req.method !== "POST") {
      return errorResponse(new AppError(405, "METHOD_NOT_ALLOWED", "Método não permitido."), cors);
    }
    const startedAt = Date.now();
    try {
      const response = await handler(req, cors);
      log(`${name}.done`, { status: response.status, ms: Date.now() - startedAt });
      return response;
    } catch (error) {
      if (error instanceof AppError) {
        log(`${name}.rejected`, { status: error.status, code: error.code, ms: Date.now() - startedAt });
        return errorResponse(error, cors);
      }
      log(`${name}.error`, {
        ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      });
      return errorResponse(AppError.internal(), cors);
    }
  };
}
