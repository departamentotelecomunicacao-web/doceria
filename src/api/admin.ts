// Acesso a dados do painel. Toda regra (papéis, transições, estoque) é
// aplicada no banco (RLS + funções); aqui só chamamos e tipamos.
import { ApiError, fromPostgrest } from "@/lib/errors";
import { callFunction } from "@/lib/functions";
import { getAdminClient } from "@/lib/supabase";
import type {
  AppRole,
  Category,
  DeliveryPricingMode,
  FulfillmentType,
  InventoryMovementType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Product,
  ProductImage,
  StockStatus,
} from "@/types/domain";

function client() {
  return getAdminClient();
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error, status } = await client().rpc(fn, args);
  if (error) throw fromPostgrest(error, status);
  return data as T;
}

// -----------------------------------------------------------------------------
// Pedidos
// -----------------------------------------------------------------------------
export interface OrderListRow {
  id: string;
  code: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  fulfillment_type: FulfillmentType;
  customer_name: string;
  customer_phone: string | null;
  total_cents: number;
  scheduled_for: string;
  created_at: string;
  source: "STOREFRONT" | "ADMIN";
}

export interface OrderFilters {
  statuses: OrderStatus[];
  fulfillment: FulfillmentType | "ALL";
  search: string;
  /** Datas AAAA-MM-DD no fuso da loja. */
  from: string | null;
  to: string | null;
  page: number;
  pageSize: number;
}

/**
 * Início do dia (AAAA-MM-DD) no fuso da loja, em ISO/UTC. O deslocamento é
 * obtido do próprio Intl para a data (sem depender do fuso do aparelho).
 */
export function storeDayStartIso(date: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const offsetName = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", timeZoneName: "longOffset" })
    .formatToParts(probe)
    .find((part) => part.type === "timeZoneName")?.value ?? "GMT-03:00";
  const offset = offsetName.replace("GMT", "") || "+00:00";
  return new Date(`${date}T00:00:00${offset}`).toISOString();
}

