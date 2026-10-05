import { useQuery } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router";
import { useAdminAuth } from "@/admin/auth";
import { getSettings } from "@/api/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { cn } from "@/components/ui/cn";
import { ErrorState, LoadingBlock } from "@/components/ui/States";
import { DeliveryTab, PaymentsTab, StoreTab, TeamTab } from "./settings/Tabs";

const TABS = [
  { key: "loja", label: "Loja" },
  { key: "entrega", label: "Entrega e agenda" },
  { key: "pagamento", label: "Pagamento" },
  { key: "equipe", label: "Equipe" },
] as const;

export default function Settings() {
  const auth = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const isOwner = auth.hasRole("OWNER");
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: getSettings, enabled: isOwner });
  const active = TABS.find((tab) => tab.key === params.get("aba"))?.key ?? "loja";

  if (!isOwner) return <Navigate to="/admin/pedidos" replace />;

  return (
    <div>
      <PageHeader title="Configurações" description="A loja e o cardápio do Wix passam a usar os novos valores na hora." />
      {/* No celular as quatro abas ficam em 2 x 2, todas visíveis (antes "Equipe" ficava escondida à direita). */}
      <div className="mb-6">
        <div className="grid grid-cols-2 gap-1 rounded-3xl bg-cream-200/70 p-1 sm:flex sm:w-max sm:rounded-full" role="tablist">
          {TABS.map((tab) => (
            <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key}
              onClick={() => setParams({ aba: tab.key }, { replace: true })}
              className={cn("h-10 rounded-full px-4 text-sm font-semibold sm:h-9", active === tab.key ? "bg-white text-cocoa-900 shadow-sm" : "text-cocoa-600 hover:text-cocoa-900")}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {active === "equipe" ? <TeamTab /> : settings.isLoading ? (
        <LoadingBlock />
      ) : settings.isError || !settings.data ? (
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} title="Não foi possível carregar as configurações" />
      ) : (
        <div className="max-w-4xl">
          {active === "loja" && <StoreTab settings={settings.data} />}
          {active === "entrega" && <DeliveryTab settings={settings.data} />}
          {active === "pagamento" && <PaymentsTab settings={settings.data} />}
        </div>
      )}
    </div>
  );
}
