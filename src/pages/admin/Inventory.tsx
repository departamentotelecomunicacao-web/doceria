import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Minus, PackagePlus, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { adjustInventory, listInventory, listMovements, type InventoryRow } from "@/api/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, LoadingBlock, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/datetime";
import { friendlyMessage } from "@/lib/errors";
import { STOCK_STATUS_LABEL } from "@/lib/labels";
import type { StockStatus } from "@/types/domain";

type Action = "IN" | "OUT" | "ADJUSTMENT";

const ACTION_LABEL: Record<Action, string> = { IN: "Entrada", OUT: "Saída", ADJUSTMENT: "Ajuste" };
const REASONS: Record<Action, string[]> = {
  IN: ["Fornada do dia", "Produção extra", "Devolução"],
  OUT: ["Quebra ou avaria", "Degustação", "Venda no balcão", "Vencimento"],
  ADJUSTMENT: ["Contagem física", "Correção de lançamento"],
};
const MOVEMENT_LABEL: Record<string, string> = {
  IN: "Entrada",
  OUT: "Saída",
  RESERVATION: "Reserva",
  RELEASE: "Liberação",
  ADJUSTMENT: "Ajuste",
};
const STATUS_TONE: Record<StockStatus, "success" | "warning" | "danger"> = { AVAILABLE: "success", LOW: "warning", SOLD_OUT: "danger" };