export async function listOrders(filters: OrderFilters): Promise<{ rows: OrderListRow[]; total: number }> {
  let query = client()
    .from("orders")
    .select("id,code,status,payment_status,payment_method,fulfillment_type,customer_name,customer_phone,total_cents,scheduled_for,created_at,source", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.statuses.length > 0) query = query.in("status", filters.statuses);
  if (filters.fulfillment !== "ALL") query = query.eq("fulfillment_type", filters.fulfillment);
  if (filters.from) query = query.gte("created_at", storeDayStartIso(filters.from));
  if (filters.to) {
    const end = new Date(storeDayStartIso(filters.to));
    end.setUTCDate(end.getUTCDate() + 1);
    query = query.lt("created_at", end.toISOString());
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
  return { rows: (data ?? []) as OrderListRow[], total: count ?? 0 };
}

export async function countActiveOrders(): Promise<{ pending: number }> {
  const { count, error, status } = await client()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("status", ["NEW", "AWAITING_PAYMENT"]);
  if (error) throw fromPostgrest(error, status);
  return { pending: count ?? 0 };
}

export interface AdminOrderDetail {
  id: string;
  code: string;
  publicToken: string;
  source: "STOREFRONT" | "ADMIN";
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  fulfillmentType: FulfillmentType;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  deliveryAddress: Record<string, string | null> | null;
  deliveryDistanceMeters: number | null;
  deliveryDurationSeconds: number | null;
  deliveryFeeIsManual: boolean;
  scheduledFor: string;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  cashChangeForCents: number | null;
  customerNotes: string | null;
  internalNotes: string | null;
  expiresAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: { id: string; productId: string | null; name: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
  history: { id: number; fromStatus: OrderStatus | null; toStatus: OrderStatus; source: string; note: string | null; actorName: string | null; createdAt: string }[];
  payments: { id: string; provider: string; method: PaymentMethod; status: PaymentStatus; amountCents: number; note: string | null; actorName: string | null; createdAt: string }[];
  reservations: { productId: string; quantity: number; status: string; expiresAt: string }[];
  events: { action: string; summary: string; actorName: string | null; createdAt: string }[];
  allowedNextStatuses: OrderStatus[];
  allowedPaymentStatuses: PaymentStatus[];
}

export const getOrder = (orderId: string) => rpc<AdminOrderDetail>("admin_get_order", { p_order_id: orderId });

export const transitionOrder = (orderId: string, to: OrderStatus, note?: string, restock = true) =>
  rpc<AdminOrderDetail>("admin_transition_order", { p_order_id: orderId, p_to_status: to, p_note: note ?? null, p_restock: restock });

export const setPaymentStatus = (orderId: string, status: PaymentStatus, note?: string, confirmOrder = false) =>
  rpc<AdminOrderDetail>("admin_set_payment_status", { p_order_id: orderId, p_status: status, p_note: note ?? null, p_confirm_order: confirmOrder });

export const updateDeliveryFee = (orderId: string, feeCents: number, reason: string) =>
  rpc<AdminOrderDetail>("admin_update_delivery_fee", { p_order_id: orderId, p_fee_cents: feeCents, p_reason: reason });

export const updateOrderNotes = (orderId: string, notes: string) =>
  rpc<AdminOrderDetail>("admin_update_order_notes", { p_order_id: orderId, p_internal_notes: notes });

export interface AdminOrderPayload {
  idempotencyKey: string;
  customer: { name: string; phone: string; email: string | null };
  fulfillment: { type: FulfillmentType; scheduledFor: string; address?: Record<string, string | null> };
  items: { productId: string; quantity: number }[];
  paymentMethod: PaymentMethod;
  cashChangeForCents: number | null;
  notes: string | null;
  manualDeliveryFeeCents: number | null;
}

export const createAdminOrder = (payload: AdminOrderPayload) =>
  rpc<{ orderId: string; code: string; publicToken: string }>("admin_create_order", { p_payload: payload });

// -----------------------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------------------
export type DashboardPeriod = "today" | "7d" | "30d" | "custom";

export interface DashboardData {
  period: { key: DashboardPeriod; from: string; to: string };
  salesCents: number;
  soldOrders: number;
  ordersCount: number;
  canceledCount: number;
  averageTicketCents: number;
  unpaidSoldCents: number;
  pipeline: { pending: number; inProduction: number; ready: number; outForDelivery: number };
  topProducts: { productId: string | null; name: string; quantity: number; revenueCents: number }[];
  lowStock: { productId: string; name: string; stockAvailable: number; stockReserved: number; lowStockThreshold: number }[];
  daily: { date: string; salesCents: number; orders: number }[];
}

export const getDashboard = (period: DashboardPeriod, from?: string, to?: string) =>
  rpc<DashboardData>("admin_dashboard", { p_period: period, p_from: from ?? null, p_to: to ?? null });

// -----------------------------------------------------------------------------
// Produtos e categorias
// -----------------------------------------------------------------------------
const PRODUCT_COLUMNS =
  "*,images:product_images(id,product_id,storage_path,thumb_path,alt_text,width,height,is_main,sort_order)";

function sortImages(product: Product): Product {
  return {
    ...product,
    images: [...(product.images ?? [])].sort((a, b) => Number(b.is_main) - Number(a.is_main) || a.sort_order - b.sort_order),
  };
}

export async function listAdminProducts(): Promise<Product[]> {
  const { data, error, status } = await client().from("products").select(PRODUCT_COLUMNS).order("sort_order").order("name");
  if (error) throw fromPostgrest(error, status);
  return (data as unknown as Product[]).map(sortImages);
}

export async function getAdminProduct(id: string): Promise<Product | null> {
  const { data, error, status } = await client().from("products").select(PRODUCT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw fromPostgrest(error, status);
  return data ? sortImages(data as unknown as Product) : null;
}

export type ProductInput = Pick<
  Product,
  | "category_id" | "name" | "slug" | "short_description" | "description" | "price_cents" | "compare_at_price_cents"
  | "low_stock_threshold" | "max_per_order" | "is_active" | "is_featured" | "sort_order" | "allergens" | "ingredients" | "weight_grams"
>;

export async function saveProduct(id: string | null, input: ProductInput & { stock_available?: number }): Promise<Product> {
  const query = id
    ? client().from("products").update(input).eq("id", id).select(PRODUCT_COLUMNS).single()
    : client().from("products").insert(input).select(PRODUCT_COLUMNS).single();
  const { data, error, status } = await query;
  if (error) throw fromPostgrest(error, status);
  return sortImages(data as unknown as Product);
}

export async function deleteProduct(id: string): Promise<void> {
  const { error, status } = await client().from("products").delete().eq("id", id);
  if (error) throw fromPostgrest(error, status);
}

export async function listAdminCategories(): Promise<Category[]> {
  const { data, error, status } = await client().from("categories").select("*").order("sort_order").order("name");
  if (error) throw fromPostgrest(error, status);
  return data as Category[];
}

export async function saveCategory(id: string | null, input: Pick<Category, "name" | "slug" | "description" | "sort_order" | "is_active">): Promise<void> {
  const { error, status } = id
    ? await client().from("categories").update(input).eq("id", id)
    : await client().from("categories").insert(input);
  if (error) throw fromPostgrest(error, status);
}

export async function deleteCategory(id: string): Promise<void> {
  const { error, status } = await client().from("categories").delete().eq("id", id);
  if (error) throw fromPostgrest(error, status);
}

// Imagens ----------------------------------------------------------------------
const BUCKET = "product-images";

export async function uploadProductImage(
  productId: string,
  files: { full: Blob; thumb: Blob; extension: string; contentType: string; width: number; height: number },
  altText: string,
  makeMain: boolean,
  sortOrder: number,
): Promise<ProductImage> {
  const storage = client().storage.from(BUCKET);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fullPath = `${productId}/${stamp}.${files.extension}`;
  const thumbPath = `${productId}/${stamp}-600.${files.extension}`;

  const upFull = await storage.upload(fullPath, files.full, { contentType: files.contentType, cacheControl: "31536000", upsert: false });
  if (upFull.error) throw new ApiError(400, "UPLOAD_FAILED", "Não foi possível enviar a imagem. Verifique o arquivo e tente novamente.");
  const upThumb = await storage.upload(thumbPath, files.thumb, { contentType: files.contentType, cacheControl: "31536000", upsert: false });
  if (upThumb.error) {
    await storage.remove([fullPath]);
    throw new ApiError(400, "UPLOAD_FAILED", "Não foi possível enviar a imagem. Verifique o arquivo e tente novamente.");
  }

  if (makeMain) {
    await client().from("product_images").update({ is_main: false }).eq("product_id", productId);
  }
  const { data, error, status } = await client()
    .from("product_images")
    .insert({ product_id: productId, storage_path: fullPath, thumb_path: thumbPath, alt_text: altText, width: files.width, height: files.height, is_main: makeMain, sort_order: sortOrder })
    .select()
    .single();
  if (error) {
    await storage.remove([fullPath, thumbPath]);
    throw fromPostgrest(error, status);
  }
  return data as ProductImage;
}

export async function updateProductImage(image: ProductImage, patch: Partial<Pick<ProductImage, "alt_text" | "is_main" | "sort_order">>): Promise<void> {
  if (patch.is_main) {
    await client().from("product_images").update({ is_main: false }).eq("product_id", image.product_id);
  }
  const { error, status } = await client().from("product_images").update(patch).eq("id", image.id);
  if (error) throw fromPostgrest(error, status);
}

export async function deleteProductImage(image: ProductImage): Promise<void> {
  const { error, status } = await client().from("product_images").delete().eq("id", image.id);
  if (error) throw fromPostgrest(error, status);
  await client().storage.from(BUCKET).remove([image.storage_path, image.thumb_path].filter(Boolean) as string[]);
}

// -----------------------------------------------------------------------------
// Estoque
// -----------------------------------------------------------------------------
export interface InventoryRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  category_id: string | null;
  category_name: string | null;
  stock_available: number;
  stock_reserved: number;
  low_stock_threshold: number;
  stock_status: StockStatus;
  consumed_30d: number;
  updated_at: string;
}

export async function listInventory(): Promise<InventoryRow[]> {
  const { data, error, status } = await client().from("inventory_overview").select("*").order("name");
  if (error) throw fromPostgrest(error, status);
  return data as InventoryRow[];
}

export const adjustInventory = (productId: string, type: Extract<InventoryMovementType, "IN" | "OUT" | "ADJUSTMENT">, quantity: number, reason: string) =>
  rpc<{ productId: string; stockAvailable: number; stockReserved: number }>("inventory_adjust", {
    p_product_id: productId,
    p_type: type,
    p_quantity: quantity,
    p_reason: reason,
  });

export interface MovementRow {
  id: number;
  type: InventoryMovementType;
  quantity: number;
  available_delta: number;
  reserved_delta: number;
  available_after: number;
  reserved_after: number;
  reason: string;
  source: string;
  created_at: string;
  order_id: string | null;
}

export async function listMovements(productId: string, limit = 30): Promise<MovementRow[]> {
  const { data, error, status } = await client()
    .from("inventory_movements")
    .select("id,type,quantity,available_delta,reserved_delta,available_after,reserved_after,reason,source,created_at,order_id")
    .eq("product_id", productId)
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw fromPostgrest(error, status);
  return data as MovementRow[];
}

// -----------------------------------------------------------------------------
// Clientes
// -----------------------------------------------------------------------------
export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  ordersCount: number;
  totalSpentCents: number;
  lastOrderAt: string | null;
  anonymized: boolean;
  createdAt: string;
}

export const listCustomers = (search: string, limit: number, offset: number) =>
  rpc<{ total: number; items: CustomerRow[] }>("admin_list_customers", { p_search: search || null, p_limit: limit, p_offset: offset });

export const anonymizeCustomer = (customerId: string) => rpc<void>("anonymize_customer", { p_customer_id: customerId });

// -----------------------------------------------------------------------------
// Configurações
// -----------------------------------------------------------------------------
export interface StoreSettingsRow {
  id: boolean;
  store_name: string;
  tagline: string;
  legal_name: string;
  whatsapp_number: string | null;
  instagram_handle: string | null;
  contact_email: string | null;
  privacy_contact_email: string | null;
  wix_site_url: string | null;
  public_location_label: string;
  pickup_address: string;
  pickup_instructions: string;
  origin_address: string;
  origin_lat: number | null;
  origin_lng: number | null;
  accepting_orders: boolean;
  pause_message: string;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  business_hours: Record<string, [string, string][]>;
  delivery_hours: Record<string, [string, string][]>;
  slot_interval_minutes: number;
  min_lead_time_minutes: number;
  max_days_ahead: number;
  min_order_cents: number;
  free_delivery_min_subtotal_cents: number | null;
  delivery_pricing_mode: DeliveryPricingMode;
  delivery_base_fee_cents: number;
  delivery_per_km_cents: number;
  delivery_max_distance_m: number;
  new_order_ttl_minutes: number;
  payment_ttl_minutes: number;
  payment_methods: PaymentMethod[];
  pix_key: string;
  pix_holder_name: string;
  content: Record<string, unknown>;
  updated_at: string;
}

export async function getSettings(): Promise<StoreSettingsRow> {
  const { data, error, status } = await client().from("store_settings").select("*").eq("id", true).single();
  if (error) throw fromPostgrest(error, status);
  return data as StoreSettingsRow;
}

export async function updateSettings(patch: Partial<StoreSettingsRow>): Promise<StoreSettingsRow> {
  const { id: _id, updated_at: _updatedAt, ...rest } = patch;
  const { data, error, status } = await client().from("store_settings").update(rest).eq("id", true).select("*").single();
  if (error) throw fromPostgrest(error, status);
  return data as StoreSettingsRow;
}

export interface DeliveryRuleRow {
  id: string;
  min_distance_m: number;
  max_distance_m: number;
  fee_cents: number;
  is_active: boolean;
}

export async function listDeliveryRules(): Promise<DeliveryRuleRow[]> {
  const { data, error, status } = await client().from("delivery_rules").select("id,min_distance_m,max_distance_m,fee_cents,is_active").order("min_distance_m");
  if (error) throw fromPostgrest(error, status);
  return data as DeliveryRuleRow[];
}

export async function saveDeliveryRule(id: string | null, input: Omit<DeliveryRuleRow, "id">): Promise<void> {
  const { error, status } = id
    ? await client().from("delivery_rules").update(input).eq("id", id)
    : await client().from("delivery_rules").insert(input);
  if (error) {
    if (error.code === "23P01") throw new ApiError(409, "OVERLAP", "Esta faixa se sobrepõe a outra faixa ativa.");
    throw fromPostgrest(error, status);
  }
}

export async function deleteDeliveryRule(id: string): Promise<void> {
  const { error, status } = await client().from("delivery_rules").delete().eq("id", id);
  if (error) throw fromPostgrest(error, status);
}

// -----------------------------------------------------------------------------
// Equipe (Edge Function admin-users, somente OWNER) e auditoria
// -----------------------------------------------------------------------------
export interface TeamMember {
  id: string;
  fullName: string;
  email: string | null;
  role: AppRole;
  isActive: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  isSelf: boolean;
}

async function accessToken(): Promise<string> {
  const { data } = await client().auth.getSession();
  if (!data.session) throw new ApiError(401, "AUTH_REQUIRED", "Sua sessão expirou. Entre novamente.");
  return data.session.access_token;
}

export async function teamAction<T>(body: Record<string, unknown>): Promise<T> {
  return callFunction<T>("admin-users", body, { accessToken: await accessToken() });
}

export interface AuditRow {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  created_at: string;
  actor_id: string | null;
  actorName: string | null;
}

export async function listAudit(limit = 100): Promise<AuditRow[]> {
  const [logs, profiles] = await Promise.all([
    client().from("audit_logs").select("id,action,entity_type,entity_id,summary,created_at,actor_id").order("id", { ascending: false }).limit(limit),
    client().from("profiles").select("id,full_name"),
  ]);
  if (logs.error) throw fromPostgrest(logs.error, logs.status);
  const names = new Map((profiles.data ?? []).map((profile) => [profile.id as string, profile.full_name as string]));
  return (logs.data ?? []).map((row) => ({ ...row, actorName: row.actor_id ? names.get(row.actor_id) ?? null : null })) as AuditRow[];
}
