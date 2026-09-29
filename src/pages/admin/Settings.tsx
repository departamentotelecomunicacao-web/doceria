import { useQuery } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router";
import { useAdminAuth } from "@/admin/auth";
import { getSettings } from "@/api/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { cn } from "@/components/ui/cn";
import { ErrorState, LoadingBlock } from "@/components/ui/States";
import { AuditTab, ContentTab, DeliveryTab, OperationTab, PaymentsTab, StoreTab, TeamTab } from "./settings/Tabs";

const TABS = [
  { key: "loja", label: "Loja", owner: false },
  { key: "conteudo", label: "Conteúdo", owner: false },
  { key: "funcionamento", label: "Funcionamento", owner: false },
  { key: "entrega", label: "Entrega", owner: false },
  { key: "pagamentos", label: "Pagamentos", owner: false },
  { key: "equipe", label: "Equipe", owner: true },
  { key: "atividades", label: "Atividades", owner: false },
] as const;

export default function Settings() {
  const auth = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: getSettings, enabled: auth.hasRole("ADMIN") });
  const tabs = TABS.filter((tab) => !tab.owner || auth.hasRole("OWNER"));
  const active = tabs.find((tab) => tab.key === params.get("aba"))?.key ?? "loja";

  if (!auth.hasRole("ADMIN")) return <Navigate to="/admin/dashboard" replace />;

  return (
    <div>
      <PageHeader title="Configurações" description="Todas as regras ficam no banco: a loja e o cardápio do Wix passam a usá-las imediatamente." />
      <div className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 rounded-full bg-cream-200/70 p-1" role="tablist">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key}
              onClick={() => setParams({ aba: tab.key }, { replace: true })}
              className={cn("h-9 rounded-full px-4 text-sm font-semibold", active === tab.key ? "bg-white text-cocoa-900 shadow-sm" : "text-cocoa-600 hover:text-cocoa-900")}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {active === "equipe" ? <TeamTab /> : active === "atividades" ? <AuditTab /> : settings.isLoading ? (
        <LoadingBlock />
      ) : settings.isError || !settings.data ? (
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} title="Não foi possível carregar as configurações" />
      ) : (
        <div className="max-w-4xl">
          {active === "loja" && <StoreTab settings={settings.data} />}
          {active === "conteudo" && <ContentTab settings={settings.data} />}
          {active === "funcionamento" && <OperationTab settings={settings.data} />}
          {active === "entrega" && <DeliveryTab settings={settings.data} />}
          {active === "pagamentos" && <PaymentsTab settings={settings.data} />}
        </div>
      )}
    </div>
  );
}