function MovementHistory({ product }: { product: InventoryRow }) {
  const query = useQuery({ queryKey: ["admin", "movements", product.id], queryFn: () => listMovements(product.id) });
  if (query.isLoading) return <LoadingBlock className="py-6" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} className="py-6" />;
  if (!query.data?.length) return <p className="text-sm text-cocoa-600">Nenhuma movimentação registrada.</p>;
  return (
    <ul className="divide-y divide-cream-200 text-sm">
      {query.data.map((movement) => (
        <li key={movement.id} className="flex items-start justify-between gap-3 py-2">
          <div>
            <p className="font-semibold">{MOVEMENT_LABEL[movement.type]} · {movement.reason}</p>
            <p className="text-xs text-cocoa-500">{formatDateTime(movement.created_at)} · {movement.source === "ORDER" ? "pedido" : movement.source === "SYSTEM" ? "sistema" : "equipe"}</p>
          </div>
          <div className="text-right tabular-nums">
            <p className={cn("font-semibold", movement.available_delta > 0 ? "text-sage-700" : movement.available_delta < 0 ? "text-berry-700" : "text-cocoa-600")}>
              {movement.available_delta > 0 ? "+" : ""}{movement.available_delta} disp.
            </p>
            <p className="text-xs text-cocoa-500">fica {movement.available_after} disp. / {movement.reserved_after} res.</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Inventory() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "inventory"], queryFn: listInventory, refetchInterval: 30_000 });
  const [filter, setFilter] = useState<"ALL" | "LOW" | "SOLD_OUT">("ALL");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [target, setTarget] = useState<{ product: InventoryRow; action: Action } | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [historyFor, setHistoryFor] = useState<InventoryRow | null>(null);

  const mutation = useMutation({
    mutationFn: (vars: { productId: string; action: Action; quantity: number; reason: string }) =>
      adjustInventory(vars.productId, vars.action, vars.quantity, vars.reason),
    onSuccess: (_data, vars) => {
      toast.success(`${ACTION_LABEL[vars.action]} registrada`);
      setTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "movements", vars.productId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (error) => toast.error("Não foi possível registrar", friendlyMessage(error)),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter((row) =>
      (showInactive || row.is_active) &&
      (filter === "ALL" || row.stock_status === filter || (filter === "LOW" && row.stock_status === "SOLD_OUT")) &&
      (!term || row.name.toLowerCase().includes(term)));
  }, [query.data, filter, search, showInactive]);

  const counts = useMemo(() => {
    const active = (query.data ?? []).filter((row) => row.is_active);
    return {
      low: active.filter((row) => row.stock_status !== "AVAILABLE").length,
      soldOut: active.filter((row) => row.stock_status === "SOLD_OUT").length,
    };
  }, [query.data]);

  const openAction = (product: InventoryRow, action: Action) => {
    setTarget({ product, action });
    setQuantity(action === "ADJUSTMENT" ? String(product.stock_available) : "");
    setReason("");
  };

  const qty = Number(quantity);
  const qtyValid = Number.isInteger(qty) && (target?.action === "ADJUSTMENT" ? qty >= 0 : qty > 0) && qty <= 100000;
  const preview = target && qtyValid
    ? target.action === "IN" ? target.product.stock_available + qty
      : target.action === "OUT" ? target.product.stock_available - qty
      : qty
    : null;

  const actions = (row: InventoryRow) => (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" variant="secondary" onClick={() => openAction(row, "IN")} icon={<PackagePlus className="size-4" aria-hidden />} data-testid={`stock-in-${row.slug}`}>Entrada</Button>
      <Button size="sm" variant="secondary" onClick={() => openAction(row, "OUT")} icon={<Minus className="size-4" aria-hidden />} disabled={row.stock_available === 0}>Saída</Button>
      <Button size="sm" variant="ghost" onClick={() => openAction(row, "ADJUSTMENT")} icon={<SlidersHorizontal className="size-4" aria-hidden />}>Ajuste</Button>
      <Button size="sm" variant="ghost" onClick={() => setHistoryFor(row)} aria-label={`Histórico de ${row.name}`}><History className="size-4" aria-hidden /></Button>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Estoque"
        description="Unidades prontas para venda. Reservado = pedidos aguardando confirmação/pagamento. Toda alteração exige motivo e fica registrada."
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex gap-2" role="group" aria-label="Filtro">
          {([["ALL", "Todos"], ["LOW", `Baixo (${counts.low})`], ["SOLD_OUT", `Esgotados (${counts.soldOut})`]] as const).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
              className={cn("h-9 rounded-full border px-3.5 text-sm font-semibold", filter === key ? "border-cocoa-900 bg-cocoa-900 text-cream-50" : "border-cream-300 bg-white text-cocoa-800")}>
              {label}
            </button>
          ))}
        </div>
        <label className="relative flex-1">
          <span className="sr-only">Buscar produto</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cocoa-400" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto" className="pl-9" />
        </label>
        <Checkbox checked={showInactive} onChange={setShowInactive} label="Mostrar inativos" />
      </div>

      {query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} title="Não foi possível carregar o estoque" />
      ) : !query.data ? (
        <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : rows.length === 0 ? (
        <div className="card"><EmptyState title="Nenhum produto neste filtro" /></div>
      ) : (
        <>
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm" data-testid="inventory-table">
              <thead className="border-b border-cream-200 bg-cream-50 text-cocoa-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Produto</th>
                  <th className="px-4 py-3 text-right font-semibold">Disponível</th>
                  <th className="px-4 py-3 text-right font-semibold">Reservado</th>
                  <th className="px-4 py-3 text-right font-semibold">Mínimo</th>
                  <th className="px-4 py-3 text-right font-semibold">Vendidos 30d</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {rows.map((row) => (
                  <tr key={row.id} data-testid="inventory-row" data-product-slug={row.slug}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{row.name}</p>
                      <p className="text-xs text-cocoa-500">{row.category_name ?? "Sem categoria"}{!row.is_active && " · inativo"}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-base font-semibold tabular-nums" data-testid="stock-available">{row.stock_available}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-cocoa-600" data-testid="stock-reserved">{row.stock_reserved}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-cocoa-600">{row.low_stock_threshold}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-cocoa-600">{row.consumed_30d}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[row.stock_status]}>{STOCK_STATUS_LABEL[row.stock_status]}</Badge></td>
                    <td className="px-4 py-3">{actions(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="card space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{row.name}</p>
                    <p className="text-xs text-cocoa-500">Mín. {row.low_stock_threshold} · vendidos 30d: {row.consumed_30d}</p>
                  </div>
                  <Badge tone={STATUS_TONE[row.stock_status]}>{STOCK_STATUS_LABEL[row.stock_status]}</Badge>
                </div>
                <div className="flex gap-6 text-sm">
                  <p><span className="text-2xl font-semibold">{row.stock_available}</span> <span className="text-cocoa-600">disponível</span></p>
                  <p><span className="text-2xl font-semibold text-cocoa-600">{row.stock_reserved}</span> <span className="text-cocoa-600">reservado</span></p>
                </div>
                {actions(row)}
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target ? `${ACTION_LABEL[target.action]}: ${target.product.name}` : ""}
        description={target ? `Disponível agora: ${target.product.stock_available} · reservado: ${target.product.stock_reserved}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>Voltar</Button>
            <Button
              loading={mutation.isPending}
              disabled={!qtyValid || reason.trim().length < 3 || (preview !== null && preview < 0)}
              onClick={() => target && mutation.mutate({ productId: target.product.id, action: target.action, quantity: qty, reason: reason.trim() })}
              data-testid="confirm-stock"
            >
              Registrar
            </Button>
          </>
        }
      >
        {target && (
          <div className="space-y-4">
            <Field label={target.action === "ADJUSTMENT" ? "Nova quantidade disponível (contagem)" : "Quantidade"}
              error={preview !== null && preview < 0 ? "A saída não pode deixar o estoque negativo." : undefined}>
              {({ id }) => <Input id={id} type="number" inputMode="numeric" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="stock-quantity" />}
            </Field>
            <Field label="Motivo" hint="Obrigatório. Aparece no histórico e na auditoria.">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} data-testid="stock-reason" />}
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {REASONS[target.action].map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => setReason(suggestion)} className="rounded-full border border-cream-300 px-3 py-1 text-xs font-semibold text-cocoa-700 hover:bg-cream-100">
                  {suggestion}
                </button>
              ))}
            </div>
            {preview !== null && preview >= 0 && (
              <p className="text-sm text-cocoa-700">Depois do registro: <strong>{preview}</strong> disponível.</p>
            )}
          </div>
        )}
      </Dialog>

      <Dialog open={historyFor !== null} onClose={() => setHistoryFor(null)} title={historyFor ? `Histórico: ${historyFor.name}` : ""} size="lg">
        {historyFor && <MovementHistory product={historyFor} />}
      </Dialog>
    </div>
  );
}
