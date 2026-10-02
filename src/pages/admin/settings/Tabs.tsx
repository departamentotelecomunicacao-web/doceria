import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ROLE_LABEL, useAdminAuth } from "@/admin/auth";
import { listTeam, teamAction, type StoreSettingsRow, type TeamMember } from "@/api/admin";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorState, LoadingBlock, Notice } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { WEEKDAY_NAMES } from "@/lib/datetime";
import { friendlyMessage } from "@/lib/errors";
import { PAYMENT_METHOD_LABEL, PERIOD_LABEL } from "@/lib/labels";
import { centsToInput, parseBRLToCents } from "@/lib/money";
import type { AppRole, DayPeriod, PaymentMethod } from "@/types/domain";
import { formatBrazilPhone, isEmail, normalizeBrazilPhone } from "@shared/validation.ts";
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

function Toggle({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-3.5 text-sm font-semibold",
        selected ? "border-cocoa-900 bg-cocoa-900 text-cream-50" : "border-cream-300 bg-white text-cocoa-700",
      )}
    >
      {children}
    </button>
  );
}

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

// -----------------------------------------------------------------------------
export function StoreTab({ settings }: { settings: StoreSettingsRow }) {
  const form = useSettingsForm(settings, [
    "store_name", "tagline", "whatsapp_phone", "notify_email", "instagram_url", "institutional_url",
    "accepting_orders", "pause_message",
  ] as const);
  const [phoneInput, setPhoneInput] = useState(formatBrazilPhone(settings.whatsapp_phone));
  const [error, setError] = useState<string | null>(null);
  const v = form.values;

  const submit = () => {
    const phone = phoneInput.trim() ? normalizeBrazilPhone(phoneInput) : null;
    if (phoneInput.trim() && !phone) return setError("WhatsApp inválido. Use DDD + número.");
    const email = v.notify_email?.trim() || null;
    if (email && !isEmail(email)) return setError("E-mail inválido.");
    setError(null);
    form.save({
      ...v,
      whatsapp_phone: phone,
      notify_email: email,
      instagram_url: v.instagram_url.trim(),
      institutional_url: v.institutional_url.trim(),
    });
  };

  return (
    <div className="space-y-5">
      <Card title="Recebendo pedidos?" description="Pause quando não puder atender (férias, fornada esgotada). A loja continua visível.">
        <Checkbox checked={v.accepting_orders} onChange={(value) => form.set("accepting_orders", value)} label="Aceitar pedidos pelo site" />
        {!v.accepting_orders && (
          <Field label="Mensagem para o cliente">
            {({ id }) => <Input id={id} value={v.pause_message} maxLength={300} onChange={(e) => form.set("pause_message", e.target.value)} placeholder="Voltamos na segunda-feira!" />}
          </Field>
        )}
      </Card>

      <Card title="Dados da loja" description="Aparecem na loja, nos e-mails e nas mensagens de WhatsApp."
        footer={<Button onClick={submit} loading={form.saving} data-testid="save-store">Salvar</Button>}>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da loja">{({ id }) => <Input id={id} value={v.store_name} maxLength={80} onChange={(e) => form.set("store_name", e.target.value)} />}</Field>
          <Field label="Frase de destaque" optional hint="Título da página inicial.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={v.tagline} maxLength={160} onChange={(e) => form.set("tagline", e.target.value)} />}
          </Field>
          <Field label="WhatsApp da loja" hint="Recebe as mensagens dos clientes.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="(28) 99999-9999" />}
          </Field>
          <Field label="E-mail que recebe os pedidos" optional hint="Chega um aviso a cada pedido novo.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="email" value={v.notify_email ?? ""} onChange={(e) => form.set("notify_email", e.target.value)} />}
          </Field>
          <Field label="Instagram" optional>
            {({ id }) => <Input id={id} type="url" value={v.instagram_url} onChange={(e) => form.set("instagram_url", e.target.value)} placeholder="https://instagram.com/suamarca" />}
          </Field>
          <Field label="Site institucional (Wix)" optional>
            {({ id }) => <Input id={id} type="url" value={v.institutional_url} onChange={(e) => form.set("institutional_url", e.target.value)} placeholder="https://www.suamarca.com.br" />}
          </Field>
        </div>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
export function DeliveryTab({ settings }: { settings: StoreSettingsRow }) {
  const form = useSettingsForm(settings, [
    "delivery_enabled", "delivery_fee_cents", "delivery_city", "pickup_enabled", "pickup_address",
    "open_weekdays", "periods", "same_day_orders", "max_days_ahead", "min_order_cents",
  ] as const);
  const [feeInput, setFeeInput] = useState(centsToInput(settings.delivery_fee_cents));
  const [minInput, setMinInput] = useState(settings.min_order_cents ? centsToInput(settings.min_order_cents) : "");
  const [error, setError] = useState<string | null>(null);
  const v = form.values;

  const submit = () => {
    const fee = parseBRLToCents(feeInput);
    const min = minInput.trim() ? parseBRLToCents(minInput) : 0;
    if (fee === null) return setError("Taxa de entrega inválida. Use o formato 5,00.");
    if (min === null) return setError("Pedido mínimo inválido.");
    if (!v.delivery_enabled && !v.pickup_enabled) return setError("Deixe ao menos entrega ou retirada ligada.");
    if (v.open_weekdays.length === 0) return setError("Escolha ao menos um dia de funcionamento.");
    if (v.periods.length === 0) return setError("Escolha ao menos um período.");
    setError(null);
    form.save({ ...v, delivery_fee_cents: fee, min_order_cents: min });
  };

  return (
    <Card title="Entrega, retirada e agenda" footer={<Button onClick={submit} loading={form.saving} data-testid="save-delivery">Salvar</Button>}>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <Checkbox checked={v.delivery_enabled} onChange={(value) => form.set("delivery_enabled", value)} label="Fazer entregas" />
          <Field label="Taxa de entrega (R$)" hint="Valor fixo cobrado em toda entrega. Dá para ajustar em cada pedido.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} inputMode="decimal" value={feeInput} onChange={(e) => setFeeInput(e.target.value)} data-testid="delivery-fee" />}
          </Field>
          <Field label="Cidade atendida">
            {({ id }) => <Input id={id} value={v.delivery_city} maxLength={80} onChange={(e) => form.set("delivery_city", e.target.value)} />}
          </Field>
        </div>
        <div className="space-y-3">
          <Checkbox checked={v.pickup_enabled} onChange={(value) => form.set("pickup_enabled", value)} label="Permitir retirada (grátis)" />
          <Field label="Endereço de retirada" hint="Mostrado ao cliente que escolher retirada.">
            {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} value={v.pickup_address} maxLength={200} onChange={(e) => form.set("pickup_address", e.target.value)} />}
          </Field>
        </div>
      </div>

      <div className="space-y-2 border-t border-cream-200 pt-4">
        <p className="text-sm font-semibold text-cocoa-800">Dias de funcionamento</p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_NAMES.map((name, day) => (
            <Toggle key={name} selected={v.open_weekdays.includes(day)} onClick={() => form.set("open_weekdays", toggleIn(v.open_weekdays, day).sort())}>
              {name}
            </Toggle>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-cocoa-800">Períodos oferecidos</p>
        <div className="flex flex-wrap gap-2">
          {(["MORNING", "AFTERNOON", "EVENING"] as DayPeriod[]).map((period) => (
            <Toggle key={period} selected={v.periods.includes(period)} onClick={() => form.set("periods", toggleIn(v.periods, period))}>
              {PERIOD_LABEL[period]}
            </Toggle>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-end"><Checkbox checked={v.same_day_orders} onChange={(value) => form.set("same_day_orders", value)} label="Aceitar pedido para o mesmo dia" /></div>
        <Field label="Agendar até quantos dias à frente">
          {({ id }) => <Input id={id} type="number" min={0} max={60} value={v.max_days_ahead} onChange={(e) => form.set("max_days_ahead", Math.max(0, Math.min(60, Number(e.target.value) || 0)))} />}
        </Field>
        <Field label="Pedido mínimo (R$)" optional>
          {({ id }) => <Input id={id} inputMode="decimal" value={minInput} onChange={(e) => setMinInput(e.target.value)} placeholder="sem mínimo" />}
        </Field>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
export function PaymentsTab({ settings }: { settings: StoreSettingsRow }) {
  const form = useSettingsForm(settings, ["payment_methods", "pix_key", "pix_holder", "email_customer_on_status"] as const);
  const [error, setError] = useState<string | null>(null);
  const v = form.values;

  const submit = () => {
    if (v.payment_methods.length === 0) return setError("Escolha ao menos uma forma de pagamento.");
    if (v.payment_methods.includes("PIX") && !v.pix_key.trim()) return setError("Informe a chave PIX ou desligue o PIX.");
    setError(null);
    form.save({ ...v, pix_key: v.pix_key.trim(), pix_holder: v.pix_holder.trim() });
  };

  return (
    <div className="space-y-5">
      <Card title="Formas de pagamento" footer={<Button onClick={submit} loading={form.saving}>Salvar</Button>}>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          {(["PIX", "CASH", "CARD"] as PaymentMethod[]).map((method) => (
            <Toggle key={method} selected={v.payment_methods.includes(method)} onClick={() => form.set("payment_methods", toggleIn(v.payment_methods, method))}>
              {PAYMENT_METHOD_LABEL[method]}
            </Toggle>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Chave PIX" hint="Aparece para o cliente depois do pedido e no e-mail.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={v.pix_key} maxLength={120} onChange={(e) => form.set("pix_key", e.target.value)} />}
          </Field>
          <Field label="Nome do favorecido" optional>
            {({ id }) => <Input id={id} value={v.pix_holder} maxLength={120} onChange={(e) => form.set("pix_holder", e.target.value)} />}
          </Field>
        </div>
      </Card>

      <Card title="Avisos por e-mail ao cliente" description="A confirmação de recebimento sempre é enviada quando o cliente informa e-mail.">
        <Checkbox
          checked={v.email_customer_on_status}
          onChange={(value) => form.save({ email_customer_on_status: value })}
          label="Avisar também quando o pedido for confirmado, sair para entrega, ficar pronto para retirada ou for cancelado"
          description="O plano grátis do EmailJS permite 200 e-mails por mês. Se estiver perto do limite, desligue e use o WhatsApp."
        />
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
const ROLES: AppRole[] = ["OWNER", "STAFF"];

export function TeamTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAdminAuth();
  const team = useQuery({ queryKey: ["admin", "team"], queryFn: listTeam });
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ fullName: "", email: "", role: "STAFF" as AppRole, password: "" });
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

  const members = team.data ?? [];
  const others = members.filter((member) => member.id !== profile?.id);

  return (
    <Card title="Equipe" description="Opcional. Use só se outra pessoa for atender os pedidos. Cada pessoa tem a própria conta. Dono(a): tudo. Atendente: pedidos e disponibilidade dos produtos.">
      <ul className="divide-y divide-cream-200">
        {members.map((member) => {
          const isSelf = member.id === profile?.id;
          return (
            <li key={member.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <div className="min-w-0 flex-1 basis-48">
                <p className="break-words font-semibold">
                  {member.fullName || member.email} {isSelf && <span className="text-xs font-normal text-cocoa-500">(você)</span>}
                </p>
                <p className="break-all text-sm text-cocoa-600">{member.email} · {ROLE_LABEL[member.role]}</p>
              </div>
              {!isSelf && (
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={member.role} className="h-9 w-36" aria-label={`Papel de ${member.fullName}`}
                    onChange={(e) => run.mutate({ action: "update", userId: member.id, role: e.target.value })}>
                    {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
                  </Select>
                  <Button size="sm" variant={member.isActive ? "ghost" : "success"}
                    onClick={() => run.mutate({ action: "update", userId: member.id, isActive: !member.isActive })}>
                    {member.isActive ? "Desativar" : "Reativar"}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<KeyRound className="size-4" />} onClick={() => { setNewPassword(""); setResetFor(member); }}>Senha</Button>
                  {!member.isActive && <Badge tone="danger">Desativado</Badge>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {others.length === 0 && !creating && (
        <p className="text-sm text-cocoa-600">Por enquanto só você tem acesso ao painel. Isso basta para receber e confirmar pedidos.</p>
      )}
      {creating ? (
        <div className="grid gap-3 rounded-2xl bg-cream-100 p-4 sm:grid-cols-2">
          <Field label="Nome">{({ id }) => <Input id={id} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />}</Field>
          <Field label="E-mail (login)">{({ id }) => <Input id={id} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />}</Field>
          <Field label="Papel">
            {({ id }) => (
              <Select id={id} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as AppRole })}>
                {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Senha inicial" hint="Mínimo de 10 caracteres, com letras e números.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="password" autoComplete="new-password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />}
          </Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" loading={run.isPending} onClick={() => run.mutate({ action: "create", ...draft }, { onSuccess: () => { setCreating(false); setDraft({ fullName: "", email: "", role: "STAFF", password: "" }); } })}>
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
        <Field label="Nova senha" hint="Mínimo de 10 caracteres, com letras e números.">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />}
        </Field>
      </Dialog>
    </Card>
  );
}
