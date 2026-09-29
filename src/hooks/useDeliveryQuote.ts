import { useCallback, useEffect, useRef, useState } from "react";
import { requestDeliveryQuote } from "@/api/store";
import { ApiError } from "@/lib/errors";
import type { DeliveryQuote } from "@/types/domain";
import { validateAddress, type AddressInput } from "@shared/validation.ts";

export type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; quote: DeliveryQuote }
  | { status: "error"; error: ApiError };

/**
 * Cotação de entrega com proteção de custo da API de mapas:
 * - só consulta quando o endereço está completo e válido;
 * - espera o usuário parar de digitar (debounce);
 * - cancela a consulta anterior e reaproveita resultados já obtidos.
 * O backend recalcula tudo novamente ao criar o pedido.
 */
export function useDeliveryQuote(address: Partial<AddressInput>, subtotalCents: number, enabled: boolean, debounceMs = 800) {
  const [state, setState] = useState<QuoteState>({ status: "idle" });
  const cache = useRef(new Map<string, DeliveryQuote>());
  const [nonce, setNonce] = useState(0);

  const validated = validateAddress(address);
  const normalizedKey = validated.ok
    ? JSON.stringify([validated.value.cep, validated.value.street.toLowerCase(), validated.value.number.toLowerCase(), validated.value.neighborhood.toLowerCase(), validated.value.city.toLowerCase(), validated.value.state])
    : null;
  const key = normalizedKey ? `${normalizedKey}|${subtotalCents}` : null;
  const addressValue = validated.ok ? validated.value : null;

  useEffect(() => {
    if (!enabled || !key || !addressValue) {
      setState({ status: "idle" });
      return;
    }
    const cached = cache.current.get(key);
    if (cached) {
      setState({ status: "ready", quote: cached });
      return;
    }
    setState({ status: "loading" });
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      requestDeliveryQuote(addressValue, subtotalCents, controller.signal)
        .then((quote) => {
          cache.current.set(key, quote);
          setState({ status: "ready", quote });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setState({
            status: "error",
            error: error instanceof ApiError ? error : new ApiError(0, "NETWORK_ERROR", "Não foi possível calcular a entrega automaticamente."),
          });
        });
    }, debounceMs);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // addressValue é derivado de key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, debounceMs, nonce]);

  const refresh = useCallback(() => {
    cache.current.clear();
    setNonce((value) => value + 1);
  }, []);

  return { state, refresh, addressComplete: Boolean(addressValue) };
}
