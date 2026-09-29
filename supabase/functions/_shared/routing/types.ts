// Abstração de provedor de rotas. A cobrança de frete usa somente a distância
// da rota (sem trânsito em tempo real); a duração é apenas estimativa.

export interface Waypoint {
  /** Endereço textual (geocodificado pelo provedor). */
  address?: string;
  lat?: number;
  lng?: number;
}

export type RouteFailureReason =
  /** Endereço não encontrado pelo provedor. */
  | "NOT_FOUND"
  /** Endereço encontrado só em nível de bairro/cidade/CEP: distância não confiável. */
  | "IMPRECISE_ADDRESS"
  /** Erro do provedor (5xx, cota, resposta inesperada). */
  | "PROVIDER_ERROR"
  | "TIMEOUT"
  /** Chave/credencial ausente ou inválida. */
  | "NOT_CONFIGURED";

export type RouteResult =
  | {
    ok: true;
    provider: string;
    distanceMeters: number;
    durationSeconds: number | null;
  }
  | {
    ok: false;
    provider: string;
    reason: RouteFailureReason;
    /** Detalhe técnico para logs (nunca exibido ao cliente). */
    detail?: string;
  };

export interface RoutingProvider {
  readonly name: string;
  computeRoute(origin: Waypoint, destination: Waypoint): Promise<RouteResult>;
}
