import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, ChefHat, Clock, Plus, Truck, PackageCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { getDashboard, type DashboardPeriod } from "@/api/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { SalesChart } from "@/components/admin/SalesChart";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/Field";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { storeDateKey } from "@/lib/datetime";
import { formatBRL } from "@/lib/money";

const PERIODS: { key: DashboardPeriod; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "custom", label: "Personalizado" },
];

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-cocoa-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-cocoa-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-cocoa-500">{hint}</p>}
    </div>
  );
}

function PipelineTile({ to, icon, label, count, highlight }: { to: string; icon: React.ReactNode; label: string; count: number; highlight?: boolean }) {
  return (
    <Link to={to} className={cn("card flex items-center gap-3 p-4 transition-colors hover:border-cocoa-400", highlight && count > 0 && "border-caramel-500 bg-butter-100")}>
      <span className="grid size-10 place-items-center rounded-xl bg-cream-100 text-cocoa-800">{icon}</span>
      <span className="flex-1">
        <span className="block text-2xl font-semibold leading-none">{count}</span>
        <span className="text-sm text-cocoa-600">{label}</span>
      </span>
      <ArrowRight className="size-4 text-cocoa-400" aria-hidden />
    </Link>
  );
}

export default function Dashboard() {
  const today = storeDateKey(new Date());
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const customValid = period !== "custom" || (from && to && from <= to);

  const query = useQuery({
    queryKey: ["admin", "dashboard", period, period === "custom" ? from : null, period === "custom" ? to : null],
    queryFn: () => getDashboard(period, period === "custom" ? from : undefined, period === "custom" ? to : undefined),
    enabled: Boolean(customValid),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visão geral"
        description="Vendas consideram pedidos confirmados em diante (sem novos, cancelados ou expirados). Horário de Brasília."
        actions={<ButtonLink to="/admin/pedidos/novo" size="sm" icon={<Plus className="size-4" aria-hidden />}>Registrar pedido</ButtonLink>}
      />

      {/* Filtros: uma linha acima de todo o conteúdo */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        {PERIODS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPeriod(item.key)}
            aria-pressed={period === item.key}
            className={cn(
              "h-9 rounded-full border px-4 text-sm font-semibold",
              period === item.key ? "border-cocoa-900 bg-cocoa-900 text-cream-50" : "border-cream-300 bg-white text-cocoa-800",
            )}
          >
            {item.label}
          </button>
        ))}
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" aria-label="Data inicial" />
            <span className="text-sm text-cocoa-500">até</span>
            <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" aria-label="Data final" />
          </div>
        )}
      </div>

      {query.isError && !data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} title="Não foi possível carregar os indicadores" />
      ) : !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className={cn("space-y-6 transition-opacity", query.isFetching && query.isPlaceholderData && "opacity-60")}>
          {/* Agora */}
          <section aria-labelledby="agora" className="space-y-3">
            <h2 id="agora" className="text-sm font-bold uppercase tracking-wider text-cocoa-600">Agora</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <PipelineTile to="/admin/pedidos?status=NEW,AWAITING_PAYMENT" icon={<Clock className="size-5" />} label="Pendentes de confirmação" count={data.pipeline.pending} highlight />
              <PipelineTile to="/admin/pedidos?status=CONFIRMED,PREPARING" icon={<ChefHat className="size-5" />} label="Em produção" count={data.pipeline.inProduction} />
              <PipelineTile to="/admin/pedidos?status=READY" icon={<PackageCheck className="size-5" />} label="Prontos" count={data.pipeline.ready} />
              <PipelineTile to="/admin/pedidos?status=OUT_FOR_DELIVERY" icon={<Truck className="size-5" />} label="Em entrega" count={data.pipeline.outForDelivery} />
            </div>
          </section>

          {/* Período */}
          <section aria-labelledby="periodo" className="space-y-3">
            <h2 id="periodo" className="text-sm font-bold uppercase tracking-wider text-cocoa-600">
              {period === "today" ? "Hoje" : `De ${data.period.from.split("-").reverse().join("/")} a ${data.period.to.split("-").reverse().join("/")}`}
            </h2>
            <div className="card p-5">
              <p className="text-sm text-cocoa-600">Vendas</p>
              <p className="text-5xl font-semibold tracking-tight text-cocoa-900" data-testid="sales-total">{formatBRL(data.salesCents)}</p>
              <p className="mt-1 text-sm text-cocoa-500">{data.soldOrders} {data.soldOrders === 1 ? "pedido confirmado" : "pedidos confirmados"}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Pedidos recebidos" value={String(data.ordersCount)} hint="todos os status" />
              <StatTile label="Ticket médio" value={formatBRL(data.averageTicketCents)} hint="pedidos confirmados" />
              <StatTile label="A receber" value={formatBRL(data.unpaidSoldCents)} hint="confirmados sem pagamento registrado" />
              <StatTile label="Cancelados ou expirados" value={String(data.canceledCount)} />
            </div>
          </section>

          <div className={cn("grid gap-6", data.daily.length > 1 && "lg:grid-cols-[1.4fr_1fr]")}>
            {data.daily.length > 1 && (
              <section className="card min-w-0 p-5" aria-labelledby="grafico">
                <h2 id="grafico" className="mb-3 font-display text-lg">Vendas por dia</h2>
                <SalesChart data={data.daily} />
              </section>
            )}

            <section className="card p-5" aria-labelledby="top">
              <h2 id="top" className="mb-4 font-display text-lg">Mais vendidos</h2>
              {data.topProducts.length === 0 ? (
                <p className="text-sm text-cocoa-600">Nenhuma venda confirmada no período.</p>
              ) : (
                <ul className="space-y-3">
                  {data.topProducts.map((product) => {
                    const max = data.topProducts[0].quantity || 1;
                    return (
                      <li key={product.productId ?? product.name} className="space-y-1">
                        <div className="flex justify-between gap-3 text-sm">
                          <span className="font-medium">{product.name}</span>
                          <span className="tabular-nums text-cocoa-600">{product.quantity} un · {formatBRL(product.revenueCents)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-cream-100" aria-hidden>
                          <div className="h-2 rounded-full bg-caramel-500" style={{ width: `${(product.quantity / max) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <section className="card p-5" aria-labelledby="estoque-baixo">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="estoque-baixo" className="flex items-center gap-2 font-display text-lg">
                <AlertTriangle className="size-5 text-caramel-600" aria-hidden /> Estoque baixo
              </h2>
              <Link to="/admin/estoque" className="text-sm font-semibold text-cocoa-700 hover:text-cocoa-900">Abrir estoque</Link>
            </div>
            {data.lowStock.length === 0 ? (
              <EmptyState className="py-6" title="Tudo abastecido" description="Nenhum produto ativo abaixo do mínimo." />
            ) : (
              <ul className="divide-y divide-cream-200 text-sm">
                {data.lowStock.map((item) => (
                  <li key={item.productId} className="flex items-center justify-between gap-3 py-2">
                    <span>{item.name}</span>
                    <span className={cn("tabular-nums font-semibold", item.stockAvailable === 0 ? "text-berry-700" : "text-caramel-700")}>
                      {item.stockAvailable === 0 ? "Esgotado" : `${item.stockAvailable} disp.`} <span className="font-normal text-cocoa-500">/ mín. {item.lowStockThreshold}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
