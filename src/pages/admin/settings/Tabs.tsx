import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ROLE_LABEL } from "@/admin/auth";
import {
  deleteDeliveryRule,
  listAudit,
  listDeliveryRules,
  saveDeliveryRule,
  teamAction,
  type DeliveryRuleRow,
  type StoreSettingsRow,
  type TeamMember,
} from "@/api/admin";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorState, LoadingBlock, Notice } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/datetime";
import { friendlyMessage } from "@/lib/errors";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { centsToInput, formatBRL, parseBRLToCents } from "@/lib/money";
import type { AppRole, PaymentMethod, StoreContent } from "@/types/domain";
import { normalizeBrazilPhone } from "@shared/validation.ts";
import { HoursEditor, validateHours } from "./HoursEditor";
import { useSettingsForm } from "./useSettingsForm";

function Card({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg">{title}</h2>
        {description && <p className="text-sm text-cocoa-600">{description}</p>}
      </div>
      {children}
      {footer && <div className="flex justify-end gap-2 border-t border-cream-200 pt-4">{footer}</div>}
    </section>
  );
}

// -----------------------------------------------------------------------------
export function StoreTab({ settings }: { settings: StoreSettingsRow }) {
  const form = useSettingsForm(settings, [
    "store_name", "tagline", "legal_name", "whatsapp_number", "instagram_handle",
    "contact_email", "privacy_contact_email", "wix_site_url", "public_location_label",
  ] as const);
  const [phoneInput, setPhoneInput] = useState(settings.whatsapp_number ? `+${settings.whatsapp_number}` : "");
  const [error, setError] = useState<string | null>(null);
  const v = form.values;

  const submit = () => {
    const phone = phoneInput.trim() ? normalizeBrazilPhone(phoneInput) : null;
    if (phoneInput.trim() && !phone) {
      setError("WhatsApp inválido. Use DDD + número.");
      return;
    }
    setError(null);
    form.save({
      ...v,
      whatsapp_number: phone ? phone.replace(/\D/g, "") : null,
      instagram_handle: v.instagram_handle ? v.instagram_handle.replace(/^@/, "").trim() || null : null,
      contact_email: v.contact_email?.trim() || null,
      privacy_contact_email: v.privacy_contact_email?.trim() || null,
      wix_site_url: v.wix_site_url?.trim() || null,
    });
  };

  return (
    <Card title="Dados da loja" description="Exibidos na loja, no rodapé, na política de privacidade e nas mensagens de WhatsApp."
      footer={<Button onClick={submit} loading={form.saving}>Salvar</Button>}>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da marca">{({ id }) => <Input id={id} value={v.store_name} maxLength={80} onChange={(e) => form.set("store_name", e.target.value)} />}</Field>
        <Field label="Frase curta" optional>{({ id }) => <Input id={id} value={v.tagline} maxLength={160} onChange={(e) => form.set("tagline", e.target.value)} />}</Field>
        <Field label="Razão social / responsável" hint="Aparece na política de privacidade como controlador dos dados.">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={v.legal_name} maxLength={160} onChange={(e) => form.set("legal_name", e.target.value)} />}
        </Field>
        <Field label="Localização pública" hint="Sem endereço exato. Ex.: Cachoeiro de Itapemirim - ES">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={v.public_location_label} maxLength={120} onChange={(e) => form.set("public_location_label", e.target.value)} />}
        </Field>
        <Field label="WhatsApp da loja" hint="Recebe os pedidos enviados pelo WhatsApp.">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="(28) 99999-9999" />}
        </Field>
        <Field label="Instagram" optional>{({ id }) => <Input id={id} value={v.instagram_handle ?? ""} onChange={(e) => form.set("instagram_handle", e.target.value)} placeholder="@suamarca" />}</Field>
        <Field label="E-mail de contato" optional>{({ id }) => <Input id={id} type="email" value={v.contact_email ?? ""} onChange={(e) => form.set("contact_email", e.target.value)} />}</Field>
        <Field label="E-mail para assuntos de dados (LGPD)" optional>{({ id }) => <Input id={id} type="email" value={v.privacy_contact_email ?? ""} onChange={(e) => form.set("privacy_contact_email", e.target.value)} />}</Field>
        <Field label="Site institucional (Wix)" optional className="sm:col-span-2">{({ id }) => <Input id={id} type="url" value={v.wix_site_url ?? ""} onChange={(e) => form.set("wix_site_url", e.target.value)} placeholder="https://www.suamarca.com.br" />}</Field>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
