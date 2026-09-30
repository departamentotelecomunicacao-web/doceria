// Hash e rate limit. O IP nunca é gravado em texto: somente o hash com sal.

import { AppError } from "./errors.ts";
import type { Db } from "./db.ts";

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function requesterHash(ip: string, salt: string | undefined): Promise<string> {
  return (await sha256Hex(`${salt ?? "doceria"}:${ip}`)).slice(0, 32);
}

export interface RateLimitRule {
  scope: string;
  limit: number;
  windowSeconds: number;
}

/** Janela fixa por hash de IP. Excedido: 429 com mensagem amigável. */
export async function enforceRateLimit(db: Db, rule: RateLimitRule, hash: string): Promise<void> {
  const allowed = await db.rpc<boolean>("rate_limit_hit", {
    p_key: `${rule.scope}:${hash}`,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });
  if (!allowed) {
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
    );
  }
}
