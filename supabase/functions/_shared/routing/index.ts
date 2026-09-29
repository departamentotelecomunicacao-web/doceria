import { GoogleRoutesProvider } from "./google-routes.ts";
import type { RoutingProvider } from "./types.ts";

export type { RouteFailureReason, RouteResult, RoutingProvider, Waypoint } from "./types.ts";

export type EnvGetter = (name: string) => string | undefined;

/**
 * Escolhe o provedor pelo ambiente (ROUTING_PROVIDER). Para adicionar Mapbox
 * ou OpenRouteService, implemente RoutingProvider em um novo arquivo e
 * registre aqui; nenhuma outra parte do sistema precisa mudar.
 */
export function createRoutingProvider(getEnv: EnvGetter, fetchImpl?: typeof fetch): RoutingProvider {
  const provider = (getEnv("ROUTING_PROVIDER") ?? "google").toLowerCase();
  switch (provider) {
    case "google":
      return new GoogleRoutesProvider({
        apiKey: getEnv("GOOGLE_MAPS_API_KEY"),
        endpoint: getEnv("GOOGLE_ROUTES_ENDPOINT") || undefined,
        timeoutMs: Number(getEnv("ROUTING_TIMEOUT_MS") ?? "") || undefined,
        fetchImpl,
      });
    default:
      throw new Error(`Provedor de rotas não suportado: ${provider}`);
  }
}