export function ContentTab({ settings }: { settings: StoreSettingsRow }) {
  const form = useSettingsForm(settings, ["content"] as const);
  const content = (form.values.content ?? {}) as StoreContent;
  const setContent = (patch: Partial<StoreContent>) => form.set("content", { ...content, ...patch } as Record<string, unknown>);
  const producers = content.producers ?? [];
  const differentials = content.differentials ?? [];

  return (
    <Card title="Textos da página inicial" description="A loja é transacional; a história completa fica no site institucional (Wix)."
      footer={<Button onClick={() => form.save()} loading={form.saving} disabled={!form.dirty}>Salvar</Button>}>
      <div className="grid gap-4">
        <Field label="Chamada acima do título" optional>{({ id }) => <Input id={id} value={content.heroEyebrow ?? ""} maxLength={80} onChange={(e) => setContent({ heroEyebrow: e.target.value })} />}</Field>
        <Field label="Título principal">{({ id }) => <Input id={id} value={content.heroTitle ?? ""} maxLength={120} onChange={(e) => setContent({ heroTitle: e.target.value })} />}</Field>
        <Field label="Subtítulo">{({ id }) => <Textarea id={id} value={content.heroSubtitle ?? ""} maxLength={300} onChange={(e) => setContent({ heroSubtitle: e.target.value })} />}</Field>
        <Field label="Título da história">{({ id }) => <Input id={id} value={content.storyTitle ?? ""} maxLength={120} onChange={(e) => setContent({ storyTitle: e.target.value })} />}</Field>
        <Field label="Texto da história">{({ id }) => <Textarea id={id} value={content.storyText ?? ""} maxLength={1200} onChange={(e) => setContent({ storyText: e.target.value })} />}</Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Quem produz</legend>
          {producers.map((producer, index) => (
            <div key={index} className="grid gap-2 rounded-xl bg-cream-100 p-3 sm:grid-cols-[1fr_1fr_auto]">
              <Input value={producer.name} placeholder="Nome" aria-label="Nome" onChange={(e) => setContent({ producers: producers.map((p, i) => (i === index ? { ...p, name: e.target.value } : p)) })} />
              <Input value={producer.role ?? ""} placeholder="Função" aria-label="Função" onChange={(e) => setContent({ producers: producers.map((p, i) => (i === index ? { ...p, role: e.target.value } : p)) })} />
              <Button size="sm" variant="ghost" onClick={() => setContent({ producers: producers.filter((_, i) => i !== index) })} aria-label="Remover"><Trash2 className="size-4" /></Button>
              <Textarea value={producer.bio ?? ""} placeholder="Mini bio (opcional)" aria-label="Bio" className="sm:col-span-3" maxLength={300}
                onChange={(e) => setContent({ producers: producers.map((p, i) => (i === index ? { ...p, bio: e.target.value } : p)) })} />
            </div>
          ))}
          {producers.length < 4 && <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setContent({ producers: [...producers, { name: "", role: "" }] })}>Adicionar pessoa</Button>}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Diferenciais (até 3)</legend>
          {differentials.map((item, index) => (
            <div key={index} className="grid gap-2 rounded-xl bg-cream-100 p-3 sm:grid-cols-[1fr_2fr_auto]">
              <Input value={item.title} placeholder="Título" aria-label="Título" onChange={(e) => setContent({ differentials: differentials.map((d, i) => (i === index ? { ...d, title: e.target.value } : d)) })} />
              <Input value={item.text} placeholder="Descrição" aria-label="Descrição" onChange={(e) => setContent({ differentials: differentials.map((d, i) => (i === index ? { ...d, text: e.target.value } : d)) })} />
              <Button size="sm" variant="ghost" onClick={() => setContent({ differentials: differentials.filter((_, i) => i !== index) })} aria-label="Remover"><Trash2 className="size-4" /></Button>
            </div>
          ))}
          {differentials.length < 3 && <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setContent({ differentials: [...differentials, { title: "", text: "" }] })}>Adicionar diferencial</Button>}
        </fieldset>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
