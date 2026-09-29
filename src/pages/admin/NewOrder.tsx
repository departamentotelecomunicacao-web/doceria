import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Route, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { createAdminOrder, listAdminProducts } from "@/api/admin";
import { requestDeliveryQuote } from "@/api/store";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/Button";
import { ChoiceCard, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { storeDateKey } from "@/lib/datetime";
import { friendlyMessage } from "@/lib/errors";
import { newIdempotencyKey } from "@/lib/idempotency";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { formatBRL, formatDistanceKm, parseBRLToCents } from "@/lib/money";
import { maxPurchasable } from "@/store/cartLogic";
import type { FulfillmentType, PaymentMethod } from "@/types/domain";
import { normalizeBrazilPhone, validateAddress, type AddressInput } from "@shared/validation.ts";
import { storeDayStartIso } from "@/api/admin";

/**
 * Registro de pedido pela equipe (ex.: pedido recebido pelo WhatsApp ou quando
 * o cálculo automático de entrega falhou). Usa a mesma função do banco da loja:
 * preços e estoque vêm do servidor; o frete pode ser informado manualmente.
 */
export default function NewOrder() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ["admin", "products"], queryFn: listAdminProducts });
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [lines, setLines] = useState<{ productId: string; quantity: number }[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<FulfillmentType>("PICKUP");
  const [address, setAddress] = useState<AddressInput>({ cep: "", street: "", number: "", complement: "", neighborhood: "", city: "Cachoeiro de Itapemirim", state: "ES", reference: "" });
  const [fee, setFee] = useState("");
  const [quoteInfo, setQuoteInfo] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [date, setDate] = useState(storeDateKey(new Date()));
  const [time, setTime] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const available = useMemo(() => (products.data ?? []).filter((p) => p.is_active && maxPurchasable(p) > 0), [products.data]);
  const byId = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const subtotal = lines.reduce((sum, line) => sum + (byId.get(line.productId)?.price_cents ?? 0) * line.quantity, 0);
  const feeCents = type === "DELIVERY" ? parseBRLToCents(fee) : 0;

  const mutation = useMutation({
    mutationFn: createAdminOrder,
    onSuccess: (order) => {
      toast.success(`Pedido #${order.code} registrado`);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      navigate(`/admin/pedidos/${order.orderId}`, { replace: true });
    },
    onError: (err) => setError(friendlyMessage(err)),
  });

  const quote = async () => {
    const validated = validateAddress(address);
    if (!validated.ok) {
      setQuoteInfo("Preencha o endereço completo para calcular.");
      return;
    }
    setQuoting(true);
    try {
      const result = await requestDeliveryQuote(validated.value, subtotal);
      if (result.available && result.feeCents !== null) {
        setFee((result.feeCents / 100).toFixed(2).replace(".", ","));
        setQuoteInfo(`Rota de ${formatDistanceKm(result.distanceMeters)}: ${formatBRL(result.feeCents)}.`);
      } else {
        setQuoteInfo(`Fora da área (${formatDistanceKm(result.distanceMeters)}). Informe a taxa combinada manualmente.`);
      }
    } catch (err) {
      setQuoteInfo(`${friendlyMessage(err)} Informe a taxa manualmente.`);
    } finally {
      setQuoting(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const normalizedPhone = normalizeBrazilPhone(phone);
    if (name.trim().length < 2) return setError("Informe o nome do cliente.");
    if (!normalizedPhone) return setError("Telefone inválido.");
    if (lines.length === 0) return setError("Adicione ao menos um produto.");
    if (!time) return setError("Informe o horário de retirada/entrega.");
    let validatedAddress: AddressInput | undefined;
    if (type === "DELIVERY") {
      const validated = validateAddress(address);
      if (!validated.ok) return setError("Endereço de entrega incompleto.");
      validatedAddress = validated.value;
      if (feeCents === null) return setError("Informe a taxa de entrega.");
    }
    const dayStart = new Date(storeDayStartIso(date));
    const [hours, minutes] = time.split(":").map(Number);
    const scheduledFor = new Date(dayStart.getTime() + (hours * 60 + minutes) * 60_000).toISOString();

    mutation.mutate({
      idempotencyKey,
      customer: { name: name.trim(), phone: normalizedPhone, email: email.trim() || null },
      fulfillment: { type, scheduledFor, ...(validatedAddress ? { address: { ...validatedAddress } } : {}) },
      items: lines,
      paymentMethod: method,
      cashChangeForCents: null,
      notes: notes.trim() || null,
      manualDeliveryFeeCents: type === "DELIVERY" ? feeCents : null,
    });
  };

  return (
    <div className="space-y-6">
      <Link to="/admin/pedidos" className="inline-flex items-center gap-1.5 text-sm font-semibold text-cocoa-700 hover:text-cocoa-900">
        <ArrowLeft className="size-4" aria-hidden /> Pedidos
      </Link>
      <PageHeader title="Registrar pedido" description="Para pedidos recebidos pelo WhatsApp ou telefone. O estoque é reservado como na loja online." />

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1.4fr_1fr]" noValidate>
        <div className="space-y-6">
          <section className="card space-y-4 p-5">
            <h2 className="font-display text-lg">Itens</h2>
            {lines.map((line, index) => {
              const product = byId.get(line.productId);
              const max = product ? maxPurchasable(product) : 0;
              return (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <Select value={line.productId} className="min-w-48 flex-1" aria-label="Produto"
                    onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, productId: e.target.value } : l)))}>
                    {available.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatBRL(p.price_cents)} ({maxPurchasable(p)} disp.)</option>)}
                  </Select>
                  <Input type="number" min={1} max={max} value={line.quantity} className="w-24" aria-label="Quantidade"
                    onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, quantity: Math.max(1, Math.min(max, Number(e.target.value) || 1)) } : l)))} />
                  <Button variant="ghost" size="sm" onClick={() => setLines(lines.filter((_, i) => i !== index))} aria-label="Remover item"><Trash2 className="size-4" /></Button>
                </div>
              );
            })}
            <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} disabled={available.length === 0}
              onClick={() => setLines([...lines, { productId: available.find((p) => !lines.some((l) => l.productId === p.id))?.id ?? available[0].id, quantity: 1 }])}>
              Adicionar produto
            </Button>
            {products.isSuccess && available.length === 0 && <Notice tone="warning">Nenhum produto com estoque disponível.</Notice>}
          </section>

          <section className="card grid gap-4 p-5 sm:grid-cols-2">
            <h2 className="font-display text-lg sm:col-span-2">Cliente</h2>
            <Field label="Nome">{({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label="Telefone">{({ id }) => <Input id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(28) 99999-9999" />}</Field>
            <Field label="E-mail" optional className="sm:col-span-2">{({ id }) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          </section>

          <section className="card space-y-4 p-5">
            <h2 className="font-display text-lg">Recebimento</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <ChoiceCard name="type" value="PICKUP" checked={type === "PICKUP"} onChange={() => setType("PICKUP")} title="Retirada" />
              <ChoiceCard name="type" value="DELIVERY" checked={type === "DELIVERY"} onChange={() => setType("DELIVERY")} title="Entrega" />
            </div>
            {type === "DELIVERY" && (
              <div className="grid gap-3 sm:grid-cols-6">
                <Field label="CEP" className="sm:col-span-2">{({ id }) => <Input id={id} value={address.cep} onChange={(e) => setAddress({ ...address, cep: e.target.value })} />}</Field>
                <Field label="Rua" className="sm:col-span-4">{({ id }) => <Input id={id} value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />}</Field>
                <Field label="Número" className="sm:col-span-2">{({ id }) => <Input id={id} value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} />}</Field>
                <Field label="Complemento" optional className="sm:col-span-4">{({ id }) => <Input id={id} value={address.complement ?? ""} onChange={(e) => setAddress({ ...address, complement: e.target.value })} />}</Field>
                <Field label="Bairro" className="sm:col-span-3">{({ id }) => <Input id={id} value={address.neighborhood} onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })} />}</Field>
                <Field label="Cidade" className="sm:col-span-2">{({ id }) => <Input id={id} value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />}</Field>
                <Field label="UF" className="sm:col-span-1">{({ id }) => <Input id={id} value={address.state} maxLength={2} onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase() })} />}</Field>
                <Field label="Taxa de entrega (R$)" className="sm:col-span-3" hint="Manual: fica registrada como frete manual.">
                  {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />}
                </Field>
                <div className="flex items-end sm:col-span-3">
                  <Button variant="secondary" size="sm" loading={quoting} icon={<Route className="size-4" />} onClick={quote}>Calcular pela rota</Button>
                </div>
                {quoteInfo && <p className="text-sm text-cocoa-700 sm:col-span-6">{quoteInfo}</p>}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Data">{({ id }) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
              <Field label="Horário (Brasília)">{({ id }) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
            </div>
          </section>
        </div>

        <aside className="card h-fit space-y-4 p-5 lg:sticky lg:top-8">
          <h2 className="font-display text-lg">Pagamento e resumo</h2>
          <Field label="Forma de pagamento">
            {({ id }) => (
              <Select id={id} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {(["PIX", "CASH", "CARD"] as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Observações" optional>{({ id }) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />}</Field>
          <dl className="space-y-1.5 border-t border-cream-200 pt-3 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatBRL(subtotal)}</dd></div>
            {type === "DELIVERY" && <div className="flex justify-between"><dt>Entrega</dt><dd className="tabular-nums">{feeCents === null ? "-" : formatBRL(feeCents)}</dd></div>}
            <div className="flex justify-between text-base font-bold"><dt>Total estimado</dt><dd className="tabular-nums">{formatBRL(subtotal + (feeCents ?? 0))}</dd></div>
          </dl>
          <p className="text-xs text-cocoa-500">Os valores finais são calculados pelo servidor com os preços atuais.</p>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" size="lg" block loading={mutation.isPending}>Registrar pedido</Button>
        </aside>
      </form>
    </div>
  );
}
