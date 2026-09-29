import { Check, CheckCircle2, Clock, Copy, MapPin, MessageCircle, Package, RefreshCw, Truck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { EmptyState, ErrorState, LoadingBlock, Notice } from "@/components/ui/States";
import { usePublicOrder } from "@/hooks/useStore";
import { centsToValue, track } from "@/lib/analytics";
import { formatDateTime, formatTime } from "@/lib/datetime";
import { FULFILLMENT_LABEL, ORDER_STATUS_CUSTOMER, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { useDocumentMeta } from "@/lib/seo";
import { readJson } from "@/lib/storage";
import { buildOrderMessage, whatsappLink } from "@/lib/whatsapp";
import type { OrderStatus, PublicOrder } from "@/types/domain";

const PICKUP_STEPS: OrderStatus[] = ["NEW", "CONFIRMED", "PREPARING", "READY", "COMPLETED"];
const DELIVERY_STEPS: OrderStatus[] = ["NEW", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED"];
const STEP_LABEL: Partial<Record<OrderStatus, string>> = {
  NEW: "Recebido",
  CONFIRMED: "Confirmado",
  PREPARING: "Em preparo",
  READY: "Pronto",
  OUT_FOR_DELIVERY: "A caminho",
  COMPLETED: "Concluído",
};

function Progress({ order }: { order: PublicOrder }) {
  const steps = order.fulfillmentType === "DELIVERY" ? DELIVERY_STEPS : PICKUP_STEPS;
  const current = order.status === "AWAITING_PAYMENT" ? 0 : steps.indexOf(order.status);
  return (
    <ol className="grid gap-3 sm:flex sm:gap-0" aria-label="Andamento do pedido">
      {steps.map((step, index) => {
        const done = index < current || order.status === "COMPLETED";
        const active = index === current && order.status !== "COMPLETED";
        return (
          <li key={step} className="flex items-center gap-3 sm:flex-1 sm:flex-col sm:gap-2 sm:text-center">
            <span className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold",
              done ? "border-sage-600 bg-sage-600 text-white" : active ? "border-cocoa-900 bg-cocoa-900 text-cream-50" : "border-cream-300 bg-white text-cocoa-400",
            )}>
              {done ? <Check className="size-4" aria-hidden /> : index + 1}
            </span>
            <span className={cn("text-sm", active ? "font-semibold text-cocoa-900" : done ? "text-cocoa-700" : "text-cocoa-400")}>
              {STEP_LABEL[step]}
              {active && <span className="sr-only"> (etapa atual)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PixBox({ order }: { order: PublicOrder }) {
  const [copied, setCopied] = useState(false);
  if (!order.pix) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(order.pix!.key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="rounded-3xl border-2 border-dashed border-caramel-400 bg-butter-100 p-5 sm:p-6" aria-labelledby="pix-title">
      <h2 id="pix-title" className="font-display text-xl">Pague com PIX</h2>
      <p className="mt-1 text-sm text-cocoa-700">
        Valor: <strong className="tabular-nums">{formatBRL(order.totalCents)}</strong>
        {order.expiresAt && <> · pague até <strong>{formatTime(order.expiresAt)}</strong> para garantir a reserva</>}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="flex-1 break-all rounded-xl bg-white px-4 py-3 font-mono text-sm" data-testid="pix-key">{order.pix.key}</code>
        <Button variant="secondary" onClick={copy} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
          {copied ? "Copiado" : "Copiar chave"}
        </Button>
      </div>
      {order.pix.holderName && <p className="mt-2 text-sm text-cocoa-600">Favorecido: {order.pix.holderName}</p>}
      <p className="mt-3 text-sm text-cocoa-700">Depois de pagar, envie o comprovante pelo WhatsApp. Confirmamos o pedido após a conferência.</p>
    </section>
  );
}

export default function OrderStatusPage() {
  const { publicToken } = useParams();
  const [params] = useSearchParams();
  const justCreated = params.get("novo") === "1";
  const query = usePublicOrder(publicToken);
  const order = query.data;

  useDocumentMeta({ title: order ? `Pedido #${order.code}` : "Acompanhar pedido", robots: "noindex,nofollow" });

  // "purchase" só quando o pagamento é de fato confirmado (pela equipe ou
  // gateway), uma única vez por pedido.
  useEffect(() => {
    if (order?.paymentStatus === "PAID") {
      track("purchase", {
        transaction_id: order.code,
        value: centsToValue(order.totalCents),
        shipping: centsToValue(order.deliveryFeeCents),
        items: order.items.map((item) => ({ item_id: item.name, item_name: item.name, price: centsToValue(item.unitPriceCents), quantity: item.quantity })),
      }, { dedupeKey: order.code });
    }
  }, [order]);

  if (query.isLoading) return <LoadingBlock label="Carregando seu pedido…" />;
  if (query.isError) {
    return <ErrorState className="container-page" error={query.error} onRetry={() => query.refetch()} title="Não foi possível carregar o pedido" />;
  }
  if (!order) {
    return (
      <EmptyState
        className="container-page min-h-[50dvh] justify-center"
        title="Pedido não encontrado"
        description="Confira se o link está completo. Por segurança, cada pedido só pode ser acessado pelo link enviado a você."
        action={<ButtonLink to="/">Voltar à loja</ButtonLink>}
      />
    );
  }

  const extra = readJson<{ addressLine: string | null; scheduleLabel: string | null } | null>(`doceria:order-extra:${publicToken}`, null, "session");
  const addressLine = extra?.addressLine
    ?? (order.deliveryAddress
      ? `${order.deliveryAddress.street}, ${order.deliveryAddress.numberMasked} - ${order.deliveryAddress.neighborhood}, ${order.deliveryAddress.city}/${order.deliveryAddress.state}`
      : null);
  const message = buildOrderMessage({
    code: order.code,
    items: order.items,
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
    fulfillmentType: order.fulfillmentType,
    addressLine,
    scheduleLabel: extra?.scheduleLabel ?? formatDateTime(order.scheduledFor),
    paymentLabel: PAYMENT_METHOD_LABEL[order.paymentMethod],
  });
  const whatsapp = whatsappLink(order.store.whatsappNumber, message);
  const closed = order.status === "CANCELED" || order.status === "EXPIRED";

  return (
    <div className="container-page max-w-3xl space-y-6 py-8 sm:py-12">
      {justCreated && !closed && (
        <div className="animate-slide-up rounded-3xl bg-cocoa-900 p-6 text-cream-50 sm:p-8" data-testid="order-created">
          <CheckCircle2 className="size-10 text-caramel-300" aria-hidden />
          <h1 className="mt-3 font-display text-3xl sm:text-4xl">Pedido recebido, {order.customerFirstName}!</h1>
          <p className="mt-2 text-cream-200">
            Guarde este link para acompanhar o pedido <strong>#{order.code}</strong>. Envie também pelo WhatsApp para agilizar a confirmação.
          </p>
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener" className={buttonClasses("success", "lg", "mt-5")} data-testid="send-whatsapp">
              <MessageCircle className="size-5" aria-hidden /> Enviar pelo WhatsApp
            </a>
          )}
        </div>
      )}

      <section className="card space-y-6 p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Pedido</p>
            <p className="font-display text-3xl" data-testid="order-code">#{order.code}</p>
            <p className="text-sm text-cocoa-600">Feito em {formatDateTime(order.createdAt)}</p>
          </div>
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Badge tone={ORDER_STATUS_TONE[order.status]} className="text-sm" >
              <span data-testid="order-status">{ORDER_STATUS_LABEL[order.status]}</span>
            </Badge>
            <Badge tone={PAYMENT_STATUS_TONE[order.paymentStatus]}>Pagamento: {PAYMENT_STATUS_LABEL[order.paymentStatus]}</Badge>
          </div>
        </div>

        <p className="text-lg text-cocoa-800">{ORDER_STATUS_CUSTOMER[order.status]}</p>

        {closed ? (
          <Notice tone="danger" icon={<XCircle className="size-5" />} title={order.status === "EXPIRED" ? "Prazo encerrado" : "Pedido cancelado"}>
            Se tiver dúvidas, fale com a gente{whatsapp ? " pelo WhatsApp" : ""}.
          </Notice>
        ) : (
          <Progress order={order} />
        )}

        {order.status === "AWAITING_PAYMENT" && <PixBox order={order} />}

        <div className="grid gap-4 rounded-2xl bg-cream-100 p-4 text-sm sm:grid-cols-2">
          <div className="flex gap-3">
            {order.fulfillmentType === "DELIVERY" ? <Truck className="mt-0.5 size-5 shrink-0" aria-hidden /> : <Package className="mt-0.5 size-5 shrink-0" aria-hidden />}
            <div>
              <p className="font-semibold">{FULFILLMENT_LABEL[order.fulfillmentType]}</p>
              {order.deliveryAddress && (
                <p className="text-cocoa-700">
                  {order.deliveryAddress.street}, {order.deliveryAddress.numberMasked}<br />
                  {order.deliveryAddress.neighborhood}, {order.deliveryAddress.city}/{order.deliveryAddress.state}
                </p>
              )}
              {order.pickup?.address && <p className="text-cocoa-700" data-testid="pickup-address"><MapPin className="mr-1 inline size-3.5" aria-hidden />{order.pickup.address}</p>}
              {order.pickup?.instructions && <p className="mt-1 text-cocoa-600">{order.pickup.instructions}</p>}
            </div>
          </div>
          <div className="flex gap-3">
            <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Horário agendado</p>
              <p className="text-cocoa-700">{extra?.scheduleLabel ?? formatDateTime(order.scheduledFor)}</p>
              <p className="text-cocoa-600">{PAYMENT_METHOD_LABEL[order.paymentMethod]}{order.cashChangeForCents ? ` · troco para ${formatBRL(order.cashChangeForCents)}` : ""}</p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-display text-xl">Itens</h2>
          <ul className="divide-y divide-cream-200 text-sm">
            {order.items.map((item) => (
              <li key={item.name} className="flex justify-between gap-3 py-2.5">
                <span><strong>{item.quantity}x</strong> {item.name} <span className="text-cocoa-500">({formatBRL(item.unitPriceCents)} cada)</span></span>
                <span className="tabular-nums">{formatBRL(item.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1.5 border-t border-cream-200 pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-cocoa-600">Subtotal</dt><dd className="tabular-nums">{formatBRL(order.subtotalCents)}</dd></div>
            {order.fulfillmentType === "DELIVERY" && (
              <div className="flex justify-between"><dt className="text-cocoa-600">Entrega</dt><dd className="tabular-nums">{order.deliveryFeeCents === 0 ? "grátis" : formatBRL(order.deliveryFeeCents)}</dd></div>
            )}
            {order.discountCents > 0 && (
              <div className="flex justify-between"><dt className="text-cocoa-600">Desconto</dt><dd className="tabular-nums">-{formatBRL(order.discountCents)}</dd></div>
            )}
            <div className="flex justify-between text-base"><dt className="font-semibold">Total</dt><dd className="font-bold tabular-nums" data-testid="order-total">{formatBRL(order.totalCents)}</dd></div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-5">
          <button type="button" onClick={() => query.refetch()} className="inline-flex items-center gap-2 text-sm font-semibold text-cocoa-700 hover:text-cocoa-900">
            <RefreshCw className={cn("size-4", query.isFetching && "animate-spin")} aria-hidden /> Atualizar status
          </button>
          {!justCreated && whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener" className={buttonClasses("secondary", "sm")}>
              <MessageCircle className="size-4" aria-hidden /> Falar sobre este pedido
            </a>
          )}
        </div>
      </section>

      <p className="text-center text-sm text-cocoa-600">
        <Link to="/produtos" className="font-semibold underline underline-offset-2">Voltar ao cardápio</Link>
      </p>
    </div>
  );
}