export function OperationTab({ settings }: { settings: StoreSettingsRow }) {
  const form = useSettingsForm(settings, [
    "accepting_orders", "pause_message", "pickup_enabled", "delivery_enabled", "business_hours", "delivery_hours",
    "slot_interval_minutes", "min_lead_time_minutes", "max_days_ahead", "min_order_cents", "new_order_ttl_minutes", "payment_ttl_minutes",
  ] as const);
  const v = form.values;
  const [minOrder, setMinOrder] = useState(centsToInput(settings.min_order_cents));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const hoursError = validateHours(v.business_hours) ?? validateHours(v.delivery_hours);
    const minOrderCents = minOrder.trim() ? parseBRLToCents(minOrder) : 0;
    if (hoursError) return setError(hoursError);
    if (minOrderCents === null) return setError("Pedido mínimo inválido.");
    setError(null);
    form.save({ ...v, min_order_cents: minOrderCents });
  };

  const number = (key: "slot_interval_minutes" | "min_lead_time_minutes" | "max_days_ahead" | "new_order_ttl_minutes" | "payment_ttl_minutes") =>
    (event: React.ChangeEvent<HTMLInputElement>) => form.set(key, Number(event.target.value));

  return (
    <div className="space-y-6">
      <Card title="Recebimento de pedidos" description="Pausar impede novos pedidos na loja e no cardápio, mantendo tudo visível.">
        <div className="space-y-3">
          <Checkbox checked={v.accepting_orders} onChange={(value) => form.set("accepting_orders", value)} label="Aceitando pedidos online" />
          {!v.accepting_orders && (
            <Field label="Mensagem da pausa">{({ id }) => <Input id={id} value={v.pause_message} maxLength={300} onChange={(e) => form.set("pause_message", e.target.value)} placeholder="Voltamos na segunda-feira!" />}</Field>
          )}
          <Checkbox checked={v.pickup_enabled} onChange={(value) => form.set("pickup_enabled", value)} label="Retirada disponível" />
          <Checkbox checked={v.delivery_enabled} onChange={(value) => form.set("delivery_enabled", value)} label="Entrega disponível" />
        </div>
      </Card>
      <Card title="Horários" description="Definem as janelas oferecidas no checkout (horário de Brasília).">
        <HoursEditor label="Funcionamento e retirada" value={v.business_hours} onChange={(value) => form.set("business_hours", value)} />
        <HoursEditor label="Entregas" value={v.delivery_hours} onChange={(value) => form.set("delivery_hours", value)} />
      </Card>
      <Card title="Regras de agendamento e prazos" footer={<Button onClick={submit} loading={form.saving}>Salvar funcionamento</Button>}>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Intervalo das janelas (min)">{({ id }) => <Input id={id} type="number" min={15} max={240} value={v.slot_interval_minutes} onChange={number("slot_interval_minutes")} />}</Field>
          <Field label="Antecedência mínima (min)">{({ id }) => <Input id={id} type="number" min={0} value={v.min_lead_time_minutes} onChange={number("min_lead_time_minutes")} />}</Field>
          <Field label="Dias à frente">{({ id }) => <Input id={id} type="number" min={0} max={30} value={v.max_days_ahead} onChange={number("max_days_ahead")} />}</Field>
          <Field label="Pedido mínimo (R$)">{({ id }) => <Input id={id} inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />}</Field>
          <Field label="Prazo para confirmar pedidos (min)" hint="Dinheiro/cartão. Depois disso a reserva expira.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="number" min={15} value={v.new_order_ttl_minutes} onChange={number("new_order_ttl_minutes")} />}
          </Field>
          <Field label="Prazo para pagamento PIX (min)" hint="Depois disso o pedido expira e o estoque volta.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="number" min={10} value={v.payment_ttl_minutes} onChange={number("payment_ttl_minutes")} />}
          </Field>
        </div>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
function DeliveryRules() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const rules = useQuery({ queryKey: ["admin", "delivery-rules"], queryFn: listDeliveryRules });
  const [draft, setDraft] = useState<{ id: string | null; min: string; max: string; fee: string; active: boolean } | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "delivery-rules"] });
    void queryClient.invalidateQueries({ queryKey: ["store-config"] });
  };
  const save = useMutation({
    mutationFn: (rule: Omit<DeliveryRuleRow, "id"> & { id: string | null }) => {
      const { id, ...input } = rule;
      return saveDeliveryRule(id, input);
    },
    onSuccess: () => {
      toast.success("Faixa salva");
      setDraft(null);
      refresh();
    },
    onError: (error) => toast.error("Não foi possível salvar", friendlyMessage(error)),
  });
  const remove = useMutation({ mutationFn: deleteDeliveryRule, onSuccess: refresh, onError: (error) => toast.error("Não foi possível remover", friendlyMessage(error)) });

  const km = (meters: number) => (meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const parseKm = (text: string) => Math.round(Number(text.replace(",", ".")) * 1000);

  if (rules.isLoading) return <LoadingBlock className="py-6" />;
  if (rules.isError) return <ErrorState error={rules.error} onRetry={() => rules.refetch()} className="py-6" />;

  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead className="text-left text-cocoa-600"><tr><th className="py-1 font-semibold">Faixa</th><th className="py-1 font-semibold">Taxa</th><th /></tr></thead>
        <tbody className="divide-y divide-cream-200">
          {(rules.data ?? []).map((rule) => (
            <tr key={rule.id} className={rule.is_active ? "" : "text-cocoa-400"}>
              <td className="py-2">acima de {km(rule.min_distance_m)} até {km(rule.max_distance_m)} km {!rule.is_active && <Badge>inativa</Badge>}</td>
              <td className="py-2 font-semibold tabular-nums">{formatBRL(rule.fee_cents)}</td>
              <td className="py-2 text-right">
                <Button size="sm" variant="ghost" onClick={() => setDraft({ id: rule.id, min: km(rule.min_distance_m), max: km(rule.max_distance_m), fee: centsToInput(rule.fee_cents), active: rule.is_active })}>Editar</Button>
                <Button size="sm" variant="ghost" aria-label="Remover faixa" onClick={() => window.confirm("Remover esta faixa?") && remove.mutate(rule.id)}><Trash2 className="size-4" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {draft ? (
        <div className="grid gap-2 rounded-xl bg-cream-100 p-3 sm:grid-cols-4">
          <Field label="De (km)">{({ id }) => <Input id={id} inputMode="decimal" value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value })} />}</Field>
          <Field label="Até (km)">{({ id }) => <Input id={id} inputMode="decimal" value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.target.value })} />}</Field>
          <Field label="Taxa (R$)">{({ id }) => <Input id={id} inputMode="decimal" value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} />}</Field>
          <div className="flex items-end"><Checkbox checked={draft.active} onChange={(value) => setDraft({ ...draft, active: value })} label="Ativa" /></div>
          <div className="flex gap-2 sm:col-span-4">
            <Button size="sm" loading={save.isPending} onClick={() => {
              const fee = parseBRLToCents(draft.fee);
              const min = parseKm(draft.min);
              const max = parseKm(draft.max);
              if (fee === null || !Number.isFinite(min) || !Number.isFinite(max) || max <= min || min < 0) {
                toast.error("Faixa inválida", "Confira as distâncias (até > de) e a taxa.");
                return;
              }
              save.mutate({ id: draft.id, min_distance_m: min, max_distance_m: max, fee_cents: fee, is_active: draft.active });
            }}>Salvar faixa</Button>
            <Button size="sm" variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => {
          const last = rules.data?.filter((r) => r.is_active).at(-1);
          setDraft({ id: null, min: last ? km(last.max_distance_m) : "0", max: "", fee: "", active: true });
        }}>Nova faixa</Button>
      )}
    </div>
  );
}

