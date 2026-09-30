import { env } from "./env";
import { ApiError } from "./errors";

interface FunctionErrorBody {
  error?: { code?: string; message?: string; data?: Record<string, unknown> | null };
}

/**
 * Chama uma Edge Function com timeout e tratamento de erro padronizado.
 * O corpo de erro das funções sempre tem { error: { code, message, data } }.
 */
export async function callFunction<T>(
  name: string,
  body: unknown,
  options: { accessToken?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  options.signal?.addEventListener("abort", () => controller.abort());

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: env.supabaseKey,
  };
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${env.supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    throw new ApiError(0, aborted ? "TIMEOUT" : "NETWORK_ERROR",
      aborted
        ? "O servidor demorou para responder. Tente novamente."
        : "Sem conexão com a internet ou servidor indisponível. Verifique sua conexão e tente novamente.");
  } finally {
    clearTimeout(timeout);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = (payload as FunctionErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? (response.status >= 500 ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR"),
      error?.message ?? "Não foi possível concluir agora. Tente novamente em instantes.",
      error?.data ?? null,
    );
  }
  return payload as T;
}
