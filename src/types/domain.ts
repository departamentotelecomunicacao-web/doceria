// Tipos de domínio compartilhados pela loja e pelo painel.

export type OrderStatus =
  | "NEW"
  | "AWAITING_PAYMENT"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "COMPLETED"
  | "CANCELED"
  | "EXPIRED";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "MANUAL_CONFIRMATION";
export type PaymentMethod = "PIX" | "CASH" | "CARD";
export type FulfillmentType = "PICKUP" | "DELIVERY";
export type AppRole = "OWNER" | "ADMIN" | "OPERATOR";
export type StockStatus = "AVAILABLE" | "LOW" | "SOLD_OUT";
export type InventoryMovementType = "IN" | "OUT" | "RESERVATION" | "RELEASE" | "ADJUSTMENT";
export type DeliveryPricingMode = "DISTANCE_TABLE" | "BASE_PLUS_PER_KM";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}

export interface ProductImage {
  id: string;
  product_id: string;
  storage_path: string;
  thumb_path: string | null;
  alt_text: string;
  width: number | null;
  height: number | null;
  is_main: boolean;
  sort_order: number;
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  price_cents: number;
  compare_at_price_cents: number | null;
  stock_available: number;
  stock_reserved: number;
  low_stock_threshold: number;
  max_per_order: number;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  allergens: string[];
  ingredients: string;
  weight_grams: number | null;
  created_at: string;
  updated_at: string;
  images: ProductImage[];
}

export interface ProducerContent {
  name: string;
  role?: string;
  bio?: string;
}

export interface StoreContent {
  heroEyebrow?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  storyTitle?: string;
  storyText?: string;
  producers?: ProducerContent[];
  differentials?: { title: string; text: string }[];
}

export interface StoreConfig {
  storeName: string;
  tagline: string;
  legalName: string;
  whatsappNumber: string | null;
  instagramHandle: string | null;
  contactEmail: string | null;
  privacyContactEmail: string | null;
  wixSiteUrl: string | null;
  publicLocationLabel: string;
  acceptingOrders: boolean;
  pauseMessage: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  businessHours: Record<string, [string, string][]>;
  deliveryHours: Record<string, [string, string][]>;
  isOpenNow: boolean;
  minLeadTimeMinutes: number;
  minOrderCents: number;
  freeDeliveryMinSubtotalCents: number | null;
  deliveryMaxDistanceMeters: number;
  deliveryPricing: {
    mode: DeliveryPricingMode;
    baseFeeCents: number;
    perKmCents: number;
    rules: { minDistanceMeters: number; maxDistanceMeters: number; feeCents: number }[];
  };
  paymentMethods: PaymentMethod[];
  content: StoreContent;
  timezone: string;
  serverTime: string;
}

export interface Slot {
  start: string;
  end: string;
}

export interface DeliveryQuote {
  available: boolean;
  reason: string | null;
  distanceMeters: number;
  distanceKm: number;
  durationMinutes: number | null;
  feeCents: number | null;
  baseFeeCents: number | null;
  freeDeliveryApplied: boolean;
  freeDeliveryMinSubtotalCents: number | null;
  maxDistanceMeters: number | null;
  expiresAt: string;
}

export interface OrderSummary {
  orderId: string;
  code: string;
  publicToken: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  fulfillmentType: FulfillmentType;
  scheduledFor: string;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  expiresAt: string | null;
  createdAt: string;
  replayed: boolean;
}

export interface CreateOrderResponse {
  order: OrderSummary;
  payment: { provider: string; kind: string; instructions: string; checkoutUrl?: string };
}

export interface PublicOrder {
  code: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  fulfillmentType: FulfillmentType;
  scheduledFor: string;
  createdAt: string;
  expiresAt: string | null;
  customerFirstName: string;
  items: { name: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  cashChangeForCents: number | null;
  deliveryAddress: {
    street: string;
    numberMasked: string;
    neighborhood: string;
    city: string;
    state: string;
  } | null;
  pickup: { address: string | null; instructions: string | null } | null;
  pix: { key: string; holderName: string | null } | null;
  history: { status: OrderStatus; at: string }[];
  store: { name: string; whatsappNumber: string | null };
}
