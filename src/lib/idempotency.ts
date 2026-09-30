// Chave de idempotência do checkout: gerada uma vez por "intenção de compra" e
// reutilizada em reenvios (duplo clique, timeout, refresh). Muda somente quando
// o conteúdo do pedido muda.
import { readJson, removeStorage, writeJson } from "./storage";

const KEY = "doceria:checkout-intent:v1";

interface Intent {
  fingerprint: string;
  key: string;
}

export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getIdempotencyKey(fingerprint: string): string {
  const intent = readJson<Intent | null>(KEY, null, "session");
  if (intent && intent.fingerprint === fingerprint) return intent.key;
  const key = newIdempotencyKey();
  writeJson(KEY, { fingerprint, key }, "session");
  return key;
}

export function clearIdempotencyKey(): void {
  removeStorage(KEY, "session");
}
