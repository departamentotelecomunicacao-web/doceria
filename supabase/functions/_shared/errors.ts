// Erro de aplicação com código estável (para o frontend) e mensagem em
// português pronta para o cliente final. Nunca carrega stack trace ao cliente.

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }

  static internal(): AppError {
    return new AppError(
      500,
      "INTERNAL_ERROR",
      "Não foi possível concluir agora. Tente novamente em instantes.",
    );
  }

  static unavailable(): AppError {
    return new AppError(
      503,
      "SERVICE_UNAVAILABLE",
      "Nosso sistema está temporariamente indisponível. Tente novamente em instantes.",
    );
  }
}

export interface PostgrestErrorBody {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Converte o erro do PostgREST/Postgres em AppError. Erros de negócio usam
 * SQLSTATE PTxxx (xxx = HTTP), message = código e detail = texto em português.
 */
export function appErrorFromPostgrest(status: number, body: PostgrestErrorBody | null): AppError {
  const code = body?.code ?? "";
  if (/^PT\d{3}$/.test(code) && body?.message) {
    let data: Record<string, unknown> | undefined;
    if (body.hint) {
      try {
        const parsed = JSON.parse(body.hint);
        if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
      } catch {
        data = undefined;
      }
    }
    return new AppError(
      Number(code.slice(2)),
      body.message,
      body.details || "Não foi possível concluir a operação.",
      data,
    );
  }
  if (status >= 500 || status === 0) return AppError.unavailable();
  return AppError.internal();
}
