// Cliente mínimo do PostgREST para a loja pública (sem supabase-js no bundle
// inicial). Usa apenas a chave publicável; RLS decide o que é visível.
import { env } from "./env";
import { ApiError, fromPostgrest } from "./errors";

function headers(): Record<string, string> {
  return { apikey: env.supabaseKey, Accept: "application/json", "Content-Type": "application/json" };
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { ...headers(), ...(init.headers ?? {}) } });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Sem conexão com a internet ou servidor indisponível. Verifique sua conexão e tente novamente.");
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw fromPostgrest(body as { code?: string; message?: string; details?: string; hint?: string } | null, response.status);
  }
  return body as T;
}

export function restSelect<T>(table: string, params: Record<string, string>): Promise<T[]> {
  const query = new URLSearchParams(params).toString();
  return request<T[]>(`${env.supabaseUrl}/rest/v1/${table}?${query}`, { method: "GET" });
}

export function restRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return request<T>(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
}

/** URL pública de um arquivo do bucket de imagens de produto. */
export function productImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${env.supabaseUrl}/storage/v1/object/public/product-images/${path.split("/").map(encodeURIComponent).join("/")}`;
}
