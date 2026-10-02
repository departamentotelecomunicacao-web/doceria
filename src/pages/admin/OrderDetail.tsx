import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bike, Copy, Mail, MapPin, MessageCircle, Phone, RotateCcw, Store, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  getOrder,
  notifyCustomer,
  setDeliveryFee,
  setInternalNotes,
  setOrderPaid,
  setOrderStatus,
  type NotifyResult,
} from "@/api/admin";
import { OrderStatusBadge, PaidBadge } from "@/components/admin/StatusBadges";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorState, LoadingBlock, Notice } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatScheduleLong } from "@/lib/datetime";
import { storeUrl } from "@/lib/env";
import { friendlyMessage } from "@/lib/errors";
import { nextStatuses, orderStatusLabel, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { centsToInput, formatBRL, parseBRLToCents } from "@/lib/money";
import { buildStatusMessage, formatAddressLine, whatsappLink } from "@/lib/whatsapp";
import type { OrderStatus } from "@/types/domain";
import { formatBrazilPhone } from "@shared/validation.ts";

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "Confirmar pedido",
  PREPARING: "Iniciar preparo",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  READY_FOR_PICKUP: "Pronto para retirada",
  DELIVERED: "Concluir pedido",
};

const EMAIL_KIND_LABEL: Record<string, string> = {
  ORDER_RECEIVED: "Confirmação de recebimento",
  STORE_NEW_ORDER: "Aviso de pedido novo (loja)",
  ORDER_CONFIRMED: "Pedido confirmado",
  ORDER_OUT_FOR_DELIVERY: "Saiu para entrega",
  ORDER_READY_FOR_PICKUP: "Pronto para retirada",
  ORDER_CANCELED: "Pedido cancelado",
};

const EVENT_LABEL: Record<string, string> = { CREATED: "Pedido feito", STATUS: "Status", PAYMENT: "Pagamento", FEE: "Taxa de entrega" };

