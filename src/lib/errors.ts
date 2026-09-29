// Erros padronizados para a interface. O cliente final nunca vê mensagens
// técnicas, "undefined" ou stack trace: sempre uma frase clara em português.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly data: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const FRIENDLY: Record<string, string> = {
  NETWORK_ERROR: "Sem conexão com a internet ou servidor indisponível. Verifique sua conexão e tente novamente.",
  TIMEOUT: "O servidor demorou para responder. Tente novamente.",
  SERVICE_UNAVAILABLE: "Nosso sistema está temporariamente indisponível. Tente novamente em instantes.",
  INTERNAL_ERROR: "Não foi possível concluir agora. Tente novamente em instantes.",
  RATE_LIMITED: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  OUT_OF_STOCK: "Um ou mais produtos acabaram de esgotar. Ajustamos seu carrinho.",
  PRODUCT_UNAVAILABLE: "Um ou mais produtos não estão mais disponíveis.",
  PRICE_CHANGED: "Os valores foram atualizados. Confira o novo total antes de confirmar.",
  ROUTING_UNAVAILABLE: "Não foi possível calcular a entrega automaticamente.",
  DELIVERY_NOT_CONFIGURED: "Não foi possível calcular a entrega automaticamente.",
  AUTH_REQUIRED: "Sua sessão expirou. Entre novamente.",
  FORBIDDEN: "Você não tem permissão para esta ação.",
  "42501": "Você não tem permissão para esta ação.",
  PGRST301: "Sua sessão expirou. Entre novamente.",
};

export function friendlyMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message && !/^[A-Z_]+$/.test(error.message)
      ? error.message
      : FRIENDLY[error.code] ?? FRIENDLY.INTERNAL_ERROR;
  }
  return FRIENDLY.INTERNAL_ERROR;
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
}

/**
 * Converte erros do supabase-js (PostgREST) em ApiError. Funções do banco
 * usam SQLSTATE PTxxx, message = código e details = texto amigável.
 */
export function fromPostgrest(error: PostgrestLikeError | null | undefined, status = 400): ApiError {
  const code = error?.code ?? "";
  if (/^PT\d{3}$/.test(code) && error?.message) {
    let data: Record<string, unknown> | null = null;
    if (error.hint) {
      try {
        data = JSON.parse(error.hint) as Record<string, unknown>;
      } catch {
        data = null;
      }
    }
    return new ApiError(Number(code.slice(2)), error.message, error.details || FRIENDLY.INTERNAL_ERROR, data);
  }
  if (code === "PGRST301" || code === "PGRST303" || /JWT/i.test(error?.message ?? "")) {
    return new ApiError(401, "AUTH_REQUIRED", FRIENDLY.AUTH_REQUIRED);
  }
  if (code === "42501") return new ApiError(403, "FORBIDDEN", FRIENDLY.FORBIDDEN);
  if (code === "23505") return new ApiError(409, "DUPLICATE", "Já existe um registro com esses dados (ex.: mesmo endereço/slug).");
  if (code === "23503") return new ApiError(409, "IN_USE", "Este registro está em uso (ex.: produto com vendas). Desative em vez de excluir.");
  if (code === "23514" || code === "22P02" || code === "23P01") {
    return new ApiError(400, "INVALID_DATA", "Alguns dados estão fora do formato permitido. Revise os campos.");
  }
  if (!code && /fetch|network|Failed to fetch/i.test(error?.message ?? "")) {
    return new ApiError(0, "NETWORK_ERROR", FRIENDLY.NETWORK_ERROR);
  }
  return new ApiError(status >= 500 ? 503 : status, "INTERNAL_ERROR", FRIENDLY.INTERNAL_ERROR);
}
