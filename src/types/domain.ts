// Tipos de domínio compartilhados pela loja e pelo painel.

export type OrderStatus =
  | "RECEIVED"
  | "CONFIRMED"
  | "PREPARING"
  | "OUT_FOR_DELIVERY"
  | "READY_FOR_PICKUP"
  | "DELIVERED"
  | "CANCELED";

export type PaymentMethod = "PIX" | "CASH" | "CARD";
export type FulfillmentType = "PICKUP" | "DELIVERY";
export type DayPeriod = "MORNING" | "AFTERNOON" | "EVENING";
export type AppRole = "OWNER" | "STAFF";

export interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  price_cents: number;
  image_path: string | null;
  /** null = sem controle de estoque */
  stock: number | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface StoreConfig {
  storeName: string;
  tagline: string;
  whatsappPhone: string | null;
  instagramUrl: string | null;
  institutionalUrl: string | null;
  acceptingOrders: boolean;
  pauseMessage: string | null;
  deliveryEnabled: boolean;
  deliveryFeeCents: number;
  deliveryCity: string;
  pickupEnabled: boolean;
  pickupAddress: string | null;
  periods: DayPeriod[];
  availableDates: string[];
  today: string;
  paymentMethods: PaymentMethod[];
  minOrderCents: number;
  /** Coluna mantida no banco; a primeira dobra atual não usa foto de capa. */
  heroImagePath: string | null;
}

export interface CreateOrderResponse {
  order: {
    orderId: string;
    code: string;
    publicToken: string;
    totalCents: number;
    replayed: boolean;
  };
  emailSent: boolean;
}

export interface PublicOrder {
  code: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  customerFirstName: string;
  district: string | null;
  scheduledDate: string;
  scheduledPeriod: DayPeriod;
  paymentMethod: PaymentMethod;
  isPaid: boolean;
  cashChangeForCents: number | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  createdAt: string;
  items: { name: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
  timeline: { status: OrderStatus; at: string }[];
  pix: { key: string; holder: string | null } | null;
  pickupAddress: string | null;
  emailSent: boolean;
  store: { name: string; whatsappPhone: string | null };
}