export function DeliveryTab({ settings }: { settings: StoreSettingsRow }) {
  const form = useSettingsForm(settings, [
    "origin_address", "origin_lat", "origin_lng", "pickup_address", "pickup_instructions", "delivery_pricing_mode",
    "delivery_base_fee_cents", "delivery_per_km_cents", "delivery_max_distance_m", "free_delivery_min_subtotal_cents",
  ] as const);
  const v = form.values;
  const [base, setBase] = useState(centsToInput(settings.delivery_base_fee_cents));
  const [perKm, setPerKm] = useState(centsToInput(settings.delivery_per_km_cents));
  const [maxKm, setMaxKm] = useState(String(settings.delivery_max_distance_m / 1000).replace(".", ","));
  const [free, setFree] = useState(centsToInput(settings.free_delivery_min_subtotal_cents));
  const [coords, setCoords] = useState(settings.origin_lat !== null && settings.origin_lng !== null ? `${settings.origin_lat}, ${settings.origin_lng}` : "");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const baseCents = parseBRLToCents(base);
    const perKmCents = parseBRLToCents(perKm);
    const maxMeters = Math.round(Number(maxKm.replace(",", ".")) * 1000);
    const freeCents = free.trim() ? parseBRLToCents(free) : null;
    let lat: number | null = null;
    let lng: number | null = null;
    if (coords.trim()) {
      const match = coords.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (!match) return setError("Coordenadas inválidas. Use o formato -20.8489, -41.1128.");
      lat = Number(match[1]);
      lng = Number(match[2]);
    }
    if (baseCents === null || perKmCents === null) return setError("Taxas inválidas.");
    if (!Number.isFinite(maxMeters) || maxMeters < 100) return setError("Distância máxima inválida.");
    if (free.trim() && freeCents === null) return setError("Valor de frete grátis inválido.");
    if (!v.origin_address.trim() && lat === null) return setError("Informe o endereço de produção (ou as coordenadas) para calcular rotas.");
    setError(null);
    form.save({
      ...v,
      origin_lat: lat,
      origin_lng: lng,
      delivery_base_fee_cents: baseCents,
      delivery_per_km_cents: perKmCents,
      delivery_max_distance_m: maxMeters,
      free_delivery_min_subtotal_cents: freeCents || null,
    });
  };

  return (
    <div className="space-y-6">
      <Card title="Origem das entregas (privado)" description="Usada somente no servidor para calcular a rota. Nunca é exibida no site.">
        <div className="grid gap-4">
          <Field label="Endereço de produção">{({ id }) => <Input id={id} value={v.origin_address} maxLength={300} onChange={(e) => form.set("origin_address", e.target.value)} />}</Field>
          <Field label="Coordenadas (opcional, mais preciso)" hint="Copie do Google Maps: clique com o botão direito no local.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="-20.8489, -41.1128" />}
          </Field>
        </div>
      </Card>
      <Card title="Retirada" description="O endereço de retirada só aparece na página do pedido de quem escolheu retirar.">
        <div className="grid gap-4">
          <Field label="Endereço de retirada">{({ id }) => <Input id={id} value={v.pickup_address} maxLength={300} onChange={(e) => form.set("pickup_address", e.target.value)} />}</Field>
          <Field label="Instruções" optional>{({ id }) => <Input id={id} value={v.pickup_instructions} maxLength={500} onChange={(e) => form.set("pickup_instructions", e.target.value)} />}</Field>
        </div>
      </Card>
      <Card title="Preço do frete" description="Cobrado pela distância da rota (sem trânsito). A duração é só estimativa."
        footer={<Button onClick={submit} loading={form.saving}>Salvar</Button>}>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Modelo de cobrança">
          {({ id }) => (
            <Select id={id} value={v.delivery_pricing_mode} onChange={(e) => form.set("delivery_pricing_mode", e.target.value as StoreSettingsRow["delivery_pricing_mode"])}>
              <option value="DISTANCE_TABLE">Tabela por faixas de distância</option>
              <option value="BASE_PLUS_PER_KM">Taxa base + preço por km</option>
            </Select>
          )}
        </Field>
        {v.delivery_pricing_mode === "BASE_PLUS_PER_KM" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Taxa base (R$)">{({ id }) => <Input id={id} inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} />}</Field>
            <Field label="Preço por km (R$)" hint="Resultado arredondado para cima em múltiplos de R$ 0,50.">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} inputMode="decimal" value={perKm} onChange={(e) => setPerKm(e.target.value)} />}
            </Field>
          </div>
        ) : (
          <DeliveryRules />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Distância máxima (km)">{({ id }) => <Input id={id} inputMode="decimal" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} />}</Field>
          <Field label="Frete grátis acima de (R$)" optional>{({ id }) => <Input id={id} inputMode="decimal" value={free} onChange={(e) => setFree(e.target.value)} />}</Field>
        </div>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
export function PaymentsTab({ settings }: { settings: StoreSettingsRow }) {
  const form = useSettingsForm(settings, ["payment_methods", "pix_key", "pix_holder_name"] as const);
  const v = form.values;
  const toggle = (method: PaymentMethod, on: boolean) =>
    form.set("payment_methods", on ? [...new Set([...v.payment_methods, method])] : v.payment_methods.filter((m) => m !== method));
  const invalid = v.payment_methods.length === 0 || (v.payment_methods.includes("PIX") && !v.pix_key.trim());

  return (
    <Card title="Formas de pagamento" description="Pagamentos são confirmados pela equipe (ou, no futuro, por webhook do gateway). Nunca pelo navegador do cliente."
      footer={<Button onClick={() => form.save()} loading={form.saving} disabled={invalid || !form.dirty}>Salvar</Button>}>
      <div className="space-y-3">
        {(["PIX", "CASH", "CARD"] as PaymentMethod[]).map((method) => (
          <Checkbox key={method} checked={v.payment_methods.includes(method)} onChange={(on) => toggle(method, on)} label={PAYMENT_METHOD_LABEL[method]} />
        ))}
        {v.payment_methods.length === 0 && <Notice tone="danger">Mantenha ao menos uma forma de pagamento.</Notice>}
      </div>
      {v.payment_methods.includes("PIX") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Chave PIX" hint="Exibida apenas na página do pedido PIX.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={v.pix_key} maxLength={140} onChange={(e) => form.set("pix_key", e.target.value)} />}
          </Field>
          <Field label="Nome do favorecido">{({ id }) => <Input id={id} value={v.pix_holder_name} maxLength={120} onChange={(e) => form.set("pix_holder_name", e.target.value)} />}</Field>
        </div>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------
export function TeamTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const team = useQuery({ queryKey: ["admin", "team"], queryFn: () => teamAction<{ members: TeamMember[] }>({ action: "list" }) });
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ fullName: "", email: "", role: "OPERATOR" as AppRole, password: "" });
  const [resetFor, setResetFor] = useState<TeamMember | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const run = useMutation({
    mutationFn: (body: Record<string, unknown>) => teamAction<{ id: string }>(body),
    onSuccess: () => {
      toast.success("Equipe atualizada");
      void queryClient.invalidateQueries({ queryKey: ["admin", "team"] });
    },
    onError: (error) => toast.error("Não foi possível concluir", friendlyMessage(error)),
  });

  if (team.isLoading) return <LoadingBlock />;
  if (team.isError) return <ErrorState error={team.error} onRetry={() => team.refetch()} title="Não foi possível carregar a equipe" />;

  return (
    <Card title="Equipe" description="Cada pessoa tem a própria conta. Proprietários gerenciam tudo; administradores cuidam de produtos, clientes e configurações; operadores cuidam de pedidos e estoque.">
      <ul className="divide-y divide-cream-200">
        {(team.data?.members ?? []).map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-48 flex-1">
              <p className="font-semibold">{member.fullName || member.email} {member.isSelf && <span className="text-xs text-cocoa-500">(você)</span>}</p>
              <p className="text-sm text-cocoa-600">{member.email} · último acesso: {member.lastSignInAt ? formatDateTime(member.lastSignInAt) : "nunca"}</p>
            </div>
            <Select value={member.role} className="h-9 w-44" aria-label={`Papel de ${member.fullName}`}
              onChange={(e) => run.mutate({ action: "update", userId: member.id, role: e.target.value })}>
              {(["OWNER", "ADMIN", "OPERATOR"] as AppRole[]).map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
            </Select>
            <Button size="sm" variant={member.isActive ? "ghost" : "success"} disabled={member.isSelf}
              onClick={() => run.mutate({ action: "update", userId: member.id, isActive: !member.isActive })}>
              {member.isActive ? "Desativar" : "Reativar"}
            </Button>
            <Button size="sm" variant="ghost" icon={<KeyRound className="size-4" />} onClick={() => { setNewPassword(""); setResetFor(member); }}>Senha</Button>
            {!member.isActive && <Badge tone="danger">Desativado</Badge>}
          </li>
        ))}
      </ul>
      {creating ? (
        <div className="grid gap-3 rounded-2xl bg-cream-100 p-4 sm:grid-cols-2">
          <Field label="Nome">{({ id }) => <Input id={id} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />}</Field>
          <Field label="E-mail">{({ id }) => <Input id={id} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />}</Field>
          <Field label="Papel">
            {({ id }) => (
              <Select id={id} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as AppRole })}>
                {(["OWNER", "ADMIN", "OPERATOR"] as AppRole[]).map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Senha inicial" hint="Mínimo de 10 caracteres com letras e números. Combine a troca no primeiro acesso.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="password" autoComplete="new-password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />}
          </Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" loading={run.isPending} onClick={() => run.mutate({ action: "create", ...draft }, { onSuccess: () => { setCreating(false); setDraft({ fullName: "", email: "", role: "OPERATOR", password: "" }); } })}>
              Criar conta
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>Adicionar pessoa</Button>
      )}
      <Dialog open={resetFor !== null} onClose={() => setResetFor(null)} title={`Nova senha para ${resetFor?.fullName ?? ""}`}
        footer={<Button loading={run.isPending} onClick={() => resetFor && run.mutate({ action: "reset-password", userId: resetFor.id, password: newPassword }, { onSuccess: () => setResetFor(null) })}>Salvar senha</Button>}>
        <Field label="Nova senha" hint="Mínimo de 10 caracteres com letras e números.">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />}
        </Field>
      </Dialog>
    </Card>
  );
}

// -----------------------------------------------------------------------------
export function AuditTab() {
  const audit = useQuery({ queryKey: ["admin", "audit"], queryFn: () => listAudit(150) });
  if (audit.isLoading) return <LoadingBlock />;
  if (audit.isError) return <ErrorState error={audit.error} onRetry={() => audit.refetch()} />;
  return (
    <Card title="Registro de atividades" description="Quem fez o quê e quando: preços, produtos, estoque, pedidos, configurações e equipe.">
      <ul className="divide-y divide-cream-200 text-sm">
        {(audit.data ?? []).map((row) => (
          <li key={row.id} className="py-2.5">
            <p className="font-medium">{row.summary}</p>
            <p className="text-xs text-cocoa-500">{formatDateTime(row.created_at)} · {row.actorName ?? "sistema"} · {row.action}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
