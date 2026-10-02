// Acesso a dados do painel. As regras (papéis, transições, estoque, totais)
// ficam no banco (RLS + funções); aqui só chamamos e tipamos.
import { ApiError, fromPostgrest } from "@/lib/errors";
import { callFunction } from "@/lib/functions";
import { getAdminClient } from "@/lib/supabase";
import type { AppRole, Category, DayPeriod, FulfillmentType, OrderStatus, PaymentMethod, Product } from "@/types/domain";

function client() {
  return getAdminClient();
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error, status } = await client().rpc(fn, args);
  if (error) throw fromPostgrest(error, status);
  return data as T;
}

async function accessToken(): Promise<string> {
  const { data } = await client().auth.getSession();
  if (!data.session) throw new ApiError(401, "AUTH_REQUIRED", "Sua sessão expirou. Entre novamente.");
  return data.session.access_token;
}

/** Início do dia (AAAA-MM-DD) em America/Sao_Paulo, em ISO/UTC. */
export function storeDayStartIso(date: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const offsetName = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", timeZoneName: "longOffset" })
    .formatToParts(probe)
    .find((part) => part.type === "timeZoneName")?.value ?? "GMT-03:00";
  const offset = offsetName.replace("GMT", "") || "+00:00";
  return new Date(`${date}T00:00:00${offset}`).toISOString();
}

// -----------------------------------------------------------------------------
// Pedidos
// -----------------------------------------------------------------------------
export interface OrderListRow {
  id: string;
  code: string;
  status: OrderStatus;
  fulfillment_type: FulfillmentType;
  payment_method: PaymentMethod;
  is_paid: boolean;
  customer_name: string;
  customer_phone: string;
  address_district: string | null;
  total_cents: number;
  scheduled_date: string;
  scheduled_period: DayPeriod;
  created_at: string;
}

export type OrderView = "open" | "today" | "all";

export interface OrderFilters {
  view: OrderView;
  today: string;
  search: string;
  page: number;
  pageSize: number;
}

const LIST_COLUMNS =
  "id,code,status,fulfillment_type,payment_method,is_paid,customer_name,customer_phone,address_district," +
  "total_cents,scheduled_date,scheduled_period,created_at";

