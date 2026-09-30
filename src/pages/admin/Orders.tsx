import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Bike, ChevronLeft, ChevronRight, ClipboardList, Search, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { getDaySummary, listOrders, type OrderFilters, type OrderView } from "@/api/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { OrderStatusBadge, PaidBadge } from "@/components/admin/StatusBadges";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/Field";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { formatScheduleShort, formatTime, storeDateKey } from "@/lib/datetime";
import { formatBRL } from "@/lib/money";

const VIEWS: { key: OrderView; label: string }[] = [
  { key: "open", label: "Em aberto" },
  { key: "today", label: "Para hoje" },
  { key: "all", label: "Todos" },
];

const PAGE_SIZE = 30;

function useDebounced<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function Tile({ label, value, highlight, testId }: { label: string; value: string; highlight?: boolean; testId?: string }) {
  return (
    <div className={cn("card p-4", highlight && "border-caramel-500 bg-butter-100")}>
      <p className="text-2xl font-semibold tabular-nums text-cocoa-900" data-testid={testId}>{value}</p>
      <p className="text-sm text-cocoa-600">{label}</p>
    </div>
  );
}

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.some((v) => v.key === params.get("ver")) ? params.get("ver") : "open") as OrderView;
  const page = Math.max(0, Number(params.get("pagina") ?? 0) || 0);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debouncedSearch = useDebounced(search);
  const today = storeDateKey(new Date());

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    if (key !== "pagina") next.delete("pagina");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (debouncedSearch) next.set("q", debouncedSearch);
    else next.delete("q");
    if (next.toString() !== params.toString()) {
      next.delete("pagina");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const filters: OrderFilters = { view, today, search: debouncedSearch, page, pageSize: PAGE_SIZE };
  const query = useQuery({
    queryKey: ["admin", "orders", filters],
    queryFn: () => listOrders(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const summary = useQuery({
    queryKey: ["admin", "orders", "summary", today],
    queryFn: () => getDaySummary(today),
    refetchInterval: 30_000,
  });
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div>
      <PageHeader title="Pedidos" description="Atualiza sozinho. Toque em um pedido para confirmar, avisar o cliente ou marcar como pago." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Novos para confirmar" value={String(summary.data?.newOrders ?? "…")} highlight={(summary.data?.newOrders ?? 0) > 0} testId="summary-new" />
        <Tile label="Para entregar/retirar hoje" value={String(summary.data?.scheduledToday ?? "…")} />
        <Tile label="Pedidos feitos hoje" value={String(summary.data?.receivedToday ?? "…")} />
        <Tile label="Vendido hoje" value={summary.data ? formatBRL(summary.data.salesTodayCents) : "…"} testId="summary-sales" />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2" role="group" aria-label="Filtro">
          {VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={view === item.key}
              onClick={() => setParam("ver", item.key === "open" ? null : item.key)}
              className={cn(
                "h-9 rounded-full border px-4 text-sm font-semibold",
                view === item.key ? "border-cocoa-900 bg-cocoa-900 text-cream-50" : "border-cream-300 bg-white text-cocoa-800",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="relative sm:w-72">
          <span className="sr-only">Buscar por cliente, WhatsApp ou código</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cocoa-400" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente, WhatsApp ou código" className="pl-9" />
        </label>
      </div>

      {query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} title="Não foi possível carregar os pedidos" />
      ) : !query.data ? (
        <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : query.data.rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ClipboardList className="size-6" aria-hidden />}
            title={view === "open" ? "Nenhum pedido em aberto" : "Nenhum pedido encontrado"}
            description={view === "open" ? "Quando chegar um pedido, ele aparece aqui com um aviso sonoro." : "Ajuste a busca ou o filtro."}
          />
        </div>
      ) : (
        <div className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}>
          <ul className="grid gap-2 lg:grid-cols-2" data-testid="orders-list">
            {query.data.rows.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/admin/pedidos/${order.id}`}
                  className={cn("card block space-y-2 p-4 transition-colors hover:border-cocoa-400", order.status === "RECEIVED" && "border-caramel-500")}
                  data-testid="order-card"
                  data-order-code={order.code}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold">#{order.code}</span>
                    <OrderStatusBadge status={order.status} type={order.fulfillment_type} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{order.customer_name}</span>
                    <span className="font-semibold tabular-nums">{formatBRL(order.total_cents)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-cocoa-600">
                    <span className="inline-flex items-center gap-1">
                      {order.fulfillment_type === "DELIVERY" ? <Bike className="size-3.5" aria-hidden /> : <Store className="size-3.5" aria-hidden />}
                      {order.fulfillment_type === "DELIVERY" ? order.address_district ?? "Entrega" : "Retirada"}
                    </span>
                    <span className="font-semibold text-cocoa-800">{formatScheduleShort(order.scheduled_date, order.scheduled_period, today)}</span>
                    <span>feito às {formatTime(order.created_at)}</span>
                    <PaidBadge paid={order.is_paid} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-cocoa-600">
              <span>{query.data.total} pedidos</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setParam("pagina", String(page - 1))} aria-label="Página anterior"><ChevronLeft className="size-4" /></Button>
                <span className="tabular-nums">{page + 1} / {totalPages}</span>
                <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages} onClick={() => setParam("pagina", String(page + 1))} aria-label="Próxima página"><ChevronRight className="size-4" /></Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
