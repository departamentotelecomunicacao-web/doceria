import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, ExternalLink, MapPin, MessageCircle, Package, Phone, Printer, Truck, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useAdminAuth } from "@/admin/auth";
import {
  getOrder,
  setPaymentStatus,
  transitionOrder,
  updateDeliveryFee,
  updateOrderNotes,
  type AdminOrderDetail,
} from "@/api/admin";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/StatusBadges";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorState, LoadingBlock, Notice } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatRelativeMinutes } from "@/lib/datetime";
import { storeUrl } from "@/lib/env";
import { ApiError, friendlyMessage } from "@/lib/errors";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { centsToInput, formatBRL, formatDistanceKm, parseBRLToCents } from "@/lib/money";
import { whatsappLink } from "@/lib/whatsapp";
import type { OrderStatus, PaymentStatus } from "@/types/domain";
import { formatBrazilPhone } from "@shared/validation.ts";

const FORWARD_LABEL: Partial<Record<OrderStatus, string>> = {
  AWAITING_PAYMENT: "Aguardar pagamento",
  CONFIRMED: "Confirmar pedido",
  PREPARING: "Iniciar preparo",
  READY: "Marcar como pronto",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  COMPLETED: "Concluir (entregue/retirado)",
};

const PAYMENT_ACTION_LABEL: Record<PaymentStatus, string> = {
  PAID: "Marcar como pago",
  MANUAL_CONFIRMATION: "Comprovante em conferência",
  FAILED: "Pagamento falhou",
  PENDING: "Voltar para pendente",
  REFUNDED: "Registrar reembolso",
};

type TimelineEntry = { at: string; title: string; detail?: string | null; by?: string | null; tone: "status" | "payment" | "event" };

function buildTimeline(order: AdminOrderDetail): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...order.history.map((h) => ({
      at: h.createdAt,
      title: h.fromStatus ? `${ORDER_STATUS_LABEL[h.fromStatus]} → ${ORDER_STATUS_LABEL[h.toStatus]}` : `Pedido criado (${ORDER_STATUS_LABEL[h.toStatus]})`,
      detail: h.note,
      by: h.actorName ?? (h.source === "SYSTEM" ? "Sistema" : h.source === "CUSTOMER" ? "Cliente (loja online)" : null),
      tone: "status" as const,
    })),
    ...order.payments.slice(1).map((p) => ({
      at: p.createdAt,
      title: `Pagamento: ${PAYMENT_STATUS_LABEL[p.status]}`,
      detail: p.note,
      by: p.actorName,
      tone: "payment" as const,
    })),
    ...order.events
      .filter((e) => e.action !== "orders.status_changed" && e.action !== "orders.canceled" && e.action !== "orders.payment_status_changed")
      .map((e) => ({ at: e.createdAt, title: e.summary, by: e.actorName, tone: "event" as const })),
  ];
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