export async function listOrders(filters: OrderFilters): Promise<{ rows: OrderListRow[]; total: number }> {
  let query = client().from("orders").select(LIST_COLUMNS, { count: "exact" });

  if (filters.view === "open") {
    query = query
      .in("status", ["RECEIVED", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"])
      .order("scheduled_date", { ascending: true })
      .order("scheduled_period", { ascending: true })
      .order("created_at", { ascending: true });
  } else if (filters.view === "today") {
    query = query.eq("scheduled_date", filters.today).order("scheduled_period").order("created_at");
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const term = filters.search.trim().replace(/[%,()]/g, " ").trim();
  if (term) {
    const digits = term.replace(/\D/g, "");
    const parts = [`code.ilike.%${term.toUpperCase()}%`, `customer_name.ilike.%${term}%`];
    if (digits.length >= 4) parts.push(`customer_phone.ilike.%${digits}%`);
    query = query.or(parts.join(","));
  }
  const fromIndex = filters.page * filters.pageSize;
  const { data, error, status, count } = await query.range(fromIndex, fromIndex + filters.pageSize - 1);
  if (error) throw fromPostgrest(error, status);
  return { rows: (data ?? []) as unknown as OrderListRow[], total: count ?? 0 };
}

export interface DaySummary {
  receivedToday: number;
  salesTodayCents: number;
  newOrders: number;
  scheduledToday: number;
}

/** Números do topo da tela de pedidos (hoje, horário de Brasília). */
export async function getDaySummary(today: string): Promise<DaySummary> {
  const [created, pending, scheduled] = await Promise.all([
    client().from("orders").select("total_cents,status").gte("created_at", storeDayStartIso(today)),
    client().from("orders").select("id", { count: "exact", head: true }).eq("status", "RECEIVED"),
    client().from("orders").select("id", { count: "exact", head: true })
      .eq("scheduled_date", today).not("status", "in", "(DELIVERED,CANCELED)"),
  ]);
  const error = created.error ?? pending.error ?? scheduled.error;
  if (error) throw fromPostgrest(error, created.status);
  const rows = (created.data ?? []) as { total_cents: number; status: OrderStatus }[];
  const valid = rows.filter((row) => row.status !== "CANCELED");
  return {
    receivedToday: rows.length,
    salesTodayCents: valid.reduce((sum, row) => sum + row.total_cents, 0),
    newOrders: pending.count ?? 0,
    scheduledToday: scheduled.count ?? 0,
  };
}

export interface AdminOrder {
  id: string;
  code: string;
  public_token: string;
  status: OrderStatus;
  fulfillment_type: FulfillmentType;
  payment_method: PaymentMethod;
  is_paid: boolean;
  paid_at: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  address_street: string | null;
  address_number: string | null;
  address_district: string | null;
  address_complement: string | null;
  address_reference: string | null;
  scheduled_date: string;
  scheduled_period: DayPeriod;
  subtotal_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  cash_change_for_cents: number | null;
  customer_notes: string | null;
  internal_notes: string;
  created_at: string;
  canceled_at: string | null;
  delivered_at: string | null;
}

export interface AdminOrderDetail {
  order: AdminOrder;
  items: { id: string; product_name: string; quantity: number; unit_price_cents: number; line_total_cents: number }[];
  events: { id: number; kind: string; from_status: OrderStatus | null; to_status: OrderStatus | null; message: string; actorName: string | null; created_at: string }[];
  notifications: { id: number; kind: string; recipient: string; status: "SENT" | "FAILED" | "SKIPPED"; error: string | null; created_at: string }[];
}

export async function getOrder(orderId: string): Promise<AdminOrderDetail | null> {
  const [order, items, events, notifications, profiles] = await Promise.all([
    client().from("orders").select("*").eq("id", orderId).maybeSingle(),
    client().from("order_items").select("id,product_name,quantity,unit_price_cents,line_total_cents").eq("order_id", orderId).order("product_name"),
    client().from("order_events").select("id,kind,from_status,to_status,message,actor_id,created_at").eq("order_id", orderId).order("id"),
    client().from("order_notifications").select("id,kind,recipient,status,error,created_at").eq("order_id", orderId).order("id"),
    client().from("profiles").select("id,full_name"),
  ]);
  const error = order.error ?? items.error ?? events.error ?? notifications.error;
  if (error) throw fromPostgrest(error, order.status);
  if (!order.data) return null;
  const names = new Map((profiles.data ?? []).map((p) => [p.id as string, p.full_name as string]));
  return {
    order: order.data as AdminOrder,
    items: (items.data ?? []) as AdminOrderDetail["items"],
    events: (events.data ?? []).map((e) => ({ ...e, actorName: e.actor_id ? names.get(e.actor_id) ?? null : null })) as AdminOrderDetail["events"],
    notifications: (notifications.data ?? []) as AdminOrderDetail["notifications"],
  };
}

export const setOrderStatus = (orderId: string, status: OrderStatus, message?: string) =>
  rpc<{ status: OrderStatus; changed: boolean }>("admin_set_status", { p_order_id: orderId, p_status: status, p_message: message ?? null });

export const setOrderPaid = (orderId: string, paid: boolean) =>
  rpc<void>("admin_set_paid", { p_order_id: orderId, p_paid: paid });

export const setDeliveryFee = (orderId: string, feeCents: number) =>
  rpc<{ totalCents: number }>("admin_set_delivery_fee", { p_order_id: orderId, p_fee_cents: feeCents });

export const setInternalNotes = (orderId: string, notes: string) =>
  rpc<void>("admin_set_internal_notes", { p_order_id: orderId, p_notes: notes });

export interface NotifyResult {
  kind: string | null;
  status: "SENT" | "FAILED" | "SKIPPED";
  reason?: string;
}

/** E-mail ao cliente sobre o status atual (ou reenvio da confirmação). */
export async function notifyCustomer(orderId: string, kind: "STATUS" | "RECEIVED", force = false): Promise<NotifyResult> {
  return callFunction<NotifyResult>("notify-order", { orderId, kind, force }, { accessToken: await accessToken(), timeoutMs: 20_000 });
}

// -----------------------------------------------------------------------------
// Produtos e categorias
// -----------------------------------------------------------------------------
export async function listAdminProducts(): Promise<Product[]> {
  const { data, error, status } = await client().from("products").select("*").order("sort_order").order("name");
  if (error) throw fromPostgrest(error, status);
  return data as Product[];
}

export async function getAdminProduct(id: string): Promise<Product | null> {
  const { data, error, status } = await client().from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw fromPostgrest(error, status);
  return (data as Product | null) ?? null;
}

export type ProductInput = Pick<
  Product,
  "category_id" | "name" | "slug" | "short_description" | "description" | "price_cents" | "stock" | "is_active" | "is_featured" | "sort_order"
>;

export async function saveProduct(id: string | null, input: ProductInput): Promise<Product> {
  const query = id
    ? client().from("products").update(input).eq("id", id).select("*").single()
    : client().from("products").insert(input).select("*").single();
  const { data, error, status } = await query;
  if (error) {
    if (error.code === "23505") throw new ApiError(409, "SLUG_IN_USE", "Já existe um produto com este endereço (slug). Mude o nome ou o slug.");
    throw fromPostgrest(error, status);
  }
  return data as Product;
}

export async function deleteProduct(product: Product): Promise<void> {
  const { error, status } = await client().from("products").delete().eq("id", product.id);
  if (error) throw fromPostgrest(error, status);
  if (product.image_path) await client().storage.from(BUCKET).remove([product.image_path]);
}

/** Atendente e dono: disponível/esgotado e quantidade (null = sem controle). */
export const setProductStock = (productId: string, isActive: boolean, stock: number | null) =>
  rpc<void>("admin_set_product_stock", { p_product_id: productId, p_is_active: isActive, p_stock: stock });

export async function listAdminCategories(): Promise<Category[]> {
  const { data, error, status } = await client().from("categories").select("*").order("sort_order").order("name");
  if (error) throw fromPostgrest(error, status);
  return data as Category[];
}

export async function saveCategory(id: string | null, input: Pick<Category, "name" | "slug" | "sort_order" | "is_active">): Promise<void> {
  const { error, status } = id
    ? await client().from("categories").update(input).eq("id", id)
    : await client().from("categories").insert(input);
  if (error) {
    if (error.code === "23505") throw new ApiError(409, "SLUG_IN_USE", "Já existe uma categoria com este nome.");
    throw fromPostgrest(error, status);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  const { error, status } = await client().from("categories").delete().eq("id", id);
  if (error) throw fromPostgrest(error, status);
}

// Foto (uma por produto) -------------------------------------------------------
const BUCKET = "product-images";

export async function uploadProductPhoto(
  product: Pick<Product, "id" | "image_path">,
  file: { blob: Blob; extension: string; contentType: string },
): Promise<string> {
  const storage = client().storage.from(BUCKET);
  const path = `${product.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${file.extension}`;
  const upload = await storage.upload(path, file.blob, { contentType: file.contentType, cacheControl: "31536000", upsert: false });
  if (upload.error) throw new ApiError(400, "UPLOAD_FAILED", "Não foi possível enviar a foto. Verifique o arquivo e tente novamente.");

  const { error, status } = await client().from("products").update({ image_path: path }).eq("id", product.id);
  if (error) {
    await storage.remove([path]);
    throw fromPostgrest(error, status);
  }
  if (product.image_path) await storage.remove([product.image_path]);
  return path;
}

export async function removeProductPhoto(product: Pick<Product, "id" | "image_path">): Promise<void> {
  const { error, status } = await client().from("products").update({ image_path: null }).eq("id", product.id);
  if (error) throw fromPostgrest(error, status);
  if (product.image_path) await client().storage.from(BUCKET).remove([product.image_path]);
}

// -----------------------------------------------------------------------------
// Configurações
// -----------------------------------------------------------------------------
export interface StoreSettingsRow {
  id: boolean;
  store_name: string;
  tagline: string;
  whatsapp_phone: string | null;
  notify_email: string | null;
  instagram_url: string;
  institutional_url: string;
  accepting_orders: boolean;
  pause_message: string;
  delivery_enabled: boolean;
  delivery_fee_cents: number;
  delivery_city: string;
  pickup_enabled: boolean;
  pickup_address: string;
  open_weekdays: number[];
  periods: DayPeriod[];
  same_day_orders: boolean;
  max_days_ahead: number;
  payment_methods: PaymentMethod[];
  pix_key: string;
  pix_holder: string;
  min_order_cents: number;
  email_customer_on_status: boolean;
  updated_at: string;
}

export async function getSettings(): Promise<StoreSettingsRow> {
  const { data, error, status } = await client().from("store_settings").select("*").eq("id", true).single();
  if (error) throw fromPostgrest(error, status);
  return data as StoreSettingsRow;
}

export async function updateSettings(patch: Partial<StoreSettingsRow>): Promise<StoreSettingsRow> {
  const { id: _id, updated_at: _updatedAt, ...rest } = patch;
  const { data, error, status } = await client().from("store_settings").update(rest).eq("id", true).select("*").maybeSingle();
  if (error) throw fromPostgrest(error, status);
  // RLS: quem não é dono não altera (nenhuma linha volta).
  if (!data) throw new ApiError(403, "FORBIDDEN", "Somente o dono ou a dona da loja pode alterar as configurações.");
  return data as StoreSettingsRow;
}

// -----------------------------------------------------------------------------
// Equipe: a lista vem direto da tabela profiles (RLS libera a leitura para a
// equipe), então a aba abre mesmo se a Edge Function estiver fora do ar ou sem
// configuração. Criar, alterar e trocar senha passam pela função admin-users.
// -----------------------------------------------------------------------------
export interface TeamMember {
  id: string;
  fullName: string;
  email: string | null;
  role: AppRole;
  isActive: boolean;
  createdAt: string;
}

export async function listTeam(): Promise<TeamMember[]> {
  const { data, error, status } = await client()
    .from("profiles")
    .select("id, full_name, email, role, is_active, created_at")
    .order("created_at", { ascending: true });
  if (error) throw fromPostgrest(error, status);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    fullName: row.full_name as string,
    email: row.email as string | null,
    role: row.role as AppRole,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
  }));
}

export async function teamAction<T>(body: Record<string, unknown>): Promise<T> {
  return callFunction<T>("admin-users", body, { accessToken: await accessToken() });
}
