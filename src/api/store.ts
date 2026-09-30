import { callFunction } from "@/lib/functions";
import { restRpc } from "@/lib/rest";
import type { CreateOrderResponse, PublicOrder, StoreConfig } from "@/types/domain";
import type { OrderRequest } from "@shared/validation.ts";

export function fetchStoreConfig(): Promise<StoreConfig> {
  return restRpc<StoreConfig>("get_public_store_config");
}

export function submitOrder(payload: OrderRequest): Promise<CreateOrderResponse> {
  return callFunction<CreateOrderResponse>("create-order", payload, { timeoutMs: 30_000 });
}

export async function fetchPublicOrder(token: string): Promise<PublicOrder | null> {
  return (await restRpc<PublicOrder | null>("get_public_order", { p_token: token })) ?? null;
}
