// Cliente mínimo para PostgREST e GoTrue usando fetch (sem dependências).
// Usa a chave secreta/service_role, disponível somente no ambiente da função.

import { AppError, appErrorFromPostgrest, type PostgrestErrorBody } from "./errors.ts";
import type { EnvGetter } from "./http.ts";

export interface DbConfig {
  url: string;
  key: string;
}

/** Prefere as novas chaves secretas (sb_secret_...) e recorre à service_role legada. */
export function dbConfigFromEnv(getEnv: EnvGetter): DbConfig {
  const url = getEnv("SUPABASE_URL");
  let key: string | undefined;
  const secretKeys = getEnv("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, string>;
      key = parsed.default ?? Object.values(parsed)[0];
    } catch {
      key = undefined;
    }
  }
  key = key || getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL e a chave secreta precisam estar configurados na Edge Function.");
  }
  return { url: url.replace(/\/$/, ""), key };
}

export class Db {
  constructor(private readonly config: DbConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      apikey: this.config.key,
      "Content-Type": "application/json",
      ...extra,
    };
    if (this.config.key.startsWith("eyJ")) headers.Authorization = `Bearer ${this.config.key}`;
    return headers;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.url}${path}`, init);
    } catch {
      throw AppError.unavailable();
    }
    const text = await response.text();
    if (!response.ok) {
      let body: PostgrestErrorBody | null = null;
      try {
        body = text ? (JSON.parse(text) as PostgrestErrorBody) : null;
      } catch {
        body = null;
      }
      throw appErrorFromPostgrest(response.status, body);
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.request<T>(`/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(args),
    });
  }

  select<T>(table: string, query: string): Promise<T[]> {
    return this.request<T[]>(`/rest/v1/${table}?${query}`, {
      method: "GET",
      headers: this.headers(),
    });
  }

  async insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
    const rows = await this.request<T[]>(`/rest/v1/${table}`, {
      method: "POST",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(row),
    });
    return rows[0];
  }

  async update(table: string, query: string, patch: Record<string, unknown>): Promise<void> {
    await this.request<unknown>(`/rest/v1/${table}?${query}`, {
      method: "PATCH",
      headers: this.headers({ Prefer: "return=minimal" }),
      body: JSON.stringify(patch),
    });
  }

  // ---------------------------------------------------------------------------
  // Auth (GoTrue)
  // ---------------------------------------------------------------------------
  private async authRequest<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.url}/auth/v1${path}`, init);
    } catch {
      throw AppError.unavailable();
    }
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = String(body?.msg ?? body?.message ?? body?.error_description ?? "");
      throw new AuthApiError(response.status, body?.error_code ?? body?.code ?? "auth_error", message);
    }
    return body as T;
  }

  /** Valida o JWT do usuário e devolve o id (sub). */
  async getUserFromJwt(jwt: string): Promise<{ id: string; email?: string } | null> {
    try {
      return await this.authRequest<{ id: string; email?: string }>("/user", {
        method: "GET",
        headers: { apikey: this.config.key, Authorization: `Bearer ${jwt}` },
      });
    } catch (error) {
      if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) return null;
      throw error;
    }
  }

  adminCreateUser(input: { email: string; password: string; fullName: string }) {
    return this.authRequest<{ id: string; email: string }>("/admin/users", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { full_name: input.fullName },
      }),
    });
  }

  adminUpdateUser(id: string, patch: Record<string, unknown>) {
    return this.authRequest<{ id: string }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(patch),
    });
  }

  adminListUsers(page = 1, perPage = 200) {
    return this.authRequest<{ users: Array<{ id: string; email: string; last_sign_in_at: string | null; banned_until?: string | null }> }>(
      `/admin/users?page=${page}&per_page=${perPage}`,
      { method: "GET", headers: this.headers() },
    );
  }
}

export class AuthApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "AuthApiError";
  }
}
