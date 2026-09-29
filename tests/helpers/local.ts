// Utilitários de teste para o stack local (supabase start + functions serve +
// stub de rotas). Nenhuma chave fica no repositório: são lidas do ambiente
// (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY) ou, se
// ausentes, do `supabase status` do projeto local.
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

function localStatus(): Record<string, string> {
  try {
    const output = execSync("npx --no-install supabase status -o json", { stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 }).toString();
    return JSON.parse(output.slice(output.indexOf("{"))) as Record<string, string>;
  } catch {
    throw new Error(
      "Stack local do Supabase não encontrado. Rode `supabase start` ou defina SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY.",
    );
  }
}

const needsStatus = !process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY || !process.env.SUPABASE_SECRET_KEY;
const status = needsStatus ? localStatus() : {};

export const SUPABASE_URL = process.env.SUPABASE_URL ?? status.API_URL;
export const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? status.PUBLISHABLE_KEY;
export const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? status.SECRET_KEY;
export const STUB_URL = process.env.ROUTES_STUB_URL ?? "http://127.0.0.1:54400";

export interface HttpResult<T = unknown> {
  status: number;
  body: T;
}

async function http<T>(url: string, init: RequestInit): Promise<HttpResult<T>> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body: body as T };
}

export function rest<T = unknown>(path: string, init: RequestInit & { key?: string; token?: string } = {}) {
  const { key = PUBLISHABLE_KEY, token, headers, ...rest } = init;
  return http<T>(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...rest,
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });
}

export const service = <T = unknown>(path: string, init: RequestInit = {}) => rest<T>(path, { ...init, key: SECRET_KEY });

export function callFunction<T = unknown>(name: string, body: unknown, token?: string) {
  return http<T>(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

export async function signIn(email: string, password = "doceria-local-123"): Promise<string> {
  const result = await http<{ access_token: string }>(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (result.status !== 200) throw new Error(`login falhou para ${email}: ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

export interface TestProduct {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  stock_available: number;
}

/** Cria um produto isolado para o teste (slug único). */
export async function createTestProduct(input: { stock: number; priceCents?: number; maxPerOrder?: number; name?: string; sortOrder?: number }): Promise<TestProduct> {
  const suffix = randomUUID().slice(0, 8);
  const result = await service<TestProduct[]>("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      name: input.name ?? `Teste ${suffix}`,
      slug: `teste-${suffix}`,
      price_cents: input.priceCents ?? 2500,
      stock_available: input.stock,
      max_per_order: input.maxPerOrder ?? 24,
      low_stock_threshold: 1,
      sort_order: input.sortOrder ?? 100,
      short_description: "Produto criado por teste automatizado",
    }),
  });
  if (result.status !== 201) throw new Error(`falha ao criar produto: ${JSON.stringify(result.body)}`);
  return result.body[0];
}

export async function getStock(productId: string) {
  const result = await service<{ stock_available: number; stock_reserved: number }[]>(`products?select=stock_available,stock_reserved&id=eq.${productId}`);
  return result.body[0];
}

export async function firstSlot(type: "PICKUP" | "DELIVERY"): Promise<string> {
  const result = await rest<{ start: string }[]>("rpc/get_fulfillment_slots", { method: "POST", body: JSON.stringify({ p_type: type }) });
  if (!result.body?.length) throw new Error("sem janelas disponíveis no seed");
  return result.body[0].start;
}

export function uniquePhone(): string {
  const digits = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  return `(28) 9${digits.slice(0, 4)}-${digits.slice(4)}`;
}

export function newKey(): string {
  return randomUUID();
}

export async function orderPayload(input: {
  items: { productId: string; quantity: number }[];
  expectedTotalCents: number;
  type?: "PICKUP" | "DELIVERY";
  paymentMethod?: "PIX" | "CASH" | "CARD";
  address?: Record<string, string>;
  key?: string;
  phone?: string;
}) {
  const type = input.type ?? "PICKUP";
  return {
    idempotencyKey: input.key ?? newKey(),
    customer: { name: "Cliente de Teste", phone: input.phone ?? uniquePhone(), email: null },
    fulfillment: { type, scheduledFor: await firstSlot(type), ...(input.address ? { address: input.address } : {}) },
    items: input.items,
    paymentMethod: input.paymentMethod ?? "CASH",
    expectedTotalCents: input.expectedTotalCents,
  };
}

export function address(neighborhood: string, street = "Rua dos Testes", number = String(Math.floor(Math.random() * 9000) + 100)) {
  return { cep: "29300-000", street, number, neighborhood, city: "Cachoeiro de Itapemirim", state: "ES" };
}

export async function stubRequests(): Promise<number> {
  const response = await fetch(`${STUB_URL}/__stats`);
  return ((await response.json()) as { requests: number }).requests;
}
