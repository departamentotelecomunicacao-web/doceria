import { callFunction } from "@/lib/functions";
import { restRpc } from "@/lib/rest";
import type {
  CreateOrderResponse,
  DeliveryQuote,
  FulfillmentType,
  PublicOrder,
  Slot,
  StoreConfig,
} from "@/types/domain";
import type { AddressInput, OrderRequest } from "@shared/validation.ts";

export function fetchStoreConfig(): Promise<StoreConfig> {
  return restRpc<StoreConfig>("get_public_store_config");
}

export async function fetchSlots(type: FulfillmentType): Promise<Slot[]> {
  return (await restRpc<Slot[] | null>("get_fulfillment_slots", { p_type: type })) ?? [];
}

export function requestDeliveryQuote(address: AddressInput, subtotalCents: number, signal?: AbortSignal): Promise<DeliveryQuote> {
  return callFunction<DeliveryQuote>("delivery-quote", { address, subtotalCents }, { signal, timeoutMs: 20_000 });
}

export function submitOrder(payload: OrderRequest): Promise<CreateOrderResponse> {
  return callFunction<CreateOrderResponse>("create-order", payload, { timeoutMs: 30_000 });
}

export async function fetchPublicOrder(token: string): Promise<PublicOrder | null> {
  return (await restRpc<PublicOrder | null>("get_public_order", { p_token: token })) ?? null;
}
