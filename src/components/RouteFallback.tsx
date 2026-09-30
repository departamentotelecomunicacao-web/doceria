import { LoadingBlock } from "@/components/ui/States";

/** Tela exibida enquanto o código de uma rota sob demanda é baixado. */
export function RouteFallback() {
  return <LoadingBlock className="min-h-[60dvh]" />;
}
