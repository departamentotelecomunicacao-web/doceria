import { useQuery } from "@tanstack/react-query";
import { fetchCatalog, fetchProductBySlug } from "@/api/catalog";
import { fetchPublicOrder, fetchSlots, fetchStoreConfig } from "@/api/store";
import type { FulfillmentType } from "@/types/domain";

// Dados vivem no Supabase; o cache do navegador é curto para que mudanças de
// preço/estoque apareçam sem novo deploy.

export function useStoreConfig() {
  return useQuery({ queryKey: ["store-config"], queryFn: fetchStoreConfig, staleTime: 60_000 });
}

export function useCatalog() {
  return useQuery({ queryKey: ["catalog"], queryFn: fetchCatalog, staleTime: 30_000 });
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: ["product", slug],
    queryFn: () => fetchProductBySlug(slug!),
    enabled: Boolean(slug),
    staleTime: 30_000,
  });
}

export function useSlots(type: FulfillmentType, enabled = true) {
  return useQuery({
    queryKey: ["slots", type],
    queryFn: () => fetchSlots(type),
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

const FINAL_STATUSES = new Set(["COMPLETED", "CANCELED", "EXPIRED"]);

export function usePublicOrder(token: string | undefined) {
  return useQuery({
    queryKey: ["public-order", token],
    queryFn: () => fetchPublicOrder(token!),
    enabled: Boolean(token),
    // Acompanhamento sem login: polling leve enquanto o pedido está em aberto.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && FINAL_STATUSES.has(status) ? false : 30_000;
    },
    refetchOnWindowFocus: true,
  });
}