function Card({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export default function OrderDetail() {
  const { orderId = "" } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ["admin", "order", orderId], queryFn: () => getOrder(orderId), refetchInterval: 30_000 });
  const detail = query.data;

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeInput, setFeeInput] = useState("");
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);

  useEffect(() => {
    if (detail && !notesDirty) setNotes(detail.order.internal_notes);
  }, [detail, notesDirty]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "order", orderId] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "pending-count"] });
  };
  const onError = (error: unknown) => {
    toast.error("Não foi possível salvar", friendlyMessage(error));
    refresh();
  };
  const reportEmail = (result: NotifyResult) => {
    if (result.status === "SENT") toast.success("E-mail enviado ao cliente");
    else if (result.status === "FAILED") toast.error("O e-mail não foi enviado", "Avise o cliente pelo WhatsApp ou tente reenviar.");
  };

  const statusMutation = useMutation({
    mutationFn: async ({ status, message }: { status: OrderStatus; message?: string }) => {
      await setOrderStatus(orderId, status, message);
      // Devolutiva automática por e-mail (o servidor decide se cabe e evita repetição).
      try {
        return await notifyCustomer(orderId, "STATUS");
      } catch {
        return { kind: null, status: "FAILED", reason: "network" } as NotifyResult;
      }
    },
    onSuccess: (email, { status }) => {
      toast.success(`Pedido: ${orderStatusLabel(status, detail?.order.fulfillment_type)}`);
      reportEmail(email);
      setCancelOpen(false);
      refresh();
    },
    onError,
  });
  const paidMutation = useMutation({
    mutationFn: (paid: boolean) => setOrderPaid(orderId, paid),
    onSuccess: (_, paid) => { toast.success(paid ? "Pagamento registrado" : "Pagamento desmarcado"); refresh(); },
    onError,
  });
  const feeMutation = useMutation({
    mutationFn: (cents: number) => setDeliveryFee(orderId, cents),
    onSuccess: () => { toast.success("Taxa de entrega atualizada"); setFeeOpen(false); refresh(); },
    onError,
  });
  const notesMutation = useMutation({
    mutationFn: (value: string) => setInternalNotes(orderId, value),
    onSuccess: () => { toast.success("Anotação salva"); setNotesDirty(false); refresh(); },
    onError,
  });
  const resendMutation = useMutation({
    mutationFn: () => notifyCustomer(orderId, "RECEIVED", true),
    onSuccess: (result) => {
      if (result.status === "SKIPPED") toast.info("E-mail não enviado", result.reason);
      else reportEmail(result);
      refresh();
    },
    onError,
  });

  if (query.isLoading) return <LoadingBlock label="Carregando pedido…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} title="Não foi possível carregar o pedido" />;
  if (!detail) {
    return (
      <Notice tone="warning" title="Pedido não encontrado">
        <Link to="/admin/pedidos" className="font-semibold underline">Voltar aos pedidos</Link>
      </Notice>
    );
  }

  const { order } = detail;
  const next = nextStatuses(order.status, order.fulfillment_type);
  const forward = next.filter((status) => status !== "CANCELED");
  const primary = forward[0];
  const canCancel = next.includes("CANCELED");
  const closed = order.status === "DELIVERED" || order.status === "CANCELED";
  const busy = statusMutation.isPending;
  const isDelivery = order.fulfillment_type === "DELIVERY";
  const publicLink = storeUrl(`/pedido/${order.public_token}`);
  const waMessage = buildStatusMessage(order.status, {
    code: order.code,
    customerName: order.customer_name,
    items: detail.items.map((item) => ({ name: item.product_name, quantity: item.quantity, lineTotalCents: item.line_total_cents })),
    deliveryFeeCents: order.delivery_fee_cents,
    totalCents: order.total_cents,
    fulfillmentType: order.fulfillment_type,
    district: order.address_district,
    scheduledDate: order.scheduled_date,
    scheduledPeriod: order.scheduled_period,
    paymentMethod: order.payment_method,
    orderUrl: publicLink,
  });
  const waCustomer = whatsappLink(order.customer_phone, waMessage);
  const address = isDelivery ? formatAddressLine({
    street: order.address_street,
    number: order.address_number,
    district: order.address_district,
    complement: order.address_complement,
    reference: order.address_reference,
  }) : null;
  const mapsLink = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.address_street}, ${order.address_number} - ${order.address_district}, Cachoeiro de Itapemirim - ES`)}`
    : null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicLink);
      toast.success("Link do pedido copiado");
    } catch {
      toast.info("Copie o link manualmente", publicLink);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Link to="/admin/pedidos" className="inline-flex items-center gap-1.5 text-sm font-semibold text-cocoa-700 hover:text-cocoa-900">
          <ArrowLeft className="size-4" aria-hidden /> Pedidos
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl">Pedido <span className="font-mono" data-testid="admin-order-code">#{order.code}</span></h1>
            <p className="text-sm text-cocoa-600">Feito em {formatDateTime(order.created_at)}</p>
          </div>
          <div className="flex items-center gap-2" data-testid="admin-order-status">
            <OrderStatusBadge status={order.status} type={order.fulfillment_type} />
            <PaidBadge paid={order.is_paid} />
          </div>
        </div>
      </div>

      {/* Próximo passo ------------------------------------------------------------ */}
      {!closed && (
        <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          {primary && (
            <Button size="lg" loading={busy} onClick={() => statusMutation.mutate({ status: primary })} className="sm:flex-1" data-testid="next-status">
              {ACTION_LABEL[primary] ?? orderStatusLabel(primary, order.fulfillment_type)}
            </Button>
          )}
          {forward.slice(1).map((status) => (
            <Button key={status} variant="secondary" size="lg" disabled={busy} onClick={() => statusMutation.mutate({ status })}>
              {ACTION_LABEL[status]}
            </Button>
          ))}
          {canCancel && (
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => { setCancelReason(""); setCancelOpen(true); }} icon={<XCircle className="size-5" />} data-testid="cancel-order">
              Cancelar
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          {/* Cliente --------------------------------------------------------------- */}
          <Card title="Cliente">
            <p className="font-semibold" data-testid="customer-name">{order.customer_name}</p>
            <div className="flex flex-wrap gap-2">
              {waCustomer && (
                <a href={waCustomer} target="_blank" rel="noopener" className={buttonClasses("success", "sm")} data-testid="whatsapp-customer">
                  <MessageCircle className="size-4" aria-hidden /> Avisar no WhatsApp
                </a>
              )}
              <a href={`tel:${order.customer_phone}`} className={buttonClasses("secondary", "sm")}>
                <Phone className="size-4" aria-hidden /> {formatBrazilPhone(order.customer_phone)}
              </a>
            </div>
            <p className="text-xs text-cocoa-500">O WhatsApp abre com a mensagem do status atual pronta para enviar.</p>
            {order.customer_email && (
              <p className="flex items-center gap-2 text-sm text-cocoa-700"><Mail className="size-4" aria-hidden /> {order.customer_email}</p>
            )}
          </Card>

          {/* Entrega ou retirada --------------------------------------------------- */}
          <Card title={isDelivery ? "Entrega" : "Retirada"}>
            <p className="flex items-start gap-2 text-sm">
              {isDelivery ? <Bike className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Store className="mt-0.5 size-4 shrink-0" aria-hidden />}
              <span className="font-semibold">{formatScheduleLong(order.scheduled_date, order.scheduled_period)}</span>
            </p>
            {address && (
              <div className="space-y-2">
                <p className="text-sm text-cocoa-800" data-testid="delivery-address">{address}</p>
                {mapsLink && (
                  <a href={mapsLink} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm font-semibold text-cocoa-700 underline">
                    <MapPin className="size-4" aria-hidden /> Abrir no mapa
                  </a>
                )}
              </div>
            )}
            {order.customer_notes && (
              <Notice tone="info" title="Observação do cliente">{order.customer_notes}</Notice>
            )}
          </Card>

          {/* Pagamento ------------------------------------------------------------- */}
          <Card title="Pagamento">
            <p className="text-sm">
              {PAYMENT_METHOD_LABEL[order.payment_method]}
              {order.cash_change_for_cents ? ` · troco para ${formatBRL(order.cash_change_for_cents)}` : ""}
            </p>
            {order.status !== "CANCELED" && (
              <Button
                variant={order.is_paid ? "secondary" : "primary"}
                loading={paidMutation.isPending}
                onClick={() => paidMutation.mutate(!order.is_paid)}
                data-testid="toggle-paid"
              >
                {order.is_paid ? "Desmarcar pagamento" : `Marcar como pago · ${formatBRL(order.total_cents)}`}
              </Button>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {/* Itens ------------------------------------------------------------------ */}
          <Card title="Itens">
            <ul className="divide-y divide-cream-200 text-sm">
              {detail.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 py-2">
                  <span><strong>{item.quantity}x</strong> {item.product_name}</span>
                  <span className="tabular-nums">{formatBRL(item.line_total_cents)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-cream-200 pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-cocoa-600">Subtotal</dt><dd className="tabular-nums">{formatBRL(order.subtotal_cents)}</dd></div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-cocoa-600">{isDelivery ? "Entrega" : "Retirada"}</dt>
                <dd className="flex items-center gap-2 tabular-nums">
                  {isDelivery ? formatBRL(order.delivery_fee_cents) : "grátis"}
                  {isDelivery && !closed && (
                    <button type="button" className="-my-2 inline-flex min-h-9 items-center rounded-full px-2 text-xs font-semibold text-cocoa-700 underline hover:bg-cream-100" onClick={() => { setFeeInput(centsToInput(order.delivery_fee_cents)); setFeeOpen(true); }} data-testid="edit-fee">
                      alterar
                    </button>
                  )}
                </dd>
              </div>
              <div className="flex justify-between text-base"><dt className="font-semibold">Total</dt><dd className="font-bold tabular-nums" data-testid="order-total">{formatBRL(order.total_cents)}</dd></div>
            </dl>
          </Card>

          {/* Anotações -------------------------------------------------------------- */}
          <Card title="Anotações da equipe">
            <Textarea value={notes} onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }} maxLength={2000} placeholder="Visível só para a equipe" aria-label="Anotações da equipe" />
            {notesDirty && (
              <Button size="sm" loading={notesMutation.isPending} onClick={() => notesMutation.mutate(notes)}>Salvar anotação</Button>
            )}
          </Card>

          {/* E-mails ---------------------------------------------------------------- */}
          <Card
            title="E-mails"
            actions={order.customer_email ? (
              <Button size="sm" variant="secondary" loading={resendMutation.isPending} onClick={() => resendMutation.mutate()} icon={<RotateCcw className="size-4" />}>
                Reenviar confirmação
              </Button>
            ) : undefined}
          >
            {!order.customer_email && <p className="text-sm text-cocoa-600">O cliente não informou e-mail. Use o WhatsApp.</p>}
            {detail.notifications.length === 0 ? (
              <p className="text-sm text-cocoa-500">Nenhum e-mail registrado.</p>
            ) : (
              <ul className="space-y-1.5 text-sm" data-testid="email-log">
                {detail.notifications.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{EMAIL_KIND_LABEL[n.kind] ?? n.kind}</span>
                    <span className={n.status === "SENT" ? "text-sage-700" : n.status === "FAILED" ? "text-berry-700" : "text-cocoa-500"}>
                      {n.status === "SENT" ? "enviado" : n.status === "FAILED" ? "falhou" : "não enviado"} · {formatDateTime(n.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Histórico ------------------------------------------------------------- */}
          <Card title="Histórico" actions={<Button size="sm" variant="ghost" onClick={copyLink} icon={<Copy className="size-4" />}>Link do cliente</Button>}>
            <ol className="space-y-2 text-sm">
              {detail.events.map((event) => (
                <li key={event.id} className="flex flex-wrap justify-between gap-2 border-b border-cream-200 pb-2 last:border-0">
                  <span>
                    <strong>{EVENT_LABEL[event.kind] ?? event.kind}</strong>
                    {event.to_status && event.kind === "STATUS" && `: ${orderStatusLabel(event.to_status, order.fulfillment_type)}`}
                    {event.message && event.kind !== "CREATED" && <span className="text-cocoa-600"> · {event.message}</span>}
                  </span>
                  <span className="text-cocoa-500">{formatDateTime(event.created_at)}{event.actorName ? ` · ${event.actorName}` : ""}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancelar pedido #${order.code}?`}
        description="Os produtos com controle de estoque voltam para o estoque. O cliente recebe um e-mail avisando (se informou e-mail)."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>Voltar</Button>
            <Button variant="danger" loading={busy} onClick={() => statusMutation.mutate({ status: "CANCELED", message: cancelReason })} data-testid="confirm-cancel">
              Cancelar pedido
            </Button>
          </>
        }
      >
        <Field label="Motivo" optional>
          {({ id }) => <Input id={id} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={300} placeholder="Ex.: cliente desistiu" />}
        </Field>
      </Dialog>

      <Dialog
        open={feeOpen}
        onClose={() => setFeeOpen(false)}
        title="Alterar taxa de entrega"
        description="Vale só para este pedido. O total é recalculado."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFeeOpen(false)}>Voltar</Button>
            <Button
              loading={feeMutation.isPending}
              onClick={() => {
                const cents = parseBRLToCents(feeInput);
                if (cents === null) { toast.error("Valor inválido", "Use o formato 5,00."); return; }
                feeMutation.mutate(cents);
              }}
              data-testid="save-fee"
            >
              Salvar
            </Button>
          </>
        }
      >
        <Field label="Taxa de entrega (R$)">
          {({ id }) => <Input id={id} inputMode="decimal" value={feeInput} onChange={(e) => setFeeInput(e.target.value)} data-testid="fee-input" />}
        </Field>
      </Dialog>
    </div>
  );
}

