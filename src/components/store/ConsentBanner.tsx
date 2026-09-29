import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { getConsent, setConsent } from "@/lib/analytics";
import { hasAnalytics } from "@/lib/env";

/**
 * Exibido somente quando há ferramentas de análise configuradas (GA4, GTM ou
 * Meta Pixel). Sem consentimento, nenhum script de terceiros é carregado.
 */
export function ConsentBanner() {
  const [decided, setDecided] = useState(() => getConsent() !== null);
  if (!hasAnalytics || decided) return null;

  const choose = (value: "granted" | "denied") => {
    setConsent(value);
    setDecided(true);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4" role="dialog" aria-label="Preferências de cookies">
      <div className="card mx-auto flex max-w-3xl flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-cocoa-700">
          Usamos cookies de medição para entender como o site é usado e melhorar o cardápio. Você pode recusar sem prejuízo para o pedido.{" "}
          <Link to="/privacidade#cookies" className="font-semibold underline underline-offset-2">Saiba mais</Link>
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => choose("denied")}>Recusar</Button>
          <Button size="sm" onClick={() => choose("granted")}>Aceitar</Button>
        </div>
      </div>
    </div>
  );
}
