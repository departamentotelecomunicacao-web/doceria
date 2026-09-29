import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ClipboardList, Package, Plus, Search, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { listOrders, type OrderFilters } from "@/api/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/StatusBadges";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Input, Select } from "@/components/ui/Field";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { formatDayLabel, formatTime } from "@/lib/datetime";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import type { FulfillmentType, OrderStatus } from "@/types/domain";

const STATUS_GROUPS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "open", label: "Em aberto", statuses: ["NEW", "AWAITING_PAYMENT", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] },
  { key: "pending", label: "Pendentes", statuses: ["NEW", "AWAITING_PAYMENT"] },
  { key: "production", label: "Em produção", statuses: ["CONFIRMED", "PREPARING"] },
  { key: "ready", label: "Prontos", statuses: ["READY"] },
  { key: "delivery", label: "Em entrega", statuses: ["OUT_FOR_DELIVERY"] },
  { key: "done", label: "Concluídos", statuses: ["COMPLETED"] },
  { key: "closed", label: "Cancelados/expirados", statuses: ["CANCELED", "EXPIRED"] },
  { key: "all", label: "Todos", statuses: [] },
];

const PAGE_SIZE = 25;

function useDebounced<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const statusParam = params.get("status");
  const statuses = useMemo<OrderStatus[]>(() => {
    if (statusParam === "todos") return [];
    if (statusParam) return statusParam.split(",").filter(Boolean) as OrderStatus[];
    return STATUS_GROUPS[0].statuses;
  }, [statusParam]);
  const activeGroup = STATUS_GROUPS.find((group) => group.statuses.join(",") === statuses.join(","))?.key ?? null;

  const [search, setSearch] = useState(params.get("q") ?? "");
  const debouncedSearch = useDebounced(search);
  const fulfillment = (params.get("tipo") ?? "ALL") as FulfillmentType | "ALL";
  const from = params.get("de");
  const to = params.get("ate");
  const page = Math.max(0, Number(params.get("pagina") ?? 0) || 0);

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

  const filters: OrderFilters = { statuses, fulfillment, search: debouncedSearch, from, to, page, pageSize: PAGE_SIZE };
  const query = useQuery({
    queryKey: ["admin", "orders", filters],
    queryFn: () => listOrders(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Pedidos"
        description="Atualiza sozinho. Toque em um pedido para confirmar, mudar status ou registrar pagamento."
        actions={<ButtonLink to="/admin/pedidos/novo" size="sm" icon={<Plus className="size-4" aria-hidden />}>Registrar pedido</ButtonLink>}
      />

      <div className="mb-4 space-y-3">
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
          <div className="flex w-max gap-2" role="group" aria-label="Status">
            {STATUS_GROUPS.map((group) => (
              <button
                key={group.key}
                type="button"
                aria-pressed={activeGroup === group.key}
                onClick={() => setParam("status", group.key === "open" ? null : group.key === "all" ? "todos" : group.statuses.join(","))}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-sm font-semibold",
                  activeGroup === group.key ? "border-cocoa-900 bg-cocoa-900 text-cream-50" : "border-cream-300 bg-white text-cocoa-800",
                )}
              >
                {group.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <label className="relative">
            <span className="sr-only">Buscar por cliente, telefone ou código</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cocoa-400" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente, telefone ou código" className="pl-9" />
          </label>
          <Select value={fulfillment} onChange={(e) => setParam("tipo", e.target.value === "ALL" ? null : e.target.value)} aria-label="Tipo de recebimento">
            <option value="ALL">Retirada e entrega</option>
            <option value="PICKUP">Retirada</option>
            <option value="DELIVERY">Entrega</option>
          </Select>
          <Input type="date" value={from ?? ""} onChange={(e) => setParam("de", e.target.value)} aria-label="De" />
          <Input type="date" value={to ?? ""} onChange={(e) => setParam("ate", e.target.value)} aria-label="Até" />
        </div>
      </div>

      {query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} title="Não foi possível carregar os pedidos" />
      ) : !query.data ? (
        <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : query.data.rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={<ClipboardList className="size-6" aria-hidden />} title="Nenhum pedido encontrado" description="Ajuste os filtros ou aguarde novos pedidos." />
        </div>
      ) : (
        <div className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}>
          {/* Tabela (desktop) */}
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm" data-testid="orders-table">
              <thead className="border-b border-cream-200 bg-cream-50 text-cocoa-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Pedido</th>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Hora</th>
                  <th className="px-4 py-3 text-right font-semibold">Valor</th>
                  <th className="px-4 py-3 font-semibold">Pagamento</th>
                  <th className="px-4 py-3 font-semibold">Recebimento</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {query.data.rows.map((order) => (
                  <tr key={order.id} className="cursor-pointer hover:bg-cream-50" onClick={() => navigate(`/admin/pedidos/${order.id}`)} data-testid="order-row" data-order-code={order.code}>
                    <td className="px-4 py-3">
                      <Link to={`/admin/pedidos/${order.id}`} className="font-mono font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>#{order.code}</Link>
                      {order.source === "ADMIN" && <span className="ml-2 text-xs text-cocoa-500">equipe</span>}
                    </td>
                    <td className="px-4 py-3">{order.customer_name}</td>
                    <td className="px-4 py-3 tabular-nums text-cocoa-700">{formatDayLabel(order.created_at)}, {formatTime(order.created_at)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatBRL(order.total_cents)}</td>
                    <td className="px-4 py-3"><span className="mr-2 text-cocoa-600">{PAYMENT_METHOD_LABEL[order.payment_method].split(" ")[0]}</span><PaymentStatusBadge status={order.payment_status} /></td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-cocoa-700">
                        {order.fulfillment_type === "DELIVERY" ? <Truck className="size-4" aria-hidden /> : <Package className="size-4" aria-hidden />}
                        {order.fulfillment_type === "DELIVERY" ? "Entrega" : "Retirada"}
                      </span>
                      <span className="block text-xs text-cocoa-500">{formatDayLabel(order.scheduled_for)}, {formatTime(order.scheduled_for)}</span>
                    </td>
                    <td className="px-4 py-3"><OrderStatusBadge status={order.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cartões (celular) */}
          <ul className="space-y-2 md:hidden">
            {query.data.rows.map((order) => (
              <li key={order.id}>
                <Link to={`/admin/pedidos/${order.id}`} className="card block space-y-2 p-4" data-testid="order-card" data-order-code={order.code}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold">#{order.code}</span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{order.customer_name}</span>
                    <span className="font-semibold tabular-nums">{formatBRL(order.total_cents)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-cocoa-600">
                    <span className="inline-flex items-center gap-1">
                      {order.fulfillment_type === "DELIVERY" ? <Truck className="size-3.5" aria-hidden /> : <Package className="size-3.5" aria-hidden />}
                      {formatDayLabel(order.scheduled_for)}, {formatTime(order.scheduled_for)}
                    </span>
                    <PaymentStatusBadge status={order.payment_status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between text-sm text-cocoa-600">
            <span>{query.data.total} {query.data.total === 1 ? "pedido" : "pedidos"}</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setParam("pagina", String(page - 1))} aria-label="Página anterior"><ChevronLeft className="size-4" /></Button>
              <span className="tabular-nums">{page + 1} / {totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages} onClick={() => setParam("pagina", String(page + 1))} aria-label="Próxima página"><ChevronRight className="size-4" /></Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