export default function OrderDetail() {
  const { orderId } = useParams();
  const auth = useAdminAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "order", orderId],
    queryFn: () => getOrder(orderId!),
    enabled: Boolean(orderId),
    refetchInterval: 30_000,
  });
  const order = query.data;

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [paymentDialog, setPaymentDialog] = useState<PaymentStatus | null>(null);
  const [paymentNote, setPaymentNote] = useState("");
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeValue, setFeeValue] = useState("");
  const [feeReason, setFeeReason] = useState("");
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (order) setNotes(order.internalNotes ?? "");
  }, [order?.id, order?.internalNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSuccess = (data: AdminOrderDetail, message: string) => {
    queryClient.setQueryData(["admin", "order", orderId], data);
    void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "pending-count"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] });
    toast.success(message);
  };
  const onError = (error: unknown) => {
    if (error instanceof ApiError && (error.code === "INVALID_TRANSITION" || error.code === "INVALID_PAYMENT_TRANSITION")) {
      toast.error("O pedido já foi atualizado", "Mostramos o status mais recente.");
      void query.refetch();
      return;
    }
    toast.error("Não foi possível salvar", friendlyMessage(error));
  };

  const transition = useMutation({
    mutationFn: (vars: { to: OrderStatus; note?: string; restock?: boolean }) => transitionOrder(orderId!, vars.to, vars.note, vars.restock ?? true),
    onSuccess: (data, vars) => onSuccess(data, `Pedido: ${ORDER_STATUS_LABEL[vars.to]}`),
    onError,
  });
  const payment = useMutation({
    mutationFn: (vars: { status: PaymentStatus; note?: string; confirm?: boolean }) => setPaymentStatus(orderId!, vars.status, vars.note, vars.confirm ?? false),
    onSuccess: (data, vars) => onSuccess(data, `Pagamento: ${PAYMENT_STATUS_LABEL[vars.status]}`),
    onError,
  });
  const fee = useMutation({
    mutationFn: (vars: { cents: number; reason: string }) => updateDeliveryFee(orderId!, vars.cents, vars.reason),
    onSuccess: (data) => onSuccess(data, "Taxa de entrega atualizada"),
    onError,
  });
  const saveNotes = useMutation({
    mutationFn: (value: string) => updateOrderNotes(orderId!, value),
    onSuccess: (data) => onSuccess(data, "Anotação salva"),
    onError,
  });

  const timeline = useMemo(() => (order ? buildTimeline(order) : []), [order]);

  if (query.isLoading) return <LoadingBlock label="Carregando pedido…" />;
  if (query.isError || !order) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} title="Não foi possível carregar o pedido" />;
  }

  const busy = transition.isPending || payment.isPending;
  const forward = order.allowedNextStatuses.filter((status) => status !== "CANCELED");
  const canCancel = order.allowedNextStatuses.includes("CANCELED");
  const consumed = !["NEW", "AWAITING_PAYMENT"].includes(order.status);
  const publicLink = storeUrl(`/pedido/${order.publicToken}`);
  const phoneDigits = order.customerPhone?.replace(/\D/g, "") ?? null;
  const customerWhatsapp = whatsappLink(phoneDigits, `Olá, ${order.customerName.split(" ")[0]}! Acompanhe seu pedido #${order.code}: ${publicLink}`);
  const address = order.deliveryAddress;
  const addressText = address
    ? `${address.street ?? ""}, ${address.number ?? ""}${address.complement ? `, ${address.complement}` : ""} - ${address.neighborhood ?? ""}, ${address.city ?? ""}/${address.state ?? ""}`
    : null;
  const mapsLink = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address.street ?? ""}, ${address.number ?? ""} - ${address.neighborhood ?? ""}, ${address.city ?? ""} - ${address.state ?? ""}, ${address.cep ?? ""}`)}`
    : null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info("Copie o link manualmente", publicLink);
    }
  };

  return (
    <div className="space-y-6">
      <div className="no-print flex items-center justify-between gap-3">
        <Link to="/admin/pedidos" className="inline-flex items-center gap-1.5 text-sm font-semibold text-cocoa-700 hover:text-cocoa-900">
          <ArrowLeft className="size-4" aria-hidden /> Pedidos
        </Link>
        <Button variant="ghost" size="sm" icon={<Printer className="size-4" aria-hidden />} onClick={() => window.print()}>Imprimir</Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-3xl font-semibold" data-testid="admin-order-code">#{order.code}</h1>
          <p className="text-sm text-cocoa-600">
            Recebido em {formatDateTime(order.createdAt)} · {order.source === "ADMIN" ? "registrado pela equipe" : "loja online"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="admin-order-status">
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.paymentStatus} />
        </div>
      </header>

      {/* Ações principais */}
      {(forward.length > 0 || canCancel) && (
        <section className="card no-print space-y-3 p-4 sm:p-5" aria-label="Ações do pedido">
          {order.expiresAt && ["NEW", "AWAITING_PAYMENT"].includes(order.status) && (
            <p className="text-sm text-caramel-700">
              A reserva de estoque expira {formatRelativeMinutes(order.expiresAt)} ({formatDateTime(order.expiresAt)}) se o pedido não for confirmado.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {order.status === "AWAITING_PAYMENT" && order.allowedPaymentStatuses.includes("PAID") && (
              <Button variant="success" size="lg" loading={payment.isPending} disabled={busy} className="w-full whitespace-normal sm:w-auto"
                onClick={() => payment.mutate({ status: "PAID", note: "Pagamento conferido", confirm: true })} data-testid="confirm-payment-and-order">
                Confirmar pagamento e pedido
              </Button>
            )}
            {forward.map((status, index) => (
              <Button
                key={status}
                size="lg"
                variant={index === 0 && order.status !== "AWAITING_PAYMENT" ? "primary" : "secondary"}
                loading={transition.isPending && transition.variables?.to === status}
                disabled={busy}
                onClick={() => transition.mutate({ to: status })}
                className="w-full whitespace-normal sm:w-auto"
                data-testid={`transition-${status}`}
              >
                {status === "READY" && order.status === "OUT_FOR_DELIVERY"
                  ? "Voltou (não entregue)"
                  : status === "CONFIRMED" && order.status === "AWAITING_PAYMENT"
                    ? "Confirmar sem registrar pagamento"
                    : FORWARD_LABEL[status] ?? ORDER_STATUS_LABEL[status]}
              </Button>
            ))}
            {canCancel && (
              <Button variant="ghost" size="lg" disabled={busy} onClick={() => { setCancelReason(""); setRestock(true); setCancelOpen(true); }}
                icon={<XCircle className="size-5" aria-hidden />} className="text-berry-700" data-testid="open-cancel">
                Cancelar pedido
              </Button>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          {/* Itens */}
          <section className="card p-5">
            <h2 className="mb-3 font-display text-lg">Itens</h2>
            <ul className="divide-y divide-cream-200 text-sm">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 py-2.5">
                  <span><strong className="text-base">{item.quantity}x</strong> {item.name} <span className="text-cocoa-500">({formatBRL(item.unitPriceCents)})</span></span>
                  <span className="tabular-nums">{formatBRL(item.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1.5 border-t border-cream-200 pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-cocoa-600">Subtotal</dt><dd className="tabular-nums">{formatBRL(order.subtotalCents)}</dd></div>
              {order.fulfillmentType === "DELIVERY" && (
                <div className="flex items-center justify-between">
                  <dt className="text-cocoa-600">
                    Entrega{order.deliveryFeeIsManual && <span className="ml-1 text-xs">(manual)</span>}
                    {auth.hasRole("ADMIN") && !["COMPLETED", "CANCELED", "EXPIRED"].includes(order.status) && !["PAID", "REFUNDED"].includes(order.paymentStatus) && (
                      <button type="button" className="no-print ml-2 text-xs font-semibold text-caramel-700 underline" onClick={() => { setFeeValue(centsToInput(order.deliveryFeeCents)); setFeeReason(""); setFeeOpen(true); }}>
                        ajustar
                      </button>
                    )}
                  </dt>
                  <dd className="tabular-nums">{formatBRL(order.deliveryFeeCents)}</dd>
                </div>
              )}
              <div className="flex justify-between text-base"><dt className="font-semibold">Total</dt><dd className="font-bold tabular-nums">{formatBRL(order.totalCents)}</dd></div>
            </dl>
          </section>

          {/* Recebimento */}
          <section className="card space-y-3 p-5">
            <h2 className="flex items-center gap-2 font-display text-lg">
              {order.fulfillmentType === "DELIVERY" ? <Truck className="size-5" aria-hidden /> : <Package className="size-5" aria-hidden />}
              {order.fulfillmentType === "DELIVERY" ? "Entrega" : "Retirada"} · {formatDateTime(order.scheduledFor)}
            </h2>
            {addressText && (
              <div className="space-y-1 text-sm">
                <p className="font-medium">{addressText}</p>
                {address?.cep && <p className="text-cocoa-600">CEP {address.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}</p>}
                {address?.reference && <p className="text-cocoa-600">Referência: {address.reference}</p>}
                {order.deliveryDistanceMeters !== null && (
                  <p className="text-cocoa-600">Rota: {formatDistanceKm(order.deliveryDistanceMeters)}{order.deliveryDurationSeconds ? ` · ~${Math.round(order.deliveryDurationSeconds / 60)} min` : ""}</p>
                )}
                {mapsLink && (
                  <a href={mapsLink} target="_blank" rel="noopener" className="no-print inline-flex items-center gap-1.5 font-semibold text-caramel-700 underline">
                    <MapPin className="size-4" aria-hidden /> Abrir no mapa
                  </a>
                )}
              </div>
            )}
            {order.customerNotes && <Notice tone="info" title="Observação do cliente">{order.customerNotes}</Notice>}
          </section>

          {/* Linha do tempo */}
          <section className="card p-5">
            <h2 className="mb-4 font-display text-lg">Histórico</h2>
            <ol className="relative space-y-4 border-l border-cream-300 pl-5">
              {timeline.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="relative">
                  <span className={`absolute -left-[1.6rem] top-1 size-3 rounded-full ring-4 ring-white ${entry.tone === "payment" ? "bg-sage-600" : entry.tone === "event" ? "bg-cocoa-400" : "bg-caramel-500"}`} aria-hidden />
                  <p className="text-sm font-semibold">{entry.title}</p>
                  <p className="text-xs text-cocoa-500">{formatDateTime(entry.at)}{entry.by ? ` · ${entry.by}` : ""}</p>
                  {entry.detail && <p className="mt-0.5 text-sm text-cocoa-700">{entry.detail}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-6">
          {/* Cliente */}
          <section className="card space-y-3 p-5">
            <h2 className="font-display text-lg">Cliente</h2>
            <p className="font-semibold">{order.customerName}</p>
            {order.customerPhone && (
              <div className="flex flex-wrap gap-2">
                <a href={`tel:${order.customerPhone}`} className={buttonClasses("secondary", "sm")}><Phone className="size-4" aria-hidden /> {formatBrazilPhone(order.customerPhone)}</a>
                {customerWhatsapp && <a href={customerWhatsapp} target="_blank" rel="noopener" className={buttonClasses("success", "sm")}><MessageCircle className="size-4" aria-hidden /> WhatsApp</a>}
              </div>
            )}
            {order.customerEmail && <p className="text-sm text-cocoa-700">{order.customerEmail}</p>}
            <div className="no-print flex flex-wrap items-center gap-2 border-t border-cream-200 pt-3 text-sm">
              <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 font-semibold text-cocoa-700 hover:text-cocoa-900">
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} Copiar link de acompanhamento
              </button>
              <a href={publicLink} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-cocoa-600 hover:text-cocoa-900">
                <ExternalLink className="size-4" aria-hidden /> abrir
              </a>
            </div>
          </section>

          {/* Pagamento */}
          <section className="card space-y-3 p-5">
            <h2 className="font-display text-lg">Pagamento</h2>
            <p className="text-sm">
              {PAYMENT_METHOD_LABEL[order.paymentMethod]} · <PaymentStatusBadge status={order.paymentStatus} />
            </p>
            {order.cashChangeForCents && <p className="text-sm font-semibold text-caramel-700">Levar troco para {formatBRL(order.cashChangeForCents)}</p>}
            {order.allowedPaymentStatuses.length > 0 && (
              <div className="no-print flex flex-wrap gap-2">
                {order.allowedPaymentStatuses.map((status) => (
                  <Button key={status} size="sm" variant={status === "PAID" ? "success" : "secondary"} disabled={busy}
                    onClick={() => { setPaymentNote(""); setPaymentDialog(status); }} data-testid={`payment-${status}`}>
                    {PAYMENT_ACTION_LABEL[status]}
                  </Button>
                ))}
              </div>
            )}
          </section>

          {/* Anotações internas */}
          <section className="card no-print space-y-3 p-5">
            <h2 className="font-display text-lg">Anotações da equipe</h2>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Visível só para a equipe." />
            <Button size="sm" variant="secondary" loading={saveNotes.isPending} disabled={notes === (order.internalNotes ?? "")} onClick={() => saveNotes.mutate(notes)}>
              Salvar anotação
            </Button>
          </section>
        </div>
      </div>

      {/* Cancelamento */}
      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancelar pedido #${order.code}`}
        description="O cliente verá o pedido como cancelado. O motivo fica registrado no histórico."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>Voltar</Button>
            <Button variant="danger" loading={transition.isPending} disabled={cancelReason.trim().length < 3}
              onClick={() => transition.mutate({ to: "CANCELED", note: cancelReason.trim(), restock }, { onSuccess: () => setCancelOpen(false) })}
              data-testid="confirm-cancel">
              Cancelar pedido
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Motivo" hint="Obrigatório (mínimo de 3 caracteres).">
            {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={500} data-testid="cancel-reason" />}
          </Field>
          {consumed ? (
            <Checkbox checked={restock} onChange={setRestock} label="Devolver os itens ao estoque disponível"
              description="Desmarque se os cookies já foram entregues, descartados ou não podem ser vendidos." />
          ) : (
            <p className="text-sm text-cocoa-600">A reserva de estoque deste pedido volta automaticamente para o disponível.</p>
          )}
        </div>
      </Dialog>

      {/* Pagamento */}
      <Dialog
        open={paymentDialog !== null}
        onClose={() => setPaymentDialog(null)}
        title={paymentDialog ? PAYMENT_ACTION_LABEL[paymentDialog] : ""}
        description={paymentDialog === "PAID" ? `Confirme que ${formatBRL(order.totalCents)} foi recebido.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaymentDialog(null)}>Voltar</Button>
            <Button variant={paymentDialog === "PAID" ? "success" : "primary"} loading={payment.isPending}
              onClick={() => paymentDialog && payment.mutate({ status: paymentDialog, note: paymentNote.trim() || undefined }, { onSuccess: () => setPaymentDialog(null) })}
              data-testid="confirm-payment">
              Confirmar
            </Button>
          </>
        }
      >
        <Field label="Observação" optional>
          {({ id }) => <Input id={id} value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} maxLength={500} placeholder="Ex.: PIX conferido no extrato" />}
        </Field>
      </Dialog>

      {/* Frete manual */}
      <Dialog
        open={feeOpen}
        onClose={() => setFeeOpen(false)}
        title="Ajustar taxa de entrega"
        description="Use quando o cálculo automático não estiver disponível ou quando combinado com o cliente."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFeeOpen(false)}>Voltar</Button>
            <Button loading={fee.isPending} disabled={parseBRLToCents(feeValue) === null || feeReason.trim().length < 3}
              onClick={() => fee.mutate({ cents: parseBRLToCents(feeValue)!, reason: feeReason.trim() }, { onSuccess: () => setFeeOpen(false) })}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nova taxa (R$)">
            {({ id }) => <Input id={id} inputMode="decimal" value={feeValue} onChange={(e) => setFeeValue(e.target.value)} />}
          </Field>
          <Field label="Motivo">
            {({ id }) => <Input id={id} value={feeReason} onChange={(e) => setFeeReason(e.target.value)} maxLength={200} />}
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
